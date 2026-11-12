import { useEffect, useState } from 'react'
import { useI18n } from './i18n'

const COLORS: Record<string, string> = { dev: '#1d4ed8', staging: '#c2410c', local: '#475569' }

// Shown on every environment except production, so nobody mistakes test data for real data.
export default function EnvBanner() {
  const { t } = useI18n()
  const [env, setEnv] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then(res => (res.ok ? res.json() : null))
      .then(data => setEnv(data?.environment ?? null))
      .catch(() => setEnv(null))
  }, [])

  if (!env || !COLORS[env]) return null
  return <div role="status" className="env-banner" style={{ background: COLORS[env] }}>{t(`env.${env}`)}</div>
}
