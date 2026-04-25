import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, ArrowRight, PlaneTakeoff, Loader2, Copy } from 'lucide-react';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
console.log('API URL:', API);

export default function AuraSessionManager({ onJoined }) {
  const [mode, setMode] = useState('landing'); // 'landing' | 'create' | 'join'
  const [memberCount, setMemberCount] = useState(2);
  const [sessionInput, setSessionInput] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdLink, setCreatedLink] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    if (sid) {
      setSessionInput(sid.toUpperCase());
      setMode('join');
    }
  }, []);

  const handleCreate = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_count: memberCount }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { session_id } = await res.json();
      const link = `${window.location.origin}?session=${session_id}`;
      setCreatedLink(link);
      setSessionInput(session_id);
      setMode('join');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setError('');
    if (!username.trim()) { setError('Please enter your name'); return; }
    if (!sessionInput.trim()) { setError('Please enter a session code'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/session/${sessionInput.trim().toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { session_id, user_id } = await res.json();
      onJoined(session_id, user_id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md mx-auto glass-heavy p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-sky-500/5 to-emerald-500/5 pointer-events-none" />
      
      <div className="relative z-10">
        <div className="text-center mb-8">
          <motion.div 
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(56,189,248,0.2)]"
          >
            <PlaneTakeoff className="w-8 h-8 text-sky-400" />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Travel Together</h2>
          <p className="text-slate-400 text-sm font-light">Your AI agent will negotiate the perfect trip for everyone.</p>
        </div>

        <AnimatePresence mode="wait">
          {mode === 'landing' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              <button
                onClick={() => setMode('create')}
                className="w-full flex items-center justify-between group bg-white/5 hover:bg-white/10 border border-white/10 p-4 rounded-xl transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-sky-500/20 rounded-lg text-sky-400 group-hover:scale-110 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-white font-medium">Create a Group</h3>
                    <p className="text-slate-400 text-xs mt-0.5">Start a new shared trip</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors group-hover:translate-x-1" />
              </button>

              <button
                onClick={() => setMode('join')}
                className="w-full flex items-center justify-between group bg-white/5 hover:bg-white/10 border border-white/10 p-4 rounded-xl transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 group-hover:scale-110 transition-transform">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-white font-medium">Join a Group</h3>
                    <p className="text-slate-400 text-xs mt-0.5">Enter with a session code</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors group-hover:translate-x-1" />
              </button>
            </motion.div>
          )}

          {mode === 'create' && (
            <motion.div 
              key="create"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Group Size</label>
                <input
                  type="number"
                  min={1} max={20}
                  value={memberCount}
                  onChange={e => setMemberCount(Number(e.target.value))}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all"
                />
              </div>
              
              {error && <p className="text-red-400 text-xs font-medium bg-red-400/10 p-3 rounded-lg border border-red-400/20">{error}</p>}
              
              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-semibold transition-all shadow-[0_0_20px_rgba(56,189,248,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Initializing AI...' : 'Initialize Session'}
              </button>
              
              <button 
                onClick={() => setMode('landing')} 
                className="w-full text-slate-400 text-sm hover:text-white transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          )}

          {mode === 'join' && (
            <motion.div 
              key="join"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-5"
            >
              {createdLink && (
                <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-4">
                  <p className="text-xs text-sky-400 font-semibold uppercase tracking-wider mb-2">Share this link</p>
                  <div className="flex gap-2">
                    <input
                      readOnly 
                      value={createdLink}
                      className="flex-1 bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-slate-300 text-xs focus:outline-none"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(createdLink)}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Copy className="w-3 h-3" />
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Room Code</label>
                <input
                  value={sessionInput}
                  onChange={e => setSessionInput(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3"
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-mono focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all placeholder:text-slate-600"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Your Name</label>
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. Maria"
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all placeholder:text-slate-600"
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                />
              </div>

              {error && <p className="text-red-400 text-xs font-medium bg-red-400/10 p-3 rounded-lg border border-red-400/20">{error}</p>}
              
              <button
                onClick={handleJoin}
                disabled={loading}
                className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-semibold transition-all shadow-[0_0_20px_rgba(56,189,248,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Connecting...' : 'Enter Session'}
              </button>
              
              {!createdLink && (
                <button 
                  onClick={() => setMode('landing')} 
                  className="w-full text-slate-400 text-sm hover:text-white transition-colors"
                >
                  Cancel
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
