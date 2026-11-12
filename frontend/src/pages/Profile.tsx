import { useState, type FormEvent } from 'react'
import { LogOut } from 'lucide-react'
import { api, errorText, type User } from '../api'
import { useI18n } from '../i18n'
import { Field, LangSwitch, Notice, PageHeading } from '../ui'

export default function Profile({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { t } = useI18n()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setDone(false)
    if (next !== confirm) { setError(t('profile.mismatch')); return }
    setBusy(true)
    try {
      await api('/auth/change-password', { method: 'POST', body: { current_password: current, new_password: next } })
      setDone(true); setCurrent(''); setNext(''); setConfirm('')
    } catch (err) { setError(errorText(err, t)) } finally { setBusy(false) }
  }

  return (
    <section className="content narrow">
      <PageHeading eyebrow={t('profile.eyebrow')} title={t('profile.title')} />
      <div className="panel profile-card">
        <div className="avatar large">{user.full_name.slice(0, 1).toUpperCase()}</div>
        <div><b>{user.full_name}</b><div className="muted">{user.email} · {t(`role.${user.role}`)}</div></div>
        <div className="profile-lang">
          <span className="muted">{t('profile.language')}</span><LangSwitch />
          <button type="button" className="secondary" onClick={onLogout}><LogOut size={15} /> {t('nav.logout')}</button>
        </div>
      </div>
      <form className="panel form" onSubmit={submit}>
        <h3 className="panel-title">{t('profile.changePw')}</h3>
        <Field label={t('profile.currentPw')}><input required type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
        <div className="form-row">
          <Field label={t('profile.newPw')} hint={t('user.pwHint')}><input required minLength={8} type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" /></Field>
          <Field label={t('profile.confirmPw')}><input required minLength={8} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {done && <Notice kind="success">{t('profile.pwChanged')}</Notice>}
        <div className="form-actions"><button className="primary" disabled={busy}>{t('common.save')}</button></div>
      </form>
    </section>
  )
}
