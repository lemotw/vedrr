import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './i18n'
import './index.css'
import App from './App.tsx'
import { QuickCapture } from './components/QuickCapture.tsx'

const isQuickCapture = getCurrentWindow().label === 'quickcapture'

if (isQuickCapture) {
  document.documentElement.classList.add('quickcapture')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isQuickCapture ? <QuickCapture /> : <App />}
  </StrictMode>,
)
