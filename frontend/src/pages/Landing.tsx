import { Link } from 'react-router-dom'

const steps = [
  { title: 'Registrate', desc: 'Crea tu cuenta con tu email institucional UMB.' },
  { title: 'Acepta el consentimiento', desc: 'Revisa y acepta el consentimiento informado.' },
  { title: 'Conversa con Mabel', desc: 'Inicia una conversacion de apoyo psicoeducativo.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen w-full bg-[var(--ink-50)] flex flex-col items-center justify-center px-4 py-12 fade-in">
      <div className="w-full max-w-md bg-[#fff] border border-[var(--ink-200)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 scale-in">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-sm"
            style={{ backgroundColor: 'var(--mabel-600)' }}
          >
            <span className="text-white text-xl font-display italic">M</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-[28px] font-display italic text-[var(--ink-900)] text-center mb-2">
          Mabel IA
        </h1>
        <p className="text-[14px] text-[var(--ink-500)] text-center mb-8 leading-relaxed">
          Asistente virtual de apoyo psicoeducativo para estudiantes de la Universidad Manuela Beltran.
        </p>

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <Link
            to="/login"
            className="w-full px-5 py-2.5 bg-[var(--mabel-600)] text-white rounded-lg font-medium text-center hover:opacity-90 transition-opacity"
          >
            Iniciar sesion
          </Link>
          <Link
            to="/register"
            className="w-full px-5 py-2.5 border border-[var(--ink-300)] text-[var(--ink-700)] rounded-lg font-medium text-center hover:bg-[var(--ink-100)] transition-colors"
          >
            Crear cuenta
          </Link>
        </div>

        {/* Divider + steps */}
        <div className="mt-10 pt-6 border-t border-[var(--ink-100)]">
          <p className="text-[12px] uppercase tracking-wider text-[var(--ink-400)] text-center mb-4">
            Como funciona
          </p>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-medium"
                  style={{
                    backgroundColor: 'var(--ink-100)',
                    color: 'var(--mabel-600)',
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <p className="text-[14px] font-medium text-[var(--ink-900)]">{step.title}</p>
                  <p className="text-[12px] text-[var(--ink-500)] leading-relaxed">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="mt-6 text-[11px] text-[var(--ink-400)] text-center max-w-md">
        Proyecto de tesis — Ingenieria de Software, Universidad Manuela Beltran (UMB), Bogota, Colombia, 2025.
      </p>
    </div>
  )
}
