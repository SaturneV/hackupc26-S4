import { useEffect, useState, useRef } from 'react'
import MemberStatus from '../components/MemberStatus.jsx'

const API = import.meta.env.VITE_API_URL

export default function Waiting({ sessionId, userId, onResults, onNegotiate }) {
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')
  const negotiateCalledRef = useRef(false)

  const poll = async () => {
    try {
      const res = await fetch(`${API}/session/${sessionId}`)
      if (!res.ok) throw new Error('No se pudo conectar con el servidor')
      const data = await res.json()
      setSession(data)

      if (data.status === 'done' || data.status === 'error') {
        onResults()
      } else if (data.status === 'negotiating' && !negotiateCalledRef.current) {
        negotiateCalledRef.current = true
        // Fetch the negotiation message before switching page
        try {
          const nr = await fetch(`${API}/session/${sessionId}/negotiation-round`)
          const round = nr.ok ? await nr.json() : {}
          onNegotiate?.(round.proposal_message || null)
        } catch (_) {
          onNegotiate?.(null)
        }
      }
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [sessionId])

  const members = session?.members_info || []
  const doneCount = members.filter(m => m.status === 'done').length
  const total = session?.member_count || members.length
  const status = session?.status || 'collecting'
  const allDone = total > 0 && doneCount === total

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-indigo-600 to-purple-700">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">
            {status === 'aggregating' ? '🧠' : allDone ? '🔍' : '⏳'}
          </div>
          <h1 className="text-3xl font-bold text-white">
            {status === 'aggregating'
              ? 'Buscando el viaje perfecto...'
              : allDone
              ? 'Analizando compatibilidades...'
              : 'Esperando al grupo'}
          </h1>
          <p className="text-indigo-200 mt-2">
            {status === 'aggregating'
              ? 'La IA está procesando las preferencias'
              : allDone
              ? 'Comprobando si hay conflictos entre las preferencias del grupo'
              : `${doneCount} de ${total} miembros han completado sus preferencias`}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-500 mb-1">
              <span>Progreso</span>
              <span>{doneCount}/{total}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-700"
                style={{ width: total > 0 ? `${(doneCount / total) * 100}%` : '0%' }}
              />
            </div>
          </div>

          {/* Member list */}
          <div className="space-y-2">
            {members.map(m => (
              <MemberStatus
                key={m.user_id}
                username={m.username}
                status={m.status}
                isMe={m.user_id === userId}
              />
            ))}
            {Array.from({ length: Math.max(0, total - members.length) }).map((_, i) => (
              <MemberStatus key={`empty-${i}`} username="Esperando unirse..." status="waiting" />
            ))}
          </div>

          {/* Analysing spinner */}
          {(status === 'aggregating' || allDone) && (
            <div className="mt-5 flex flex-col items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <p className="text-sm text-indigo-600 font-medium">
                {status === 'aggregating' ? 'La IA está trabajando...' : 'Analizando preferencias...'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
