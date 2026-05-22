// Time-of-day personalised greetings for the Home landing.
//
// Strategy: hardcoded phrase pool (no DB query) selected randomly per page
// load and stabilised with `useMemo` at the call site. Browser time is the
// source of truth — reflects the user's real local hour even if they're
// travelling or on a different timezone than the backend.
//
// Tone guidelines applied to every phrase:
//   - Spanish (es-CO), tildes correctas
//   - Género-neutral (sin "lista/listo")
//   - Cálido y empático, sin clichés ni signos de exclamación múltiples
//   - 1 frase corta (cabe en un H1 32px sin saltar línea)
//   - Mabel acompaña, no anima a la fuerza — especialmente en la noche

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening'

const MORNING: ReadonlyArray<string> = [
  'Buenos días, {name}.',
  'Hola, {name}. ¿Cómo amaneciste?',
  'Buen día, {name}.',
  'Hola, {name}. Empezamos el día.',
  'Buenos días, {name}. ¿Cómo te sientes?',
  'Hola, {name}. ¿Qué tal va tu mañana?',
  'Me alegra verte, {name}.',
  'Buenos días, {name}. Aquí estoy.',
  'Hola, {name}. Un nuevo día contigo.',
  '{name}, qué bueno verte temprano.',
]

const AFTERNOON: ReadonlyArray<string> = [
  'Buenas tardes, {name}.',
  'Hola, {name}. ¿Cómo va el día?',
  'Hola, {name}. ¿Cómo te sientes?',
  'Buenas tardes, {name}. ¿Qué tal todo?',
  '{name}, me alegra verte por aquí.',
  'Hola, {name}. Tómate un respiro.',
  'Buenas tardes, {name}. ¿Necesitas hablar?',
  'Hola, {name}. Aquí estoy para ti.',
  '{name}, qué bueno tenerte de vuelta.',
  'Hola, {name}. ¿Cómo va la tarde?',
]

const EVENING: ReadonlyArray<string> = [
  'Buenas noches, {name}.',
  'Hola, {name}. ¿Cómo estuvo tu día?',
  'Hola, {name}. ¿Cómo te sientes esta noche?',
  'Buenas noches, {name}. Aquí estoy.',
  '{name}, qué bueno verte esta noche.',
  'Hola, {name}. ¿Quieres conversar un rato?',
  'Buenas noches, {name}. Tómate un momento.',
  'Hola, {name}. ¿Qué llevas en mente?',
  '{name}, gracias por venir.',
  'Hola, {name}. Una noche tranquila contigo.',
]

const POOLS: Record<GreetingPeriod, ReadonlyArray<string>> = {
  morning: MORNING,
  afternoon: AFTERNOON,
  evening: EVENING,
}

/**
 * Map a 0–23 hour to one of three time buckets. Late night (00–04) folds
 * into `evening` because the phrase pool is curated to be gentle at night
 * and the user's emotional state at 2am aligns more with "noche" than with
 * "madrugada nueva".
 */
export function getGreetingPeriod(hour: number): GreetingPeriod {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 19) return 'afternoon'
  return 'evening'
}

/**
 * Pick a random greeting for the current time and substitute `{name}` with
 * the provided first name. Pass a `Date` for testing — otherwise `new Date()`.
 *
 * Random selection uses `Math.random()`; we don't seed by date because we
 * WANT variety across page loads (matches the Claude.ai pattern).
 */
export function getTimedGreeting(name: string, date: Date = new Date()): string {
  const pool = POOLS[getGreetingPeriod(date.getHours())]
  const phrase = pool[Math.floor(Math.random() * pool.length)]
  return phrase.replace('{name}', name)
}
