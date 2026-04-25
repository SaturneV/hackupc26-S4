import { useState } from 'react'
import Home from './pages/Home.jsx'
import Chat from './pages/Chat.jsx'
import Waiting from './pages/Waiting.jsx'
import Results from './pages/Results.jsx'
import Debug from './pages/Debug.jsx'

export default function App() {
  const [page, setPage] = useState(window.location.hash === '#debug' ? 'debug' : 'home')
  const [sessionId, setSessionId] = useState(null)
  const [userId, setUserId] = useState(null)
  const [negotiationMessage, setNegotiationMessage] = useState(null)

  const go = (p, sid, uid) => {
    if (sid) setSessionId(sid)
    if (uid) setUserId(uid)
    setPage(p)
  }

  const handleNegotiate = (message) => {
    setNegotiationMessage(message)
    setPage('chat')
  }

  const handleChatDone = () => {
    setNegotiationMessage(null)
    go('waiting')
  }

  if (page === 'debug')   return <Debug />
  if (page === 'chat')    return (
    <Chat
      sessionId={sessionId}
      userId={userId}
      onDone={handleChatDone}
      negotiationMessage={negotiationMessage}
    />
  )
  if (page === 'waiting') return (
    <Waiting
      sessionId={sessionId}
      userId={userId}
      onResults={() => go('results')}
      onNegotiate={handleNegotiate}
    />
  )
  if (page === 'results') return <Results sessionId={sessionId} userId={userId} />
  return <Home onJoined={(sid, uid) => go('chat', sid, uid)} />
}
