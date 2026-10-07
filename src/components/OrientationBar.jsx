import { useState } from 'react'

// Answers two of the three "where am I" questions right above the document,
// without making the reader consult the sidebar map at all: WHERE AM I
// (breadcrumb, always visible once a map exists) and HOW DOES THIS CONNECT
// (the dependency chain, shown on demand since not every section has one).
export default function OrientationBar({ breadcrumbPath, dependencyChain, onJump }) {
  const [showWhy, setShowWhy] = useState(false)

  if (!breadcrumbPath || breadcrumbPath.length === 0) return null

  const hasDependencyChain = dependencyChain && dependencyChain.length > 1

  return (
    <div className="orientation-bar">
      <nav aria-label="Breadcrumb: current position in document" className="breadcrumb">
        {breadcrumbPath.map((node, i) => (
          <span key={`${node.page}-${node.text}`} className="breadcrumb-segment">
            {i > 0 && <span aria-hidden="true" className="breadcrumb-sep">›</span>}
            {i === breadcrumbPath.length - 1 ? (
              <span className="breadcrumb-current" aria-current="location">{node.text}</span>
            ) : (
              <button type="button" className="breadcrumb-link" onClick={() => onJump(node)}>
                {node.text}
              </button>
            )}
          </span>
        ))}
      </nav>

      {hasDependencyChain && (
        <button
          type="button"
          className="why-here-toggle"
          aria-expanded={showWhy}
          onClick={() => setShowWhy((v) => !v)}
        >
          {showWhy ? '− Hide' : '? Why am I here'}
        </button>
      )}

      {hasDependencyChain && showWhy && (
        <ol className="dependency-chain" aria-label="How this section connects to earlier ones">
          {dependencyChain.map((node, i) => {
            const isLast = i === dependencyChain.length - 1
            return (
              <li key={`${node.page}-${node.text}`}>
                {i > 0 && <span aria-hidden="true" className="dependency-arrow">↓</span>}
                {isLast ? (
                  <span className="dependency-here">
                    <span className="visually-hidden">You are here: </span>
                    {node.text}
                  </span>
                ) : (
                  <button type="button" className="dependency-link" onClick={() => onJump(node)}>
                    {node.text}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
