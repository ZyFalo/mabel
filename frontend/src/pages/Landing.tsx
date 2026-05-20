import { Link } from 'react-router-dom'

const steps = [
  { title: 'Registrate', desc: 'Crea tu cuenta con tu email institucional UMB.' },
  { title: 'Acepta el consentimiento', desc: 'Revisa y acepta el consentimiento informado.' },
  { title: 'Conversa con Mabel', desc: 'Inicia una conversacion de apoyo psicoeducativo.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen w-full bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12 fade-in">
      <div className="w-full max-w-md bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 scale-in">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-sm"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <span className="text-white text-xl font-display italic">M</span>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-[28px] font-display italic text-[var(--text-strong)] text-center mb-2">
          Mabel IA
        </h1>
        <p className="text-[14px] text-[var(--text-muted)] text-center mb-8 leading-relaxed">
          Asistente virtual de apoyo psicoeducativo para estudiantes de la Universidad Manuela Beltran.
        </p>

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <Link
            to="/login"
            className="w-full px-5 py-2.5 bg-[var(--accent)] text-white rounded-lg font-medium text-center hover:opacity-90 transition-opacity"
          >
            Iniciar sesion
          </Link>
          <Link
            to="/register"
            className="w-full px-5 py-2.5 border border-[var(--border-strong)] text-[var(--text)] rounded-lg font-medium text-center hover:bg-[var(--bg-hover)] transition-colors"
          >
            Crear cuenta
          </Link>
        </div>

        {/* Divider + steps */}
        <div className="mt-10 pt-6 border-t border-[var(--border-subtle)]">
          <p className="text-[12px] uppercase tracking-wider text-[var(--text-faint)] text-center mb-4">
            Como funciona
          </p>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-medium"
                  style={{
                    backgroundColor: 'var(--bg-hover)',
                    color: 'var(--accent)',
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <p className="text-[14px] font-medium text-[var(--text-strong)]">{step.title}</p>
                  <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="mt-6 text-[11px] text-[var(--text-faint)] text-center max-w-md">
        Proyecto de tesis — Ingenieria de Software, Universidad Manuela Beltran (UMB), Bogota, Colombia, 2025.
      </p>
    </div>
  )
}
