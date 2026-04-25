import { useEffect, useState } from 'react'
import MemberStatus from '../components/MemberStatus.jsx'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function Waiting({ sessionId, userId, onResults, onNegotiate }) {
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')

  const poll = async () => {
    try {
      const res = await fetch(`${API}/session/${sessionId}`)
      if (!res.ok) throw new Error('Failed to fetch session')
      const data = await res.json()
      setSession(data)
      if (data.status === 'done' || data.status === 'error') {
        onResults()
      } else if (data.status === 'negotiating') {
        onNegotiate?.()
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
  const done = members.filter(m => m.status === 'done').length
  const total = session?.member_count || members.length
  const status = session?.status || 'collecting'

  const headerIcon = status === 'aggregating' ? '🧠' : status === 'negotiating' ? '🤝' : '⏳'
  const headerTitle =
    status === 'aggregating' ? 'Finding your perfect trip...' :
    status === 'negotiating' ? 'Group negotiation in progress' :
    'Waiting for the group'
  const headerSub =
    status === 'aggregating' ? "Our AI is crunching everyone's preferences" :
    status === 'negotiating' ? 'Members are reviewing the AI compromise proposal' :
    `${done} of ${total} members have shared their preferences`

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-indigo-600 to-purple-700">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">{headerIcon}</div>
          <h1 className="text-3xl font-bold text-white">{headerTitle}</h1>
          <p className="text-indigo-200 mt-2">{headerSub}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          {status === 'negotiating' && (
            <div className="mb-5 rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3 flex items-start gap-3">
              <span className="text-xl mt-0.5">🤝</span>
              <div>
                <p className="font-semibold text-yellow-800 text-sm">Negotiation round active</p>
                <p className="text-yellow-700 text-xs mt-0.5">
                  The AI detected conflicting preferences and sent each member a compromise proposal. Waiting for everyone to respond.
                </p>
              </div>
            </div>
          )}

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-slate-500 mb-1">
              <span>Progress</span>
              <span>{done}/{total}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-500"
                style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
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
            {/* Placeholder for members who haven't joined yet */}
            {Array.from({ length: Math.max(0, total - members.length) }).map((_, i) => (
              <MemberStatus key={`empty-${i}`} username="Waiting to join..." status="waiting" />
            ))}
          </div>

          {(status === 'aggregating' || status === 'negotiating') && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 text-indigo-600 font-medium animate-pulse">
                <span>{status === 'negotiating' ? '🤝' : '🤖'}</span>
                {status === 'negotiating' ? 'Waiting for responses...' : 'AI is working its magic...'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
