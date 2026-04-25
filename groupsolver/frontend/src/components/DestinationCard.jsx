const CITY_EMOJI = {
  Barcelona: '🏖️', Lisbon: '🌊', Amsterdam: '🚲', Prague: '🏰',
  Rome: '🏛️', Dubrovnik: '⛵', Athens: '🏺', Budapest: '♨️',
  Vienna: '🎼', Porto: '🍷', Paris: '🗼', Berlin: '🐻',
  Madrid: '💃', Milan: '👗', Santorini: '🌅', Reykjavik: '🌋',
  Zurich: '🏔️', Copenhagen: '🧜', Seville: '🌸', Valletta: '⚓',
}

export default function DestinationCard({ destination, rank }) {
  const { city, country, score_avg, flight_option, why } = destination
  const emoji = CITY_EMOJI[city] || '🗺️'
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className="text-2xl w-8 text-center font-black text-slate-300">#{rank}</div>
      <div className="text-3xl">{emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-slate-800">{city}, <span className="text-slate-500 font-normal">{country}</span></div>
        <div className="text-slate-500 text-xs mt-0.5">Score: {score_avg}/100</div>
        {why && <div className="text-slate-400 text-xs mt-1 truncate">{why}</div>}
      </div>
      {flight_option && (
        <div className="text-right flex-shrink-0">
          <div className="font-bold text-slate-700 text-lg">€{flight_option.price}</div>
          <div className="text-slate-400 text-xs">{flight_option.airline}</div>
        </div>
      )}
    </div>
  )
}
