const STOPWORDS = new Set([
  'about', 'after', 'again', 'their', 'there', 'these', 'those', 'where',
  'while', 'because', 'through', 'between', 'under', 'before', 'other',
  'using', 'based', 'should', 'would', 'could', 'which', 'being', 'having',
])

function significantWords(str) {
  const words = str.toLowerCase().match(/[a-z]{6,}/g) || []
  return Array.from(new Set(words)).filter((w) => !STOPWORDS.has(w))
}

// Heuristic "does this concept reappear" check used to resurface Memory
// Anchors: either a near-verbatim phrase match, or shared distinctive
// (long, non-stopword) vocabulary between the anchored text and the page.
export function conceptReappears(anchorText, pageText) {
  const needle = anchorText.trim().toLowerCase()
  const haystack = pageText.toLowerCase()
  if (needle.length >= 12 && haystack.includes(needle.slice(0, 40))) return true
  const words = significantWords(anchorText)
  if (words.length === 0) return false
  const hayWords = new Set(significantWords(pageText))
  return words.some((w) => hayWords.has(w))
}
