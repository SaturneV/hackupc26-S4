import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, Loader2, Volume2, VolumeX } from 'lucide-react';
import clsx from 'clsx';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const SS = window.speechSynthesis;
const VOICE_SUPPORTED = !!(SR && SS);

export default function VoiceAgent({ onSearch, isSearching, agentMessage }) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  
  const srRef = useRef(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!SR) return;
    const sr = new SR();
    srRef.current = sr;
    sr.lang = 'en-US'; // Or es-ES based on requirement, setting to en-US as the UI is in English
    sr.interimResults = true;
    sr.maxAlternatives = 1;

    sr.onstart = () => {
      setListening(true);
      setAudioLevel(0.5); // Initial bump
    };
    
    sr.onend = () => {
      setListening(false);
      setAudioLevel(0);
    };
    
    sr.onerror = () => {
      setListening(false);
      setAudioLevel(0);
    };

    sr.onresult = (e) => {
      // Create a fake audio level based on transcript length/events
      const transcript = e.results[0][0].transcript;
      setAudioLevel(Math.min(1, transcript.length * 0.05 + 0.3));
      
      if (e.results[0].isFinal) {
        const finalTranscript = transcript.trim();
        if (finalTranscript && !isSearching) {
          onSearch(finalTranscript);
        }
      }
    };

    return () => sr.abort();
  }, [isSearching, onSearch]);

  // Simulate audio level dropping when not speaking
  useEffect(() => {
    if (!listening && !speaking) return;
    
    const interval = setInterval(() => {
      setAudioLevel(prev => {
        if (prev <= 0.1) return prev === 0 ? 0 : 0.1;
        return prev * 0.8; // Decay
      });
    }, 100);
    return () => clearInterval(interval);
  }, [listening, speaking]);

  // Handle TTS
  useEffect(() => {
    if (!SS || !voiceOn || !agentMessage) return;
    
    SS.cancel();
    const utt = new SpeechSynthesisUtterance(agentMessage);
    utt.lang = 'en-US';
    utt.rate = 1.0;
    
    utt.onstart = () => {
      setSpeaking(true);
      setAudioLevel(0.8);
    };
    
    utt.onend = () => {
      setSpeaking(false);
      setAudioLevel(0);
    };

    // Fake audio level during speaking
    const interval = setInterval(() => {
      if (speaking) {
        setAudioLevel(0.4 + Math.random() * 0.6);
      }
    }, 150);

    SS.speak(utt);

    return () => {
      clearInterval(interval);
      SS.cancel();
    };
  }, [agentMessage, voiceOn]);

  const toggleListening = () => {
    if (!VOICE_SUPPORTED) return;
    if (listening) {
      srRef.current?.stop();
    } else {
      SS.cancel(); // Stop speaking if starting to listen
      setSpeaking(false);
      srRef.current?.start();
    }
  };

  // Particle generation
  const particles = Array.from({ length: 36 });
  const baseRadius = 40;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full flex flex-col items-center justify-center pointer-events-auto"
    >
      <div className="relative w-48 h-48 flex items-center justify-center mb-8">
        {/* Core Orb */}
        <motion.div 
          className={clsx(
            "absolute inset-0 rounded-full blur-2xl opacity-50 mix-blend-screen transition-colors duration-700",
            listening ? "bg-red-500" : speaking ? "bg-sky-400" : isSearching ? "bg-emerald-400" : "bg-white/10"
          )}
          animate={{
            scale: listening || speaking ? 1 + audioLevel * 0.5 : isSearching ? [1, 1.2, 1] : 1,
            opacity: listening || speaking ? 0.5 + audioLevel * 0.5 : 0.5
          }}
          transition={isSearching ? { repeat: Infinity, duration: 2 } : { duration: 0.1 }}
        />

        {/* Dynamic Particles */}
        <div className="absolute inset-0 flex items-center justify-center">
          {particles.map((_, i) => {
            const angle = (i / particles.length) * Math.PI * 2;
            const isActive = listening || speaking;
            const extension = isActive ? Math.random() * audioLevel * 40 : 0;
            const r = baseRadius + extension;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            
            return (
              <motion.div
                key={i}
                className={clsx(
                  "absolute w-1.5 h-1.5 rounded-full transition-colors duration-300",
                  listening ? "bg-red-400" : speaking ? "bg-sky-300" : isSearching ? "bg-emerald-300" : "bg-white/30"
                )}
                animate={{
                  x, y,
                  scale: isActive ? 1 + Math.random() * audioLevel : 1,
                  opacity: isActive ? 0.5 + Math.random() * 0.5 : 0.3
                }}
                transition={{ duration: 0.1 }}
              />
            );
          })}
        </div>

        {/* Central Button */}
        <button
          onClick={toggleListening}
          disabled={isSearching}
          className={clsx(
            "relative z-10 w-20 h-20 rounded-full flex items-center justify-center glass-heavy border border-white/20 transition-all duration-300 shadow-2xl",
            listening ? "bg-red-500/20 border-red-500/50" : "hover:bg-white/10",
            isSearching && "opacity-50 cursor-wait"
          )}
        >
          {isSearching ? (
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          ) : listening ? (
            <Square className="w-6 h-6 text-red-400 fill-current" />
          ) : (
            <Mic className={clsx("w-8 h-8", speaking ? "text-sky-400" : "text-white")} />
          )}
        </button>
      </div>

      {/* Status Text & Controls */}
      <div className="flex flex-col items-center gap-4 bg-black/20 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10">
        <p className="text-white/80 font-medium tracking-wide">
          {isSearching ? "Analyzing destinations..." : listening ? "Listening..." : speaking ? "Speaking..." : "Tap to speak your intent"}
        </p>

        {VOICE_SUPPORTED && (
          <button
            onClick={() => setVoiceOn(!voiceOn)}
            className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-slate-400 hover:text-white transition-colors"
          >
            {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {voiceOn ? 'Voice On' : 'Voice Off'}
          </button>
        )}
      </div>

      {/* Subtitles (Optional, good for accessibility) */}
      <AnimatePresence>
        {speaking && agentMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-6 max-w-md text-center"
          >
            <p className="text-sm text-slate-300 font-light italic leading-relaxed">"{agentMessage}"</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
