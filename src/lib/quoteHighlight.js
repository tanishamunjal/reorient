function collapseWhitespace(str) {
  return str.replace(/\s+/g, ' ')
}

// Below this length, a match is too generic to trust blindly (a stray number,
// a one-word fragment) — if it turns out to be ambiguous on the page we'd
// rather not guess.
const AMBIGUOUS_LENGTH_THRESHOLD = 25

// Finds `quote` within a page's real text-layer spans and highlights the
// matching span(s) in place, scrolling to them. This only ever highlights
// text that's actually in the DOM (the same selectable layer used for Memory
// Anchors) — it never draws a highlight that isn't backed by real page text.
//
// If the quote is short AND appears more than once on the page (a heading
// word that's also a running header, or that recurs in body text), picking
// the first hit blindly can land on the wrong occurrence — worse than not
// highlighting at all. In that case this bails out (returns false) so the
// caller falls back to a plain page-level jump instead of a misleading
// highlight.
export function highlightQuoteOnPage(pageWrapperEl, quote, reducedMotion) {
  if (!pageWrapperEl || !quote) return false
  const textLayer = pageWrapperEl.querySelector('.textLayer')
  if (!textLayer) return false

  const spans = Array.from(textLayer.querySelectorAll('span'))
  spans.forEach((s) => s.classList.remove('quote-highlight'))

  const cleanQuote = collapseWhitespace(quote).trim()
  if (!cleanQuote) return false

  let concatenated = ''
  const ranges = []
  spans.forEach((span) => {
    const text = collapseWhitespace(span.textContent || '')
    const start = concatenated.length
    concatenated += text + ' '
    ranges.push({ span, start, end: start + text.length })
  })

  const escaped = cleanQuote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = Array.from(concatenated.matchAll(new RegExp(escaped, 'gi')))
  if (matches.length === 0) return false
  if (matches.length > 1 && cleanQuote.length < AMBIGUOUS_LENGTH_THRESHOLD) return false

  const match = matches[0]
  const matchStart = match.index
  const matchEnd = matchStart + match[0].length
  const matchedSpans = ranges.filter((r) => r.end > matchStart && r.start < matchEnd).map((r) => r.span)
  if (matchedSpans.length === 0) return false

  matchedSpans.forEach((s) => s.classList.add('quote-highlight'))
  matchedSpans[0].scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
  return true
}
