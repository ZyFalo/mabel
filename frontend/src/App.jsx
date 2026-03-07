function App() {
  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary mb-4">Mabel IA</h1>
        <p className="text-lg text-text-primary">En construcción</p>
        <div className="mt-6 flex gap-3 justify-center">
          <span className="inline-block w-3 h-3 rounded-full bg-primary animate-pulse" />
          <span className="inline-block w-3 h-3 rounded-full bg-accent animate-pulse [animation-delay:0.2s]" />
          <span className="inline-block w-3 h-3 rounded-full bg-success animate-pulse [animation-delay:0.4s]" />
        </div>
      </div>
    </div>
  )
}

export default App
