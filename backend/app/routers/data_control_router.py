"""Endpoints de control de datos del estudiante sobre su propia info.

Implementa los flows del paquete "Control de datos" auditado por el
agente etico el 2026-05-23. Detalle completo en
`docs/DATA_RETENTION_POLICY.md`.

Endpoints:
- POST   /users/me/history/toggle-off  — toggle OFF save_history
- POST   /users/me/history/toggle-on   — toggle ON save_history
- PATCH  /sessions/{id}/hide           — quitar sesion del sidebar
- DELETE /sessions/{id}                — hard delete una sesion
- DELETE /users/me/messages            — hard delete TODAS las sesiones
                                         (preserva cuenta, preferences,
                                         consents — ejercicio del
                                         derecho de supresion sin
                                         revocar consentimiento futuro)

Todos los endpoints siguen D-12: el servicio flushea pero el router
commitea junto con `audit_log_action` en una sola transaccion.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth import require_role
from app.models.preference import Preference
from app.models.user import User
from app.repositories.preference_repository import PreferenceRepository
from app.services.audit_service import audit_log_action
from app.services.history_service import HistoryService

router = APIRouter(tags=["data-control"])


def _client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    return request.client.host


# -----------------------------------------------------------------------
# Toggle del historial (Settings → Privacidad → "Guardar historial")
# -----------------------------------------------------------------------


@router.post("/users/me/history/toggle-off")
async def history_toggle_off(
    request: Request,
    current_user: User = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """Desactiva el historial. Ramifica por scope del consentimiento:

      - `solo_uso` (o sin consentimiento) → hard DELETE de todas las
        sesiones + messages. No hay base legal para retener.
      - `uso_mejora_anon` / `uso_investigacion` → soft hide masivo;
        la data permanece para metricas/investigacion bajo el
        consentimiento aceptado.

    Cualquiera de los dos paths actualiza `preferences.save_history`
    a False de forma atomica, de modo que el estado del toggle y la
    accion ejecutada nunca se desincronicen.
    """
    history = HistoryService(db)
    result = await history.apply_history_toggle_off(current_user.id)

    # Marca la preference como False en la misma transaccion. Si no
    # existe (usuario sin preferences aun), no se crea — no tiene
    # sentido marcar un toggle si nunca lo habia tocado.
    pref_repo = PreferenceRepository(db)
    pref = await pref_repo.get_by_user_id(current_user.id)
    if pref is not None and pref.save_history:
        pref.save_history = False
        await db.flush()

    await audit_log_action(
        db,
        actor_id=current_user.id,
        actor_role="student",
        action="history_toggle_off",
        target_type="user",
        target_id=current_user.id,
        details={
            "behavior": result["behavior"],
            "scope": result["scope"],
            "affected_sessions": result["affected_sessions"],
            "deleted_messages": result["deleted_messages"],
        },
        ip=_client_ip(request),
    )
    await db.commit()
    return {
        "behavior": result["behavior"],
        "affected_sessions": result["affected_sessions"],
        "deleted_messages": result["deleted_messages"],
    }


@router.post("/users/me/history/toggle-on")
async def history_toggle_on(
    request: Request,
    current_user: User = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """Reactiva el historial. NO des-oculta retroactivamente sesiones
    previamente marcadas con `hidden_at` (one-way intencional segun
    politica documentada). Solo las sesiones nuevas a partir de
    ahora nacen visibles.
    """
    pref_repo = PreferenceRepository(db)
    pref = await pref_repo.get_by_user_id(current_user.id)
    if pref is not None and not pref.save_history:
        pref.save_history = True
        await db.flush()

    await audit_log_action(
        db,
        actor_id=current_user.id,
        actor_role="student",
        action="history_toggle_on",
        target_type="user",
        target_id=current_user.id,
        details={},
        ip=_client_ip(request),
    )
    await db.commit()
    return {"ok": True}


# -----------------------------------------------------------------------
# Acciones por sesion (menu 3-puntos del sidebar + boton SessionDetail)
# -----------------------------------------------------------------------


@router.patch("/sessions/{session_id}/hide")
async def hide_session(
    session_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """Soft-hide individual: la sesion deja de aparecer en el sidebar
    pero permanece en BD. Idempotente (re-hide no falla).

    Solo emite audit_log_action cuando el estado realmente cambia
    (code-review #4, 2026-05-23): doble-click o retry no inflan el
    audit log con eventos fantasma sin cambio de estado.
    """
    history = HistoryService(db)
    try:
        _, changed = await history.hide_session(session_id, current_user.id)
    except ValueError as e:
        msg = str(e)
        if msg == "SESSION_NOT_FOUND":
            raise HTTPException(status_code=404, detail="Sesion no encontrada") from e
        if msg == "ACCESS_DENIED":
            raise HTTPException(status_code=403, detail="Acceso denegado") from e
        raise

    if changed:
        await audit_log_action(
            db,
            actor_id=current_user.id,
            actor_role="student",
            action="session_hidden",
            target_type="session",
            target_id=session_id,
            details={"reason": "user_per_session"},
            ip=_client_ip(request),
        )
    await db.commit()
    return {"ok": True, "changed": changed}


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_session(
    session_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """Hard DELETE de una sesion + CASCADE de sus messages. Ejercicio
    individual del derecho de supresion (Ley 1581 art. 8 lit. e)."""
    history = HistoryService(db)
    try:
        deleted_messages = await history.hard_delete_session(
            session_id, current_user.id
        )
    except ValueError as e:
        msg = str(e)
        if msg == "SESSION_NOT_FOUND":
            raise HTTPException(status_code=404, detail="Sesion no encontrada") from e
        if msg == "ACCESS_DENIED":
            raise HTTPException(status_code=403, detail="Acceso denegado") from e
        raise

    await audit_log_action(
        db,
        actor_id=current_user.id,
        actor_role="student",
        action="session_deleted_hard",
        target_type="session",
        target_id=session_id,
        details={"messages_deleted": deleted_messages},
        ip=_client_ip(request),
    )
    await db.commit()
    # 204 No Content — sin body


# -----------------------------------------------------------------------
# Supresion masiva (Privacidad → "Eliminar mis datos")
# -----------------------------------------------------------------------


@router.delete("/users/me/messages")
async def hard_delete_all_messages(
    request: Request,
    current_user: User = Depends(require_role("student")),
    db: AsyncSession = Depends(get_db),
):
    """Hard DELETE de TODAS las sesiones + messages del usuario.
    Preserva la cuenta, preferencias y consentimientos vigentes (el
    usuario puede seguir usando Mabel pero arranca con historial
    vacio). Ejercicio explicito del derecho de supresion sin tener
    que revocar consentimientos futuros (Ley 1581 art. 9: la
    autorizacion es revocable parcial o totalmente)."""
    history = HistoryService(db)
    result = await history.hard_delete_all_user_messages(current_user.id)

    await audit_log_action(
        db,
        actor_id=current_user.id,
        actor_role="student",
        action="user_messages_hard_delete",
        target_type="user",
        target_id=current_user.id,
        details={
            "sessions_deleted": result["affected_sessions"],
            "messages_deleted": result["deleted_messages"],
        },
        ip=_client_ip(request),
    )
    await db.commit()
    return result


# Silencia el aviso de Preference no usado — necesario para que SQLAlchemy
# registre el modelo al importar el modulo (los pref_repo.get_by_user_id
# arriba lo usan via FROM).
_ = Preference
