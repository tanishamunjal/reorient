// Shared with App.jsx's Confusion Detection threshold: a page has to be
// genuinely revisited this many times (not just glanced at twice) before
// either system treats it as a likely sticking point.
export const REVISIT_HEAT_THRESHOLD = 3

export function flattenTree(tree) {
  const out = []
  const walk = (nodes) => {
    nodes.forEach((n) => {
      out.push(n)
      if (n.children?.length) walk(n.children)
    })
  }
  walk(tree || [])
  return out
}

// Best-effort label for an arbitrary page: the node whose page matches
// exactly, or failing that the closest preceding node (the section the page
// falls within), or a bare "Page N" fallback.
export function labelForPage(flatNodes, page) {
  const exact = flatNodes.find((n) => n.page === page)
  if (exact) return exact.text
  const preceding = flatNodes
    .filter((n) => n.page <= page)
    .sort((a, b) => b.page - a.page)[0]
  return preceding ? preceding.text : `Page ${page}`
}

function flattenWithParent(tree, parent = null, out = []) {
  tree.forEach((n) => {
    out.push({ node: n, parent })
    if (n.children?.length) flattenWithParent(n.children, n, out)
  })
  return out
}

// The full ancestor chain (root-first, ending with the node itself) for
// whichever node "owns" a given page — same best-match rule as labelForPage
// (exact page match, else the closest preceding node), but returning the
// whole path up the tree instead of just that one node's label. This is what
// powers the orientation breadcrumb: "Results › Neural Activity › Treatment
// Group" instead of just "Treatment Group".
export function pathToPage(tree, page) {
  const flat = flattenWithParent(tree || [])
  if (flat.length === 0) return []
  const entry =
    flat.find((f) => f.node.page === page) ||
    flat.filter((f) => f.node.page <= page).sort((a, b) => b.node.page - a.node.page)[0]
  if (!entry) return []

  const byNode = new Map(flat.map((f) => [f.node, f]))
  const path = []
  let cur = entry
  while (cur) {
    path.unshift(cur.node)
    cur = cur.parent ? byNode.get(cur.parent) : null
  }
  return path
}

// Walks a node's dependsOn chain backward to build the "why am I here"
// argument path: root-cause first, ending with the node itself. Each node
// can depend on several earlier ones (see the AI prompts in lib/ai.js), so
// this follows only the primary (first-listed) dependency at each step —
// the same simplification checkConfusion already makes — rather than trying
// to render a full dependency graph as a linear path.
export function buildDependencyChain(tree, node, maxLen = 6) {
  if (!node) return []
  const flat = flattenTree(tree)
  const byText = new Map(flat.map((n) => [n.text, n]))
  const chain = [node]
  const seen = new Set([node.text])
  let cur = node
  while (cur.dependsOn?.length && chain.length < maxLen) {
    const depNode = byText.get(cur.dependsOn[0])
    if (!depNode || seen.has(depNode.text)) break
    chain.unshift(depNode)
    seen.add(depNode.text)
    cur = depNode
  }
  return chain
}
