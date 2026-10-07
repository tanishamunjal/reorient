import { useEffect, useRef } from 'react'

function getFocusable(container) {
  return Array.from(
    container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter((el) => !el.disabled)
}

export default function ReplayOverlay({ steps, reducedMotion, onClose, onJump }) {
  const panelRef = useRef(null)
  const closeButtonRef = useRef(null)
  const returnFocusRef = useRef(null)

  useEffect(() => {
    if (!steps || steps.length === 0) return undefined
    returnFocusRef.current = document.activeElement
    closeButtonRef.current?.focus()

    function onKeyDown(e) {
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = getFocusable(panelRef.current)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      returnFocusRef.current?.focus?.()
    }
  }, [steps])

  if (!steps || steps.length === 0) return null

  return (
    <div className="replay-overlay" role="dialog" aria-modal="true" aria-label="Relationship Replay">
      <div className="replay-panel" ref={panelRef}>
        <div className="replay-header">
          <h3>How you got here</h3>
          <button type="button" ref={closeButtonRef} className="icon-button" aria-label="Close replay" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="replay-sub" aria-live="polite">
          {reducedMotion ? 'Your recent path, most recent last:' : 'Retracing your recent path…'}
        </p>
        <ol className="replay-path">
          {steps.map((step, i) => (
            <li
              key={`${step.page}-${i}`}
              className={reducedMotion ? '' : 'replay-step-animated'}
              style={reducedMotion ? undefined : { animationDelay: `${i * 220}ms` }}
            >
              <button type="button" className="replay-step" onClick={() => onJump(step.page)}>
                <span className="replay-dot" aria-hidden="true" />
                <span className="replay-label">{step.label}</span>
                <span className="replay-page">p.{step.page}</span>
              </button>
              {i < steps.length - 1 && <span className="replay-connector" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
