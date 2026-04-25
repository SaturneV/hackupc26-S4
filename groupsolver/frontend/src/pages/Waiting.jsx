import { useEffect, useState } from 'react'
import MemberStatus from '../components/MemberStatus.jsx'

const API = import.meta.env.VITE_API_URL

export default function Waiting({ sessionId, userId, onResults }) {
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-br from-indigo-600 to-purple-700">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">
            {status === 'aggregating' ? '🧠' : '⏳'}
          </div>
          <h1 className="text-3xl font-bold text-white">
            {status === 'aggregating' ? 'Finding your perfect trip...' : 'Waiting for the group'}
          </h1>
          <p className="text-indigo-200 mt-2">
            {status === 'aggregating'
              ? 'Our AI is crunching everyone\'s preferences'
              : `${done} of ${total} members have shared their preferences`}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

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

          {status === 'aggregating' && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 text-indigo-600 font-medium animate-pulse">
                <span>🤖</span> AI is working its magic...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
