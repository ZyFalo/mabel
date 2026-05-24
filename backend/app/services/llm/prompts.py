from app.core.config import settings


# ─────────────────────────────────────────────────────────────────────
# System prompts por modelo
# ─────────────────────────────────────────────────────────────────────
#
# Mabel tiene DOS motores LLM soportados con system prompts distintos:
#
# 1. `MABEL_GEMMA4_SYSTEM_PROMPT` — el prompt B+ EXACTO con el que se
#    fine-tuneó el modelo propio `mabel-gemma4-e4b-Q4_K_M` (hosteado en
#    Modal.com). Cambiar este string degrada la calidad del modelo:
#    según la doc del repo Gemma4-Mabel, los safety guardrails se
#    debilitan, el estilo deja de ser conversacional y el modelo puede
#    empezar a diagnosticar. NUNCA editar a la ligera. Si necesitamos
#    inyectar contexto (check-in, voice mode) lo hacemos como prefijo
#    al primer turno del usuario, no aquí.
#
# 2. `MABEL_SYSTEM_PROMPT` — versión rica usada con LLMs no entrenados
#    para Mabel (Gemini, OpenAI, etc., como fallback). Incluye reglas
#    de identidad, personalidad y límites porque esos modelos no los
#    conocen por entrenamiento.
#
# `build_system_prompt()` elige uno u otro según el modelo configurado
# en LLM_MODEL.

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
    """True si el deploy está configurado para usar el system prompt
    fijo del fine-tuning Mabel-Gemma4.

    DECISIÓN EXPLÍCITA via env var `LLM_FLAVOR=mabel_gemma4`. Antes
    se inferia por substring match en LLM_MODEL ('mabel-gemma' in
    nombre), pero esa heurística era frágil:

    - Rename a 'umb-gemma4-prod' para ocultar brand en logs → False
      cuando debería ser True → se enviaba prompt verbose al fine-tune.
    - Coincidencia accidental tipo 'mabel-gemma3-otro-proyecto' → True
      cuando debería ser False → se enviaba prompt corto al modelo
      equivocado.

    El env var explícito elimina la ambigüedad. Si LLM_FLAVOR no se
    setea, defaultea a 'generic' (comportamiento legacy seguro).
    """
    return (settings.LLM_FLAVOR or "").strip().lower() == "mabel_gemma4"


MABEL_SYSTEM_PROMPT = """Eres Mabel IA, una asistente virtual de psicoeducacion en salud mental creada para apoyar a los estudiantes de la Universidad Manuela Beltran (UMB) en Bogota, Colombia.

REGLAS DE IDENTIDAD (NUNCA violar):
- Tu nombre es Mabel IA. Siempre presentate como Mabel.
- NUNCA digas que eres un modelo de lenguaje, una IA de Google, Gemini, ni ningun otro nombre que no sea Mabel IA.
- Si te preguntan quien eres, responde: "Soy Mabel IA, tu asistente de bienestar emocional de la UMB."
- Si te preguntan como funcionas, di que fuiste creada por el equipo de investigacion de la UMB para acompanar a los estudiantes.
- NUNCA menciones a Google, Gemini, GPT, OpenAI ni ningun proveedor tecnologico.

PERSONALIDAD:
- Empatica, calida, profesional
- Usas lenguaje cercano pero respetuoso
- Hablas en espanol colombiano
- Escucha activamente y valida las emociones del estudiante
- Ofrece tecnicas basadas en evidencia: respiracion, mindfulness, gestion del tiempo, higiene del sueno
- Manten las respuestas concisas pero significativas
- Recuerda el contexto de la conversacion para dar continuidad

LIMITES ESTRICTOS:
- NO diagnosticas trastornos mentales ni condiciones clinicas.
- NO prescribes medicamentos ni tratamientos medicos.
- NO reemplazas a profesionales de salud mental (psicologos, psiquiatras).
- NO solicitas datos personales sensibles (cedula, direccion, informacion financiera).
- Si un estudiante menciona ideacion suicida, autolesion o riesgo grave, responde con empatia, valida sus emociones y sugiere buscar ayuda profesional inmediata. No minimices su experiencia.
- Cuando no sepas algo, admitelo honestamente.
"""


# --- Mapeos para serializar el check-in al system prompt ---

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
    Se usa en DOS escenarios:

    1. Concatenado al MABEL_SYSTEM_PROMPT cuando el motor es Gemini /
       OpenAI (build_system_prompt lo hace internamente).
    2. Inyectado como prefijo al primer turno del USER cuando el motor
       es Mabel-Gemma4 (chat_service.send_message lo invoca directo
       para evitar tocar el system prompt fijo del fine-tuning).

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

    Lógica:
    - Si el modelo es Mabel-Gemma4 (fine-tuned), devuelve el prompt FIJO
      del fine-tuning sin modificación. El check-in NO se inyecta aquí
      (el caller debe usar `build_checkin_context_block` y prefijar al
      primer user turn). Modificar este prompt degrada calidad.
    - Si el modelo es genérico (Gemini, OpenAI), devuelve el prompt
      rico con identidad + reglas + check-in concatenado, mismo
      comportamiento que antes del split.

    Acepta los 7 campos del check-in actual (todos opcionales):
      - mood (0-10)            ánimo, vía 5 caritas en UI
      - energy (1-4)           recursos para el día
      - stress (1-4)           qué tan abrumada/o se siente hoy
      - sleep_quality (str)    calidad subjetiva — predice mejor que horas
      - sleep (float)          horas exactas, opcional, complementa quality
      - loneliness (1-4)       conexión / soledad UCLA single-item
      - focus (str | list)     multi-select, ahora con Pareja y Futuro
      - focus_other (str)      texto libre cuando focus incluye 'Otro'
      - note (str)             texto libre
    """
    # Motor con identidad por entrenamiento: NO tocar el system prompt.
    if is_mabel_gemma4():
        return MABEL_GEMMA4_SYSTEM_PROMPT

    return _build_system_prompt_generic(checkin_payload)


def _build_system_prompt_generic(checkin_payload: dict | None = None) -> str:
    """Versión original para LLMs no entrenados — preserva el contrato.

    Acepta los 7 campos del check-in actual (todos opcionales):
      - mood (0-10)            ánimo, vía 5 caritas en UI
      - energy (1-4)           recursos para el día
      - stress (1-4)           qué tan abrumada/o se siente hoy
      - sleep_quality (str)    calidad subjetiva — predice mejor que horas
      - sleep (float)          horas exactas, opcional, complementa quality
      - loneliness (1-4)       conexión / soledad UCLA single-item
      - focus (str | list)     multi-select, ahora con Pareja y Futuro
      - focus_other (str)      texto libre cuando focus incluye 'Otro'
      - note (str)             texto libre

    El bloque se concatena al system prompt como CONTEXTO DEL ESTUDIANTE.
    Mabel está instruida arriba para no repetir literalmente sino
    demostrar empatía basada en estos datos.

    Sesiones legacy con solo {mood, sleep, focus, note} siguen
    funcionando — los campos faltantes simplemente no se incluyen.
    """
    prompt = MABEL_SYSTEM_PROMPT
    if not checkin_payload:
        return prompt

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
        # Legacy: solo horas sin calidad
        parts.append(f"- Horas de sueno: {sleep}")
    if loneliness in _LONELINESS_LABEL:
        parts.append(f"- Sensacion de conexion social: {_LONELINESS_LABEL[loneliness]}")
    focus_str = _format_focus(focus_raw, focus_other if isinstance(focus_other, str) else None)
    if focus_str:
        parts.append(f"- Foco de preocupacion: {focus_str}")
    if note:
        parts.append(f"- Nota adicional: {note}")

    if parts:
        prompt += "\nCONTEXTO DEL ESTUDIANTE (check-in de esta sesion):\n"
        prompt += "\n".join(parts)
        prompt += (
            "\n\nUsa esta informacion para personalizar tu respuesta y mostrar "
            "que entiendes como se siente el estudiante. No la repitas "
            "textualmente, sino que demuestra empatia basandote en estos "
            "datos. Si combinas señales (p. ej. animo bajo + sin bateria), "
            "ajusta el tono: cuando no hay energia, evita proponer ejercicios "
            "activos y prioriza validar el descanso.\n"
        )
    return prompt
