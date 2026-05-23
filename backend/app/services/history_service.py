"""Servicio de control de historial — soft-hide + hard-delete con
ramificacion por scope de consentimiento.

Documentado en `docs/DATA_RETENTION_POLICY.md`. Implementa los flujos
del menu 3-puntos del sidebar + del toggle "Guardar historial" en
Settings + del boton "Eliminar definitivamente" en SessionDetail.

Compliance critico (B-04 del agente etico, 2026-05-23): si el usuario
firmo scope=`solo_uso`, el toggle OFF debe ejecutar **hard DELETE**
real en lugar de soft-hide — `solo_uso` no autoriza retencion para
analisis o investigacion. Esa ramificacion vive aqui (no en BD)
porque depende de `consents.scope` actual del usuario, dato vivo.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consent import Consent
from app.models.session import Session as SessionModel


class HistoryService:
    """Encapsula soft-hide y hard-delete de sesiones para el usuario.

    Patron D-12: ningun metodo commitea. El router envuelve la accion
    + audit_log + commit unico en su transaccion.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # --------------------------------------------------------------
    # Helpers internos
    # --------------------------------------------------------------

    async def _get_active_scope(self, user_id: uuid.UUID) -> str | None:
        """Lee el scope del consentimiento activo (mas reciente) del
        usuario. Devuelve None si no hay consentimiento — en ese caso
        el caller debe tratar al usuario como `solo_uso` (mas
        restrictivo, no asumir base legal extendida).
        """
        result = await self.db.execute(
            select(Consent.scope)
            .where(Consent.user_id == user_id, Consent.revoked_at.is_(None))
            .order_by(Consent.accepted_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    @staticmethod
    def _scope_allows_retention(scope: str | None) -> bool:
        """True si el scope autoriza retener data para investigacion/
        mejora. `solo_uso` y la ausencia de consentimiento NO autorizan.
        """
        return scope in ("uso_mejora_anon", "uso_investigacion")

    # --------------------------------------------------------------
    # Acciones individuales por sesion (menu 3-puntos del sidebar)
    # --------------------------------------------------------------

    async def hide_session(
        self, session_id: uuid.UUID, user_id: uuid.UUID
    ) -> tuple[SessionModel, bool]:
        """Marca una sesion como oculta (soft-hide). El contenido
        permanece intacto. Una sesion ya oculta retorna sin cambios
        (idempotente para no fallar en doble-click).

        Devuelve `(session, changed)`. `changed=False` indica que la
        sesion ya estaba oculta y no se hizo nada — el router usa
        este flag para evitar emitir audit_log_action duplicados ante
        re-clicks (code-review #4, 2026-05-23).
        """
        session = await self._get_owned_session(session_id, user_id)
        if session.hidden_at is not None:
            return session, False
        session.hidden_at = datetime.now(UTC)
        session.hidden_reason = "user_per_session"
        await self.db.flush()
        await self.db.refresh(session)
        return session, True

    async def hard_delete_session(
        self, session_id: uuid.UUID, user_id: uuid.UUID
    ) -> int:
        """Hard DELETE de una sesion individual. CASCADE elimina sus
        messages. Devuelve el numero de messages eliminados (para
        audit log details).
        """
        session = await self._get_owned_session(session_id, user_id)
        # Contamos messages antes del DELETE para incluirlos en audit.
        from app.models.message import Message

        count_result = await self.db.execute(
            select(Message.id).where(Message.session_id == session.id)
        )
        messages_count = len(count_result.scalars().all())
        await self.db.delete(session)
        await self.db.flush()
        return messages_count

    # --------------------------------------------------------------
    # Acciones masivas (toggle OFF history, "Eliminar mis datos")
    # --------------------------------------------------------------

    async def apply_history_toggle_off(self, user_id: uuid.UUID) -> dict:
        """Aplica el toggle OFF `save_history`.

        Ramifica por scope:
          - `solo_uso` (o sin consentimiento) → hard DELETE de todas
            las sesiones + messages del usuario. No hay base legal
            para retener.
          - `uso_mejora_anon` / `uso_investigacion` → soft hide
            masivo (sessions.hidden_at = NOW()) sobre las sesiones
            que aun esten visibles.

        Returns `{behavior, scope, affected_sessions, deleted_messages}`
        para que el router lo persista en el audit log.
        """
        scope = await self._get_active_scope(user_id)
        retention_allowed = self._scope_allows_retention(scope)

        if not retention_allowed:
            # Hard delete real: cuenta primero para audit, luego DELETE.
            from app.models.message import Message

            sessions_q = select(SessionModel.id).where(
                SessionModel.user_id == user_id
            )
            session_ids = (await self.db.execute(sessions_q)).scalars().all()
            if not session_ids:
                return {
                    "behavior": "hard_delete",
                    "scope": scope,
                    "affected_sessions": 0,
                    "deleted_messages": 0,
                }
            from sqlalchemy import func

            msg_count_result = await self.db.execute(
                select(func.count(Message.id)).where(
                    Message.session_id.in_(session_ids)
                )
            )
            msg_count = int(msg_count_result.scalar() or 0)
            await self.db.execute(
                delete(SessionModel).where(SessionModel.user_id == user_id)
            )
            await self.db.flush()
            return {
                "behavior": "hard_delete",
                "scope": scope,
                "affected_sessions": len(session_ids),
                "deleted_messages": msg_count,
            }

        # Soft hide masivo: solo afecta las que aun estan visibles
        # (idempotente: re-toggle OFF no re-marca lo ya oculto).
        now = datetime.now(UTC)
        result = await self.db.execute(
            update(SessionModel)
            .where(
                SessionModel.user_id == user_id,
                SessionModel.hidden_at.is_(None),
            )
            .values(hidden_at=now, hidden_reason="user_toggle_off")
        )
        await self.db.flush()
        return {
            "behavior": "soft_hide",
            "scope": scope,
            "affected_sessions": result.rowcount,
            "deleted_messages": 0,
        }

    async def hard_delete_all_user_messages(self, user_id: uuid.UUID) -> dict:
        """Endpoint "Eliminar mis datos" — hard DELETE de TODAS las
        sesiones + messages del usuario, preservando user, preferences
        y consents (la cuenta sigue activa). Ejercicio del derecho de
        supresion (Ley 1581 art. 8 lit. e).
        """
        from sqlalchemy import func

        from app.models.message import Message

        sessions_q = select(SessionModel.id).where(
            SessionModel.user_id == user_id
        )
        session_ids = (await self.db.execute(sessions_q)).scalars().all()
        if not session_ids:
            return {"affected_sessions": 0, "deleted_messages": 0}

        msg_count_result = await self.db.execute(
            select(func.count(Message.id)).where(Message.session_id.in_(session_ids))
        )
        msg_count = int(msg_count_result.scalar() or 0)
        await self.db.execute(
            delete(SessionModel).where(SessionModel.user_id == user_id)
        )
        await self.db.flush()
        return {
            "affected_sessions": len(session_ids),
            "deleted_messages": msg_count,
        }

    # --------------------------------------------------------------
    # Internos
    # --------------------------------------------------------------

    async def _get_owned_session(
        self, session_id: uuid.UUID, user_id: uuid.UUID
    ) -> SessionModel:
        """Carga la sesion (incluyendo ocultas) y valida propiedad.

        `include_hidden=True` aqui es CRITICO: para hide/delete una
        sesion oculta, necesitamos poder cargarla. Sin esto, una
        sesion ya oculta no se podria eliminar definitivamente
        despues — error inalcanzable hoy pero que se hubiera vuelto
        bug latente con cualquier feature futura.
        """
        # NOTA: usamos query directa para no acoplarnos al
        # SessionRepository que filtra por hidden por defecto.
        result = await self.db.execute(
            select(SessionModel).where(SessionModel.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session is None:
            raise ValueError("SESSION_NOT_FOUND")
        if session.user_id != user_id:
            raise ValueError("ACCESS_DENIED")
        return session
