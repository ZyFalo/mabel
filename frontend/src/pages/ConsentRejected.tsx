import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function ConsentRejected() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="text-5xl mb-6">&#128532;</div>
        <h1 className="text-2xl font-bold text-text-primary mb-4">Consentimiento no aceptado</h1>
        <p className="text-text-primary/60 mb-4">
          De acuerdo con la Ley 1581 de 2012, el consentimiento informado es necesario para
          utilizar Mabel IA, ya que el sistema procesa datos personales como parte de un
          proyecto de investigacion academica.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-8 text-left">
          <p className="text-sm font-medium text-text-primary mb-2">Al aceptar, puedes:</p>
          <ul className="text-sm text-text-primary/60 space-y-1.5">
            <li>&#8226; Acceder al asistente de apoyo psicoeducativo</li>
            <li>&#8226; Recibir orientacion sobre bienestar emocional</li>
            <li>&#8226; Utilizar herramientas de check-in y seguimiento</li>
            <li>&#8226; Revocar el consentimiento en cualquier momento</li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            to="/consent"
            className="px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Volver a revisar el consentimiento
          </Link>
          <button onClick={handleLogout} className="px-6 py-3 text-text-primary/60 hover:text-text-primary transition-colors">
            Cerrar sesion
          </button>
        </div>

        <p className="mt-8 text-xs text-text-primary/40">
          Si tienes preguntas, contacta al equipo de investigacion a traves de los canales institucionales de la UMB.
        </p>
      </div>
    </div>
  )
}
