from app.core.config import settings  # noqa: F401 — usado por callers que importan vía este módulo


# ─────────────────────────────────────────────────────────────────────
# System prompt unificado para Mabel
# ─────────────────────────────────────────────────────────────────────
#
# DECISIÓN 2026-05-25 (switch admin LLM): Mabel usa UN solo system
# prompt — `MABEL_GEMMA4_SYSTEM_PROMPT` — independientemente del
# adapter activo (Mabel-Gemma4 propio en Modal, o Gemini de Google).
# Razón:
#   - Mabel-Gemma4 fue fine-tuneada a este prompt EXACTO; cualquier
#     desviación degrada calidad (lo dice la doc del repo Gemma4-Mabel:
#     safety guardrails se debilitan, estilo deja de ser conversacional,
#     el modelo puede empezar a diagnosticar).
#   - Gemini se adapta a cualquier prompt razonable y este cubre
#     identidad + escucha activa + límites + protocolo de crisis.
#
# El check-in del estudiante NO se concatena al system prompt — se
# inyecta como prefijo del primer user turn en `chat_service.send_message`
# para ambos motores (`_inject_checkin_into_first_user_turn`).

# DECISIÓN DELIBERADA — NO añadir aquí reglas de identidad tipo "Nunca
# digas que eres Gemini/Google". El modelo fue fine-tuneado con este
# prompt EXACTO; cualquier adición degrada calidad (lo dice la doc del
# repo Gemma4-Mabel). Las reglas de identidad se cumplen vía el fine-
# tuning mismo, no via prompt.
#
# RIESGO RESIDUAL: si Modal sirve el modelo BASE (sin fine-tune) por
# error de deploy mientras LLM_MODEL aún apunta al fine-tune, podríamos
# tener un brand leak ("Soy Gemma de Google"). Mitigación operativa
# (no de prompt):
#   1. /api/v1/llm/health permite pre-warming + observabilidad del
#      endpoint Modal — si serve algo distinto al fine-tune, el admin
#      lo detecta en el primer smoke chat.
#   2. Al desplegar a Modal, el script de deploy debe verificar que
#      el GGUF cargado sea el fine-tuneado (model card hash), no la
#      versión base.
# Si en el futuro queremos garantía hard a nivel app, agregar un post-
# filter en chat_service que detecte respuestas con 'Soy Gemma|Google'
# y las reescriba o las marque como safety_event.
MABEL_GEMMA4_SYSTEM_PROMPT = (
    "Te llamas Mabel, asistente de apoyo emocional para estudiantes "
    "universitarios colombianos de la UMB. Escucha activa: valida "
    "emociones primero y haz preguntas exploratorias para entender lo "
    "que pasa. Cuando tenga sentido, ofrece 1-2 sugerencias prácticas "
    "breves en prosa, sin imponer. No eres psicóloga profesional, no "
    "diagnosticas ni das planes terapéuticos. Tampoco resuelves tareas "
    "académicas, código, traducciones, resúmenes ni preguntas "
    "factuales: si te las piden, valida la emoción detrás y redirige "
    "sin sermonear. Responde en español colombiano, breve (máx 4-5 "
    "frases), conversacional, puede usar negrita y cursiva para "
    "énfasis, sin headings ni listas con bullets ni emojis. Si hay "
    "crisis (suicidio, autolesión), mantén la calma, valida, deriva a "
    "Línea 123, Línea 106, Línea 155 o Bienestar UMB y pregunta por "
    "persona de confianza."
)


def is_mabel_gemma4() -> bool:
    """DEPRECADO — no usar en código nuevo.

    El system prompt unificado (decisión 2026-05-25) ya no depende de
    este flag. Las decisiones por-motor (TTS suffix, inyección del
    check-in al primer user turn) ahora viajan en `ChatService.provider_name`,
    poblado por el factory `get_llm_provider()` desde `system_config`.

    Esta función queda solo por compatibilidad con tests / scripts
    externos que la pudieran importar; devuelve `True` constante para
    no romper esos callers (todos asumían el deploy productivo de
    Mabel-Gemma4).
    """
    return True


# --- Mapeos para serializar el check-in al primer user turn ---

# Calidad de sueño subjetiva (reemplaza el campo crudo `sleep` en horas
# como dimensión principal, ver `constants/checkin.ts` en frontend).
_SLEEP_QUALITY_LABEL = {
    "mal": "mal",
    "regular": "regular",
    "bien": "bien",
    "muy_bien": "muy bien",
}

# Escalas 1-4 de los segmented sliders (energy, stress, loneliness).
# Mantenemos label numérico + descripción humana para que el LLM tenga
# ambas pistas: la palabra dispara empatía, el número permite gradación
# si Mabel quiere matizar.
_ENERGY_LABEL = {1: "sin batería", 2: "baja", 3: "suficiente", 4: "con todo"}
_STRESS_LABEL = {1: "nada", 2: "un poco", 3: "bastante", 4: "muchísimo"}
_LONELINESS_LABEL = {
    1: "muy sola/o",
    2: "algo sola/o",
    3: "acompañada/o",
    4: "muy acompañada/o",
}


def _format_focus(focus, focus_other: str | None) -> str | None:
    """Serializa el campo `focus` que puede venir como string (legacy)
    o como lista (formato actual con multi-select). Si está presente
    `focus_other` y la lista incluye 'Otro', concatena el texto libre
    entre paréntesis para que Mabel lo pueda referenciar.
    """
    if not focus:
        return None
    if isinstance(focus, str):
        items = [focus]
    elif isinstance(focus, list):
        items = [str(x) for x in focus if x]
    else:
        return None
    if not items:
        return None
    base = ", ".join(items)
    if focus_other and "Otro" in items:
        base += f' (otro: "{focus_other}")'
    return base


def build_checkin_context_block(checkin_payload: dict | None) -> str:
    """Serializa el check-in a un bloque de texto reutilizable.

    Devuelve string vacío si no hay payload o no hay campos válidos.
    Se inyecta como prefijo al primer turno del USER en
    `chat_service.send_message` para AMBOS motores (Mabel-Gemma4 y
    Gemini). Evita tocar el system prompt fijo del fine-tuning.

    Misma serialización de los 7 campos del check-in actual:
      - mood (0-10), energy (1-4), stress (1-4), sleep_quality (str),
        sleep (float, opcional), loneliness (1-4), focus (str|list),
        focus_other (str), note (str).
    """
    if not checkin_payload:
        return ""

    mood = checkin_payload.get("mood")
    energy = checkin_payload.get("energy")
    stress = checkin_payload.get("stress")
    sleep_quality = checkin_payload.get("sleep_quality")
    sleep = checkin_payload.get("sleep")
    loneliness = checkin_payload.get("loneliness")
    focus_raw = checkin_payload.get("focus")
    focus_other = checkin_payload.get("focus_other")
    note = checkin_payload.get("note")

    parts: list[str] = []
    if mood is not None:
        parts.append(f"- Estado de animo: {mood}/10")
    if energy in _ENERGY_LABEL:
        parts.append(f"- Energia para hoy: {_ENERGY_LABEL[energy]} ({energy}/4)")
    if stress in _STRESS_LABEL:
        parts.append(f"- Nivel de agobio hoy: {_STRESS_LABEL[stress]} ({stress}/4)")
    if sleep_quality in _SLEEP_QUALITY_LABEL:
        sleep_line = f"- Calidad de sueño anoche: {_SLEEP_QUALITY_LABEL[sleep_quality]}"
        if sleep is not None:
            sleep_line += f" (~{sleep} h)"
        parts.append(sleep_line)
    elif sleep is not None:
        parts.append(f"- Horas de sueno: {sleep}")
    if loneliness in _LONELINESS_LABEL:
        parts.append(f"- Sensacion de conexion social: {_LONELINESS_LABEL[loneliness]}")
    focus_str = _format_focus(focus_raw, focus_other if isinstance(focus_other, str) else None)
    if focus_str:
        parts.append(f"- Foco de preocupacion: {focus_str}")
    if note:
        parts.append(f"- Nota adicional: {note}")

    return "\n".join(parts)


def build_system_prompt(checkin_payload: dict | None = None) -> str:
    """Construye el system prompt para enviar al LLM.

    DECISIÓN 2026-05-25 (switch admin LLM): el system prompt se unifica
    al `MABEL_GEMMA4_SYSTEM_PROMPT` (corto, fine-tune-targeted) para
    AMBOS proveedores. Razón:
    - Mabel-Gemma4 fue fine-tuneada a este prompt EXACTO; cambiarlo
      degrada su calidad.
    - Gemini se adapta a cualquier prompt razonable y el corto cubre
      identidad + escucha activa + límites + crisis.

    Consecuencia: el `checkin_payload` NO se concatena aquí; se inyecta
    como prefijo del primer user turn en `chat_service.send_message`
    via `_inject_checkin_into_first_user_turn` para ambos motores. El
    `checkin_payload` queda en la firma por compatibilidad (callers
    legacy lo pasan posicional) — se ignora intencionalmente. La rama
    "prompt rico" (`MABEL_SYSTEM_PROMPT` + `_build_system_prompt_generic`)
    fue removida porque era código muerto tras la unificación y un
    futuro maintainer podría asumir erróneamente que Gemini la recibe.
    """
    # `checkin_payload` se mantiene en la firma pero no se usa aquí
    # (se inyecta en el user turn). Suprimimos el unused-arg.
    _ = checkin_payload
    return MABEL_GEMMA4_SYSTEM_PROMPT
