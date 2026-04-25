import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles, MapPin, Plane, Loader2 } from 'lucide-react';
import clsx from 'clsx';

export default function SearchInterface({ onSearch, isSearching }) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !isSearching) {
      onSearch(query);
    }
  };

  const suggestions = [
    "A quiet beach with surfing and seafood",
    "Mountain retreat for deep work",
    "Vibrant city with ancient history and street food"
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="w-full relative"
    >
      <form 
        onSubmit={handleSubmit}
        className={clsx(
          "relative glass-heavy rounded-2xl p-2 transition-all duration-500 overflow-hidden",
          isFocused ? "shadow-[0_0_40px_-10px_rgba(56,189,248,0.3)] border-sky-500/50" : "border-white/10"
        )}
      >
        <div className="flex items-center px-4 py-3">
          {isSearching ? (
            <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
          ) : (
            <Sparkles className={clsx("w-6 h-6 transition-colors duration-300", isFocused ? "text-sky-400" : "text-slate-400")} />
          )}
          
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Describe your perfect escape..."
            className="flex-1 bg-transparent border-none outline-none text-white px-4 text-lg placeholder:text-slate-500 font-light"
            disabled={isSearching}
          />

          <button 
            type="submit"
            disabled={!query.trim() || isSearching}
            className="p-2 rounded-xl bg-white/10 hover:bg-sky-500/20 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plane className="w-5 h-5" />
          </button>
        </div>

        {/* Suggestions Panel (shows only when empty and focused, or as examples) */}
        <AnimatePresence>
          {!query && isFocused && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-6 pb-4 pt-2 border-t border-white/5"
            >
              <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider font-semibold">Try asking for</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={() => {
                      setQuery(s);
                      onSearch(s);
                    }}
                    className="text-sm bg-white/5 hover:bg-white/10 border border-white/5 rounded-full px-4 py-2 text-slate-300 transition-colors flex items-center gap-2"
                  >
                    <Search className="w-3 h-3 text-sky-400" />
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Subtle glow effect behind input */}
        <div className="absolute inset-0 bg-gradient-to-r from-sky-500/0 via-sky-500/5 to-emerald-500/0 pointer-events-none" />
      </form>
    </motion.div>
  );
}
