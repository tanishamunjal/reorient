# Reorient

Reorient is a reading companion for dense PDFs — research papers, textbook
chapters, long reports — that turns a wall of text into a navigable mind map,
so you always know where you are and how the pieces connect.

## The problem

Long, text-heavy PDFs are hard to navigate even when the content itself
isn't that hard. Scrolling through pages of unbroken text makes it easy to
lose your place, lose the thread of how one section relates to another, and
give up before finishing.

This became concrete when a friend of mine who has dyslexia tried an early
version of Reorient and said that dense, word-heavy PDFs are what trip him
up most — not any single sentence, but the sheer wall of text with no visual
structure to anchor on. That's what pushed the mind map from a "nice to
have" into the core of the app: instead of reading top to bottom through
solid text, you get a visual map of the document's structure and can jump
straight to the part you need.

## What it does

Every feature here answers one of three questions a reader loses track of in
a dense document: **where am I**, **how does this connect to what came
before**, and **what was I doing last time**.

- **Orientation breadcrumb** — a persistent bar above the document showing
  the full path to your current position (e.g. "Results › Neural Activity ›
  Treatment Group"), updating live as you scroll. Click any level to jump
  there.
- **"Why am I here?"** — when a section conceptually builds on an earlier
  one, the breadcrumb bar can expand into the argument path that got you
  here (e.g. Hypothesis → Method → this Result), reusing the same
  section-dependency data the AI already extracts, just made visible instead
  of only ever driving a silent Confusion Detection check.
- **Focus Lens** — a toggle in the mind map that hides everything except
  your current section, its parents, and its immediate children, so a big
  document doesn't dump its whole structure on you at once.
- **Welcome back** — reopening a document you've already been in shows a
  small card with exactly where you left off and your last note, with one
  click to jump back rather than restarting at page 1.
- **Automatic mind map** — extracts real headings from the PDF's text layer
  (font size, bold weight, and layout are used to tell headings from body
  text, not just line length), then builds the section hierarchy
  deterministically from each heading's actual measured font size — the same
  way a Markdown outline works — rather than asking an AI to guess which
  heading nests under which. A heading-shaped line that repeats on three or
  more pages (a running chapter header, a page-top author credit) is treated
  as page furniture and dropped, not shown as a section. If a document has no
  real heading structure at all, Claude groups the content into sections
  instead — those AI-generated groupings are always visually labeled as
  AI-generated, never presented as if they were part of the original
  document.
- **Key-point bullets** — clicking any heading both jumps to it in the PDF
  *and* surfaces AI-extracted key points for that section right in the tree,
  each one grounded in a verbatim quote from the source (see "Why this
  approach" below).
- **Graph View** — a radial, click-to-drill-down visualization of the same
  document structure. Clicking into a leaf section fetches the same
  quote-grounded key points as bubbles you can drill into.
- **Click-to-navigate** — clicking any heading or key point jumps the PDF
  to that exact spot and highlights the matching text in place, using the
  same underlying text layer as native PDF text selection.
- **Struggle indicator** — sections you've genuinely revisited 3+ times (the
  same signal that drives Confusion Detection below) get a small heat marker
  right on the map, so where you got stuck is visible at a glance instead of
  only ever showing up as a one-off banner.
- **Add your own vocabulary** — select any word or short phrase in the text
  and ask Claude to define it in context; it's added to the vocabulary
  panel, saved per document, and visually marked as your own addition.
- **Memory Anchors** — highlight a passage and leave yourself a note; anchors
  persist per-document and resurface later.
- **Confusion Detection** — notices when you keep returning to the same page
  (3+ revisits, not just a second look) and offers a nudge, instead of
  assuming one re-read means confusion.
- **Relationship Replay** — after stepping away, replays the path you took
  through the document so you can pick back up with context.
- **Vocabulary panel** — an auto-generated glossary of hard terms, plus
  anything you've added yourself — click a term for a definition in context.
- **Accessibility controls** — light/dark/system theme, a brightness slider,
  adjustable text scale and layout density (which also tightens the Graph
  View's layout, not just row padding), and a reduced-motion mode that's
  independent of your OS setting and turns off animated scrolling and
  transitions app-wide.
- **Keyboard and screen-reader support** — the mind map tree and Graph View
  are both fully keyboard-navigable (roving tabindex, arrow-key navigation),
  use proper ARIA tree/treeitem roles, and announce state changes through
  live regions. Focus is trapped correctly in modal overlays (Replay) and
  returned to the trigger element on close.

## Why this approach

Everything the mind map and Graph View show is grounded in the document
itself. Headings come from real text-layer data (position, font size, bold
weight), and their hierarchy comes from that same real data too — the AI is
never asked to invent or reorganize structure it can't actually see. The
places AI content does appear — key points, generated categories for
heading-less documents, and user-added vocabulary definitions — are always
explicitly labeled as AI-generated, and key points are thrown out if they
can't be traced back to an exact quote in the source PDF. The goal was to
make a study tool that's actually trustworthy, not just a nicer-looking
wrapper around a hallucination-prone summarizer.

## Tech stack

- **React 19 + Vite** for the app shell
- **pdf.js** (`pdfjs-dist`) for PDF rendering and text-layer extraction
- **Claude API** (Anthropic) for AI-assisted section grouping, vocabulary,
  and key-point extraction, called directly from the browser through a Vite
  dev proxy
- **localStorage** for per-document persistence (Memory Anchors, prefs) —
  no backend/server

## Getting started

```bash
npm install
cp .env.example .env   # add your own Anthropic / Gemini API keys
npm run dev
```

Run the unit test suite with:

```bash
npm test
```

The app runs entirely client-side; the only external calls are to the
Claude API for the AI-assisted features described above.

See [TESTING.md](./TESTING.md) for the real bugs found and fixed while
testing against actual academic PDFs.
