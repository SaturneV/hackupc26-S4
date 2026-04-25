import { useState, useEffect, useRef, useCallback } from 'react'
import ChatBubble from '../components/ChatBubble.jsx'

const API = import.meta.env.VITE_API_URL

const SR = window.SpeechRecognition || window.webkitSpeechRecognition
const SS = window.speechSynthesis
const VOICE_SUPPORTED = !!(SR && SS)

function speak(text, lang = 'es-ES') {
  if (!SS) return
  SS.cancel()
  const utt = new SpeechSynthesisUtterance(text.replace(/\*\*/g, '').replace(/#+\s*/g, ''))
  utt.lang = lang
  utt.rate = 1.05
  SS.speak(utt)
}

export default function Chat({ sessionId, userId, onDone }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [negotiating, setNegotiating] = useState(false)
  const [negotiationShown, setNegotiationShown] = useState(false)

  // Voice state
  const [voiceOn, setVoiceOn] = useState(true)       // TTS auto-play toggle
  const [listening, setListening] = useState(false)   // microphone active
  const [noSupport, setNoSupport] = useState(false)

  const bottomRef = useRef(null)
  const greetedRef = useRef(false)
  const srRef = useRef(null)                           // SpeechRecognition instance
  const sendMessageRef = useRef(null)                  // always-current sendMessage ref

  // ── helpers ─────────────────────────────────────────────────────────────────

  const addBotMessage = useCallback((text) => {
    setMessages(prev => [...prev, { role: 'assistant', text }])
    if (voiceOn) speak(text)
  }, [voiceOn])

  // ── init greeting ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (greetedRef.current) return
    greetedRef.current = true
    sendMessage('Hello!')
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── negotiation poll ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!done) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/session/${sessionId}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.status === 'negotiating') {
          clearInterval(interval)
          await loadNegotiationRound()
        } else if (data.status === 'done' || data.status === 'error') {
          clearInterval(interval)
          onDone()
        }
      } catch (_) {}
    }, 3000)
    return () => clearInterval(interval)
  }, [done, sessionId])

  const loadNegotiationRound = async () => {
    if (negotiationShown) return
    try {
      const res = await fetch(`${API}/session/${sessionId}/negotiation-round`)
      if (!res.ok) return
      const data = await res.json()
      if (data.proposal_message) {
        setNegotiating(true)
        setNegotiationShown(true)
        setDone(false)
        const text = `Negociación necesaria.\n\n${data.proposal_message}\n\nCuéntanos tu opinión sobre este compromiso.`
        addBotMessage(text)
      }
    } catch (_) {}
  }

  // ── voice: microphone ────────────────────────────────────────────────────────

  const startListening = () => {
    if (!SR) { setNoSupport(true); return }
    if (listening) { srRef.current?.stop(); return }

    const sr = new SR()
    srRef.current = sr
    sr.lang = 'es-ES'
    sr.interimResults = false
    sr.maxAlternatives = 1

    sr.onstart = () => setListening(true)
    sr.onend = () => setListening(false)
    sr.onerror = () => setListening(false)

    sr.onresult = (e) => {
      const transcript = e.results[0][0].transcript.trim()
      if (transcript) {
        setInput(transcript)
        sendMessageRef.current?.(transcript)
      }
    }

    sr.start()
  }

  // Keep ref pointing to latest sendMessage so SR onresult never calls a stale closure
  useEffect(() => { sendMessageRef.current = sendMessage })

  // Stop SR if component unmounts mid-listen
  useEffect(() => () => { srRef.current?.abort() }, [])

  // ── chat send ────────────────────────────────────────────────────────────────

  const sendNegotiateResponse = async (text) => {
    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch(`${API}/session/${sessionId}/member/${userId}/negotiate-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: text }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.statusText)
      addBotMessage('¡Gracias! Esperando la respuesta de los demás miembros...')
      setNegotiating(false)
      setDone(true)
    } catch (e) {
      addBotMessage(`Error: ${e.message}. Inténtalo de nuevo.`)
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async (text) => {
    if (!text?.trim() || loading) return

    if (negotiating) return sendNegotiateResponse(text)

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
      addBotMessage(data.reply)
      if (data.done) {
        setDone(true)
        setTimeout(onDone, 2000)
      }
    } catch (e) {
      addBotMessage(`Error: ${e.message}. Inténtalo de nuevo.`)
    } finally {
      setLoading(false)
    }
  }

  // ── derived UI ───────────────────────────────────────────────────────────────

  const badge = negotiating
    ? { color: 'bg-yellow-500', text: 'Negociación activa' }
    : done
    ? { color: 'bg-green-500', text: '¡Listo! Esperando al grupo...' }
    : null

  const placeholder = negotiating
    ? 'Tu opinión sobre el compromiso...'
    : done
    ? '¡Preferencias guardadas!'
    : 'Escribe tu respuesta...'

  const inputDisabled = loading || (done && !negotiating)

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-4 shadow">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="text-3xl">{negotiating ? '🤝' : '🤖'}</div>
          <div>
            <h1 className="text-white font-bold text-lg">
              {negotiating ? 'Negociación de grupo' : 'Agente de viajes'}
            </h1>
            <p className="text-blue-200 text-sm">Sesión: {sessionId}</p>
          </div>

          {/* Voice toggle */}
          {VOICE_SUPPORTED && (
            <button
              onClick={() => { setVoiceOn(v => !v); SS.cancel() }}
              title={voiceOn ? 'Desactivar voz' : 'Activar voz'}
              className={`ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                voiceOn
                  ? 'bg-white text-blue-700 border-white'
                  : 'bg-transparent text-blue-200 border-blue-400 hover:border-white hover:text-white'
              }`}
            >
              {voiceOn ? '🔊 Voz ON' : '🔇 Voz OFF'}
            </button>
          )}

          {badge && (
            <div className={`${VOICE_SUPPORTED ? '' : 'ml-auto'} ${badge.color} text-white text-xs font-semibold px-3 py-1 rounded-full`}>
              {badge.text}
            </div>
          )}
        </div>
      </div>

      {/* No-support warning */}
      {(noSupport || (!VOICE_SUPPORTED)) && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-amber-700 text-sm">
          Tu navegador no soporta la Web Speech API. Usa Chrome para activar el chat por voz.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-3">
          {messages.map((msg, i) => (
            <ChatBubble key={i} role={msg.role} text={msg.text} />
          ))}
          {loading && <ChatBubble role="assistant" text="..." typing />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t bg-white px-4 py-3">
        <form
          onSubmit={e => { e.preventDefault(); sendMessage(input) }}
          className="max-w-2xl mx-auto flex gap-2"
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={inputDisabled}
            placeholder={placeholder}
            className="flex-1 border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
          />

          {/* Mic button */}
          {VOICE_SUPPORTED && (
            <button
              type="button"
              onClick={startListening}
              disabled={inputDisabled}
              title={listening ? 'Escuchando… (click para parar)' : 'Hablar'}
              className={`px-4 py-3 rounded-xl font-semibold transition-all disabled:opacity-40 ${
                listening
                  ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {listening ? '⏹' : '🎤'}
            </button>
          )}

          <button
            type="submit"
            disabled={inputDisabled || !input.trim()}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-semibold transition-colors"
          >
            {negotiating ? 'Responder' : 'Enviar'}
          </button>
        </form>

        {listening && (
          <p className="max-w-2xl mx-auto mt-2 text-center text-sm text-red-500 animate-pulse">
            🎤 Escuchando en español… habla ahora
          </p>
        )}
      </div>
    </div>
  )
}
