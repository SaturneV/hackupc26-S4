export default function MemberStatus({ username, status, isMe }) {
  const isDone = status === 'done'
  const isWaiting = status === 'waiting'

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border
      ${isDone ? 'bg-green-50 border-green-200' : isWaiting ? 'bg-slate-50 border-slate-200' : 'bg-blue-50 border-blue-200'}`}
    >
      <div className={`w-3 h-3 rounded-full flex-shrink-0
        ${isDone ? 'bg-green-500' : isWaiting ? 'bg-slate-300' : 'bg-blue-400 animate-pulse'}`}
      />
      <span className="flex-1 font-medium text-slate-700">
        {username}
        {isMe && <span className="ml-2 text-xs text-blue-500">(you)</span>}
      </span>
      <span className={`text-xs font-semibold
        ${isDone ? 'text-green-600' : isWaiting ? 'text-slate-400' : 'text-blue-600'}`}
      >
        {isDone ? '✓ Done' : isWaiting ? 'Not joined' : 'Chatting...'}
      </span>
    </div>
  )
}
