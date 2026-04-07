import { useState, useEffect, useRef } from 'react'
import { Send, Bot, User, Sparkles, Loader2 } from 'lucide-react'
import { chatbotAPI } from '../../services/api'

export default function PolicyChatbot() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const endRef = useRef(null)

  useEffect(() => {
    chatbotAPI.suggested()
      .then(({ data }) => setSuggestions(data))
      .catch(() => setSuggestions([
        'What is the daily meal allowance?',
        'Can I expense alcohol at a client dinner?',
        'What are the hotel booking limits?',
      ]))

    // Welcome message
    setMessages([{
      role: 'assistant',
      content: 'Hi! I\'m your policy assistant. Ask me anything about the company expense policy — meal limits, travel rules, reimbursement procedures, and more.',
      timestamp: new Date(),
    }])
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text) => {
    const question = text || input.trim()
    if (!question || loading) return

    const userMsg = { role: 'user', content: question, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const { data } = await chatbotAPI.ask(question)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        fromCache: data.fromCache,
        timestamp: new Date(),
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err.response?.data?.message || 'Sorry, I couldn\'t process that. Please try again.',
        error: true,
        timestamp: new Date(),
      }])
    }
    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Ask Policy <Sparkles size={18} style={{ display: 'inline', color: 'var(--accent)', verticalAlign: -2 }} /></h2>
        <p>Got a question about expenses? Just ask — I'm here to help!</p>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)', padding: 0, overflow: 'hidden' }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 12,
                marginBottom: 16,
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 'var(--radius-full)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-inset)',
                color: msg.role === 'user' ? '#fff' : 'var(--accent)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
              }}>
                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div style={{
                maxWidth: '75%',
                padding: '12px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? 'var(--accent)' : msg.error ? 'rgba(239,68,68,0.1)' : 'var(--bg-inset)',
                color: msg.role === 'user' ? '#fff' : msg.error ? 'var(--red)' : 'var(--text-primary)',
                fontSize: '0.88rem',
                lineHeight: 1.6,
                border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
              }}>
                {msg.content}
                {msg.sources?.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                    <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Sources:</div>
                    {msg.sources.map((s, j) => (
                      <div key={j} className="text-xs" style={{ color: 'var(--accent)', fontStyle: 'italic' }}>• {s}</div>
                    ))}
                  </div>
                )}
                {msg.fromCache && (
                  <div className="text-xs text-muted" style={{ marginTop: 4 }}>⚡ Cached response</div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 'var(--radius-full)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)', color: 'var(--accent)',
              }}>
                <Bot size={14} />
              </div>
              <div style={{
                padding: '12px 16px', borderRadius: '16px 16px 16px 4px',
                background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)',
              }}>
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 size={14} style={{ animation: 'spin 0.6s linear infinite' }} />
                  Checking policy...
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && suggestions.length > 0 && (
          <div style={{ padding: '0 24px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {suggestions.slice(0, 4).map((s, i) => (
              <button
                key={i}
                className="btn btn--secondary btn--sm"
                style={{ fontSize: '0.75rem', borderRadius: 20 }}
                onClick={() => sendMessage(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-elevated)',
        }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input
              className="form-input"
              placeholder="e.g. What is the maximum hotel rate for domestic travel?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              style={{ flex: 1, margin: 0 }}
            />
            <button
              className="btn btn--primary btn--icon"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{ width: 42, height: 42, borderRadius: 'var(--radius-full)', flexShrink: 0 }}
            >
              <Send size={16} />
            </button>
          </div>
          <div className="text-xs text-muted" style={{ marginTop: 6, textAlign: 'center' }}>
            Answers are generated from your company's expense policy document. Max 15 questions/hour.
          </div>
        </div>
      </div>
    </div>
  )
}
