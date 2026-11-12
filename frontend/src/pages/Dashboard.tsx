import { useEffect, useState } from 'react'
import { Activity, Bot, ChevronRight, Clock3, FileCheck2, Inbox, Mail, Plus, Printer, ShieldCheck, Ticket as TicketIcon, UserCheck, Wifi } from 'lucide-react'
import type { ReactNode } from 'react'
import { api, isStaff, type Ticket, type User } from '../api'
import type { Counts } from '../App'
import { useI18n } from '../i18n'
import { navigate, PageHeading } from '../ui'
import { TicketTable } from './Tickets'

function Stat({ icon, text, value, color, onClick }: { icon: ReactNode; text: string; value: number | string; color: string; onClick?: () => void }) {
  const body = <><div className={`stat-icon ${color}`}>{icon}</div><div><div className="stat-label">{text}</div><div className="stat-value">{value}</div></div></>
  return onClick ? <button className="stat-card clickable" onClick={onClick}>{body}</button> : <div className="stat-card">{body}</div>
}

export default function Dashboard({ user, counts }: { user: User; counts: Counts }) {
  const { t } = useI18n()
  const [recent, setRecent] = useState<Ticket[]>([])
  const staff = isStaff(user)

  useEffect(() => { api<Ticket[]>('/tickets?limit=6').then(setRecent).catch(() => undefined) }, [])

  const s = counts.tickets
  const by = (key: string) => s?.by_status[key] ?? 0
  const value = (n: number) => (s ? n : '–')
  const ask = (q: string) => navigate(`/assistant?q=${encodeURIComponent(q)}`)

  return (
    <section className="content">
      <PageHeading eyebrow={t('dash.eyebrow')} title={t('dash.hello', { name: user.full_name.split(' ')[0] })} subtitle={t('dash.subtitle')}>
        <button className="primary" onClick={() => navigate('/tickets?new=1')}><Plus size={17} /> {t('ticket.create')}</button>
      </PageHeading>

      <div className="stats-grid">
        <Stat icon={<TicketIcon />} text={t('dash.total')} value={value(s?.total ?? 0)} color="blue" />
        <Stat icon={<Clock3 />} text={t('dash.open')} value={value(by('OPEN'))} color="orange" />
        <Stat icon={<Activity />} text={t('dash.progress')} value={value(by('IN_PROGRESS') + by('PENDING'))} color="purple" />
        <Stat icon={<ShieldCheck />} text={t('dash.resolved')} value={value(by('RESOLVED') + by('CLOSED'))} color="green" />
      </div>

      {staff && (
        <>
          <h3 className="section-title">{t('dash.queue')}</h3>
          <div className="stats-grid three">
            <Stat icon={<Inbox />} text={t('dash.unassigned')} value={value(s?.unassigned ?? 0)} color="orange" onClick={() => navigate('/tickets?assigned=unassigned')} />
            <Stat icon={<UserCheck />} text={t('dash.assignedToMe')} value={value(s?.assigned_to_me ?? 0)} color="blue" onClick={() => navigate('/tickets?assigned=me')} />
            <Stat icon={<FileCheck2 />} text={t('dash.pendingDocs')} value={counts.docs ? counts.docs.pending : '–'} color="purple" onClick={() => navigate('/docs?tab=review')} />
          </div>
        </>
      )}

      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <div><h3>{t('dash.recent')}</h3><p>{t('dash.recentSub')}</p></div>
            <button className="text-button" onClick={() => navigate('/tickets')}>{t('dash.viewAll')} <ChevronRight size={15} /></button>
          </div>
          <TicketTable tickets={recent} showAssignee={staff} emptyText={t('ticket.empty')} />
        </div>
        <div className="panel ai-panel">
          <div className="ai-orb"><Bot size={27} /></div>
          <div className="eyebrow">{t('nav.assistant').toUpperCase()}</div>
          <h2>{t('dash.ai.title')}</h2>
          <p>{t('dash.ai.text')}</p>
          <div className="quick-actions">
            <button onClick={() => ask(t('ai.q.network'))}><Wifi size={16} /> {t('dash.ai.network')}</button>
            <button onClick={() => ask(t('ai.q.printer'))}><Printer size={16} /> {t('dash.ai.printer')}</button>
            <button onClick={() => ask(t('ai.q.email'))}><Mail size={16} /> {t('dash.ai.email')}</button>
          </div>
          <button className="primary full" onClick={() => navigate('/assistant')}>{t('dash.ai.start')} <ChevronRight size={17} /></button>
        </div>
      </div>
    </section>
  )
}
