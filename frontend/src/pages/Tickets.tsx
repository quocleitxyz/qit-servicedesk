import { useEffect, useState, type FormEvent } from 'react'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { api, errorText, isStaff, PRIORITIES, query, STATUSES, type Category, type Ticket, type User } from '../api'
import { formatDate, label, useI18n } from '../i18n'
import { Field, Modal, navigate, Notice, PageHeading, PriorityBadge, StatusBadge } from '../ui'

export function TicketTable({ tickets, showAssignee, emptyText }: { tickets: Ticket[]; showAssignee: boolean; emptyText: string }) {
  const i18n = useI18n()
  const { t, lang } = i18n
  const open = (id: string) => navigate(`/tickets/${id}`)
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('ticket.col.code')}</th><th>{t('ticket.col.subject')}</th><th>{t('ticket.field.status').toUpperCase()}</th>
            <th>{t('ticket.field.priority').toUpperCase()}</th>{showAssignee && <th>{t('ticket.field.assignee').toUpperCase()}</th>}
            <th>{t('ticket.field.created').toUpperCase()}</th>
          </tr>
        </thead>
        <tbody>
          {tickets.length === 0 && <tr><td colSpan={showAssignee ? 6 : 5} className="empty">{emptyText}</td></tr>}
          {tickets.map(ticket => (
            <tr key={ticket.id} className="row-link" tabIndex={0} onClick={() => open(ticket.id)}
              onKeyDown={e => { if (e.key === 'Enter') open(ticket.id) }}>
              <td><b className="ticket-code">{ticket.ticket_code}</b></td>
              <td>
                <div className="subject">{ticket.title}</div>
                <small className="muted">{label(i18n, 'cat', ticket.category_name ?? 'General')}{showAssignee && ticket.creator_name ? ` · ${ticket.creator_name}` : ''}</small>
              </td>
              <td><StatusBadge value={ticket.status} /></td>
              <td><PriorityBadge value={ticket.priority} /></td>
              {showAssignee && <td className={ticket.assignee_name ? '' : 'muted'}>{ticket.assignee_name ?? t('ticket.unassigned')}</td>}
              <td className="date">{formatDate(ticket.created_at, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CreateTicket({ categories, onClose, onCreated }: { categories: Category[]; onClose: () => void; onCreated: (ticket: Ticket) => void }) {
  const i18n = useI18n()
  const { t } = i18n
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      onCreated(await api<Ticket>('/tickets', { method: 'POST', body: { title, description, priority, category_id: categoryId || null } }))
    } catch (err) { setError(errorText(err, t)); setBusy(false) }
  }

  return (
    <Modal eyebrow={t('ticket.new.eyebrow')} title={t('ticket.new.title')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label={t('ticket.field.title')}><input required minLength={4} maxLength={255} value={title} onChange={e => setTitle(e.target.value)} placeholder={t('ticket.field.title.ph')} autoFocus /></Field>
        <Field label={t('ticket.field.description')}><textarea required minLength={5} value={description} onChange={e => setDescription(e.target.value)} placeholder={t('ticket.field.description.ph')} /></Field>
        <div className="form-row">
          <Field label={t('ticket.field.category')}>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">{t('cat.General')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{label(i18n, 'cat', c.name)}</option>)}
            </select>
          </Field>
          <Field label={t('ticket.field.priority')}>
            <select value={priority} onChange={e => setPriority(e.target.value)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </select>
          </Field>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="primary full" disabled={busy}>{t('ticket.submit')} <ChevronRight size={17} /></button>
      </form>
    </Modal>
  )
}

export default function Tickets({ user, onChanged, openCreate }: { user: User; onChanged: () => void; openCreate: boolean }) {
  const i18n = useI18n()
  const { t } = i18n
  const staff = isStaff(user)
  const initial = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [assigned, setAssigned] = useState(initial.get('assigned') ?? '')
  const [creating, setCreating] = useState(openCreate)
  const [error, setError] = useState('')

  useEffect(() => { api<Category[]>('/categories').then(setCategories).catch(() => undefined) }, [])
  useEffect(() => { if (openCreate) setCreating(true) }, [openCreate])

  // Filters are applied by the server; typing in the search box waits 300 ms before querying.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      api<Ticket[]>(`/tickets${query({ q: search.trim(), status, priority, category_id: categoryId, assigned })}`)
        .then(list => { if (!cancelled) { setTickets(list); setError('') } })
        .catch(err => { if (!cancelled) setError(errorText(err, t)) })
    }, search ? 300 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search, status, priority, categoryId, assigned, t])

  const filtered = Boolean(search || status || priority || categoryId || assigned)

  return (
    <section className="content">
      <PageHeading eyebrow={t('ticket.eyebrow')} title={staff ? t('nav.tickets.all') : t('nav.tickets.mine')} subtitle={t('ticket.subtitle')}>
        <button className="primary" onClick={() => setCreating(true)}><Plus size={17} /> {t('ticket.create')}</button>
      </PageHeading>
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
      <div className="panel">
        <div className="table-toolbar">
          <div className="searchbox"><Search size={16} /><input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} aria-label={t('common.search')} /></div>
          <div className="filters">
            <select value={status} onChange={e => setStatus(e.target.value)} aria-label={t('ticket.field.status')}>
              <option value="">{t('ticket.filter.statusAll')}</option>
              {STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </select>
            <select value={priority} onChange={e => setPriority(e.target.value)} aria-label={t('ticket.field.priority')}>
              <option value="">{t('ticket.filter.priorityAll')}</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
            </select>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} aria-label={t('ticket.field.category')}>
              <option value="">{t('ticket.filter.categoryAll')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{label(i18n, 'cat', c.name)}</option>)}
            </select>
            {staff && (
              <select value={assigned} onChange={e => setAssigned(e.target.value)} aria-label={t('ticket.field.assignee')}>
                <option value="">{t('ticket.filter.assignedAll')}</option>
                <option value="me">{t('ticket.filter.assignedMe')}</option>
                <option value="unassigned">{t('ticket.filter.unassigned')}</option>
              </select>
            )}
          </div>
          <span className="muted count">{tickets ? t('ticket.count', { n: tickets.length }) : t('app.loading')}</span>
        </div>
        <TicketTable tickets={tickets ?? []} showAssignee={staff} emptyText={tickets === null ? t('app.loading') : filtered ? t('ticket.emptyFiltered') : t('ticket.empty')} />
      </div>
      {creating && (
        <CreateTicket categories={categories} onClose={() => { setCreating(false); if (openCreate) navigate('/tickets') }}
          onCreated={ticket => { onChanged(); navigate(`/tickets/${ticket.id}`) }} />
      )}
    </section>
  )
}
