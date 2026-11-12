import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, History, Lock, MessageSquare, Send } from 'lucide-react'
import { api, errorText, isStaff, PRIORITIES, STATUSES, type Category, type Staff, type TicketDetail, type User } from '../api'
import { formatDate, label, useI18n } from '../i18n'
import { navigate, Notice, PriorityBadge, StatusBadge } from '../ui'

export default function TicketDetailPage({ id, user, onChanged }: { id: string; user: User; onChanged: () => void }) {
  const i18n = useI18n()
  const { t, lang } = i18n
  const staff = isStaff(user)
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [reply, setReply] = useState('')
  const [internal, setInternal] = useState(false)
  const [resolution, setResolution] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<TicketDetail>(`/tickets/${id}`)
      setTicket(data); setResolution(data.resolution ?? ''); setError('')
    } catch (err) { setError(errorText(err, t)) }
  }, [id, t])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!staff) return
    api<Category[]>('/categories').then(setCategories).catch(() => undefined)
    api<Staff[]>('/users/staff').then(setStaffList).catch(() => undefined)
  }, [staff])

  async function update(changes: Record<string, string | null>) {
    setBusy(true)
    try {
      await api(`/tickets/${id}`, { method: 'PATCH', body: changes })
      await load(); onChanged()
    } catch (err) { setError(errorText(err, t)) } finally { setBusy(false) }
  }

  async function sendReply(e: FormEvent) {
    e.preventDefault()
    if (!reply.trim()) return
    setBusy(true)
    try {
      await api(`/tickets/${id}/comments`, { method: 'POST', body: { content: reply.trim(), is_internal: internal } })
      setReply(''); setInternal(false)
      await load(); onChanged()
    } catch (err) { setError(errorText(err, t)) } finally { setBusy(false) }
  }

  const back = <button className="text-button back" onClick={() => navigate('/tickets')}><ArrowLeft size={15} /> {t('common.back')}</button>
  if (!ticket) return <section className="content">{back}{error ? <Notice kind="error">{error}</Notice> : <p className="muted">{t('app.loading')}</p>}</section>

  const isOwner = ticket.created_by === user.id
  const done = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
  const eventValue = (action: string, value: string | null) =>
    value === null ? t('common.none')
      : action === 'STATUS' ? label(i18n, 'status', value)
        : action === 'PRIORITY' ? label(i18n, 'priority', value)
          : action === 'CATEGORY' ? label(i18n, 'cat', value) : value

  return (
    <section className="content">
      {back}
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
      <div className="detail-head">
        <div>
          <div className="eyebrow">{ticket.ticket_code}</div>
          <h1>{ticket.title}</h1>
          <div className="badge-row"><StatusBadge value={ticket.status} /><PriorityBadge value={ticket.priority} /><span className="badge neutral">{label(i18n, 'cat', ticket.category_name ?? 'General')}</span></div>
        </div>
        {!staff && isOwner && (
          <div className="heading-actions">
            {done
              ? <button className="secondary" disabled={busy} onClick={() => update({ status: 'OPEN' })}>{t('ticket.reopen')}</button>
              : (ticket.status === 'OPEN') && <button className="secondary" disabled={busy} onClick={() => update({ status: 'CLOSED' })}>{t('ticket.close')}</button>}
            {ticket.status === 'RESOLVED' && <button className="primary" disabled={busy} onClick={() => update({ status: 'CLOSED' })}>{t('ticket.close')}</button>}
          </div>
        )}
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <div className="panel">
            <h3 className="panel-title">{t('ticket.field.description')}</h3>
            <p className="pre">{ticket.description}</p>
            {ticket.resolution && !staff && (
              <div className="resolution"><b>{t('ticket.field.resolution')}</b><p className="pre">{ticket.resolution}</p></div>
            )}
          </div>

          <div className="panel">
            <h3 className="panel-title"><MessageSquare size={16} /> {t('ticket.conversation')}</h3>
            {ticket.comments.length === 0 && <p className="muted">{t('ticket.noComments')}</p>}
            <div className="thread">
              {ticket.comments.map(c => (
                <div key={c.id} className={`comment${c.is_internal ? ' internal' : ''}${c.user_id === user.id ? ' own' : ''}`}>
                  <div className="avatar">{(c.user_name ?? '?').slice(0, 1).toUpperCase()}</div>
                  <div className="comment-body">
                    <div className="comment-meta">
                      <b>{c.user_name}</b>
                      {c.user_role && c.user_role !== 'USER' && <span className="badge neutral">{t(`role.${c.user_role}`)}</span>}
                      {c.is_internal && <span className="badge internal-tag"><Lock size={10} /> {t('ticket.internalTag')}</span>}
                      <span className="muted">{formatDate(c.created_at, lang, true)}</span>
                    </div>
                    <p className="pre">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <form className="reply" onSubmit={sendReply}>
              <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder={t('ticket.reply.ph')} maxLength={8000} aria-label={t('ticket.reply.ph')} />
              <div className="reply-actions">
                {staff ? <label className="check"><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> {t('ticket.reply.internal')}</label> : <span />}
                <button className="primary" disabled={busy || !reply.trim()}><Send size={15} /> {t('ticket.reply.send')}</button>
              </div>
            </form>
          </div>
        </div>

        <aside className="detail-side">
          <div className="panel">
            <h3 className="panel-title">{t('ticket.details')}</h3>
            <dl className="props">
              <dt>{t('ticket.field.requester')}</dt><dd>{ticket.creator_name}</dd>
              <dt>{t('ticket.field.status')}</dt>
              <dd>{staff
                ? <select value={ticket.status} disabled={busy} onChange={e => update({ status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select>
                : <StatusBadge value={ticket.status} />}</dd>
              <dt>{t('ticket.field.priority')}</dt>
              <dd>{staff
                ? <select value={ticket.priority} disabled={busy} onChange={e => update({ priority: e.target.value })}>{PRIORITIES.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</select>
                : <PriorityBadge value={ticket.priority} />}</dd>
              <dt>{t('ticket.field.category')}</dt>
              <dd>{staff
                ? <select value={ticket.category_id ?? ''} disabled={busy} onChange={e => update({ category_id: e.target.value || null })}>
                    <option value="">{t('cat.General')}</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{label(i18n, 'cat', c.name)}</option>)}
                  </select>
                : label(i18n, 'cat', ticket.category_name ?? 'General')}</dd>
              <dt>{t('ticket.field.assignee')}</dt>
              <dd>{staff
                ? <>
                    <select value={ticket.assigned_to ?? ''} disabled={busy} onChange={e => update({ assigned_to: e.target.value || null })}>
                      <option value="">{t('ticket.unassigned')}</option>
                      {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                    {ticket.assigned_to !== user.id && <button className="text-button" disabled={busy} onClick={() => update({ assigned_to: user.id })}>{t('ticket.assignMe')}</button>}
                  </>
                : ticket.assignee_name ?? <span className="muted">{t('ticket.unassigned')}</span>}</dd>
              <dt>{t('ticket.field.created')}</dt><dd>{formatDate(ticket.created_at, lang, true)}</dd>
              <dt>{t('ticket.field.updated')}</dt><dd>{formatDate(ticket.updated_at, lang, true)}</dd>
            </dl>
          </div>

          {staff && (
            <div className="panel">
              <h3 className="panel-title">{t('ticket.field.resolution')}</h3>
              <textarea className="resolution-input" value={resolution} onChange={e => setResolution(e.target.value)} placeholder={t('ticket.field.resolution.ph')} aria-label={t('ticket.field.resolution')} />
              <button className="secondary full" disabled={busy || resolution === (ticket.resolution ?? '')} onClick={() => update({ resolution })}>{t('ticket.saveResolution')}</button>
            </div>
          )}

          <div className="panel">
            <h3 className="panel-title"><History size={16} /> {t('ticket.history')}</h3>
            <ul className="timeline">
              {ticket.events.map(e => (
                <li key={e.id}>
                  <div><b>{e.user_name}</b> {t(`event.${e.action}`)}</div>
                  {e.action !== 'CREATED' && e.action !== 'RESOLUTION' && <div className="change">{eventValue(e.action, e.old_value)} → {eventValue(e.action, e.new_value)}</div>}
                  <small className="muted">{formatDate(e.created_at, lang, true)}</small>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  )
}
