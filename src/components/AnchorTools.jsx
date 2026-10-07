import { useEffect, useRef, useState } from 'react'

export function AnchorPopup({ selection, onSave, onCancel, onAddVocab, vocabAdding }) {
  const [note, setNote] = useState('')
  const returnFocusRef = useRef(null)

  useEffect(() => {
    if (selection) {
      returnFocusRef.current = document.activeElement
    } else if (returnFocusRef.current) {
      returnFocusRef.current.focus?.()
      returnFocusRef.current = null
    }
  }, [selection])

  if (!selection) return null

  return (
    <div
      className="anchor-popup"
      style={{ top: selection.rect.top, left: selection.rect.left }}
      role="dialog"
      aria-label="Add memory anchor"
    >
      <p className="anchor-popup-quote">&ldquo;{truncate(selection.text, 90)}&rdquo;</p>
      <label className="visually-hidden" htmlFor="anchor-note-input">Why does this matter to you?</label>
      <textarea
        id="anchor-note-input"
        autoFocus
        placeholder="Why does this matter to you?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
      />
      {selection.text.length <= 60 && (
        <button
          type="button"
          className="anchor-popup-vocab"
          disabled={vocabAdding}
          onClick={onAddVocab}
        >
          {vocabAdding ? 'Defining…' : `✦ Define "${truncate(selection.text, 24)}" and add to vocabulary`}
        </button>
      )}

      <div className="anchor-popup-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="primary"
          disabled={!note.trim()}
          onClick={() => onSave(note.trim())}
        >
          Save anchor
        </button>
      </div>
    </div>
  )
}

export function AnchorPanel({ anchors, resurfacedPages, onJump, onDelete }) {
  if (!anchors || anchors.length === 0) return null

  return (
    <section className="anchor-panel" aria-label="Memory anchors">
      <h3 className="panel-heading">Memory anchors</h3>
      <ul className="anchor-list">
        {anchors.map((a) => {
          const reappearsOn = resurfacedPages[a.id] || []
          return (
            <li key={a.id} className="anchor-item">
              <p className="anchor-note">{a.note}</p>
              <p className="anchor-quote">&ldquo;{truncate(a.text, 70)}&rdquo;</p>
              <div className="anchor-meta">
                <button type="button" className="link-button" onClick={() => onJump(a.page)}>
                  p.{a.page}
                </button>
                <button type="button" className="link-button danger" onClick={() => onDelete(a.id)}>
                  Remove
                </button>
              </div>
              {reappearsOn.length > 0 && (
                <p className="anchor-resurface" role="note">
                  This idea reappears on page {reappearsOn[0]}
                  {reappearsOn.length > 1 ? ` (+${reappearsOn.length - 1} more)` : ''} —{' '}
                  <button type="button" className="link-button" onClick={() => onJump(reappearsOn[0])}>
                    take me there
                  </button>
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n).trim() + '…' : str
}
