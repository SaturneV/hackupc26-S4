import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Loader2, Volume2, VolumeX, Send } from 'lucide-react';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SS = window.speechSynthesis;
const VOICE_SUPPORTED = !!(SR && SS);

const DEMO_PROFILES = [
  {
    label: "🇫🇷 Francia",
    available_dates: { start: "2025-04-14", end: "2025-04-21" },
    max_budget_flight: 400,
    trip_type: ["city", "culture"],
  },
  {
    label: "🇮🇹 Italia",
    available_dates: { start: "2025-04-14", end: "2025-04-21" },
    max_budget_flight: 400,
    trip_type: ["city", "adventure"],
  },
  {
    label: "🏖️ Playa",
    available_dates: { start: "2025-04-14", end: "2025-04-21" },
    max_budget_flight: 350,
    trip_type: ["beach", "nature"],
  },
];

export default function VoiceOverlay({ sessionId, userId, onDestinationsUpdate }) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [agentMessage, setAgentMessage] = useState('');
  const [textInput, setTextInput] = useState('');

  const [isDone, setIsDone] = useState(false);
  const [sessionPhase, setSessionPhase] = useState('collecting'); // 'collecting', 'negotiating', 'success'
  const [agentCards, setAgentCards] = useState([]);
  const [showAutofill, setShowAutofill] = useState(false);

  const srRef = useRef(null);
  const initialized = useRef(false);

  const speakText = (text) => {
    if (!SS || !voiceOn) return;
    try {
      SS.cancel();
      const cleanText = text.replace(/\*\*/g, '').replace(/#+\s*/g, '');
      const utt = new SpeechSynthesisUtterance(cleanText);
      utt.lang = 'en-US';
      utt.onstart = () => setSpeaking(true);
      utt.onend = () => setSpeaking(false);
      utt.onerror = () => setSpeaking(false);
      SS.speak(utt);
    } catch(err) {
      console.warn("Speech Synthesis failed:", err);
    }
  };

  const speakWhenReady = (text) => {
    if (!SS) return;
    const doSpeak = () => speakText(text);
    if (SS.getVoices().length > 0) {
      doSpeak();
    } else {
      SS.addEventListener('voiceschanged', doSpeak, { once: true });
    }
  };

  // Initialize AI conversation when entering the room
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const welcome = "Hey! Tell me when you're free to travel and what kind of trip you're into.";
      fetch(`${API}/session/${sessionId}`)
        .then(r => r.json())
        .then(sessionData => {
          const me = sessionData.members_info?.find(m => m.user_id === userId);
          if (me?.status === 'done') {
            setIsDone(true);
            setAgentMessage('Waiting for the other person...');
            speakWhenReady('Waiting for the other person...');
          } else {
            setAgentMessage(welcome);
            speakWhenReady(welcome);
          }
        })
        .catch(() => {
          setAgentMessage(welcome);
          speakWhenReady(welcome);
        });
    }
  }, [sessionId, userId]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!SR) return;
    try {
      const sr = new SR();
      srRef.current = sr;
      sr.lang = 'en-US';
      sr.interimResults = false;
      sr.maxAlternatives = 1;

      sr.onstart = () => setListening(true);
      sr.onend = () => setListening(false);
      sr.onerror = (e) => {
        console.warn("Speech recognition error", e);
        setListening(false);
      };

      sr.onresult = async (e) => {
        const transcript = e.results[0][0].transcript.trim();
        if (transcript) {
          await handleSend(transcript);
        }
      };
    } catch (err) {
      console.warn("Speech Recognition initialization failed:", err);
    }
    return () => {
      try { srRef.current?.abort(); } catch(e){}
    };
  }, [sessionId, userId]);

  // Polling for session status when waiting for others
  useEffect(() => {
    if (!isDone || sessionPhase === 'success') return;
    let isPolling = true;

    const poll = async () => {
      try {
        const res = await fetch(`${API}/session/${sessionId}`);
        if (!res.ok) return;
        const sessionData = await res.json();

        if (sessionData.status === 'success') {
          const resultRes = await fetch(`${API}/session/${sessionId}/result`);
          const resultData = await resultRes.json();
          if (resultData.result && resultData.result.top_destinations) {
            onDestinationsUpdate(resultData.result.top_destinations);
            setAgentMessage(resultData.result.recommendation || "We found your perfect destination!");
            speakText(resultData.result.recommendation || "We found your perfect destination!");
            setSessionPhase('success');
            isPolling = false;
          }
        } else if (sessionData.status === 'negotiating') {
          const negRes = await fetch(`${API}/session/${sessionId}/negotiation-round?user_id=${userId}`);
          const negData = await negRes.json();

          if (!negData.responses || !negData.responses[userId]) {
            setAgentCards([]);
            setAgentMessage(negData.proposal_message || '');
            speakText(negData.proposal_message || '');
            setSessionPhase('negotiating');
            setIsDone(false);
            isPolling = false;
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }

      if (isPolling) {
        setTimeout(poll, 3000);
      }
    };

    poll();

    return () => { isPolling = false; };
  }, [isDone, sessionId, userId, sessionPhase]);

  const handleSend = async (text) => {
    if (isDone) return;
    setLoading(true);
    try {
      if (sessionPhase === 'negotiating') {
        const res = await fetch(`${API}/session/${sessionId}/member/${userId}/negotiate-response`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response: text }),
        });
        if (!res.ok) throw new Error(await res.text());

        setIsDone(true);
        setSessionPhase('collecting');
        setAgentMessage("Response sent. Waiting for the other person...");
        speakText("Response sent. Waiting for the other person...");
      } else {
        const res = await fetch(`${API}/session/${sessionId}/member/${userId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        setAgentMessage(data.reply);
        speakText(data.reply);

        if (data.done) {
          setIsDone(true);
        }
      }
    } catch (err) {
      console.error(err);
      setAgentMessage("Sorry, there was a connection error.");
      speakText("Sorry, there was a connection error.");
    } finally {
      setLoading(false);
    }
  };

  const toggleListening = () => {
    if (!VOICE_SUPPORTED) {
      alert("Your browser doesn't support the microphone. Use the text input below.");
      return;
    }
    try {
      if (listening) {
        srRef.current?.stop();
      } else {
        SS.cancel();
        setSpeaking(false);
        srRef.current?.start();
      }
    } catch (err) {
      console.warn("Microphone access error:", err);
      alert("Microphone error (possibly insecure HTTP connection). Use the text input instead.");
      setListening(false);
    }
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (textInput.trim() && !loading && !isDone) {
      handleSend(textInput.trim());
      setTextInput('');
    }
  };

  const handleAutofill = async (profile) => {
    setShowAutofill(false);
    setLoading(true);
    try {
      const res = await fetch(`${API}/session/${sessionId}/member/${userId}/quick-fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error(await res.text());
      setIsDone(true);
      setAgentMessage('Preferences saved! Waiting for the other person...');
    } catch (err) {
      console.error(err);
      setAgentMessage('Autofill error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-end">

      {/* Full Screen Glow Effects */}
      <motion.div
        className="absolute inset-0 mix-blend-screen pointer-events-none"
        animate={{
          boxShadow: listening
            ? 'inset 0 0 150px rgba(239, 68, 68, 0.3)'
            : speaking
            ? 'inset 0 0 150px rgba(56, 189, 248, 0.3)'
            : loading
            ? 'inset 0 0 150px rgba(16, 185, 129, 0.2)'
            : sessionPhase === 'success'
            ? 'inset 0 0 150px rgba(16, 185, 129, 0.4)'
            : 'inset 0 0 0px rgba(0,0,0,0)'
        }}
        transition={{ duration: 0.5 }}
      />

      {/* Subtitles & Status */}
      <div className="w-full max-w-3xl mx-auto px-4 md:px-8 pb-8 flex flex-col items-center">
        <AnimatePresence mode="wait">
          {agentMessage ? (
            <motion.div
              key="subtitle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 w-full text-center bg-black/60 p-4 md:p-6 rounded-2xl backdrop-blur-md border border-white/10"
            >
              <p className="text-lg md:text-2xl text-white font-light tracking-wide text-shadow-sm leading-relaxed">
                {agentMessage}
              </p>
            </motion.div>
          ) : null}
          {listening && (
            <motion.div
              key="listening"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-4 text-red-400 font-medium animate-pulse"
            >
              Listening...
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls and Text Input */}
        <div className="pointer-events-auto flex flex-col items-center w-full max-w-md gap-4">

          <div className="flex items-center gap-4">
            <button
              onClick={toggleListening}
              disabled={loading || isDone || sessionPhase === 'success'}
              className={clsx(
                "w-16 h-16 rounded-full flex items-center justify-center glass-heavy border border-white/20 transition-all duration-300 shadow-2xl shrink-0",
                listening ? "bg-red-500/30 border-red-500/60 scale-110" : "hover:bg-white/10 hover:scale-105",
                (loading || isDone || sessionPhase === 'success') && "opacity-50 cursor-not-allowed"
              )}
            >
              {loading ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : listening ? (
                <Square className="w-5 h-5 text-red-400 fill-current" />
              ) : (
                <Mic className={clsx("w-6 h-6", speaking ? "text-sky-400" : "text-white")} />
              )}
            </button>

            {VOICE_SUPPORTED && (
              <button
                onClick={() => setVoiceOn(!voiceOn)}
                className="w-12 h-12 rounded-full flex items-center justify-center glass-heavy border border-white/20 transition-all duration-300 hover:bg-white/10 shrink-0"
                title="Toggle Voice"
              >
                {voiceOn ? <Volume2 className="w-5 h-5 text-white" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
              </button>
            )}

            {!isDone && sessionPhase !== 'success' && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowAutofill(v => !v)}
                  disabled={loading}
                  className="w-12 h-12 rounded-full flex items-center justify-center glass-heavy border border-amber-400/40 text-amber-300 hover:bg-amber-400/10 transition-all duration-300 text-xs font-bold"
                  title="Demo autofill"
                >
                  ⚡
                </button>
                {showAutofill && (
                  <div className="absolute bottom-14 right-0 w-52 bg-black/80 border border-white/10 rounded-2xl backdrop-blur-md overflow-hidden shadow-2xl">
                    <p className="text-xs text-amber-300 font-semibold px-4 pt-3 pb-1 uppercase tracking-wider">Demo autofill</p>
                    {DEMO_PROFILES.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => handleAutofill(p)}
                        className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors border-t border-white/5"
                      >
                        <span className="font-medium">{p.label}</span>
                        <span className="block text-xs text-slate-400 mt-0.5">€{p.max_budget_flight} · {p.trip_type.join(', ')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {!isDone && sessionPhase !== 'success' && (
            <form onSubmit={handleTextSubmit} className="w-full flex items-center gap-2 mt-2">
              <input
                type="text"
                value={textInput}
                onChange={e => setTextInput(e.target.value)}
                placeholder="Type your answer here..."
                disabled={loading}
                className="flex-1 bg-black/40 border border-white/20 rounded-full px-5 py-3 text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 backdrop-blur-md placeholder:text-slate-400 text-sm md:text-base"
              />
              <button
                type="submit"
                disabled={!textInput.trim() || loading}
                className="w-12 h-12 rounded-full bg-sky-500 hover:bg-sky-400 flex items-center justify-center text-white disabled:opacity-50 transition-colors shrink-0"
              >
                <Send className="w-5 h-5 ml-[-2px]" />
              </button>
            </form>
          )}

          {isDone && sessionPhase !== 'success' && (
            <div className="text-emerald-400 text-sm font-medium bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-400/20 mt-2">
              {sessionPhase === 'collecting' ? 'Preferences saved! Waiting for the other person...' : 'Waiting for the other person...'}
            </div>
          )}

          {sessionPhase === 'success' && (
            <div className="text-emerald-400 text-sm font-medium bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-400/20 mt-2">
              Destination found! Zoom in on the globe.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
