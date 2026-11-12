import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { label, useI18n, type Lang } from './i18n'

export function navigate(path: string) {
  window.location.hash = path
}

export function LangSwitch() {
  const { lang, setLang } = useI18n()
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      {(['vi', 'en'] as Lang[]).map(code => (
        <button key={code} type="button" className={lang === code ? 'active' : ''} onClick={() => setLang(code)}
          aria-pressed={lang === code}>{code.toUpperCase()}</button>
      ))}
    </div>
  )
}

export function StatusBadge({ value }: { value: string }) {
  const i18n = useI18n()
  return <span className={`badge status-${value.toLowerCase()}`}>{label(i18n, 'status', value)}</span>
}

export function PriorityBadge({ value }: { value: string }) {
  const i18n = useI18n()
  return <span className={`badge priority-${value.toLowerCase()}`}>{label(i18n, 'priority', value)}</span>
}

export function DocStatusBadge({ value }: { value: string }) {
  const { t } = useI18n()
  return <span className={`badge doc-${value.toLowerCase()}`}>{t(`doc.status.${value}`)}</span>
}

export function Notice({ kind, children, onClose }: { kind: 'error' | 'success' | 'info' | 'warn'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div>{children}</div>
      {onClose && <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={15} /></button>}
    </div>
  )
}

export function Modal({ eyebrow, title, onClose, children, wide }: {
  eyebrow?: string; title: string; onClose: () => void; children: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label: text, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{text}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function PageHeading({ eyebrow, title, subtitle, children }: {
  eyebrow: string; title: string; subtitle?: string; children?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  )
}

// --- Minimal, safe Markdown ---------------------------------------------------
// Renders to React elements (never innerHTML), so user-written articles cannot inject HTML.
// Supported: # headings, - bullets, 1. numbered lists, ``` code blocks, **bold**, `code`, links.

function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s<>()]+)/g)
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={key}>{part.slice(1, -1)}</code>
    if (/^https?:\/\//.test(part)) return <a key={key} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
    return part
  })
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = `b${i}`
    if (line.trim().startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      i++
      blocks.push(<pre key={key}><code>{code.join('\n')}</code></pre>)
    } else if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length
      const content = inline(line.replace(/^#+\s*/, ''), key)
      blocks.push(level === 1 ? <h2 key={key}>{content}</h2> : level === 2 ? <h3 key={key}>{content}</h3> : <h4 key={key}>{content}</h4>)
      i++
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i].replace(/^\s*[-*]\s+/, ''), `li${i}`)}</li>)
        i++
      }
      blocks.push(<ul key={key}>{items}</ul>)
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i].replace(/^\s*\d+[.)]\s+/, ''), `li${i}`)}</li>)
        i++
      }
      blocks.push(<ol key={key}>{items}</ol>)
    } else if (!line.trim()) {
      i++
    } else {
      const paragraph: string[] = []
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*[-*]\s+|\s*\d+[.)]\s+|\s*```)/.test(lines[i])) paragraph.push(lines[i++])
      blocks.push(<p key={key}>{paragraph.flatMap((l, n) => n ? [<br key={`br${n}`} />, ...inline(l, `${key}-${n}`)] : inline(l, `${key}-${n}`))}</p>)
    }
  }
  return <div className="markdown">{blocks}</div>
}
