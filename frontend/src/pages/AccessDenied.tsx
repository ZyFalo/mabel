import { Link } from 'react-router-dom'

export default function AccessDenied() {
  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">&#128274;</div>
        <h1 className="text-2xl font-bold text-text-primary mb-3">Acceso denegado</h1>
        <p className="text-text-primary/60 mb-8">No tienes permisos para acceder a esta pagina.</p>
        <Link
          to="/home"
          className="px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
