# Testing & debugging

Reorient was tested against real academic PDFs (research papers downloaded
from actual journals, not synthetic test files), plus feedback from people
who actually used it — including a friend with dyslexia, whose feedback
about dense, word-heavy PDFs being the hardest thing to read directly shaped
the mind map becoming the app's core feature rather than a side panel.

Testing against real documents surfaced real bugs. Some examples:

## Heading extraction

- **Fragmented headings.** Multi-line headings and titles were being split
  into several separate "headings," one per line, because the extractor
  treated every text-layer line as its own item. Fixed by merging
  consecutive same-page, same-column, same-size, same-weight lines within a
  small vertical gap into a single heading block before classifying
  anything.
- **Two-column layout scrambling.** Academic papers laid out in two columns
  were producing headings in the wrong reading order, because rows were
  being read left-to-right across the full page width instead of down one
  column and then the next. Fixed by detecting column gutters from
  horizontal gaps within a row, then sorting by (page, column, vertical
  position) instead of raw row order.
- **Boilerplate mistaken for headings.** Journal metadata — ISSN numbers,
  DOIs, copyright lines, "journal homepage" text — was passing the
  heading heuristic because it was short, bold, or differently sized.
  Fixed with an explicit noise-pattern filter.
- **Author bylines shown as headings.** Author name lists (e.g. "Jane Smith,
  John Doe, and Priya Patel") on early pages were being picked up as
  section headings. Fixed by detecting name-list shape (short, comma/"and"
  separated, Title Case, only on the first few pages) and excluding it.
- **Random-looking highlight jumps.** Clicking a heading sometimes
  highlighted the wrong spot on the page when short or generic text
  matched more than once. Fixed by detecting ambiguous matches (multiple
  hits for a short quote) and falling back to a plain page jump instead of
  guessing which occurrence was meant.

## Structure and hierarchy

- **Wrong parent/child nesting in the mind map.** The tree's hierarchy used
  to be decided by asking Claude to group headings into a plausible-sounding
  structure from their text alone — with no way to know which heading the
  PDF itself had rendered larger or smaller, it would sometimes nest an
  unrelated heading under another one just because the grouping "sounded
  right." Fixed by building the hierarchy deterministically from each
  heading's real measured font size instead (`buildHeadingTree` in
  `src/lib/pdfText.js`) — the same nearest-larger-ancestor algorithm a
  Markdown outline or table-of-contents builder uses. The AI is now only
  asked to annotate that already-correct tree (cross-references and a
  vocabulary glossary), never to reorganize it.
- **Running headers/footers and author bylines showing up as their own
  section bubbles** ("Chapter 7" appearing as a heading, author names beyond
  the first few pages). A real section heading appears exactly once, at the
  top of its section — so anything heading-shaped that repeats on three or
  more different pages is treated as page furniture and dropped entirely,
  rather than kept as a section (`dropRunningHeaders` in
  `src/lib/pdfText.js`).

## Interaction bugs

- **Confusion Detection firing too eagerly.** It was meant to notice when a
  reader keeps returning to a page they're stuck on, but it was logging a
  "revisit" on every scroll tick, including while sitting still on the same
  page — so it fired after effectively one visit. Fixed to only count a
  genuine revisit (leaving the page and coming back), and raised the
  threshold to three revisits before nudging, so it doesn't feel like it's
  nagging after a normal second look.
- **Graph View key points silently doing nothing.** Clicking a leaf bubble
  to fetch AI key points would sometimes just stop the loading spinner with
  no visible result. Root cause: when the anti-hallucination filter
  correctly rejected every AI-generated candidate (because none of them
  could be matched back to real source text), the UI simply didn't drill in
  at all. Fixed to always show the drill-down, with an explicit "No key
  points found for this section" message when that happens — a rejected
  hallucination should be visible, not silent.
- **Connector lines cutting through bubble text in Graph View.** Lines from
  a parent bubble to its children were drawn to the bubble's center and
  showing through translucent bubble backgrounds. Fixed by shortening each
  line to stop at the bubble's edge and making bubble backgrounds fully
  opaque.
- **Smooth-scroll highlight ignoring the reduced-motion setting.** Jumping
  to a highlighted quote always used animated smooth scrolling, even with
  "reduce motion" turned on. Fixed by threading the user's motion
  preference through the highlight/scroll path.
- **The in-app "reduce motion" toggle doing almost nothing.** It correctly
  disabled a couple of JS-driven behaviors (smooth scrolling), but every
  CSS transition/animation in the app only ever responded to the *OS-level*
  `prefers-reduced-motion` setting, not the app's own toggle — so turning it
  on in the UI without also having it on at the OS level barely changed
  anything. Fixed by mirroring the preference onto `documentElement` as
  `data-reduced-motion` and adding one global override rule keyed off that
  attribute, the same pattern already used for the manual dark/light theme
  toggle.
- **"Compact density" barely visible, and not applied to Graph View at
  all.** The tree row padding shrank by a couple pixels, which was too
  subtle to read as "compact," and Graph View's bubble spacing was governed
  by constants that didn't change with the density setting at all. Fixed by
  tightening the tree's padding/gap/font-size further and by making Graph
  View's layout geometry (bubble spacing, connector-line pullback, orbit
  radius) explicitly density-aware.

## Automated tests

The parts of the codebase most likely to silently regress — because a bug
there doesn't crash anything, it just quietly produces a wrong result — are
covered by unit tests:

- `src/lib/pdfText.test.js` — heading detection (`isLikelyHeading`), noise
  filtering, author-byline detection, multi-line heading merging, and
  dedup/keep-first-occurrence behavior.
- `src/lib/quoteHighlight.test.js` — highlighting an unambiguous quote,
  correctly refusing to guess when a short quote is ambiguous, and still
  matching a long quote that legitimately recurs.
- `src/lib/ai.test.js` — the anti-hallucination filter in `extractKeyPoints`:
  a key point is kept only when its quote is a genuine (whitespace/case-
  insensitive) substring of the real source text, and dropped otherwise.

Run them with:

```bash
npm test
```

## What's not covered

Everything above is unit-level. There's no end-to-end/integration test that
drives an actual PDF through rendering, extraction, and the UI — that
testing has been manual so far, against real academic PDFs and real
readers. Given more time, that's the natural next layer.
