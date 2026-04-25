import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const API = import.meta.env.VITE_API_URL

const COORDS = {
  Lisbon: [38.7223, -9.1393], Porto: [41.1579, -8.6291],
  Barcelona: [41.3874, 2.1686], Rome: [41.9028, 12.4964],
  Amsterdam: [52.3676, 4.9041], Prague: [50.0755, 14.4378],
  Reykjavik: [64.1355, -21.8954], Marrakech: [31.6295, -7.9811],
  Istanbul: [41.0082, 28.9784], Tbilisi: [41.6938, 44.8015],
  Azores: [37.7412, -25.6756], 'Canary Islands': [27.9202, -15.3877],
  Athens: [37.9838, 23.7275], Dubrovnik: [42.6507, 18.0944],
  Vienna: [48.2082, 16.3738], Budapest: [47.4979, 19.0402],
  Copenhagen: [55.6761, 12.5683], Seville: [37.3891, -5.9845],
  Ljubljana: [46.0569, 14.5058], Valletta: [35.8997, 14.5147],
  Madrid: [40.4168, -3.7038], Milan: [45.4642, 9.1900],
  Santorini: [36.3932, 25.4615], Berlin: [52.5200, 13.4050],
  Zurich: [47.3769, 8.5417],
}

const CITY_EMOJI = {
  Lisbon: '🌊', Porto: '🍷', Barcelona: '🏖️', Rome: '🏛️',
  Amsterdam: '🚲', Prague: '🏰', Reykjavik: '🌋', Marrakech: '🕌',
  Istanbul: '🕌', Tbilisi: '🏔️', Azores: '🌋', 'Canary Islands': '🌴',
  Athens: '🏺', Dubrovnik: '⛵', Vienna: '🎼', Budapest: '♨️',
  Copenhagen: '🧜', Seville: '🌸', Ljubljana: '🏰', Valletta: '⚓',
  Madrid: '💃', Milan: '👗', Santorini: '🌅', Berlin: '🐻', Zurich: '🏔️',
}

function ScoreBar({ score, color = 'bg-blue-500' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-bold text-slate-700 w-10 text-right">{score}</span>
    </div>
  )
}

function MemberScoreRow({ uid, score, reason, username, isMe }) {
  const [open, setOpen] = useState(isMe)
  const scoreColor = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-400' : 'bg-red-400'
  const scoreBadge = score >= 80 ? 'text-green-700 bg-green-100' : score >= 60 ? 'text-yellow-700 bg-yellow-100' : 'text-red-700 bg-red-100'
  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${isMe ? 'border-blue-400 shadow-md' : 'border-slate-200'}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {(username || uid).slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 truncate">{username || 'Traveler'}</span>
            {isMe && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full flex-shrink-0">You</span>}
          </div>
          <ScoreBar score={score} color={scoreColor} />
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${scoreBadge}`}>{score}/100</span>
        <span className="text-slate-300 flex-shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && reason && (
        <div className="px-4 pb-4 pt-2 text-slate-600 text-sm border-t border-slate-100 bg-slate-50">{reason}</div>
      )}
    </div>
  )
}

function FlightCard({ flight }) {
  if (!flight) return null
  return (
    <a
      href={flight.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-4 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white hover:from-blue-700 hover:to-indigo-800 transition-all shadow-lg group"
    >
      <div className="text-4xl">✈️</div>
      <div className="flex-1">
        <div className="font-bold text-lg">{flight.airline}</div>
        <div className="text-blue-200 text-sm">
          {flight.departure && flight.departure !== 'TBD' ? flight.departure : 'Flexible dates'}
        </div>
      </div>
      <div className="text-right">
        <div className="text-3xl font-black">€{flight.price}</div>
        <div className="text-blue-200 text-sm group-hover:text-white transition-colors">Book now →</div>
      </div>
    </a>
  )
}

function ScoreTable({ destinations, memberNames }) {
  if (!destinations?.length) return null
  const top3 = destinations.slice(0, 3)
  const uids = Object.keys(top3[0]?.scores_per_member || {})
  if (!uids.length) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-lg font-bold text-slate-800">Score breakdown</h2>
        <p className="text-slate-500 text-sm">Top 3 destinations × every member</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-semibold text-slate-600">Destination</th>
              {uids.map(uid => (
                <th key={uid} className="px-4 py-3 font-semibold text-slate-600 text-center">
                  {memberNames[uid] || uid.slice(0, 6)}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">Avg</th>
            </tr>
          </thead>
          <tbody>
            {top3.map((dest, i) => (
              <tr key={dest.city} className={`border-b border-slate-100 ${i === 0 ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {i === 0 && <span className="mr-1">🏆</span>}
                  {CITY_EMOJI[dest.city] || '🗺️'} {dest.city}
                </td>
                {uids.map(uid => {
                  const s = dest.scores_per_member?.[uid] ?? '—'
                  const color = s >= 80 ? 'text-green-700 bg-green-100' : s >= 60 ? 'text-yellow-700 bg-yellow-100' : 'text-red-700 bg-red-100'
                  return (
                    <td key={uid} className="px-4 py-3 text-center">
                      <span className={`font-bold px-2 py-0.5 rounded-full text-xs ${color}`}>{s}</span>
                    </td>
                  )
                })}
                <td className="px-4 py-3 text-center font-black text-slate-800">{dest.score_avg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CO2Block({ destinations, winner, greenAlt }) {
  if (!winner?.co2_kg) return null
  const top3 = destinations.slice(0, 3).filter(d => d.co2_kg)
  const isGreenWinner = greenAlt && greenAlt.city === winner.city

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <span className="text-xl">🌍</span>
        <div>
          <h2 className="text-lg font-bold text-slate-800">Sustainability</h2>
          <p className="text-slate-500 text-sm">Estimated CO₂ per person (ICAO short-haul factor)</p>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {top3.map(dest => {
          const isWinner = dest.city === winner.city
          const isGreen = greenAlt && dest.city === greenAlt.city
          const maxCO2 = Math.max(...top3.map(d => d.co2_kg))
          return (
            <div key={dest.city}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700">
                  {isGreen && '🌱 '}{CITY_EMOJI[dest.city] || '🗺️'} {dest.city}
                  {isWinner && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Winner</span>}
                </span>
                <span className="text-sm font-bold text-slate-800">{dest.co2_kg} kg</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${isGreen ? 'bg-green-500' : isWinner ? 'bg-blue-500' : 'bg-slate-400'}`}
                  style={{ width: `${(dest.co2_kg / maxCO2) * 100}%` }}
                />
              </div>
            </div>
          )
        })}

        {greenAlt && !isGreenWinner && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="font-semibold text-green-800 mb-1 flex items-center gap-2">
              🌱 Green Alternative: {greenAlt.city}
            </div>
            <p className="text-green-700 text-sm">
              Saves <strong>{Math.abs(Math.round(greenAlt.delta_co2 ?? 0))} kg CO₂</strong> per person
              {greenAlt.delta_price != null && (
                <> · Price difference: <strong>{greenAlt.delta_price > 0 ? '+' : ''}€{Math.round(greenAlt.delta_price)}</strong></>
              )}
              {' '}· Still scores {greenAlt.score_avg}/100 for the group
            </p>
          </div>
        )}

        {isGreenWinner && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-3 text-green-800 font-semibold text-sm">
            🌱 Great news — your winner IS the greenest option!
          </div>
        )}
      </div>
    </div>
  )
}

function OtherDestCard({ dest, rank }) {
  const emoji = CITY_EMOJI[dest.city] || '🗺️'
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className="text-2xl w-8 text-center font-black text-slate-300">#{rank}</div>
      <div className="text-3xl">{emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-slate-800">{dest.city}, <span className="text-slate-500 font-normal">{dest.country}</span></div>
        <ScoreBar score={dest.score_avg} color="bg-slate-400" />
        {dest.why && <div className="text-slate-500 text-xs mt-1 truncate">{dest.why}</div>}
      </div>
      <div className="text-right flex-shrink-0 space-y-0.5">
        {dest.flight_option && (
          <>
            <div className="font-bold text-slate-700 text-lg">€{dest.flight_option.price}</div>
            <div className="text-slate-400 text-xs">{dest.flight_option.airline}</div>
          </>
        )}
        {dest.co2_kg && <div className="text-green-600 text-xs">{dest.co2_kg} kg CO₂</div>}
      </div>
    </div>
  )
}

export default function Results({ sessionId, userId }) {
  const [result, setResult] = useState(null)
  const [sessionStatus, setSessionStatus] = useState('loading')
  const [memberNames, setMemberNames] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [resResult, resDebug] = await Promise.all([
          fetch(`${API}/results/${sessionId}`),
          fetch(`${API}/debug/${sessionId}`),
        ])
        if (!resResult.ok) throw new Error('Could not load results')
        const data = await resResult.json()
        setSessionStatus(data.session_status)
        setResult(data.result)
        if (resDebug.ok) {
          const debug = await resDebug.json()
          const names = {}
          Object.entries(debug.members || {}).forEach(([uid, m]) => {
            names[uid] = m.username || uid
          })
          setMemberNames(names)
        }
      } catch (e) {
        setError(e.message)
      }
    }
    load()
    const iv = setInterval(load, 4000)
    return () => clearInterval(iv)
  }, [sessionId])

  if (error) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">😵</div>
        <p className="text-red-500 font-semibold">{error}</p>
      </div>
    </div>
  )

  if (sessionStatus === 'error' || result?.status === 'error') return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div className="max-w-md text-center bg-white rounded-2xl shadow-xl p-8">
        <div className="text-5xl mb-4">😅</div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Something went wrong</h2>
        <p className="text-slate-500">{result?.conflicts?.join(', ') || 'The AI could not process the request.'}</p>
      </div>
    </div>
  )

  if (!result || sessionStatus === 'aggregating') return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-indigo-600 to-purple-700">
      <div className="text-center text-white">
        <div className="text-7xl mb-6 animate-bounce">🧠</div>
        <h2 className="text-3xl font-bold mb-3">Crunching the numbers...</h2>
        <p className="text-indigo-200 text-lg">Finding the perfect destination for your group</p>
        <div className="mt-6 flex justify-center gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      </div>
    </div>
  )

  const top = result.top_destinations || []
  const winner = top[0]
  const winnerEmoji = winner ? (CITY_EMOJI[winner.city] || '🗺️') : '🎉'
  const winnerCoords = winner ? (COORDS[winner.city] || [40, 10]) : [48, 8]
  const avgScore = winner?.score_avg ?? 0
  const greenAlt = result.green_alternative

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="relative bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 px-4 pt-12 pb-16 text-center text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none select-none text-[300px] flex items-center justify-center leading-none">
          {winnerEmoji}
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur rounded-full px-4 py-1.5 text-sm font-semibold mb-6">
            🎉 Group decision is in!
          </div>
          <div className="text-8xl mb-4">{winnerEmoji}</div>
          {winner ? (
            <>
              <h1 className="text-6xl font-black tracking-tight mb-1">{winner.city}</h1>
              <p className="text-2xl text-blue-200 font-medium mb-4">{winner.country}</p>
              <div className="inline-flex items-center gap-3 bg-white/20 backdrop-blur rounded-full px-5 py-2 text-sm font-semibold mb-6">
                <span>⭐ Group score: {avgScore}/100</span>
                {winner.co2_kg && <span>· 🌍 {winner.co2_kg} kg CO₂/person</span>}
                {greenAlt && greenAlt.city === winner.city && <span>· 🌱 Greenest option!</span>}
              </div>
              {winner.why && (
                <p className="max-w-xl mx-auto text-blue-100 text-lg leading-relaxed">{winner.why}</p>
              )}
            </>
          ) : (
            <h1 className="text-4xl font-bold">No destination found</h1>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-6 pb-16 space-y-6">

        {/* Conflicts */}
        {result.conflicts?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
            <h3 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
              <span>⚠️</span> Conflicts resolved
            </h3>
            <ul className="list-disc list-inside text-amber-700 text-sm space-y-1">
              {result.conflicts.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}

        {/* Flight */}
        {winner?.flight_option && <FlightCard flight={winner.flight_option} />}

        {/* Map */}
        {winner && (
          <div className="rounded-2xl overflow-hidden shadow-lg h-56 border border-slate-200">
            <MapContainer center={winnerCoords} zoom={5} className="h-full w-full" scrollWheelZoom={false}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {top.map((dest, i) => {
                const coords = dest.coords || COORDS[dest.city]
                if (!coords) return null
                return (
                  <Marker key={i} position={coords}>
                    <Popup><strong>{dest.city}</strong><br />Score: {dest.score_avg}/100{dest.co2_kg ? `\nCO₂: ${dest.co2_kg} kg` : ''}</Popup>
                  </Marker>
                )
              })}
            </MapContainer>
          </div>
        )}

        {/* Score table */}
        <ScoreTable destinations={top} memberNames={memberNames} />

        {/* Per-member scores */}
        {winner && Object.keys(winner.scores_per_member || {}).length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">How happy is everyone?</h2>
              <p className="text-slate-500 text-sm">Individual match scores for {winner.city}</p>
            </div>
            <div className="p-4 space-y-2">
              {Object.entries(winner.scores_per_member).map(([uid, score]) => (
                <MemberScoreRow
                  key={uid}
                  uid={uid}
                  score={score}
                  reason={winner.why_per_member?.[uid]}
                  username={memberNames[uid]}
                  isMe={uid === userId}
                />
              ))}
            </div>
          </div>
        )}

        {/* CO2 / Sustainability */}
        <CO2Block destinations={top} winner={winner} greenAlt={greenAlt} />

        {/* AI recommendation */}
        {result.recommendation && (
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-5">
            <div className="flex gap-3">
              <div className="text-2xl flex-shrink-0">🤖</div>
              <div>
                <div className="font-semibold text-indigo-800 mb-1">AI recommendation</div>
                <p className="text-indigo-700 text-sm leading-relaxed">{result.recommendation}</p>
              </div>
            </div>
          </div>
        )}

        {/* Other destinations */}
        {top.length > 1 && (
          <div>
            <h2 className="text-lg font-bold text-slate-700 mb-3">Other options considered</h2>
            <div className="space-y-2">
              {top.slice(1).map((dest, i) => (
                <OtherDestCard key={i} dest={dest} rank={i + 2} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
