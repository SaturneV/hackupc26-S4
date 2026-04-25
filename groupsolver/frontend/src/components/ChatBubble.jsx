export default function ChatBubble({ role, text, typing }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm flex-shrink-0 mt-1">
          🤖
        </div>
      )}
      <div
        className={`max-w-xs sm:max-w-sm lg:max-w-md px-4 py-3 rounded-2xl text-sm leading-relaxed
          ${isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white text-slate-800 shadow-sm border border-slate-100 rounded-bl-sm'
          }`}
      >
        {typing ? (
          <div className="flex gap-1 items-center h-4">
            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <span className="whitespace-pre-wrap">{text}</span>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-slate-300 flex items-center justify-center text-slate-600 text-sm flex-shrink-0 mt-1">
          😊
        </div>
      )}
    </div>
  )
}
