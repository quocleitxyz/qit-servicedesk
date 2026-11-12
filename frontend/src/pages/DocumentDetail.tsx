import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Download, FileText, Pencil, Trash2, Upload, X } from 'lucide-react'
import { api, downloadFile, errorText, formatSize, isStaff, uploadFile, type Doc, type User } from '../api'
import { formatDate, label, useI18n } from '../i18n'
import { DocStatusBadge, Field, Markdown, Modal, navigate, Notice } from '../ui'

export default function DocumentDetail({ id, user, maxMb, onChanged }: { id: string; user: User; maxMb: number; onChanged: () => void }) {
  const i18n = useI18n()
  const { t, lang } = i18n
  const staff = isStaff(user)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try { setDoc(await api<Doc>(`/documents/${id}`)); setError('') } catch (err) { setError(errorText(err, t)) }
  }, [id, t])
  useEffect(() => { load() }, [load])

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await action(); await load(); onChanged() } catch (err) { setError(errorText(err, t)) } finally { setBusy(false); setProgress('') }
  }

  const review = (action: 'APPROVE' | 'REJECT') => run(async () => {
    await api(`/documents/${id}/review`, { method: 'POST', body: { action, note: action === 'REJECT' ? note : null } })
    setRejecting(false); setNote('')
  })

  async function upload(files: FileList | null) {
    if (!files?.length) return
    const list = Array.from(files)
    const tooLarge = list.find(f => f.size > maxMb * 1024 * 1024)
    if (tooLarge) { setError(t('doc.tooLarge', { name: tooLarge.name, mb: maxMb })); return }
    await run(async () => {
      for (const file of list) {
        await uploadFile(`/documents/${id}/files`, file, pct => setProgress(t('doc.uploading', { name: file.name, pct })))
      }
    })
    if (fileInput.current) fileInput.current.value = ''
  }

  async function remove() {
    if (!window.confirm(t('common.confirmDelete'))) return
    setBusy(true)
    try { await api(`/documents/${id}`, { method: 'DELETE' }); onChanged(); navigate('/docs') }
    catch (err) { setError(errorText(err, t)); setBusy(false) }
  }

  const back = <button className="text-button back" onClick={() => navigate('/docs')}><ArrowLeft size={15} /> {t('common.back')}</button>
  if (!doc) return <section className="content">{back}{error ? <Notice kind="error">{error}</Notice> : <p className="muted">{t('app.loading')}</p>}</section>

  const canEdit = staff || doc.created_by === user.id
  const files = doc.files ?? []

  return (
    <section className="content narrow">
      {back}
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}

      {doc.status === 'PENDING' && staff && (
        <Notice kind="warn">
          <div className="review-bar">
            <span>{t('doc.review.banner')}</span>
            <span className="heading-actions">
              <button className="secondary danger" disabled={busy} onClick={() => setRejecting(true)}><X size={15} /> {t('doc.review.reject')}</button>
              <button className="primary" disabled={busy} onClick={() => review('APPROVE')}><Check size={15} /> {t('doc.review.approve')}</button>
            </span>
          </div>
        </Notice>
      )}
      {doc.status === 'PENDING' && !staff && <Notice kind="info">{t('doc.review.pendingAuthor')}</Notice>}
      {doc.status === 'REJECTED' && <Notice kind="error"><b>{t('doc.review.rejected')}</b> {doc.review_note}</Notice>}

      <article className="panel doc-article">
        <div className="detail-head">
          <div>
            <div className="badge-row"><span className="badge neutral">{label(i18n, 'cat', doc.topic)}</span><DocStatusBadge value={doc.status} /></div>
            <h1>{doc.title}</h1>
            <div className="doc-card-meta">
              <span>{t('doc.by')}: {doc.author_name}</span><span>·</span>
              <span>{t('doc.updated')}: {formatDate(doc.updated_at, lang, true)}</span>
              {doc.status === 'APPROVED' && doc.reviewer_name && <><span>·</span><span>{t('doc.reviewedBy')}: {doc.reviewer_name}</span></>}
            </div>
          </div>
          {canEdit && (
            <div className="heading-actions">
              <button className="secondary" disabled={busy} onClick={() => navigate(`/docs/${id}/edit`)}><Pencil size={15} /> {t('common.edit')}</button>
              <button className="secondary danger" disabled={busy} onClick={remove}><Trash2 size={15} /> {t('common.delete')}</button>
            </div>
          )}
        </div>
        {doc.summary && <p className="doc-summary">{doc.summary}</p>}
        {doc.content && <Markdown text={doc.content} />}
      </article>

      <div className="panel">
        <div className="panel-heading">
          <h3>{t('doc.attachments')}</h3>
          {canEdit && (
            <>
              <input ref={fileInput} type="file" multiple hidden onChange={e => upload(e.target.files)} />
              <button className="secondary" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={15} /> {t('doc.upload')}</button>
            </>
          )}
        </div>
        {progress && <Notice kind="info">{progress}</Notice>}
        {files.length === 0 && <p className="muted">{t('doc.noFiles')}</p>}
        <ul className="file-list">
          {files.map(file => (
            <li key={file.id}>
              <FileText size={18} />
              <div className="file-name"><b>{file.name}</b><small className="muted">{formatSize(file.size)} · {formatDate(file.created_at, lang)}</small></div>
              <button className="secondary" onClick={() => downloadFile(`/documents/${id}/files/${file.id}`, file.name).catch(err => setError(errorText(err, t)))}><Download size={15} /> {t('doc.download')}</button>
              {canEdit && <button className="icon-button danger" disabled={busy} title={t('common.delete')} aria-label={t('common.delete')}
                onClick={() => { if (window.confirm(t('common.confirmDelete'))) run(() => api(`/documents/${id}/files/${file.id}`, { method: 'DELETE' })) }}><Trash2 size={16} /></button>}
            </li>
          ))}
        </ul>
        {canEdit && <small className="muted">{t('doc.attachHint', { mb: maxMb })}</small>}
      </div>

      {rejecting && (
        <Modal title={t('doc.review.reject')} onClose={() => setRejecting(false)}>
          <form className="form" onSubmit={e => { e.preventDefault(); review('REJECT') }}>
            <Field label={t('doc.review.note')}><textarea required value={note} onChange={e => setNote(e.target.value)} placeholder={t('doc.review.note.ph')} autoFocus /></Field>
            <button className="primary full danger" disabled={busy || !note.trim()}>{t('doc.review.reject')}</button>
          </form>
        </Modal>
      )}
    </section>
  )
}
