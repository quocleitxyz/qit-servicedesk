import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Plus } from 'lucide-react'
import { api, errorText, ROLES, type Role, type User } from '../api'
import { formatDate, useI18n } from '../i18n'
import { Field, Modal, Notice, PageHeading } from '../ui'

export default function UsersPage({ me }: { me: User }) {
  const { t, lang } = useI18n()
  const [users, setUsers] = useState<User[] | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false)
  const [resetFor, setResetFor] = useState<User | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'USER' as Role })
  const [newPassword, setNewPassword] = useState('')
  const [modalError, setModalError] = useState('')

  const load = useCallback(() => api<User[]>('/users').then(setUsers).catch(err => setError(errorText(err, t))), [t])
  useEffect(() => { load() }, [load])

  async function patch(user: User, changes: Partial<User>) {
    setError('')
    try { await api(`/users/${user.id}`, { method: 'PATCH', body: changes }); await load() }
    catch (err) { setError(errorText(err, t)); await load() }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setModalError('')
    try {
      await api('/users', { method: 'POST', body: form })
      setCreating(false); setForm({ full_name: '', email: '', password: '', role: 'USER' }); await load()
    } catch (err) { setModalError(errorText(err, t)) } finally { setBusy(false) }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault()
    if (!resetFor) return
    setBusy(true); setModalError('')
    try {
      await api(`/users/${resetFor.id}/reset-password`, { method: 'POST', body: { new_password: newPassword } })
      setMessage(t('user.pwResetDone', { name: resetFor.full_name })); setResetFor(null); setNewPassword('')
    } catch (err) { setModalError(errorText(err, t)) } finally { setBusy(false) }
  }

  return (
    <section className="content">
      <PageHeading eyebrow={t('user.eyebrow')} title={t('user.title')} subtitle={t('user.subtitle')}>
        <button className="primary" onClick={() => { setModalError(''); setCreating(true) }}><Plus size={17} /> {t('user.new')}</button>
      </PageHeading>
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
      {message && <Notice kind="success" onClose={() => setMessage('')}>{message}</Notice>}
      <div className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>{t('user.name').toUpperCase()}</th><th>EMAIL</th><th>{t('user.role').toUpperCase()}</th><th>{t('user.state').toUpperCase()}</th><th>{t('user.created').toUpperCase()}</th><th>{t('common.actions').toUpperCase()}</th></tr></thead>
            <tbody>
              {users === null && <tr><td colSpan={6} className="empty">{t('app.loading')}</td></tr>}
              {users?.map(u => (
                <tr key={u.id}>
                  <td><div className="subject">{u.full_name}{u.id === me.id && <span className="badge neutral you">{t('user.you')}</span>}</div></td>
                  <td>{u.email}</td>
                  <td>
                    <select value={u.role} disabled={u.id === me.id} onChange={e => patch(u, { role: e.target.value as Role })} aria-label={t('user.role')}>
                      {ROLES.map(r => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                    </select>
                  </td>
                  <td><span className={`badge ${u.is_active ? 'doc-approved' : 'doc-rejected'}`}>{u.is_active ? t('user.active') : t('user.locked')}</span></td>
                  <td className="date">{u.created_at ? formatDate(u.created_at, lang) : ''}</td>
                  <td>
                    <div className="row-actions">
                      <button className="secondary" onClick={() => { setModalError(''); setNewPassword(''); setResetFor(u) }}><KeyRound size={14} /> {t('user.resetPw')}</button>
                      {u.id !== me.id && <button className={`secondary${u.is_active ? ' danger' : ''}`} onClick={() => patch(u, { is_active: !u.is_active })}>{u.is_active ? t('user.lock') : t('user.unlock')}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <Modal eyebrow={t('user.eyebrow')} title={t('user.new')} onClose={() => setCreating(false)}>
          <form className="form" onSubmit={create}>
            <Field label={t('user.name')}><input required minLength={2} maxLength={150} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} autoFocus /></Field>
            <Field label="Email"><input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="off" /></Field>
            <div className="form-row">
              <Field label={t('login.password')} hint={t('user.pwHint')}><input required minLength={8} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
              <Field label={t('user.role')}>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Role })}>{ROLES.map(r => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select>
              </Field>
            </div>
            {modalError && <Notice kind="error">{modalError}</Notice>}
            <button className="primary full" disabled={busy}>{t('common.create')}</button>
          </form>
        </Modal>
      )}

      {resetFor && (
        <Modal eyebrow={resetFor.email} title={t('user.resetPw')} onClose={() => setResetFor(null)}>
          <form className="form" onSubmit={resetPassword}>
            <Field label={t('user.newPw')} hint={t('user.pwHint')}><input required minLength={8} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" autoFocus /></Field>
            {modalError && <Notice kind="error">{modalError}</Notice>}
            <button className="primary full" disabled={busy}>{t('common.save')}</button>
          </form>
        </Modal>
      )}
    </section>
  )
}
