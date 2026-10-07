import { useState } from 'react'

export default function VocabPanel({ vocabulary, onJump }) {
  const [openTerm, setOpenTerm] = useState(null)

  if (!vocabulary || vocabulary.length === 0) return null

  return (
    <section className="vocab-panel" aria-label="Vocabulary">
      <h3 className="panel-heading">Vocabulary</h3>
      <ul className="vocab-list">
        {vocabulary.map((entry) => {
          const isOpen = openTerm === entry.term
          return (
            <li key={entry.term} className="vocab-item">
              <button
                type="button"
                className="vocab-term"
                aria-expanded={isOpen}
                onClick={() => setOpenTerm(isOpen ? null : entry.term)}
              >
                <span>
                  {entry.custom && (
                    <>
                      <span aria-hidden="true" className="graph-sparkle vocab-custom-mark">✦</span>
                      <span className="visually-hidden">Your addition: </span>
                    </>
                  )}
                  {entry.term}
                </span>
                <span aria-hidden="true" className="vocab-caret">{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen && (
                <div className="vocab-definition">
                  <p>{entry.definition}</p>
                  {typeof entry.page === 'number' && (
                    <button type="button" className="link-button" onClick={() => onJump(entry.page)}>
                      Jump to page {entry.page}
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
