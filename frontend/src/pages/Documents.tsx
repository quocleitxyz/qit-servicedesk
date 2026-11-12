import { useEffect, useState } from 'react'
import { FileText, Paperclip, Plus, Search } from 'lucide-react'
import { api, errorText, isStaff, query, type Doc, type User } from '../api'
import { formatDate, label, useI18n } from '../i18n'
import { DocStatusBadge, navigate, Notice, PageHeading } from '../ui'

type Tab = 'library' | 'mine' | 'review'

export default function Documents({ user }: { user: User }) {
  const i18n = useI18n()
  const { t, lang } = i18n
  const staff = isStaff(user)
  const initial = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('tab')
  const [tab, setTab] = useState<Tab>(initial === 'review' && staff ? 'review' : initial === 'mine' ? 'mine' : 'library')
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [search, setSearch] = useState('')
  const [topic, setTopic] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const params = tab === 'library' ? { status: 'APPROVED' } : tab === 'mine' ? { mine: true } : { status: 'PENDING' }
    const timer = setTimeout(() => {
      api<Doc[]>(`/documents${query({ ...params, q: search.trim(), topic })}`)
        .then(list => {
          if (cancelled) return
          setDocs(list); setError('')
          // Topic choices come from the documents themselves (collected while no topic filter is set).
          if (!topic && !search) setTopics([...new Set(list.map(d => d.topic))].sort())
        })
        .catch(err => { if (!cancelled) setError(errorText(err, t)) })
    }, search ? 300 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [tab, search, topic, t])

  const tabs: Tab[] = staff ? ['library', 'review', 'mine'] : ['library', 'mine']

  return (
    <section className="content">
      <PageHeading eyebrow={t('doc.eyebrow')} title={t('doc.title')} subtitle={t('doc.subtitle')}>
        <button className="primary" onClick={() => navigate('/docs/new')}><Plus size={17} /> {t('doc.new')}</button>
      </PageHeading>
      {error && <Notice kind="error" onClose={() => setError('')}>{error}</Notice>}

      <div className="table-toolbar">
        <div className="tabs" role="tablist">
          {tabs.map(id => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''}
              onClick={() => { setTab(id); setTopic(''); setDocs(null) }}>{t(`doc.tab.${id}`)}</button>
          ))}
        </div>
        <div className="filters">
          <div className="searchbox"><Search size={16} /><input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} aria-label={t('common.search')} /></div>
          <select value={topic} onChange={e => setTopic(e.target.value)} aria-label={t('doc.field.topic')}>
            <option value="">{t('doc.field.topic')}: {t('common.all')}</option>
            {topics.map(name => <option key={name} value={name}>{label(i18n, 'cat', name)}</option>)}
          </select>
        </div>
      </div>

      {docs === null && <p className="muted">{t('app.loading')}</p>}
      {docs?.length === 0 && <div className="panel empty-state"><FileText size={28} /><p>{t('doc.empty')}</p></div>}
      <div className="doc-grid">
        {docs?.map(doc => (
          <button key={doc.id} className="doc-card" onClick={() => navigate(`/docs/${doc.id}`)}>
            <div className="doc-card-top">
              <span className="badge neutral">{label(i18n, 'cat', doc.topic)}</span>
              {(tab !== 'library' || doc.status !== 'APPROVED') && <DocStatusBadge value={doc.status} />}
            </div>
            <b>{doc.title}</b>
            {doc.summary && <p>{doc.summary}</p>}
            <div className="doc-card-meta">
              <span>{doc.author_name}</span><span>·</span><span>{formatDate(doc.updated_at, lang)}</span>
              {doc.file_count > 0 && <span className="files"><Paperclip size={12} /> {t('doc.files', { n: doc.file_count })}</span>}
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
