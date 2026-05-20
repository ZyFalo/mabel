import { Link, useNavigate } from 'react-router-dom'
import { Frown } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

export default function ConsentRejected() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen w-full bg-[var(--ink-50)] flex items-center justify-center px-4 py-12 fade-in">
      <div className="w-full max-w-2xl bg-[#fff] border border-[var(--ink-200)] rounded-2xl shadow-sm px-6 py-8 md:px-10 md:py-10 scale-in">
        <div className="flex justify-center mb-5">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--ink-100)' }}
          >
            <Frown size={28} style={{ color: 'var(--ink-500)' }} />
          </div>
        </div>

        <h1 className="text-[24px] font-display italic text-[var(--ink-900)] text-center mb-3">
          Consentimiento no aceptado
        </h1>
        <p className="text-[14px] text-[var(--ink-500)] text-center mb-6 leading-relaxed">
          De acuerdo con la Ley 1581 de 2012, el consentimiento informado es necesario para utilizar
          Mabel IA, ya que el sistema procesa datos personales como parte de un proyecto de
          investigacion academica.
        </p>

        <div
          className="rounded-lg p-4 mb-8 border"
          style={{
            backgroundColor: 'var(--ink-100)',
            borderColor: 'var(--ink-100)',
          }}
        >
          <p className="text-[13px] font-medium text-[var(--ink-900)] mb-2">Al aceptar, puedes:</p>
          <ul className="text-[13px] text-[var(--ink-500)] space-y-1.5">
            <li>&#8226; Acceder al asistente de apoyo psicoeducativo</li>
            <li>&#8226; Recibir orientacion sobre bienestar emocional</li>
            <li>&#8226; Utilizar herramientas de check-in y seguimiento</li>
            <li>&#8226; Revocar el consentimiento en cualquier momento</li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            to="/consent"
            className="w-full px-5 py-2.5 bg-[var(--mabel-600)] text-white rounded-lg font-medium text-center hover:opacity-90 transition-opacity"
          >
            Volver a revisar el consentimiento
          </Link>
          <button
            onClick={handleLogout}
            className="w-full px-5 py-2.5 border border-[var(--ink-300)] text-[var(--ink-700)] rounded-lg font-medium hover:bg-[var(--ink-100)] transition-colors"
          >
            Cerrar sesion
          </button>
        </div>

        <p className="mt-6 text-[11px] text-[var(--ink-400)] text-center">
          Si tienes preguntas, contacta al equipo de investigacion a traves de los canales
          institucionales de la UMB.
        </p>
      </div>
    </div>
  )
}
