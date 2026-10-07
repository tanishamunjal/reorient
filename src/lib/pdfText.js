// PDF rendering + text/heading extraction helpers, split out of App.jsx so
// they can be reasoned about (and re-run for zoom changes) independently.

export function isLikelyHeading(text, size, bodySize, allBold) {
  const trimmed = text.trim()
  // Merged multi-line headings (see mergeHeadingBlocks) can legitimately run
  // longer than a single-line heading, so these bounds are generous.
  if (trimmed.length < 3 || trimmed.length > 140) return false
  if (/[.!?]$/.test(trimmed)) return false
  if (trimmed.split(/\s+/).length > 18) return false
  if (/^[•\-*]/.test(trimmed)) return false
  // A stray mid-sentence fragment (e.g. a bolded phrase inside a reference
  // citation) reads like body text, not a heading — real headings start with
  // a capital letter or a number ("3.1. Liposomes", "Abstract"), never
  // lowercase or a stray symbol.
  if (!/^[A-Z0-9]/.test(trimmed)) return false
  return size > Number(bodySize) || allBold
}

// Boilerplate that shows up styled like a heading (often bold/large on a
// journal's cover page or in its standardized front/back matter) but is
// never actually a content section a reader would want to navigate to:
// ISSN lines, journal homepage banners, DOIs, copyright notices, bare URLs,
// and the standardized administrative labels ("Article History", "ORCID",
// "Declaration of interest"...) that appear near-verbatim across nearly
// every journal article regardless of subject.
const NOISE_PATTERNS = [
  /issn/i,
  /journal homepage/i,
  /doi\.org/i,
  /^https?:\/\//i,
  /www\.\S+\.\S+/i,
  /^\S+@\S+\.\S+$/,
  /^©/,
  /all rights reserved/i,
  /^article\s*history$/i,
  /^keywords?$/i,
  /^orcid(\s*ids?)?$/i,
  /^declaration of interest(s)?$/i,
  /^disclosure statement$/i,
  /^reviewer disclosures?$/i,
  /^conflicts? of interest$/i,
  /^funding$/i,
  /^acknowledge?ments?$/i,
  /^data availability( statement)?$/i,
  /^supplementary (material|information)$/i,
]

export function isNoise(text) {
  return NOISE_PATTERNS.some((p) => p.test(text))
}

// A footnote/affiliation marker glued onto a name (directly, "Khot¹", or
// with a space before it as some journals typeset it, "Khot *") isn't part
// of the name — strip it before judging whether a word looks like part of a
// person's name, otherwise the marker alone (matching neither a letter-only
// name nor being ignorable) wrongly disqualifies that whole segment.
function stripFootnoteMarker(word) {
  return word.replace(/[*†‡§¹²³⁴⁵⁶⁷⁸⁹⁰]+$/g, '').replace(/\d+$/g, '')
}

// Author bylines ("Sidra Khot, Anandha Krishnaveni, ... & Abdelwahab Omri")
// are usually styled exactly like a heading (bold, page-1 title-adjacent) so
// they pass every other check. They have a distinct shape though: several
// comma/"&"/"and"-separated segments that are each a short name (allowing
// for footnote markers and accented letters), and they only ever appear on
// a paper's opening page(s).
export function looksLikeAuthorList(text, page) {
  if (page > 3) return false
  const segments = text
    .split(/,| & | and /i)
    .map((s) => s.trim())
    .filter(Boolean)
  if (segments.length < 3) return false
  const nameLike = segments.filter((seg) => {
    const words = seg
      .split(/\s+/)
      .map(stripFootnoteMarker)
      .filter(Boolean)
    if (words.length < 2 || words.length > 3) return false
    return words.every((w) => /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'-]*$/.test(w) && /^\p{Lu}/u.test(w))
  })
  return nameLike.length === segments.length
}

const MAX_LINE_GAP_FACTOR = 1.8

function isStyledLine(line, bodySize) {
  return line.text.length > 0 && (line.size > Number(bodySize) || line.allBold)
}

// A heading that wraps onto 2-3 lines (a long paper title, an author byline)
// otherwise gets extracted as separate, meaningless fragments — one per
// line — since line-grouping is deliberately per-visual-line. This walks the
// document in reading order and glues together consecutive same-style lines
// that are close enough vertically to be one wrapped heading rather than two
// unrelated ones.
export function mergeHeadingBlocks(orderedLines, bodySize) {
  const blocks = []
  let current = null
  orderedLines.forEach((line) => {
    if (!isStyledLine(line, bodySize)) {
      current = null
      return
    }
    const continuesBlock =
      current &&
      current.page === line.page &&
      current.column === line.column &&
      current.size === line.size &&
      current.allBold === line.allBold &&
      Math.abs(current.lastY - line.y) <= line.size * MAX_LINE_GAP_FACTOR
    if (continuesBlock) {
      current.text += ' ' + line.text
      current.lastY = line.y
    } else {
      current = { text: line.text, size: line.size, allBold: line.allBold, page: line.page, column: line.column, lastY: line.y }
      blocks.push(current)
    }
  })
  return blocks
}

const normalizeHeadingText = (s) =>
  s
    .toLowerCase()
    .replace(/[*†‡§]/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

// A real section heading appears exactly once, at the top of its section. Text
// that's heading-shaped (bold/large) but shows up on 3+ different pages is
// something else wearing a heading's clothes — a running header repeating a
// chapter name on every page, a page-top author credit, a journal banner.
// Genuine one-off duplicates (a title reprinted once as a running header a
// few pages later) are handled separately below by keeping just the first
// occurrence; this catches the "printed on nearly every page" case those
// wouldn't, and drops it entirely rather than keeping even one copy, since a
// three-times-repeated fragment is never really "a section" of the document.
const RUNNING_HEADER_PAGE_THRESHOLD = 3

function dropRunningHeaders(candidates) {
  const pagesByNorm = new Map()
  candidates.forEach((c) => {
    const norm = normalizeHeadingText(c.text)
    if (!pagesByNorm.has(norm)) pagesByNorm.set(norm, new Set())
    pagesByNorm.get(norm).add(c.page)
  })
  return candidates.filter((c) => pagesByNorm.get(normalizeHeadingText(c.text)).size < RUNNING_HEADER_PAGE_THRESHOLD)
}

export function extractHeadings(orderedLines, bodySize) {
  const candidates = []
  mergeHeadingBlocks(orderedLines, bodySize).forEach((block) => {
    const trimmed = block.text.trim().replace(/\s+/g, ' ')
    if (!isLikelyHeading(trimmed, block.size, bodySize, block.allBold)) return
    if (isNoise(trimmed)) return
    if (looksLikeAuthorList(trimmed, block.page)) return
    candidates.push({ text: trimmed, size: block.size, page: block.page, allBold: block.allBold })
  })

  const withoutRunningHeaders = dropRunningHeaders(candidates)

  // Drop the remaining repeats: a title/byline that reappears verbatim (or
  // near-verbatim, e.g. as a shortened running header seen only once or
  // twice, or the same author list with added footnote-marker asterisks) is
  // not a new section — keep only wherever it first appeared.
  const kept = []
  withoutRunningHeaders.forEach((h) => {
    const norm = normalizeHeadingText(h.text)
    const isDupe = kept.some((k) => {
      const kNorm = normalizeHeadingText(k.text)
      if (kNorm === norm) return true
      if (norm.length < 20 || kNorm.length < 20) return false
      return kNorm.includes(norm) || norm.includes(kNorm)
    })
    if (!isDupe) kept.push(h)
  })

  return kept.sort((a, b) => a.page - b.page)
}

// Builds the section hierarchy directly from each heading's real font size,
// instead of asking the AI to guess it from the text alone. Two headings the
// PDF itself rendered at the same size are the same outline level (siblings);
// a smaller heading nests under the nearest earlier heading rendered larger
// than it. This is the same algorithm a Markdown outline (#, ##, ###) or a
// table-of-contents builder uses, just driven by measured size instead of a
// typed-in level — and it means the tree can never nest an unrelated heading
// under another one just because an AI guessed a plausible-sounding grouping.
export function buildHeadingTree(headings) {
  const root = []
  const stack = [] // entries: { size, node }, largest-size ancestor at the bottom
  headings.forEach((h) => {
    const node = { text: h.text, page: h.page, children: [], dependsOn: [] }
    while (stack.length && stack[stack.length - 1].size <= h.size) stack.pop()
    if (stack.length === 0) root.push(node)
    else stack[stack.length - 1].node.children.push(node)
    stack.push({ size: h.size, node })
  })
  return root
}

// item.fontName from pdf.js's getTextContent() is only an internal object id
// (e.g. "g_d0_f1"), not the real font name, so it never contains "bold". The
// actual embedded font (with its real PostScript name, which does encode
// weight, e.g. "Arial-BoldMT") is only resolvable via page.commonObjs, and
// only after the page has been rendered at least once.
function makeBoldResolver(page) {
  const cache = {}
  return (fontId) => {
    if (fontId in cache) return cache[fontId]
    let bold = false
    try {
      const fontObj = page.commonObjs.get(fontId)
      bold = /bold|black|heavy/i.test(fontObj?.name || '')
    } catch {
      bold = false
    }
    cache[fontId] = bold
    return bold
  }
}

// Renders every page of `pdf` into freshly created page wrapper elements
// (canvas + selectable text layer) appended to `container`. When
// `withExtraction` is true, also returns heading candidates and per-page
// plain text; otherwise resolves with { headings: [], pageTexts: [] } to
// keep the return shape uniform for callers that only care about rendering
// (e.g. re-rendering at a new zoom level).
export async function renderPages(pdf, container, pageRefs, scale, withExtraction) {
  const { TextLayer } = await import('pdfjs-dist')

  const sizeCounts = {}
  const allItems = []
  const pageWidths = {}
  container.innerHTML = ''
  pageRefs.current = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    pageWidths[i] = viewport.width / scale

    const wrapper = document.createElement('div')
    wrapper.className = 'pdf-page'
    wrapper.dataset.page = i
    wrapper.style.width = `${viewport.width}px`
    wrapper.style.height = `${viewport.height}px`

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.dataset.page = i
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise

    wrapper.appendChild(canvas)
    container.appendChild(wrapper)
    pageRefs.current.push(wrapper)

    const content = await page.getTextContent()

    const textLayerDiv = document.createElement('div')
    textLayerDiv.className = 'textLayer'
    wrapper.appendChild(textLayerDiv)
    try {
      const textLayer = new TextLayer({ textContentSource: content, container: textLayerDiv, viewport })
      await textLayer.render()
    } catch {
      // Non-fatal: page just won't be selectable/screen-readable.
    }

    if (withExtraction) {
      const isFontBold = makeBoldResolver(page)
      content.items.forEach((item) => {
        const size = Math.round(item.transform[0])
        const y = Math.round(item.transform[5] / 3) * 3
        const x = item.transform[4]
        const isBold = isFontBold(item.fontName)
        sizeCounts[size] = (sizeCounts[size] || 0) + 1
        allItems.push({ text: item.str, size, y, x, page: i, isBold })
      })
    }
  }

  if (!withExtraction) return { headings: [], pageTexts: [] }

  const bodySize = Object.entries(sizeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0

  // Many academic/journal PDFs are laid out in two columns. Grouping purely by
  // (page, size, y) assumes a "row" is always one contiguous line, but if a
  // left-column row and a right-column row land at the same height, they get
  // concatenated into gibberish, and reading the whole page by y alone
  // interleaves the two columns instead of reading one fully before the next.
  //
  // Fix: within each same-row group, split off a new line wherever there's a
  // large horizontal gap (the column gutter) rather than normal word-spacing.
  // Only THEN classify each resulting line into a column — never per-glyph,
  // which would slice a full-width title in half wherever it crosses the
  // page's midpoint.
  const rowMap = {}
  allItems.forEach((item) => {
    const key = `${item.page}-${item.size}-${item.y}`
    if (!rowMap[key]) rowMap[key] = []
    rowMap[key].push(item)
  })

  const columnFor = (page, x) => (x < (pageWidths[page] ?? Infinity) / 2 ? 0 : 1)

  const orderedLines = []
  Object.values(rowMap).forEach((items) => {
    items.sort((a, b) => a.x - b.x)
    const pageWidth = pageWidths[items[0].page] ?? 600
    const gapThreshold = Math.max(24, pageWidth * 0.06)

    let run = [items[0]]
    const flushRun = () => {
      const first = run[0]
      orderedLines.push({
        text: run.map((i) => i.text).join(' ').trim(),
        size: first.size,
        y: first.y,
        page: first.page,
        column: columnFor(first.page, first.x),
        allBold: run.every((i) => i.isBold),
      })
    }
    for (let idx = 1; idx < items.length; idx++) {
      const prev = items[idx - 1]
      const gap = items[idx].x - (prev.x + (prev.text?.length || 1) * prev.size * 0.5)
      if (gap > gapThreshold) {
        flushRun()
        run = [items[idx]]
      } else {
        run.push(items[idx])
      }
    }
    flushRun()
  })

  // Reading order: page, then column (left before right), then top-to-bottom
  // within that column (PDF y grows upward, hence the descending sort).
  // Heading-merging and per-page text assembly both depend on this order.
  orderedLines.sort((a, b) => a.page - b.page || a.column - b.column || b.y - a.y)

  const headings = extractHeadings(orderedLines, bodySize)

  const pageTexts = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const pageLines = orderedLines.filter((l) => l.page === i && l.text)
    pageTexts.push({ page: i, text: pageLines.map((l) => l.text).join('\n') })
  }

  return { headings, pageTexts }
}
