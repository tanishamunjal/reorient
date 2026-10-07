import { useMemo, useRef, useState } from 'react'
import { REVISIT_HEAT_THRESHOLD, pathToPage } from '../lib/treeUtils'

function nodeKey(node, path) {
  return `${path}-${node.page}-${node.text}`
}

// Flattens the tree into visible rows (respecting collapsed state) in
// document order, for both rendering and keyboard navigation.
function flatten(nodes, depth, path, collapsed, out) {
  nodes.forEach((node, i) => {
    const key = nodeKey(node, `${path}-${i}`)
    const hasChildren = node.children && node.children.length > 0
    out.push({ node, depth, key, hasChildren })
    if (hasChildren && !collapsed.has(key)) {
      flatten(node.children, depth + 1, key, collapsed, out)
    }
  })
}

export default function MindMapTree({ tree, currentPage, onJumpToNode, onExpandNode, onJumpToQuote, density, visitCounts }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [focusedKey, setFocusedKey] = useState(null)
  const [expandedKP, setExpandedKP] = useState(() => new Set())
  const [keyPoints, setKeyPoints] = useState(() => new Map())
  const [focusMode, setFocusMode] = useState(false)
  const containerRef = useRef(null)

  const allRows = useMemo(() => {
    const out = []
    flatten(tree, 0, 'root', collapsed, out)
    return out
  }, [tree, collapsed])

  // Focus Lens: instead of the whole tree, show only the current section's
  // ancestors (so you still know where you are), the section itself, and
  // its immediate children — everything else hidden rather than just
  // visually de-emphasized, so a reader who's already overwhelmed by a big
  // document doesn't have a big tree to scan past. Follows currentPage
  // automatically as the reader scrolls, no manual drilling required.
  const visibleNodeSet = useMemo(() => {
    if (!focusMode) return null
    const path = pathToPage(tree, currentPage)
    if (path.length === 0) return null
    const current = path[path.length - 1]
    const set = new Set(path)
    ;(current.children || []).forEach((c) => set.add(c))
    return set
  }, [focusMode, tree, currentPage])

  const rows = useMemo(
    () => (visibleNodeSet ? allRows.filter((r) => visibleNodeSet.has(r.node)) : allRows),
    [allRows, visibleNodeSet]
  )

  const activeKey = focusedKey && rows.some((r) => r.key === focusedKey)
    ? focusedKey
    : rows.find((r) => r.node.page === currentPage)?.key ?? rows[0]?.key

  function toggle(key) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function fetchKeyPointsIfNeeded(row) {
    if (keyPoints.has(row.key)) return
    setKeyPoints((prev) => new Map(prev).set(row.key, { status: 'loading', points: [] }))
    try {
      const points = await onExpandNode(row.node)
      setKeyPoints((prev) => new Map(prev).set(row.key, { status: 'loaded', points: points || [] }))
    } catch (err) {
      console.error(err)
      setKeyPoints((prev) => new Map(prev).set(row.key, { status: 'error', points: [] }))
    }
  }

  function openKeyPoints(row) {
    if (expandedKP.has(row.key)) return
    setExpandedKP((prev) => new Set(prev).add(row.key))
    fetchKeyPointsIfNeeded(row)
  }

  // Clicking a heading both navigates to it AND surfaces its key-point
  // bullets right there in the tree, so a reader doesn't have to separately
  // discover the ✦ toggle to see what a section is actually about.
  function activate(row) {
    onJumpToNode(row.node)
    if (row.hasChildren) toggle(row.key)
    openKeyPoints(row)
  }

  function toggleKeyPoints(row, e) {
    e.stopPropagation()
    if (expandedKP.has(row.key)) {
      setExpandedKP((prev) => {
        const next = new Set(prev)
        next.delete(row.key)
        return next
      })
      return
    }
    openKeyPoints(row)
  }

  function focusRowByIndex(idx) {
    if (idx < 0 || idx >= rows.length) return
    const key = rows[idx].key
    setFocusedKey(key)
    requestAnimationFrame(() => {
      containerRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus()
    })
  }

  function handleKeyDown(e, row, idx) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        focusRowByIndex(idx + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        focusRowByIndex(idx - 1)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (row.hasChildren && collapsed.has(row.key)) toggle(row.key)
        else focusRowByIndex(idx + 1)
        break
      case 'ArrowLeft':
        e.preventDefault()
        if (row.hasChildren && !collapsed.has(row.key)) toggle(row.key)
        else {
          const parentIdx = rows.findIndex((r, i) => i < idx && r.depth === row.depth - 1)
          if (parentIdx !== -1) focusRowByIndex(parentIdx)
        }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        activate(row)
        break
      default:
        break
    }
  }

  if (allRows.length === 0) return null

  return (
    <div className="tree-outer">
      <div className="tree-toolbar">
        <button
          type="button"
          className="tree-focus-toggle"
          aria-pressed={focusMode}
          title="Show only the current section, its parents, and its children"
          onClick={() => setFocusMode((v) => !v)}
        >
          {focusMode ? '◎ Focus: on' : '◎ Focus current section'}
        </button>
      </div>
      <div
        ref={containerRef}
        role="tree"
        aria-label="Document structure map"
        className={`mind-map-tree density-${density}`}
      >
        {rows.map((row, idx) => {
        const childCount = row.hasChildren ? row.node.children.length : 0
        const revisits = visitCounts?.[row.node.page] || 0
        const isHot = revisits >= REVISIT_HEAT_THRESHOLD
        const label = `${row.node.text}, page ${row.node.page}${
          row.hasChildren
            ? `, ${childCount} sub-item${childCount === 1 ? '' : 's'}, ${collapsed.has(row.key) ? 'collapsed' : 'expanded'}`
            : ''
        }${isHot ? `, revisited ${revisits} times — possible sticking point` : ''}`
        const kpOpen = expandedKP.has(row.key)
        const kpState = keyPoints.get(row.key)
        return (
          <div key={row.key}>
            <div
              role="treeitem"
              data-key={row.key}
              aria-level={row.depth + 1}
              aria-expanded={row.hasChildren ? !collapsed.has(row.key) : undefined}
              aria-current={row.node.page === currentPage ? 'location' : undefined}
              aria-label={label}
              tabIndex={row.key === activeKey ? 0 : -1}
              className={`tree-node${row.node.page === currentPage ? ' current' : ''}`}
              style={{ '--depth': row.depth }}
              onClick={() => activate(row)}
              onFocus={() => setFocusedKey(row.key)}
              onKeyDown={(e) => handleKeyDown(e, row, idx)}
            >
              {row.hasChildren && (
                <span className="tree-toggle" aria-hidden="true">
                  {collapsed.has(row.key) ? '▸' : '▾'}
                </span>
              )}
              {isHot && (
                <span className="tree-heat" aria-hidden="true" title={`Revisited ${revisits} times — you may be stuck here`}>
                  ●
                </span>
              )}
              <span className="tree-label" aria-hidden="true">{row.node.text}</span>
              <span className="tree-page" aria-hidden="true">p.{row.node.page}</span>
              <button
                type="button"
                className="tree-kp-toggle"
                aria-expanded={kpOpen}
                aria-label={`${kpOpen ? 'Hide' : 'Show'} key points for ${row.node.text}`}
                title={`${kpOpen ? 'Hide' : 'Show'} key points`}
                onClick={(e) => toggleKeyPoints(row, e)}
              >
                <span aria-hidden="true">✦</span>
              </button>
            </div>

            {kpOpen && (
              <div className="tree-keypoints" style={{ '--depth': row.depth }}>
                {(!kpState || kpState.status === 'loading') && (
                  <p className="tree-keypoints-status">Finding key points…</p>
                )}
                {kpState?.status === 'error' && (
                  <p className="tree-keypoints-status">Couldn't find key points for this section.</p>
                )}
                {kpState?.status === 'loaded' && kpState.points.length === 0 && (
                  <p className="tree-keypoints-status">No key points found for this section.</p>
                )}
                {kpState?.status === 'loaded' && kpState.points.length > 0 && (
                  <ul>
                    {kpState.points.map((p, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => onJumpToQuote(row.node.page, p.quote)}
                          title={`"${p.quote}" — click to see this on page ${row.node.page}`}
                        >
                          {p.point}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )
        })}
      </div>
    </div>
  )
}
