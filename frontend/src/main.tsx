import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import EnvBanner from './EnvBanner'
import { I18nProvider } from './i18n'
import './style.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <EnvBanner />
      <App />
    </I18nProvider>
  </React.StrictMode>
)
