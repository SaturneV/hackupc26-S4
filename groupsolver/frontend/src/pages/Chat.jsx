import { useState, useEffect, useRef } from 'react'
import ChatBubble from '../components/ChatBubble.jsx'

const API = import.meta.env.VITE_API_URL

export default function Chat({ sessionId, userId, onDone }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const bottomRef = useRef(null)
  const greetedRef = useRef(false)

  useEffect(() => {
    if (greetedRef.current) return
    greetedRef.current = true
    sendMessage('Hello!')
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return
    if (text !== 'Hello!') {
      setMessages(prev => [...prev, { role: 'user', text }])
    }
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${API}/session/${sessionId}/member/${userId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || res.statusText)
      }
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply }])
      if (data.done) {
        setDone(true)
        setTimeout(onDone, 2000)
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${e.message}. Please try again.` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-4 shadow">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="text-3xl">🤖</div>
          <div>
            <h1 className="text-white font-bold text-lg">Travel Agent</h1>
            <p className="text-blue-200 text-sm">Session: {sessionId}</p>
          </div>
          {done && (
            <div className="ml-auto bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
              Done! Waiting for others...
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, i) => (
            <ChatBubble key={i} role={msg.role} text={msg.text} />
          ))}
          {loading && <ChatBubble role="assistant" text="..." typing />}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t bg-white px-4 py-3">
        <form
          onSubmit={e => { e.preventDefault(); sendMessage(input) }}
          className="max-w-2xl mx-auto flex gap-2"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading || done}
            placeholder={done ? 'Preferences saved!' : 'Type your answer...'}
            className="flex-1 border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
          />
          <button
            type="submit"
            disabled={loading || done || !input.trim()}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
