// Per-document persistence. Everything is scoped under a docId derived from
// the file's name + size, so anchors/preferences don't leak between documents.
// There is no backend, so localStorage is the only durable store available.

export function makeDocId(file) {
  return `${file.name}::${file.size}`
}

const ANCHORS_PREFIX = 'reorient:anchors:'
const CUSTOM_VOCAB_PREFIX = 'reorient:vocab:'
const LAST_POSITION_PREFIX = 'reorient:lastpos:'
export const PREFS_KEY = 'reorient:prefs'

export function loadAnchors(docId) {
  try {
    const raw = localStorage.getItem(ANCHORS_PREFIX + docId)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveAnchors(docId, anchors) {
  try {
    localStorage.setItem(ANCHORS_PREFIX + docId, JSON.stringify(anchors))
  } catch {
    // localStorage can throw if full/unavailable (private browsing); anchors
    // simply won't persist across reloads in that case.
  }
}

// Vocabulary terms the reader picked out and asked to have defined, as
// opposed to the auto-generated glossary — kept separately so it survives a
// "Rebuild map" (which regenerates the auto glossary from scratch).
export function loadCustomVocab(docId) {
  try {
    const raw = localStorage.getItem(CUSTOM_VOCAB_PREFIX + docId)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCustomVocab(docId, vocab) {
  try {
    localStorage.setItem(CUSTOM_VOCAB_PREFIX + docId, JSON.stringify(vocab))
  } catch {
    // ignore
  }
}

// Where a reader left off in a document, in the reading-order sense the
// mind map already knows (a page number plus the breadcrumb text for it) —
// powers the "welcome back" card shown when the same document is reopened.
export function loadLastPosition(docId) {
  try {
    const raw = localStorage.getItem(LAST_POSITION_PREFIX + docId)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveLastPosition(docId, position) {
  try {
    localStorage.setItem(LAST_POSITION_PREFIX + docId, JSON.stringify(position))
  } catch {
    // ignore
  }
}

const DEFAULT_PREFS = {
  reducedMotion: false,
  density: 'comfortable', // 'comfortable' | 'compact'
  textScale: 1,
  sidebarWidth: 320,
  theme: 'system', // 'system' | 'light' | 'dark'
  brightness: 100, // % filter applied to the document pane, 60-140
}

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}
