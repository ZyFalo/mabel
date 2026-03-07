import { useState } from 'react'
import SosPanel from '../sos/SosPanel'

export default function SosFab() {
  const [showSos, setShowSos] = useState(false)

  return (
    <>
      <button
        onClick={() => setShowSos(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-white border-2 border-danger text-danger font-bold text-sm shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center z-40"
        aria-label="SOS"
      >
        SOS
      </button>
      <SosPanel
        open={showSos}
        trigger="manual"
        onClose={() => setShowSos(false)}
      />
    </>
  )
}
