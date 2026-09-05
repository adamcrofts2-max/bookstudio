import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import { installErrorCapture } from '@/lib/installErrorCapture'
import './index.css'

// Before the first render, so a fault during mount is recorded too.
installErrorCapture()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
