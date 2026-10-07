import { useEffect, useRef, useState } from 'react'
import { REVISIT_HEAT_THRESHOLD } from '../lib/treeUtils'

// Rough footprint of a resting (non-hovered) bubble, used only to size the
// radius so siblings don't overlap — see computeRadius below. On a research
// paper with long section titles, fixed-size bubbles either overflow a
// narrow sidebar or look tiny and wasteful on a wide one, so bubble size
// scales continuously with the actual available width (tracked via
// ResizeObserver below) instead of only having two fixed steps. Compact
// density still asks for a visibly tighter layout on top of that, not just
// smaller padding, so it further shrinks whatever the width-based size is.
const MIN_NODE_W = 118
const MAX_NODE_W = 190
const NARROW_WIDTH = 260
const WIDE_WIDTH = 820

export function layoutFor(availableWidth, density) {
  const clamped = Math.min(Math.max(availableWidth, NARROW_WIDTH), WIDE_WIDTH)
  const t = (clamped - NARROW_WIDTH) / (WIDE_WIDTH - NARROW_WIDTH)
  const scaledNodeW = MIN_NODE_W + t * (MAX_NODE_W - MIN_NODE_W)
  const nodeW = density === 'compact' ? scaledNodeW * 0.82 : scaledNodeW
  const nodeH = Math.round(nodeW * 0.615)
  const gap = Math.max(12, Math.round(nodeW * 0.14))
  const minRadius = Math.max(96, Math.round(nodeW * 0.9))
  return { nodeW: Math.round(nodeW), nodeH, gap, minRadius }
}

function angleFor(index, count) {
  return (index / count) * 2 * Math.PI - Math.PI / 2
}

function nodeKey(node) {
  return `${node.page}-${node.text}`
}

// Connector lines are drawn between bubble CENTERS, but should visually stop
// at each bubble's edge — otherwise the line runs straight through the label
// text (worse still on bubbles with a translucent tint, where it's visible
// right through the background). Pulling each endpoint in by an approximate
// bubble radius keeps the line confined to the gap between bubbles. Kept
// proportional to nodeW so the pullback still lands on the bubble's edge
// when compact density shrinks the bubbles.
function shrinkLine(x1, y1, x2, y2, pullStart, pullEnd) {
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  return {
    x1: x1 + ux * pullStart,
    y1: y1 + uy * pullStart,
    x2: x2 - ux * pullEnd,
    y2: y2 - uy * pullEnd,
  }
}

// The radius needed so that `count` bubbles evenly spaced around a circle
// don't touch: the chord between two adjacent bubbles is 2*r*sin(π/count),
// which must be at least one bubble-width-plus-gap. More siblings need a
// bigger circle — a fixed radius (the old approach) overlaps badly past
// 5-6 items.
function computeRadius(count, nodeW, gap, minRadius) {
  if (count <= 1) return minRadius
  const angleStep = (2 * Math.PI) / count
  const needed = (nodeW + gap) / (2 * Math.sin(angleStep / 2))
  return Math.max(minRadius, needed)
}

// Radial drill-down over the tree data that feeds MindMapTree — real
// document structure, no AI calls, no new nodes. One OPTIONAL extra level:
// clicking a real leaf (no sub-headings) also asks the AI to break that
// section's own page text into key points. Those generated bubbles are
// visually distinct (ai-generated class) and terminal — clicking one jumps to
// and highlights its exact source quote rather than drilling further, so the
// generated layer never gets confused with real structure and every point is
// traceable to real text on the page.
export default function GraphView({ tree, currentPage, onJumpToNode, onExpandLeaf, onJumpToQuote, density, visitCounts }) {
  const [path, setPath] = useState([])
  const [loadingKey, setLoadingKey] = useState(null)
  const [availableWidth, setAvailableWidth] = useState(320)
  const wrapperRef = useRef(null)
  const ringRefs = useRef([])
  const centerRef = useRef(null)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      setAvailableWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!tree || tree.length === 0) return null

  const { nodeW: NODE_W, nodeH: NODE_H, gap: GAP, minRadius: MIN_RADIUS } = layoutFor(availableWidth, density)
  const CENTER_PULLBACK = NODE_W * 0.42
  const CHILD_PULLBACK = NODE_W * 0.33

  const lastEntry = path.length ? path[path.length - 1] : null
  const center = lastEntry ? lastEntry.node : null
  const ring = lastEntry ? lastEntry.generatedChildren ?? lastEntry.node.children ?? [] : tree

  const radius = computeRadius(ring.length, NODE_W, GAP, MIN_RADIUS)
  // The canvas itself may need to be wider/taller than the visible sidebar to
  // fit everyone without overlap; the wrapper scrolls horizontally when that
  // happens, and the sidebar's own vertical scroll absorbs extra height.
  const canvasWidth = Math.max(availableWidth, radius * 2 + NODE_W + 40)
  const canvasHeight = Math.max(340, radius * 2 + NODE_H + 40)
  const cx = canvasWidth / 2
  const cy = canvasHeight / 2

  function goBack() {
    setPath((prev) => prev.slice(0, -1))
    centerRef.current?.focus()
  }

  async function expandLeaf(node) {
    const key = nodeKey(node)
    setLoadingKey(key)
    try {
      const points = await onExpandLeaf(node)
      // Always drill in, even when nothing came back (the anti-hallucination
      // filter can legitimately zero out every candidate) — otherwise the
      // bubble just silently stops "loading" with no visible result, which
      // reads as the feature being broken rather than "nothing found here."
      const generatedChildren = (points || []).map((p) => ({
        text: p.point,
        quote: p.quote,
        page: node.page,
        _generated: true,
      }))
      setPath((prev) => [...prev, { node, generatedChildren }])
    } catch (err) {
      console.error(err)
      alert(`Could not break this section down further: ${err.message}`)
    } finally {
      setLoadingKey(null)
    }
  }

  function selectNode(node) {
    if (node._generated) {
      onJumpToQuote(node.page, node.quote)
      return
    }
    onJumpToNode(node)
    if (node.children && node.children.length > 0) {
      setPath((prev) => [...prev, { node }])
      return
    }
    expandLeaf(node)
  }

  function focusRing(index) {
    const el = ringRefs.current[(index + ring.length) % ring.length]
    el?.focus()
  }

  function handleRingKeyDown(e, index) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      focusRing(index + 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      focusRing(index - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusRing(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusRing(ring.length - 1)
    } else if (e.key === 'Escape' && path.length > 0) {
      e.preventDefault()
      goBack()
    }
  }

  const positions = ring.map((node, i) => {
    const angle = angleFor(i, ring.length || 1)
    return { node, x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) }
  })

  const isEmptyKeyPoints = Boolean(lastEntry?.generatedChildren && lastEntry.generatedChildren.length === 0)

  const sceneLabel = isEmptyKeyPoints
    ? `No key points found inside "${center.text}"`
    : center
      ? `Showing ${ring.length} item${ring.length === 1 ? '' : 's'} inside "${center.text}"`
      : `Showing ${ring.length} top-level item${ring.length === 1 ? '' : 's'}`

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <button type="button" onClick={goBack} disabled={path.length === 0}>
          ← Back
        </button>
        {path.length > 0 && (
          <span className="graph-breadcrumb" title={path.map((p) => p.node.text).join(' › ')}>
            {path.map((p) => p.node.text).join(' › ')}
          </span>
        )}
      </div>

      <p className="visually-hidden" aria-live="polite">{sceneLabel}</p>

      {availableWidth < 260 && (
        <p className="graph-narrow-hint">
          This panel is narrow — drag the sidebar wider, or turn on Compact density, for a clearer map.
        </p>
      )}

      <div className="graph-canvas-wrapper" ref={wrapperRef}>
        <div
          className="graph-canvas"
          style={{ width: canvasWidth, height: canvasHeight }}
          role="group"
          aria-roledescription="mind map"
          aria-label={center ? `Document structure graph, centered on ${center.text}` : 'Document structure graph, top level'}
        >
        <svg className="graph-lines" aria-hidden="true" width={canvasWidth} height={canvasHeight}>
          {positions.map(({ node, x, y }) => {
            const line = shrinkLine(cx, cy, cx + x, cy + y, CENTER_PULLBACK, CHILD_PULLBACK)
            return (
              <line
                key={nodeKey(node)}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                className={`graph-line${node.page === currentPage ? ' current' : ''}${node._generated ? ' ai-generated' : ''}`}
              />
            )
          })}
        </svg>

        {center ? (
          <button
            type="button"
            ref={centerRef}
            className={`graph-bubble graph-center${center.page === currentPage ? ' current' : ''}${center._generated ? ' ai-generated' : ''}`}
            style={{ left: cx, top: cy }}
            onClick={goBack}
            title={`Go back up from "${center.text}"`}
            aria-label={`Go back up a level, currently centered on ${center.text}${center._generated ? ' (AI-generated key point)' : ''}`}
          >
            <span className="graph-label">{center.text}</span>
          </button>
        ) : (
          <div
            className="graph-bubble graph-center graph-center-empty"
            style={{ left: cx, top: cy }}
            aria-hidden="true"
          >
            <span className="graph-label">Document</span>
          </div>
        )}

        {isEmptyKeyPoints && (
          <p className="graph-empty-note" style={{ left: cx, top: cy + 110 }}>
            No key points found for this section.
          </p>
        )}

        {positions.map(({ node, x, y }, i) => {
          const key = nodeKey(node)
          const hasChildren = node.children && node.children.length > 0
          const isLoading = loadingKey === key
          const revisits = visitCounts?.[node.page] || 0
          const isHot = !node._generated && revisits >= REVISIT_HEAT_THRESHOLD
          const title = node._generated
            ? `"${node.quote}" — click to see this exact quote on page ${node.page}`
            : hasChildren
              ? `Zoom into "${node.text}"`
              : `Go to page ${node.page} and find key points in "${node.text}"`
          const a11yName = node._generated
            ? `${node.text}. AI-generated key point, page ${node.page}. Activate to view its source quote.`
            : hasChildren
              ? `${node.text}, page ${node.page}. Has ${node.children.length} sub-item${node.children.length === 1 ? '' : 's'}. Activate to zoom in.${isHot ? ` Revisited ${revisits} times — possible sticking point.` : ''}`
              : `${node.text}, page ${node.page}. Activate to go to this page and find key points.${isHot ? ` Revisited ${revisits} times — possible sticking point.` : ''}`

          return (
            <button
              key={key}
              ref={(el) => { ringRefs.current[i] = el }}
              type="button"
              className={`graph-bubble graph-child${node.page === currentPage ? ' current' : ''}${
                hasChildren ? ' has-children' : ' leaf'
              }${node._generated ? ' ai-generated' : ''}${isLoading ? ' loading' : ''}${isHot ? ' hot' : ''}`}
              style={{ left: cx + x, top: cy + y }}
              onClick={() => selectNode(node)}
              onKeyDown={(e) => handleRingKeyDown(e, i)}
              disabled={isLoading}
              title={isHot ? `${title} — revisited ${revisits} times` : title}
              aria-label={isLoading ? `Finding key points in ${node.text}…` : a11yName}
            >
              {node._generated && <span className="graph-sparkle" aria-hidden="true">✦</span>}
              {isHot && <span className="graph-heat" aria-hidden="true" title={`Revisited ${revisits} times`}>●</span>}
              <span className="graph-label">{isLoading ? 'Finding key points…' : node.text}</span>
              {!isLoading && <span className="graph-page" aria-hidden="true">p.{node.page}</span>}
            </button>
          )
        })}
        </div>
      </div>
    </div>
  )
}
