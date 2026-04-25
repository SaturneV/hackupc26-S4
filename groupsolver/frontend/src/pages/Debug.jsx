import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function Debug() {
  const [sessionId, setSessionId] = useState('')
  const [input, setInput] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetch_debug = async (sid) => {
    if (!sid.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/debug/${sid.trim().toUpperCase()}`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      setData(await res.json())
      setSessionId(sid.trim().toUpperCase())
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  // Auto-refresh every 3s while viewing
  useEffect(() => {
    if (!sessionId) return
    const id = setInterval(() => fetch_debug(sessionId), 3000)
    return () => clearInterval(id)
  }, [sessionId])

  const statusColor = (s) => ({
    chatting: 'bg-yellow-100 text-yellow-800',
    done: 'bg-green-100 text-green-800',
    collecting: 'bg-blue-100 text-blue-800',
    aggregating: 'bg-purple-100 text-purple-800',
    error: 'bg-red-100 text-red-800',
  }[s] || 'bg-gray-100 text-gray-700')

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-mono">
      <h1 className="text-2xl font-bold text-green-400 mb-6">🛠 Debug View</h1>

      {/* Session input */}
      <div className="flex gap-2 mb-8">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetch_debug(input)}
          placeholder="Session ID (e.g. 07B1BA6D)"
          className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button
          onClick={() => fetch_debug(input)}
          disabled={loading}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-sm font-semibold"
        >
          {loading ? '...' : 'Load'}
        </button>
      </div>

      {error && <div className="text-red-400 mb-4">Error: {error}</div>}

      {data && (
        <div className="space-y-6">
          {/* Session meta */}
          <section>
            <h2 className="text-green-400 text-sm font-bold mb-2 uppercase tracking-wider">Session</h2>
            <div className="bg-slate-800 rounded p-4 text-xs space-y-1">
              <div><span className="text-slate-400">ID:</span> {sessionId}</div>
              <div><span className="text-slate-400">Status:</span>{' '}
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColor(data.session.status)}`}>
                  {data.session.status}
                </span>
              </div>
              <div><span className="text-slate-400">Members:</span> {data.session.members?.length || 0} / {data.session.member_count}</div>
              <div><span className="text-slate-400">Created:</span> {data.session.created_at}</div>
            </div>
          </section>

          {/* Members */}
          <section>
            <h2 className="text-green-400 text-sm font-bold mb-2 uppercase tracking-wider">Members</h2>
            <div className="space-y-3">
              {Object.entries(data.members).map(([uid, m]) => (
                <div key={uid} className="bg-slate-800 rounded p-4 text-xs">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-white font-bold">{m.username || uid}</span>
                    <span className="text-slate-500 text-xs">{uid}</span>
                    <span className={`ml-auto px-2 py-0.5 rounded font-semibold ${statusColor(m.status)}`}>
                      {m.status}
                    </span>
                    <span className="text-slate-400">{m.message_count} msgs</span>
                  </div>

                  <div className="mb-2">
                    <span className="text-slate-400">Collected so far:</span>
                    {Object.keys(m.collected_so_far).length === 0
                      ? <span className="text-slate-500 ml-2">nothing yet</span>
                      : (
                        <div className="mt-1 grid grid-cols-2 gap-1">
                          {m.collected_so_far.available_dates && (
                            <div className="bg-slate-700 rounded px-2 py-1">
                              <span className="text-slate-400">dates: </span>
                              <span className="text-white">{m.collected_so_far.available_dates.start} → {m.collected_so_far.available_dates.end}</span>
                            </div>
                          )}
                          {m.collected_so_far.max_budget_flight != null && (
                            <div className="bg-slate-700 rounded px-2 py-1">
                              <span className="text-slate-400">budget: </span>
                              <span className="text-white">€{m.collected_so_far.max_budget_flight}</span>
                            </div>
                          )}
                          {m.collected_so_far.trip_type && (
                            <div className="bg-slate-700 rounded px-2 py-1">
                              <span className="text-slate-400">type: </span>
                              <span className="text-white">{m.collected_so_far.trip_type?.join(', ')}</span>
                            </div>
                          )}
                          {m.collected_so_far.trip_duration != null && (
                            <div className="bg-slate-700 rounded px-2 py-1">
                              <span className="text-slate-400">duration: </span>
                              <span className="text-white">{m.collected_so_far.trip_duration} days</span>
                            </div>
                          )}
                        </div>
                      )
                    }
                  </div>

                  {m.preferences && (
                    <div>
                      <span className="text-green-400">✓ Final preferences:</span>
                      <pre className="mt-1 bg-slate-700 rounded p-2 text-xs overflow-x-auto text-green-300">
                        {JSON.stringify(m.preferences, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Result */}
          {data.result && (
            <section>
              <h2 className="text-green-400 text-sm font-bold mb-2 uppercase tracking-wider">Aggregation Result</h2>
              <pre className="bg-slate-800 rounded p-4 text-xs overflow-x-auto text-slate-200">
                {JSON.stringify(data.result, null, 2)}
              </pre>
            </section>
          )}

          <div className="text-slate-600 text-xs">Auto-refreshing every 3s</div>
        </div>
      )}
    </div>
  )
}
