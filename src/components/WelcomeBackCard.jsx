function truncate(str, n) {
  return str.length > n ? str.slice(0, n).trim() + '…' : str
}

// The "what was I doing" half of orientation: reconstructs where a reader
// left off the last time they opened THIS document, from data the app
// already keeps (last position, most recent Memory Anchor) — a real
// reorientation moment instead of silently dropping them back at page 1.
export default function WelcomeBackCard({ info, onContinue, onDismiss }) {
  if (!info) return null

  return (
    <div className="welcome-back-card" role="status">
      <p className="welcome-back-title">Welcome back</p>
      <p className="welcome-back-detail">
        You stopped in: <strong>{info.breadcrumbText || `page ${info.page}`}</strong>
      </p>
      {info.lastAnchor && (
        <p className="welcome-back-detail">
          Last note: &ldquo;{truncate(info.lastAnchor.note, 80)}&rdquo;
        </p>
      )}
      <div className="welcome-back-actions">
        <button type="button" onClick={onDismiss}>Dismiss</button>
        <button type="button" className="primary" onClick={onContinue}>Continue →</button>
      </div>
    </div>
  )
}
