// Single Claude call that builds the navigable structure (either a literal
// table of contents from real headings, or an AI-invented topic grouping
// when the document has none) plus a vocabulary glossary, in one round trip.

const MAX_PAGE_TEXT_CHARS = 35000
const MAX_KEY_POINT_SOURCE_CHARS = 6000

function buildPageTextBlock(pageTexts) {
  let combined = ''
  let truncated = false
  for (const { page, text } of pageTexts) {
    if (!text.trim()) continue
    const chunk = `[Page ${page}]\n${text}\n\n`
    if (combined.length + chunk.length > MAX_PAGE_TEXT_CHARS) {
      truncated = true
      break
    }
    combined += chunk
  }
  return { combined, truncated }
}

// Only used when the document has no typographically distinct headings at
// all — real headings never go through this prompt, see buildHeadingTree in
// pdfText.js and annotateHeadingTree below for that path instead.
function buildGeneratedTreePrompt(pageTexts) {
  const { combined: pageTextBlock, truncated } = buildPageTextBlock(pageTexts)

  return `You are helping build a navigable structural map of a document for a reading tool that keeps readers spatially oriented in dense text.

Document text by page${truncated ? ' (truncated to the first portion of the document)' : ''}:

${pageTextBlock || '(no extractable body text)'}

TASKS:

1. Build a hierarchical "tree" of the document. This document has no typographically distinct headings, so invent clear, concise category labels (your own words, not verbatim quotes) that group the content by theme or topic. Major themes as top-level nodes, related subtopics nested underneath. Use the page number where each topic is primarily discussed.
For each node, also include a "dependsOn" array listing the EXACT text of any earlier node(s) in this same tree that this section conceptually depends on or builds on (e.g. it uses a term, result, or idea introduced earlier). Leave it an empty array if there's no clear dependency. Never reference a node that appears later in the document than this one.

2. Build a short "vocabulary" glossary: identify up to 12 terms or phrases in the document a reader might find difficult or unfamiliar (jargon, technical terms, uncommon words). For each, give a plain-language one-sentence definition in the context of this document, and the page number where it first appears. If the document has no such terms, return an empty array.

Return ONLY valid JSON, no explanation, no markdown fences, in this exact shape:
{"tree": [{"text": string, "page": number, "dependsOn": string[], "children": [...same shape, can be empty array]}], "vocabulary": [{"term": string, "definition": string, "page": number}]}`
}

async function callClaude(prompt, apiKey, maxTokens) {
  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || `Request failed with status ${response.status}`)
  }
  const rawText = data.content[0].text
  const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch (parseErr) {
    console.error('Raw response that failed to parse:', cleaned)
    throw parseErr
  }
}

// Used only when the document has no real headings — the AI invents both the
// grouping and the labels, so the result is always shown to the reader as
// AI-generated (see mindMapSource === 'generated' in App.jsx).
export async function buildDocumentStructure({ pageTexts, apiKey }) {
  const prompt = buildGeneratedTreePrompt(pageTexts)
  const parsed = await callClaude(prompt, apiKey, 16000)

  return {
    tree: Array.isArray(parsed.tree) ? parsed.tree : [],
    vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary : [],
  }
}

function flattenNodeRefs(tree, depth = 0, out = []) {
  tree.forEach((node) => {
    out.push({ node, depth })
    if (node.children?.length) flattenNodeRefs(node.children, depth + 1, out)
  })
  return out
}

// Used when the document DOES have real headings: the tree itself is already
// built deterministically from heading font sizes (buildHeadingTree in
// pdfText.js), so the AI is never asked to invent or reorganize structure
// here — only to annotate it with two things that genuinely require reading
// comprehension: cross-references between sections, and a vocabulary
// glossary. Nodes are mutated in place (dependsOn is filled in on the same
// node objects passed in) so the caller's tree reference stays valid.
export async function annotateHeadingTree({ tree, pageTexts, apiKey }) {
  const flat = flattenNodeRefs(tree)
  if (flat.length === 0) return { vocabulary: [] }

  const outline = flat
    .map(({ node, depth }, i) => `${i}. [Page ${node.page}]${'  '.repeat(depth)} ${node.text}`)
    .join('\n')
  const { combined: pageTextBlock, truncated } = buildPageTextBlock(pageTexts)

  const prompt = `You are helping annotate a navigable structural map of a document for a reading tool that keeps readers spatially oriented in dense text.

This outline was already built directly from the document's real headings (indentation shows hierarchy, numbers are node indices):
${outline}

Document text by page${truncated ? ' (truncated to the first portion of the document)' : ''}:

${pageTextBlock || '(no extractable body text)'}

TASKS:

1. For each numbered node above, decide which EARLIER node(s) (strictly smaller index) it conceptually depends on or builds on — e.g. it uses a term, result, or idea introduced there. Only include a dependency when it's clear and meaningful; most nodes should have none. Never reference an index equal to or greater than the node's own index.

2. Build a short "vocabulary" glossary: up to 12 terms or phrases in the document a reader might find difficult or unfamiliar, each with a plain-language one-sentence definition in context, and the page number where it first appears. Empty array if there are none.

Return ONLY valid JSON, no explanation, no markdown fences, in this exact shape:
{"dependsOn": {"<node index>": [earlier node indices]}, "vocabulary": [{"term": string, "definition": string, "page": number}]}`

  const parsed = await callClaude(prompt, apiKey, 8000)
  const dependsOnMap = parsed?.dependsOn && typeof parsed.dependsOn === 'object' ? parsed.dependsOn : {}

  flat.forEach(({ node }, i) => {
    const rawDeps = dependsOnMap[i] ?? dependsOnMap[String(i)]
    const validIndices = Array.isArray(rawDeps)
      ? rawDeps.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < i)
      : []
    node.dependsOn = validIndices.map((idx) => flat[idx].node.text)
  })

  return { vocabulary: Array.isArray(parsed?.vocabulary) ? parsed.vocabulary : [] }
}

// A single word or short phrase the reader picked out of the document
// themselves — not part of the auto-generated glossary. Defined the same way
// key points are grounded: only from the surrounding page text, no outside
// knowledge, so the definition matches how the term is actually used here.
export async function defineTerm({ term, contextText, apiKey }) {
  const trimmedContext = (contextText || '').slice(0, MAX_KEY_POINT_SOURCE_CHARS)
  const prompt = `A reader selected the term or phrase "${term}" while reading a document. Here is the text of the page it appears on:

${trimmedContext || '(no surrounding text available)'}

Give a single, plain-language, one-sentence definition of "${term}" as it's used in this context. If the surrounding text doesn't make the meaning clear, give the most common general definition instead, but keep it to one sentence.

Return ONLY valid JSON, no explanation, no markdown fences, in this exact shape: {"definition": string}`

  const parsed = await callClaude(prompt, apiKey, 300)
  return { definition: typeof parsed?.definition === 'string' ? parsed.definition : '' }
}

// Breaks a single section's own page text into concrete key points — used only
// for the Graph View's optional "drill past the real structure" level. Unlike
// buildDocumentStructure, this DOES generate new text (paraphrased points), so
// every point is required to carry a verbatim quote from the source, and any
// point whose quote doesn't actually appear in the source (case/whitespace
// aside) is dropped before it ever reaches the UI — a hallucination guard for
// what is otherwise ungrounded model output.
export async function extractKeyPoints({ sectionTitle, sourceText, apiKey }) {
  const trimmed = (sourceText || '').slice(0, MAX_KEY_POINT_SOURCE_CHARS)
  if (!trimmed.trim()) return []

  const prompt = `Here is the text of a section titled "${sectionTitle}" from a document:

${trimmed}

Extract the concrete key points made in this text — as many as are genuinely distinct, up to 8, no more than needed. Use ONLY information present in this text; do not add outside knowledge, inference, or interpretation beyond what's stated. For each key point, also give an exact, verbatim, contiguous quote copied word-for-word from the text above (same spelling, punctuation, and case) that the point is directly based on — this is shown to the reader as proof of where the point comes from, so it must be copied exactly, never paraphrased or reconstructed from memory.

Return ONLY valid JSON, no explanation, no markdown fences, in this exact shape: an array of {"point": string, "quote": string}.`

  const parsed = await callClaude(prompt, apiKey, 2000)
  if (!Array.isArray(parsed)) return []

  const collapsedSource = trimmed.replace(/\s+/g, ' ').toLowerCase()
  return parsed.filter((item) => {
    if (!item?.point || !item?.quote) return false
    const collapsedQuote = String(item.quote).replace(/\s+/g, ' ').trim().toLowerCase()
    return collapsedQuote.length > 0 && collapsedSource.includes(collapsedQuote)
  })
}
