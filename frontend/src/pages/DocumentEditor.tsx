import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Paperclip, X } from 'lucide-react'
import { api, errorText, formatSize, isStaff, uploadFile, type Category, type Doc, type User } from '../api'
import { label, useI18n } from '../i18n'
import { Field, Markdown, navigate, Notice, PageHeading } from '../ui'

export default function DocumentEditor({ id, user, maxMb, onChanged }: { id?: string; user: User; maxMb: number; onChanged: () => void }) {
  const i18n = useI18n()
  const { t } = i18n
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('General')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [topics, setTopics] = useState<string[]>(['General'])
  const [preview, setPreview] = useState(false)
  const [loaded, setLoaded] = useState(!id)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api<Category[]>('/categories').then(list => setTopics(['General', ...list.map(c => c.name)])).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!id) return
    api<Doc>(`/documents/${id}`).then(doc => {
      setTitle(doc.title); setTopic(doc.topic); setSummary(doc.summary ?? ''); setContent(doc.content ?? ''); setLoaded(true)
    }).catch(err => setError(errorText(err, t)))
  }, [id, t])

  function addFiles(list: FileList | null) {
    if (!list) return
    const picked = Array.from(list)
    const tooLarge = picked.find(f => f.size > maxMb * 1024 * 1024)
    if (tooLarge) { setError(t('doc.tooLarge', { name: tooLarge.name, mb: maxMb })); return }
    setFiles(current => [...current, ...picked])
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    const body = { title, topic, summary: summary || null, content }
    let docId = id
    try {
      const saved = await api<Doc>(id ? `/documents/${id}` : '/documents', { method: id ? 'PATCH' : 'POST', body })
      docId = saved.id
      // The document exists from here on; files are uploaded one by one into it.
      for (const file of files) {
        await uploadFile(`/documents/${docId}/files`, file, pct => setProgress(t('doc.uploading', { name: file.name, pct })))
      }
      onChanged()
      navigate(`/docs/${docId}`)
    } catch (err) {
      setError(errorText(err, t)); setBusy(false); setProgress('')
      // If the text was saved but a file failed, continue on the saved document instead of creating a duplicate.
      if (!id && docId) { onChanged(); navigate(`/docs/${docId}`) }
    }
  }

  const cancel = () => navigate(id ? `/docs/${id}` : '/docs')
  const topicChoices = topics.includes(topic) ? topics : [...topics, topic]

  return (
    <section className="content narrow">
      <button className="text-button back" onClick={cancel}><ArrowLeft size={15} /> {t('common.back')}</button>
      <PageHeading eyebrow={t('doc.eyebrow')} title={id ? t('doc.editor.edit') : t('doc.editor.new')} />
      {!isStaff(user) && <Notice kind="info">{t('doc.editor.pendingNote')}</Notice>}
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}
      {!loaded ? <p className="muted">{t('app.loading')}</p> : (
        <form className="panel form" onSubmit={submit}>
          <div className="form-row wide-first">
            <Field label={t('doc.field.title')}><input required minLength={4} maxLength={255} value={title} onChange={e => setTitle(e.target.value)} autoFocus /></Field>
            <Field label={t('doc.field.topic')}>
              <select value={topic} onChange={e => setTopic(e.target.value)}>
                {topicChoices.map(name => <option key={name} value={name}>{label(i18n, 'cat', name)}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('doc.field.summary')}><input maxLength={500} value={summary} onChange={e => setSummary(e.target.value)} placeholder={t('doc.field.summary.ph')} /></Field>
          <div className="field">
            <div className="field-head">
              <span>{t('doc.field.content')}</span>
              <div className="tabs small">
                <button type="button" className={preview ? '' : 'active'} onClick={() => setPreview(false)}>{t('common.edit')}</button>
                <button type="button" className={preview ? 'active' : ''} onClick={() => setPreview(true)}>{t('doc.preview')}</button>
              </div>
            </div>
            {preview
              ? <div className="preview-box">{content ? <Markdown text={content} /> : <p className="muted">{t('common.none')}</p>}</div>
              : <textarea className="content-input" value={content} onChange={e => setContent(e.target.value)} placeholder={t('doc.field.content.ph')} aria-label={t('doc.field.content')} />}
          </div>
          <div className="field">
            <span>{t('doc.field.files')}</span>
            <label className="file-picker"><Paperclip size={16} /> {t('doc.attach')}<input type="file" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} /></label>
            <small>{t('doc.attachHint', { mb: maxMb })}</small>
            {files.length > 0 && (
              <ul className="file-list compact">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <div className="file-name"><b>{file.name}</b><small className="muted">{formatSize(file.size)}</small></div>
                    <button type="button" className="icon-button" aria-label={t('common.delete')} onClick={() => setFiles(current => current.filter((_, i) => i !== index))}><X size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {progress && <Notice kind="info">{progress}</Notice>}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={cancel} disabled={busy}>{t('common.cancel')}</button>
            <button className="primary" disabled={busy}>{t('common.save')}</button>
          </div>
        </form>
      )}
    </section>
  )
}
