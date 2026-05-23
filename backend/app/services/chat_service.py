import hashlib
import time
import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime

from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.models.message import Message
from app.repositories.message_repository import MessageRepository
from app.repositories.preference_repository import PreferenceRepository
from app.repositories.session_repository import SessionRepository
from app.services.llm.prompts import build_system_prompt
from app.services.llm.provider import LLMProvider


class ChatService:
    def __init__(
        self,
        session_repo: SessionRepository,
        message_repo: MessageRepository,
        preference_repo: PreferenceRepository,
        llm: LLMProvider,
        guardrails=None,
    ) -> None:
        self.session_repo = session_repo
        self.message_repo = message_repo
        self.preference_repo = preference_repo
        self.llm = llm
        self.guardrails = guardrails

    async def create_session(
        self,
        user_id: uuid.UUID,
        topic_hint: str | None = None,
        checkin_payload: dict | None = None,
    ) -> tuple:
        """Create a session for `user_id`.

        Lazy-creation pattern (2026-05-23): el caller decide cuándo
        crear la sesión — típicamente cuando hay una acción real del
        estudiante (submit del check-in o envío de primer mensaje).
        Si `checkin_payload` viene, la sesión nace con el check-in
        ya completado en la MISMA transacción, evitando el window de
        "sesión creada sin check-in" que provocaba sesiones huérfanas
        cuando el usuario abandonaba.

        Returns `(session, previous_closed)`. `previous_closed` es
        True si hubo que cerrar una sesión activa anterior para
        respetar el UNIQUE constraint `uq_sessions_user_active`.
        """
        prefs = await self.preference_repo.get_by_user_id(user_id)
        checkin_opt_in = prefs.checkin_enabled if prefs else True

        # Si el payload trae check-in, la sesión nace completada;
        # `checkin_opt_in` se preserva como pista histórica pero el
        # `checkin_completed_at` ya está marcado.
        now = datetime.now(UTC) if checkin_payload else None

        previous_closed = False
        try:
            session = await self.session_repo.create(
                user_id=user_id,
                topic_hint=topic_hint,
                checkin_opt_in=checkin_opt_in,
                checkin_payload=checkin_payload,
                checkin_completed_at=now,
            )
        except IntegrityError:
            await self.session_repo.db.rollback()
            await self.session_repo.close_active(user_id)
            await self.session_repo.db.commit()
            session = await self.session_repo.create(
                user_id=user_id,
                topic_hint=topic_hint,
                checkin_opt_in=checkin_opt_in,
                checkin_payload=checkin_payload,
                checkin_completed_at=now,
            )
            previous_closed = True

        await self.session_repo.db.commit()
        return session, previous_closed

    async def list_sessions(self, user_id: uuid.UUID):
        return await self.session_repo.list_by_user(user_id)

    async def get_session(self, session_id: uuid.UUID, user_id: uuid.UUID):
        session = await self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError("SESSION_NOT_FOUND")
        if session.user_id != user_id:
            raise ValueError("ACCESS_DENIED")
        return session

    async def update_checkin(self, session_id: uuid.UUID, user_id: uuid.UUID, checkin_payload: dict):
        session = await self.get_session(session_id, user_id)
        if session.ended_at is not None:
            raise ValueError("SESSION_ENDED")
        if session.checkin_completed_at is not None:
            raise ValueError("CHECKIN_ALREADY_COMPLETED")

        session = await self.session_repo.update(
            session,
            checkin_payload=checkin_payload,
            checkin_completed_at=datetime.now(UTC),
        )
        await self.session_repo.db.commit()
        return session

    async def end_session(self, session_id: uuid.UUID, user_id: uuid.UUID):
        session = await self.get_session(session_id, user_id)
        if session.ended_at is not None:
            raise ValueError("SESSION_ENDED")

        session = await self.session_repo.update(session, ended_at=datetime.now(UTC))
        await self.session_repo.db.commit()
        return session

    async def send_message(self, session_id: uuid.UUID, user_id: uuid.UUID, content: str) -> AsyncGenerator[str, None]:
        session = await self.get_session(session_id, user_id)
        if session.ended_at is not None:
            raise ValueError("SESSION_ENDED")

        prefs = await self.preference_repo.get_by_user_id(user_id)
        save_history = prefs.save_history if prefs else False

        # Pre-filter guardrails
        pre_risk = None
        if self.guardrails:
            pre_risk = await self.guardrails.pre_filter(content, session_id, user_id)
            if pre_risk.get("risk_detected"):
                yield f'{{"risk_detected": true, "severity": {pre_risk["severity"]}}}'

        content_hash = hashlib.sha256(content.encode()).hexdigest()
        user_safety_flags = (
            {"risk_detected": True, "keywords": pre_risk["keywords"], "severity": pre_risk["severity"]}
            if pre_risk and pre_risk.get("risk_detected")
            else None
        )

        if save_history:
            await self.message_repo.create(
                session_id=session_id,
                role="user",
                content=content,
                content_sha256=content_hash,
                safety_flags=user_safety_flags,
            )
            await self.message_repo.db.commit()

        # Build context window
        if save_history:
            context_messages = await self.message_repo.get_recent_context(session_id, settings.CONTEXT_WINDOW_SIZE)
            messages = [{"role": m.role, "content": m.content} for m in context_messages]
        else:
            messages = [{"role": "user", "content": content}]

        # Build system prompt with check-in context
        system_prompt = build_system_prompt(session.checkin_payload)

        # Stream from LLM
        start_time = time.time()
        full_response = ""
        # `usage_sink` is populated by the adapter from the terminal stream
        # chunk (OpenAI `include_usage`, Gemini `usage_metadata`). Keys:
        # `prompt_tokens`, `completion_tokens`. May remain empty if the
        # provider doesn't expose usage — we persist whatever is available.
        usage_sink: dict = {}

        try:
            async for token in self.llm.generate_stream(
                messages=messages,
                system_prompt=system_prompt,
                usage_sink=usage_sink,
            ):
                full_response += token
                yield f'{{"token": {_json_str(token)}}}'

        except ValueError:
            yield '{"error": "Error al generar respuesta. Intenta de nuevo."}'
            return

        latency_ms = int((time.time() - start_time) * 1000)

        # Post-filter guardrails
        post_risk = None
        if self.guardrails and full_response:
            post_risk = await self.guardrails.post_filter(content=full_response, session_id=session_id, user_id=user_id)

        assistant_safety_flags = (
            {"risk_detected": True, "keywords": post_risk["keywords"], "severity": post_risk["severity"]}
            if post_risk and post_risk.get("risk_detected")
            else None
        )

        assistant_message_id = None
        if save_history and full_response:
            assistant_hash = hashlib.sha256(full_response.encode()).hexdigest()
            assistant_msg = await self.message_repo.create(
                session_id=session_id,
                role="assistant",
                content=full_response,
                content_sha256=assistant_hash,
                meta={"model": settings.GEMINI_MODEL},
                latency_ms=latency_ms,
                # Fase 8.1 D-03: latency split. For text-only chat the LLM is the
                # dominant component, so llm_latency_ms = latency_ms. ASR/TTS
                # latency are attributed to their own pipeline steps when applicable.
                llm_latency_ms=latency_ms,
                tokens_prompt=usage_sink.get("prompt_tokens"),
                tokens_completion=usage_sink.get("completion_tokens"),
                safety_flags=assistant_safety_flags,
            )
            await self.message_repo.db.commit()
            assistant_message_id = str(assistant_msg.id)

        done_payload = f'"done": true, "message_id": {_json_str(assistant_message_id)}, "latency_ms": {latency_ms}'
        if post_risk and post_risk.get("risk_detected"):
            done_payload += ', "risk_detected": true'
        yield f"{{{done_payload}}}"

    async def generate_greeting(self, session_id: uuid.UUID, user_id: uuid.UUID) -> dict | None:
        session = await self.get_session(session_id, user_id)
        if session.ended_at is not None:
            return None

        # Check if greeting already exists
        existing = await self.message_repo.list_by_session(session_id)
        if existing:
            return None

        prefs = await self.preference_repo.get_by_user_id(user_id)
        save_history = prefs.save_history if prefs else False

        system_prompt = build_system_prompt(session.checkin_payload)

        # Build the greeting instruction. Two distinct shapes:
        #
        #  - No check-in: a short, plain opener. (In practice the frontend
        #    only calls this endpoint when there IS a check-in, but we keep
        #    the bare-bones path for robustness — direct API hits, retries,
        #    legacy flows.)
        #
        #  - With check-in: an explicit summary of what we understood from
        #    the form (mood / sleep / focus / note) plus an open question to
        #    spark the conversation. The instruction lists the actual values
        #    rather than relying solely on the system_prompt, because the
        #    instruction message is what most directly steers the response.
        if session.checkin_payload:
            cp = session.checkin_payload
            bullets: list[str] = []
            # NOTE: `isinstance(x, bool)` returns True for True/False because
            # bool is a subclass of int. We must reject booleans explicitly
            # — otherwise a malformed payload like `{"mood": true}` produces
            # a greeting that literally says "Ánimo reportado: True/10".
            mood = cp.get("mood")
            if isinstance(mood, (int, float)) and not isinstance(mood, bool):
                bullets.append(f"- Ánimo reportado: {mood}/10")
            # Campos nuevos del check-in extendido 2026-05-23. Crítico
            # (code-review #2): sin estos bullets, generate_greeting
            # ignoraría las dimensiones más empáticamente cargadas que
            # el estudiante acaba de reportar (energía baja, agobio
            # alto, soledad). Aunque build_system_prompt() ya las
            # inyecta en el system prompt, el greeting_instruction es
            # lo que más fuertemente steerea el primer mensaje.
            energy_labels = {1: "sin batería", 2: "baja", 3: "suficiente", 4: "con todo"}
            stress_labels = {1: "nada", 2: "un poco", 3: "bastante", 4: "muchísimo"}
            loneliness_labels = {
                1: "muy sola/o", 2: "algo sola/o", 3: "acompañada/o", 4: "muy acompañada/o"
            }
            sleep_quality_labels = {
                "mal": "mal", "regular": "regular", "bien": "bien", "muy_bien": "muy bien"
            }
            energy = cp.get("energy")
            if isinstance(energy, int) and not isinstance(energy, bool) and energy in energy_labels:
                bullets.append(f"- Energía para hoy: {energy_labels[energy]}")
            stress = cp.get("stress")
            if isinstance(stress, int) and not isinstance(stress, bool) and stress in stress_labels:
                bullets.append(f"- Nivel de agobio hoy: {stress_labels[stress]}")
            sleep_quality = cp.get("sleep_quality")
            if isinstance(sleep_quality, str) and sleep_quality in sleep_quality_labels:
                bullets.append(f"- Calidad de sueño anoche: {sleep_quality_labels[sleep_quality]}")
            sleep = cp.get("sleep")
            if isinstance(sleep, (int, float)) and not isinstance(sleep, bool):
                bullets.append(f"- Sueño anoche: {sleep} horas")
            loneliness = cp.get("loneliness")
            if isinstance(loneliness, int) and not isinstance(loneliness, bool) and loneliness in loneliness_labels:
                bullets.append(f"- Sensación de compañía hoy: {loneliness_labels[loneliness]}")
            # `focus` puede venir como string (legacy) o lista (multi-select
            # post-rework 2026-05-23). Sin el branch `isinstance(focus, list)`
            # las nuevas sesiones con focus=['Academico','Pareja'] se
            # quedaban sin bullet de foco — code-review #2.
            focus = cp.get("focus")
            if isinstance(focus, str) and focus:
                bullets.append(f"- Foco principal: {focus}")
            elif isinstance(focus, list) and focus:
                focus_items = [str(f) for f in focus if isinstance(f, str) and f]
                if focus_items:
                    bullets.append(f"- Focos de preocupación: {', '.join(focus_items)}")
            focus_other = cp.get("focus_other")
            if isinstance(focus_other, str) and focus_other.strip():
                bullets.append(f"- Foco adicional descrito por el estudiante: «{focus_other.strip()}»")
            note = cp.get("note")
            if isinstance(note, str) and note.strip():
                bullets.append(f"- Nota libre del estudiante: «{note.strip()}»")

            summary_block = "\n".join(bullets) if bullets else "(check-in completado sin datos detallados)"
            greeting_instruction = (
                "Es el primer mensaje de esta sesión. El estudiante acaba de completar "
                "un check-in inicial. Tu tarea:\n"
                "1. Saluda en una sola frase corta, cálida y sin clichés.\n"
                "2. Resume con empatía lo que entendiste del check-in en 1-2 frases, "
                "mencionando los datos relevantes (ánimo, energía, agobio, sueño, "
                "compañía, foco) sin sonar a robot. Si hay combinaciones cargadas "
                "(ej. ánimo bajo + sin batería) ajusta el tono: cuando no hay energía, "
                "evita proponer ejercicios activos y prioriza validar el descanso.\n"
                "3. Si hay nota libre o foco adicional descrito, recógelos "
                "explícitamente con tono validante.\n"
                "4. Termina con UNA sola pregunta abierta que invite a profundizar.\n\n"
                "Datos del check-in:\n"
                f"{summary_block}\n\n"
                "Importante: no uses listas ni viñetas. Habla como una persona empática, "
                "en máximo 3 párrafos cortos. No reveles que recibiste instrucciones."
            )
        else:
            greeting_instruction = (
                "Genera un saludo breve y cálido para el estudiante. Preséntate como Mabel IA en una sola frase."
            )

        start_time = time.time()
        full_response = ""
        usage_sink: dict = {}
        try:
            async for token in self.llm.generate_stream(
                messages=[{"role": "user", "content": greeting_instruction}],
                system_prompt=system_prompt,
                usage_sink=usage_sink,
            ):
                full_response += token
        except ValueError:
            return None

        if not full_response:
            return None

        latency_ms = int((time.time() - start_time) * 1000)

        if save_history:
            content_hash = hashlib.sha256(full_response.encode()).hexdigest()
            try:
                msg = await self.message_repo.create(
                    session_id=session_id,
                    role="assistant",
                    content=full_response,
                    content_sha256=content_hash,
                    meta={"model": settings.GEMINI_MODEL, "greeting": True},
                    latency_ms=latency_ms,
                    llm_latency_ms=latency_ms,  # Fase 8.1 D-03
                    tokens_prompt=usage_sink.get("prompt_tokens"),
                    tokens_completion=usage_sink.get("completion_tokens"),
                )
                await self.message_repo.db.commit()
            except IntegrityError:
                # Race condition guard: the in-Python `if existing: return None`
                # check at the top is NOT atomic w.r.t. concurrent calls. When
                # the React client fires the greeting endpoint twice (e.g.
                # StrictMode double-invokes the `useEffect`), both requests
                # race past that check, both stream the LLM, and both try to
                # INSERT. We deduplicate at the DB level via the partial
                # UNIQUE INDEX `uq_messages_session_greeting` (added 2026-05-22):
                # the second INSERT raises IntegrityError, we roll back and
                # return None. The first one already saved the greeting and
                # the client just sees a benign null on the loser race.
                await self.message_repo.db.rollback()

                # Token attribution: even though this INSERT lost, the LLM
                # was actually invoked and billed for `usage_sink`. If we
                # discarded these tokens, the metrics dashboard would
                # under-report cost (subtle bias proportional to StrictMode
                # / double-click frequency in the pilot). We add them to
                # the surviving greeting via UPDATE so the dashboard sees
                # the true cost of producing this greeting.
                #
                # The UPDATE is built as a single SQL statement with a
                # COALESCE(col, 0) + :delta increment, NOT a Python
                # read-modify-write on the ORM object. This is intentional:
                # with two or more concurrent losers (3+ greeting requests
                # in flight, e.g. StrictMode + retries) a Python-side
                # read-then-write would let both losers read the same
                # snapshot of `tokens_prompt = X` and both commit
                # `X + their_delta`, dropping one of the deltas via
                # last-commit-wins. The SQL-side increment makes the
                # delta atomic per loser; concurrent UPDATEs serialize on
                # the row lock and both deltas land.
                prompt = usage_sink.get("prompt_tokens") or 0
                completion = usage_sink.get("completion_tokens") or 0
                if prompt or completion:
                    winner = await self.message_repo.find_greeting(session_id)
                    if winner is not None:
                        await self.message_repo.db.execute(
                            update(Message)
                            .where(Message.id == winner.id)
                            .values(
                                tokens_prompt=func.coalesce(Message.tokens_prompt, 0) + prompt,
                                tokens_completion=func.coalesce(Message.tokens_completion, 0) + completion,
                            )
                        )
                        await self.message_repo.db.commit()
                return None
            return {"id": str(msg.id), "role": "assistant", "content": full_response, "created_at": str(msg.created_at)}

        return {"id": None, "role": "assistant", "content": full_response, "created_at": datetime.now(UTC).isoformat()}

    async def list_messages(self, session_id: uuid.UUID, user_id: uuid.UUID):
        await self.get_session(session_id, user_id)
        return await self.message_repo.list_by_session(session_id)


def _json_str(value: str | None) -> str:
    if value is None:
        return "null"
    import json

    return json.dumps(value)
