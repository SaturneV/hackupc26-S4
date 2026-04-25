import { useState, useEffect, useRef } from 'react'
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

// Props:
//   sessionId, userId, onDone — always required
//   negotiationMessage — if set, component starts in negotiation mode (no greeting)
export default function Chat({ sessionId, userId, onDone, negotiationMessage }) {
  const isNegotiationMode = !!negotiationMessage

  const [messages, setMessages] = useState(() =>
    isNegotiationMode
      ? [{ role: 'assistant', text: negotiationMessage }]
      : []
  )
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)          // finished this phase
  const [negotiating, setNegotiating] = useState(isNegotiationMode)

  const [voiceOn, setVoiceOn] = useState(true)
  const [listening, setListening] = useState(false)

  const bottomRef = useRef(null)
  const greetedRef = useRef(isNegotiationMode)     // skip greeting if negotiation mode
  const srRef = useRef(null)
  const sendMessageRef = useRef(null)

  // ── greeting (normal mode only) ──────────────────────────────────────────────
  useEffect(() => {
    if (greetedRef.current) return
    greetedRef.current = true
    sendMessage('Hello!')
  }, [])

  // speak negotiation message on mount if voice is on
  useEffect(() => {
    if (isNegotiationMode && voiceOn) speak(negotiationMessage)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── TTS helper ───────────────────────────────────────────────────────────────
  const addBotMessage = (text) => {
    setMessages(prev => [...prev, { role: 'assistant', text }])
    if (voiceOn) speak(text)
  }

  // ── keep sendMessage ref fresh ───────────────────────────────────────────────
  useEffect(() => { sendMessageRef.current = sendMessage })

  // ── microphone ───────────────────────────────────────────────────────────────
  const startListening = () => {
    if (!SR) return
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
  useEffect(() => () => srRef.current?.abort(), [])

  // ── send logic ───────────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    if (!text?.trim() || loading || done) return

    if (negotiating) {
      // negotiation-response path
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
        addBotMessage('¡Gracias! Hemos registrado tu respuesta. Esperando al resto del grupo...')
        setNegotiating(false)
        setDone(true)
        setTimeout(onDone, 1500)
      } catch (e) {
        addBotMessage(`Error: ${e.message}. Inténtalo de nuevo.`)
      } finally {
        setLoading(false)
      }
      return
    }

    // normal chat path
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
        setTimeout(onDone, 1500)
      }
    } catch (e) {
      addBotMessage(`Error: ${e.message}. Inténtalo de nuevo.`)
    } finally {
      setLoading(false)
    }
  }

  // ── derived UI ───────────────────────────────────────────────────────────────
  const badge = negotiating
    ? { color: 'bg-yellow-500', text: '⚠️ Conflicto detectado' }
    : done
    ? { color: 'bg-green-500', text: '✓ Listo' }
    : null

  const placeholder = done
    ? 'Esperando al grupo...'
    : negotiating
    ? 'Escribe tu respuesta al conflicto...'
    : 'Escribe tu respuesta...'

  const inputDisabled = loading || done

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* Header */}
      <div className={`px-4 py-4 shadow bg-gradient-to-r ${negotiating ? 'from-yellow-500 to-orange-500' : 'from-blue-600 to-indigo-700'}`}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="text-3xl">{negotiating ? '⚠️' : '🤖'}</div>
          <div>
            <h1 className="text-white font-bold text-lg">
              {negotiating ? 'Conflicto en el grupo' : 'Agente de viajes'}
            </h1>
            <p className="text-white/70 text-sm">Sesión: {sessionId}</p>
          </div>

          {VOICE_SUPPORTED && (
            <button
              onClick={() => { setVoiceOn(v => !v); SS.cancel() }}
              className={`ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                voiceOn ? 'bg-white text-blue-700 border-white' : 'bg-transparent text-white/70 border-white/40 hover:border-white hover:text-white'
              }`}
            >
              {voiceOn ? '🔊 Voz ON' : '🔇 Voz OFF'}
            </button>
          )}

          {badge && !VOICE_SUPPORTED && (
            <div className={`ml-auto ${badge.color} text-white text-xs font-semibold px-3 py-1 rounded-full`}>
              {badge.text}
            </div>
          )}
        </div>
      </div>

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

      {/* Input */}
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
          {VOICE_SUPPORTED && (
            <button
              type="button"
              onClick={startListening}
              disabled={inputDisabled}
              title={listening ? 'Escuchando… (click para parar)' : 'Hablar'}
              className={`px-4 py-3 rounded-xl font-semibold transition-all disabled:opacity-40 ${
                listening ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
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
