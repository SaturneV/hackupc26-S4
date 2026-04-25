import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL

export default function Home({ onJoined }) {
  const [mode, setMode] = useState('landing') // 'landing' | 'create' | 'join'
  const [memberCount, setMemberCount] = useState(2)
  const [sessionInput, setSessionInput] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [createdLink, setCreatedLink] = useState('')

  // Pre-fill session ID from ?session=XXXX in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sid = params.get('session')
    if (sid) {
      setSessionInput(sid.toUpperCase())
      setMode('join')
    }
  }, [])

  const handleCreate = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_count: memberCount }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { session_id } = await res.json()
      const link = `${window.location.origin}?session=${session_id}`
      setCreatedLink(link)
      setSessionInput(session_id)
      setMode('join')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    setError('')
    if (!username.trim()) { setError('Please enter your name'); return }
    if (!sessionInput.trim()) { setError('Please enter a session code'); return }
    setLoading(true)
    try {
      const res = await fetch(`${API}/session/${sessionInput.trim().toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { session_id, user_id } = await res.json()
      onJoined(session_id, user_id)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-blue-600 to-indigo-800">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">✈️</div>
          <h1 className="text-4xl font-bold text-white">GroupSolver</h1>
          <p className="text-blue-200 mt-2 text-lg">Find the perfect trip for your whole group</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {mode === 'landing' && (
            <div className="space-y-4">
              <button
                onClick={() => setMode('create')}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-lg transition-colors"
              >
                🗺️ Create a new group trip
              </button>
              <button
                onClick={() => setMode('join')}
                className="w-full py-4 bg-white hover:bg-slate-50 text-blue-700 border-2 border-blue-200 rounded-xl font-semibold text-lg transition-colors"
              >
                👥 Join a session
              </button>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800">New Group Trip</h2>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">How many travelers?</label>
                <input
                  type="number"
                  min={1} max={20}
                  value={memberCount}
                  onChange={e => setMemberCount(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors"
              >
                {loading ? 'Creating...' : 'Create Session'}
              </button>
              <button onClick={() => setMode('landing')} className="w-full text-slate-400 text-sm hover:text-slate-600">← Back</button>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800">Join the trip 🌍</h2>

              {createdLink && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <p className="text-xs text-blue-600 font-medium mb-1">Share this link with your group:</p>
                  <div className="flex gap-2">
                    <input
                      readOnly value={createdLink}
                      className="flex-1 text-xs bg-white border border-blue-200 rounded px-2 py-1 text-slate-700"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(createdLink)}
                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Session code</label>
                <input
                  value={sessionInput}
                  onChange={e => setSessionInput(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3D4"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 font-mono text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Your name</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. Maria"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button
                onClick={handleJoin}
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors"
              >
                {loading ? 'Joining...' : "Let's go! 🚀"}
              </button>
              {!createdLink && (
                <button onClick={() => setMode('landing')} className="w-full text-slate-400 text-sm hover:text-slate-600">← Back</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
