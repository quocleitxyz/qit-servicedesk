import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BookOpen, Bot, ChevronRight, ClipboardList, LayoutDashboard, LogOut, ShieldCheck, UserCog, Users as UsersIcon } from 'lucide-react'
import { api, errorText, getToken, isStaff, setToken, type DocStats, type TicketStats, type User } from './api'
import { useI18n } from './i18n'
import { LangSwitch, navigate, Notice } from './ui'
import Dashboard from './pages/Dashboard'
import Tickets from './pages/Tickets'
import TicketDetailPage from './pages/TicketDetail'
import Documents from './pages/Documents'
import DocumentDetail from './pages/DocumentDetail'
import DocumentEditor from './pages/DocumentEditor'
import UsersPage from './pages/Users'
import Assistant from './pages/Assistant'
import Profile from './pages/Profile'

type Route = { page: string; id?: string; sub?: string; query: URLSearchParams }

// The page is kept in the URL hash (#/tickets/<id>) so links can be shared and Back works.
function parseHash(): Route {
  const [path, search = ''] = window.location.hash.replace(/^#\/?/, '').split('?')
  const [page = '', id, sub] = path.split('/')
  return { page: page || 'dashboard', id, sub, query: new URLSearchParams(search) }
}

function Login({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState(false)

  // Demo accounts are only advertised where the backend actually creates them (local, dev).
  useEffect(() => {
    api<{ demo_users?: boolean }>('/health', { auth: false }).then(h => setDemo(h.demo_users === true)).catch(() => undefined)
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const data = await api<{ access_token: string; user: User }>('/auth/login', { method: 'POST', body: { email, password }, auth: false })
      onLogin(data.access_token, data.user)
    } catch (err) { setError(errorText(err, t)) } finally { setBusy(false) }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-top"><div className="brand-mark">Q</div><LangSwitch /></div>
        <div className="eyebrow">{t('login.eyebrow')}</div>
        <h1>{t('login.title')}</h1>
        <p className="muted">{t('login.subtitle')}</p>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="login-email">{t('login.email')}</label>
          <input id="login-email" value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="username" required autoFocus />
          <label htmlFor="login-password">{t('login.password')}</label>
          <input id="login-password" value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
          <button className="primary full" disabled={busy}>{t('login.submit')} <ChevronRight size={17} /></button>
        </form>
        {error && <Notice kind="error">{error}</Notice>}
        {demo && (
          <div className="demo-hint">
            <b>{t('login.demo')}</b><br />
            admin@qit.local · QitAdmin!2026<br />
            support@qit.local · QitSupport!2026<br />
            user@qit.local · QitUser!2026
          </div>
        )}
      </div>
    </div>
  )
}

export type Counts = { tickets: TicketStats | null; docs: DocStats | null }

export default function App() {
  const { t } = useI18n()
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(!getToken())
  const [route, setRoute] = useState<Route>(parseHash)
  const [counts, setCounts] = useState<Counts>({ tickets: null, docs: null })

  const logout = useCallback(() => { setToken(''); setUser(null); setCounts({ tickets: null, docs: null }) }, [])

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    window.addEventListener('qit:unauthorized', logout)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('qit:unauthorized', logout) }
  }, [logout])

  // Restore the session after a page reload.
  useEffect(() => {
    if (!getToken()) return
    api<User>('/auth/me').then(setUser).catch(logout).finally(() => setReady(true))
  }, [logout])

  // Sidebar badges. Pages call this again after they change something.
  const refreshCounts = useCallback(() => {
    Promise.all([api<TicketStats>('/tickets/stats'), api<DocStats>('/documents/stats')])
      .then(([tickets, docs]) => setCounts({ tickets, docs }))
      .catch(() => undefined)
  }, [])
  useEffect(() => { if (user) refreshCounts() }, [user, refreshCounts])

  if (!ready) return <div className="loading-overlay">{t('app.loading')}</div>
  if (!user) return <Login onLogin={(token, u) => { setToken(token); setUser(u) }} />

  const staff = isStaff(user)
  const admin = user.role === 'IT_ADMIN'
  const page = route.page === 'users' && !admin ? 'dashboard' : route.page
  const section = page === 'tickets' ? 'tickets' : page === 'docs' ? 'docs' : page

  const titles: Record<string, string> = {
    dashboard: t('nav.dashboard'), tickets: staff ? t('nav.tickets.all') : t('nav.tickets.mine'), docs: t('nav.docs'),
    assistant: t('nav.assistant'), users: t('nav.users'), profile: t('nav.profile'),
  }
  const openTickets = counts.tickets
    ? (counts.tickets.by_status.OPEN ?? 0) + (counts.tickets.by_status.IN_PROGRESS ?? 0) + (counts.tickets.by_status.PENDING ?? 0)
    : null
  const navButton = (id: string, icon: JSX.Element, text: string, badge?: JSX.Element | null) => (
    <button className={section === id ? 'active' : ''} onClick={() => navigate(`/${id}`)} aria-current={section === id ? 'page' : undefined}>
      {icon}<span className="nav-text">{text}</span>{badge}
    </button>
  )

  let content: JSX.Element
  if (page === 'tickets' && route.id) content = <TicketDetailPage key={route.id} id={route.id} user={user} onChanged={refreshCounts} />
  else if (page === 'tickets') content = <Tickets user={user} onChanged={refreshCounts} openCreate={route.query.get('new') === '1'} />
  else if (page === 'docs' && route.id === 'new') content = <DocumentEditor user={user} maxMb={counts.docs?.max_upload_mb ?? 50} onChanged={refreshCounts} />
  else if (page === 'docs' && route.id && route.sub === 'edit') content = <DocumentEditor key={route.id} id={route.id} user={user} maxMb={counts.docs?.max_upload_mb ?? 50} onChanged={refreshCounts} />
  else if (page === 'docs' && route.id) content = <DocumentDetail key={route.id} id={route.id} user={user} maxMb={counts.docs?.max_upload_mb ?? 50} onChanged={refreshCounts} />
  else if (page === 'docs') content = <Documents user={user} />
  else if (page === 'assistant') content = <Assistant initialMessage={route.query.get('q') ?? ''} />
  else if (page === 'users') content = <UsersPage me={user} />
  else if (page === 'profile') content = <Profile user={user} onLogout={logout} />
  else content = <Dashboard user={user} counts={counts} />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark small">Q</div><div><b>QIT</b><small>{t('app.tagline')}</small></div></div>
        <div className="side-label">{t('nav.workspace')}</div>
        <nav>
          {navButton('dashboard', <LayoutDashboard size={18} />, t('nav.dashboard'))}
          {navButton('tickets', <ClipboardList size={18} />, titles.tickets, openTickets ? <span className="nav-count">{openTickets}</span> : null)}
          {navButton('docs', <BookOpen size={18} />, t('nav.docs'),
            staff && counts.docs?.pending ? <span className="nav-count warn" title={t('dash.pendingDocs')}>{counts.docs.pending}</span> : null)}
          {navButton('assistant', <Bot size={18} />, t('nav.assistant'), <span className="new-tag">AI</span>)}
        </nav>
        {admin && <><div className="side-label">{t('nav.admin')}</div><nav>{navButton('users', <UsersIcon size={18} />, t('nav.users'))}</nav></>}
        <div className="sidebar-bottom">
          <div className="help-card">
            <ShieldCheck size={20} /><b>{t('nav.help.title')}</b><p>{t('nav.help.text')}</p>
            <button onClick={() => navigate('/assistant')}>{t('nav.help.cta')} <ChevronRight size={14} /></button>
          </div>
          <div className="profile">
            <button className="profile-link" onClick={() => navigate('/profile')} title={t('nav.profile')}>
              <div className="avatar">{user.full_name.slice(0, 1).toUpperCase()}</div>
              <div className="profile-info"><b>{user.full_name}</b><small>{t(`role.${user.role}`)}</small></div>
            </button>
            <button className="icon-button" onClick={logout} title={t('nav.logout')} aria-label={t('nav.logout')}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">QIT <ChevronRight size={14} /> <b>{titles[section] ?? titles.dashboard}</b></div>
          <div className="top-actions">
            <LangSwitch />
            <button className="icon-button" onClick={() => navigate('/profile')} title={t('nav.profile')} aria-label={t('nav.profile')}><UserCog size={18} /></button>
          </div>
        </header>
        {content}
      </main>
    </div>
  )
}
