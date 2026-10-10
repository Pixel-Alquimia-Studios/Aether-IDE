// Prevención en origen del "ResizeObserver loop completed with undelivered
// notifications": el callback corre tras el layout del frame (setTimeout 0),
// de modo que el navegador entrega las observaciones completas y nunca emite
// el error. (Un filtro de window.error no basta: vite/client registra su
// listener antes y reporta primero.) Afecta a Monaco automaticLayout, xterm
// fit y cualquier otro observer. Los timeouts pendientes se cancelan en
// disconnect() para que ningún callback dispare tras el unmount.
{
  const OriginalResizeObserver = window.ResizeObserver
  const pendingTimers = new WeakMap<ResizeObserver, Set<number>>()

  class SafeResizeObserver extends OriginalResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        const timer = window.setTimeout(() => {
          pendingTimers.get(observer)?.delete(timer)
          callback(entries, observer)
        }, 0)
        pendingTimers.get(observer)?.add(timer)
      })
      pendingTimers.set(this, new Set())
    }

    disconnect(): void {
      const timers = pendingTimers.get(this)
      if (timers) {
        for (const timer of timers) window.clearTimeout(timer)
        timers.clear()
      }
      super.disconnect()
    }
  }

  window.ResizeObserver = SafeResizeObserver
}

// Filtro limpio de respaldo por si el error se colara en alguna condición rara
window.addEventListener('error', (event) => {
  const message = event.message ?? ''
  if (
    message.includes('ResizeObserver loop completed') ||
    message.includes('ResizeObserver loop limit')
  ) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
})

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
