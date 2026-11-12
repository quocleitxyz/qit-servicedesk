import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, Plus, Send, UserRound } from 'lucide-react'
import { api, errorText } from '../api'
import { useI18n } from '../i18n'
import { navigate, PageHeading } from '../ui'

type Message = { role: 'user' | 'assistant'; content: string }

export default function Assistant({ initialMessage }: { initialMessage: string }) {
  const { t, lang } = useI18n()
  const [input, setInput] = useState(initialMessage)
  const [chat, setChat] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => { setInput(initialMessage) }, [initialMessage])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [chat])

  async function send(e: FormEvent) {
    e.preventDefault()
    const message = input.trim()
    if (!message || busy) return
    setInput(''); setBusy(true)
    setChat(prev => [...prev, { role: 'user', content: message }])
    try {
      const result = await api<{ answer: string }>('/ai/chat', { method: 'POST', body: { message, lang } })
      setChat(prev => [...prev, { role: 'assistant', content: result.answer }])
    } catch (err) {
      setChat(prev => [...prev, { role: 'assistant', content: errorText(err, t) }])
    } finally { setBusy(false) }
  }

  // The greeting is rendered from the dictionary so it follows the language switch.
  const messages: Message[] = [{ role: 'assistant', content: t('ai.hello') }, ...chat]

  return (
    <section className="content chat-content">
      <PageHeading eyebrow={t('ai.eyebrow')} title={t('ai.title')} subtitle={t('ai.subtitle')}>
        <button className="secondary" onClick={() => navigate('/tickets?new=1')}><Plus size={15} /> {t('ai.toTicket')}</button>
      </PageHeading>
      <div className="chat-panel">
        <div className="chat-header">
          <div className="ai-orb small-orb"><Bot size={20} /></div>
          <div><b>{t('ai.name')}</b><small>{t('ai.meta')}</small></div>
          <span className="online-badge"><span className="pulse" /> {t('ai.online')}</span>
        </div>
        <div className="chat-messages" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`message ${m.role === 'user' ? 'user-message' : 'assistant-message'}`}>
              <div className="message-avatar">{m.role === 'user' ? <UserRound size={16} /> : <Bot size={16} />}</div>
              <div className="message-bubble"><div className="message-author">{m.role === 'user' ? t('ai.you') : 'QIT AI'}</div><p>{m.content}</p></div>
            </div>
          ))}
          <div ref={bottom} />
        </div>
        <form className="chat-input" onSubmit={send}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder={t('ai.placeholder')} aria-label={t('ai.placeholder')} maxLength={4000} />
          <button className="primary" type="submit" disabled={busy} aria-label={t('ticket.reply.send')}><Send size={17} /></button>
        </form>
        <div className="chat-disclaimer">{t('ai.disclaimer')}</div>
      </div>
    </section>
  )
}
