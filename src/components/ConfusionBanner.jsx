export default function ConfusionBanner({ suggestion, onJump, onDismiss }) {
  if (!suggestion) return null

  return (
    <div className="confusion-banner" role="status" aria-live="polite">
      <p>
        You've come back to this section a few times. It builds on{' '}
        <strong>&ldquo;{suggestion.dependsOnText}&rdquo;</strong> (page {suggestion.dependsOnPage}).
      </p>
      <div className="confusion-actions">
        <button type="button" className="primary" onClick={() => onJump(suggestion.dependsOnPage)}>
          Review it
        </button>
        <button type="button" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  )
}
