import { Link } from 'react-router-dom'

const steps = [
  { title: 'Registrate', desc: 'Crea tu cuenta con tu email institucional UMB.' },
  { title: 'Acepta el consentimiento', desc: 'Revisa y acepta el consentimiento informado.' },
  { title: 'Conversa con Mabel', desc: 'Inicia una conversacion de apoyo psicoeducativo.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg-main">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 pt-20 pb-16">
        <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center mb-6">
          <span className="text-white text-2xl font-bold">M</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-primary mb-3">Mabel IA</h1>
        <p className="text-lg text-text-primary/70 mb-8 text-center max-w-lg">
          Asistente virtual de apoyo psicoeducativo para estudiantes de la Universidad Manuela Beltran
        </p>
        <p className="text-text-primary/60 text-center max-w-md mb-10 text-sm leading-relaxed">
          Mabel IA te ofrece un espacio seguro para conversar sobre bienestar emocional,
          tecnicas de manejo del estres y orientacion psicoeducativa. No reemplaza atencion
          profesional en salud mental.
        </p>
        <div className="flex gap-4">
          <Link
            to="/register"
            className="px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Registrarse
          </Link>
          <Link
            to="/login"
            className="px-6 py-3 border-2 border-primary text-primary rounded-lg font-medium hover:bg-primary/5 transition-colors"
          >
            Iniciar sesion
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-16 px-4">
        <h2 className="text-2xl font-bold text-accent text-center mb-10">Como funciona?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {steps.map((step, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center mb-4">
                {i + 1}
              </div>
              <h3 className="font-semibold text-text-primary mb-2">{step.title}</h3>
              <p className="text-sm text-text-primary/60">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Institutional */}
      <section className="py-12 px-4 text-center">
        <p className="text-sm text-text-primary/50">
          Proyecto de tesis — Ingenieria de Software, Universidad Manuela Beltran (UMB), Bogota, Colombia, 2025.
        </p>
        <button
          onClick={() => alert('Politica de privacidad: Ver consentimiento informado al registrarse.')}
          className="mt-3 text-sm text-primary/70 underline hover:text-primary"
        >
          Politica de privacidad
        </button>
      </section>
    </div>
  )
}
