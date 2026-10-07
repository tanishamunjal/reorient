import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { renderPages, buildHeadingTree } from './lib/pdfText'
import { buildDocumentStructure, annotateHeadingTree, extractKeyPoints, defineTerm } from './lib/ai'
import {
  makeDocId,
  loadAnchors,
  saveAnchors,
  loadCustomVocab,
  saveCustomVocab,
  loadLastPosition,
  saveLastPosition,
  loadPrefs,
  savePrefs,
  PREFS_KEY,
} from './lib/storage'
import { flattenTree, labelForPage, pathToPage, buildDependencyChain, REVISIT_HEAT_THRESHOLD } from './lib/treeUtils'
import { conceptReappears } from './lib/textMatch'
import { highlightQuoteOnPage } from './lib/quoteHighlight'
import MindMapTree from './components/MindMapTree'
import GraphView from './components/GraphView'
import VocabPanel from './components/VocabPanel'
import AccessibilityBar from './components/AccessibilityBar'
import ReplayOverlay from './components/ReplayOverlay'
import { AnchorPopup, AnchorPanel } from './components/AnchorTools'
import ConfusionBanner from './components/ConfusionBanner'
import OrientationBar from './components/OrientationBar'
import WelcomeBackCard from './components/WelcomeBackCard'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

const REVISIT_WINDOW = 10
const REVISIT_THRESHOLD = REVISIT_HEAT_THRESHOLD
const CONFUSION_COOLDOWN_MS = 30000
const INTERRUPTION_THRESHOLD_MS = 15000

function App() {
  const [loadingPdf, setLoadingPdf] = useState(false)
  const [loadingAI, setLoadingAI] = useState(false)
  const [headings, setHeadings] = useState([])
  const [pageTexts, setPageTexts] = useState([])
  const [numPages, setNumPages] = useState(0)
  const [mindMap, setMindMap] = useState(null)
  const [mindMapSource, setMindMapSource] = useState(null) // 'headings' | 'generated'
  const [vocabulary, setVocabulary] = useState([])
  const [customVocab, setCustomVocab] = useState([])
  const [vocabAdding, setVocabAdding] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [docId, setDocId] = useState(null)
  const [anchors, setAnchors] = useState([])
  const [visitCounts, setVisitCounts] = useState({})
  const [welcomeBack, setWelcomeBack] = useState(null)
  const [selectionInfo, setSelectionInfo] = useState(null)
  const [confusionSuggestion, setConfusionSuggestion] = useState(null)
  const [replaySteps, setReplaySteps] = useState(null)
  const [viewMode, setViewMode] = useState('tree')
  const [prefs, setPrefsState] = useState(() => {
    const base = loadPrefs()
    if (!localStorage.getItem(PREFS_KEY)) {
      base.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    }
    return base
  })

  const containerRef = useRef(null)
  const pageRefs = useRef([])
  const pdfRef = useRef(null)
  const scrollRafRef = useRef(null)
  const visitHistoryRef = useRef([])
  const hiddenAtRef = useRef(null)
  const dismissedPairsRef = useRef(new Set())
  const confusionShownRef = useRef(new Map())
  const keyPointsCacheRef = useRef(new Map())
  const stateRef = useRef({})

  useEffect(() => {
    stateRef.current = { mindMap, anchors, pageTexts, docId, prefs, currentPage, numPages }
  })

  useEffect(() => {
    savePrefs(prefs)
  }, [prefs])

  useEffect(() => {
    if (prefs.theme === 'system') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', prefs.theme)
    }
  }, [prefs.theme])

  // The app's own "reduce motion" toggle is independent of the OS-level
  // prefers-reduced-motion setting (someone may want it on here without
  // changing their whole system). CSS animations/transitions only respond to
  // the OS media query by default, so this attribute gives the stylesheet a
  // second, always-checkable hook — see the [data-reduced-motion='true']
  // rule in App.css — the same override-the-media-query pattern used for the
  // manual theme toggle above.
  useEffect(() => {
    if (prefs.reducedMotion) {
      document.documentElement.setAttribute('data-reduced-motion', 'true')
    } else {
      document.documentElement.removeAttribute('data-reduced-motion')
    }
  }, [prefs.reducedMotion])

  function updatePrefs(partial) {
    setPrefsState((prev) => ({ ...prev, ...partial }))
  }

  const checkConfusion = useCallback((page) => {
    const { mindMap: tree } = stateRef.current
    if (!tree) return
    const recentWindow = visitHistoryRef.current.slice(-REVISIT_WINDOW).map((h) => h.page)
    const revisits = recentWindow.filter((p) => p === page).length
    if (revisits < REVISIT_THRESHOLD) return

    const flat = flattenTree(tree)
    let node = flat.find((n) => n.page === page && n.dependsOn?.length)
    if (!node) {
      node = flat
        .filter((n) => n.page <= page && n.dependsOn?.length)
        .sort((a, b) => b.page - a.page)[0]
    }
    if (!node) return

    const depText = node.dependsOn[0]
    const depNode = flat.find((n) => n.text === depText)
    if (!depNode) return

    const pairKey = `${page}->${depNode.page}`
    if (dismissedPairsRef.current.has(pairKey)) return
    const lastShown = confusionShownRef.current.get(pairKey)
    if (lastShown && Date.now() - lastShown < CONFUSION_COOLDOWN_MS) return

    confusionShownRef.current.set(pairKey, Date.now())
    setConfusionSuggestion({ dependsOnText: depText, dependsOnPage: depNode.page, pairKey })
  }, [])

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page)
    // Only record a "visit" (and run the revisit check) on an actual page-to-page
    // transition. Without this, scrolling slowly while reading a single page fires
    // this handler many times a second, all for the SAME page, which would make
    // Confusion Detection think you'd "revisited" a page you never left.
    const history = visitHistoryRef.current
    const last = history[history.length - 1]
    if (last && last.page === page) return
    history.push({ page, ts: Date.now() })
    if (history.length > 100) history.shift()
    setVisitCounts((prev) => ({ ...prev, [page]: (prev[page] || 0) + 1 }))

    // Remembers where the reader is as they go, not just on unload, so the
    // "welcome back" card has something real to show even if the tab is
    // just closed outright. Breadcrumb text is precomputed and saved here
    // rather than recomputed from the tree on reopen, since Build Mind Map
    // is a separate manual step that may not have run yet next time.
    const { mindMap: tree, docId: currentDocId } = stateRef.current
    if (currentDocId && tree) {
      const path = pathToPage(tree, page)
      if (path.length > 0) {
        saveLastPosition(currentDocId, {
          page,
          breadcrumbText: path.map((n) => n.text).join(' › '),
          ts: Date.now(),
        })
      }
    }

    checkConfusion(page)
  }, [checkConfusion])

  // Which page is "current" is computed directly from geometry (getBoundingClientRect)
  // on scroll, rather than via IntersectionObserver. IntersectionObserver's callback is
  // tied to the browser's compositor/paint cycle, which some environments (embedded
  // previews, backgrounded tabs) throttle or suppress entirely — when that happens the
  // map silently stops following scroll. A direct scroll-event calculation has no such
  // dependency: it runs whenever the container's scroll position actually changes.
  const computeVisiblePage = useCallback(() => {
    const container = containerRef.current
    if (!container || pageRefs.current.length === 0) return
    const containerRect = container.getBoundingClientRect()
    const readLine = containerRect.top + containerRect.height * 0.35

    let bestPage = null
    let bestIsContained = false
    let bestDistance = Infinity

    pageRefs.current.forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.bottom < containerRect.top || rect.top > containerRect.bottom) return
      const page = Number(el.dataset.page)
      const containsReadLine = rect.top <= readLine && rect.bottom >= readLine
      if (containsReadLine) {
        bestPage = page
        bestIsContained = true
        return
      }
      if (bestIsContained) return
      const mid = rect.top + rect.height / 2
      const distance = Math.abs(mid - readLine)
      if (distance < bestDistance) {
        bestDistance = distance
        bestPage = page
      }
    })

    if (bestPage != null) handlePageChange(bestPage)
  }, [handlePageChange])

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current != null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      computeVisiblePage()
    })
  }, [computeVisiblePage])

  const buildReplaySteps = useCallback(() => {
    const { mindMap: tree } = stateRef.current
    const flat = tree ? flattenTree(tree) : []
    const distinct = []
    visitHistoryRef.current.forEach((h) => {
      if (!distinct.length || distinct[distinct.length - 1].page !== h.page) distinct.push(h)
    })
    return distinct.slice(-6).map((h) => ({
      page: h.page,
      label: flat.length ? labelForPage(flat, h.page) : `Page ${h.page}`,
    }))
  }, [])

  const triggerReplay = useCallback(() => {
    const steps = buildReplaySteps()
    if (steps.length > 0) setReplaySteps(steps)
  }, [buildReplaySteps])

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        hiddenAtRef.current = Date.now()
        return
      }
      if (!hiddenAtRef.current) return
      const away = Date.now() - hiddenAtRef.current
      hiddenAtRef.current = null
      if (away > INTERRUPTION_THRESHOLD_MS) {
        const steps = buildReplaySteps()
        if (steps.length > 1) setReplaySteps(steps)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [buildReplaySteps])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape') return
      setSelectionInfo(null)
      setReplaySteps(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)
    }
  }, [])

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return

    const newDocId = makeDocId(file)
    const loadedAnchors = loadAnchors(newDocId)
    const lastPosition = loadLastPosition(newDocId)
    setDocId(newDocId)
    setAnchors(loadedAnchors)
    setCustomVocab(loadCustomVocab(newDocId))
    setWelcomeBack(lastPosition ? { ...lastPosition, lastAnchor: loadedAnchors[0] || null } : null)
    setLoadingPdf(true)
    setHeadings([])
    setPageTexts([])
    setMindMap(null)
    setMindMapSource(null)
    setVocabulary([])
    setCurrentPage(1)
    setConfusionSuggestion(null)
    setReplaySteps(null)
    setSelectionInfo(null)
    setVisitCounts({})
    visitHistoryRef.current = []
    dismissedPairsRef.current = new Set()
    confusionShownRef.current = new Map()
    keyPointsCacheRef.current = new Map()

    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      pdfRef.current = pdf
      const { headings: found, pageTexts: texts } = await renderPages(
        pdf,
        containerRef.current,
        pageRefs,
        scale,
        true
      )
      setHeadings(found)
      setPageTexts(texts)
      setNumPages(pdf.numPages)
      computeVisiblePage()
    } catch (err) {
      console.error(err)
      alert('Could not read that PDF — check the console for details.')
    } finally {
      setLoadingPdf(false)
    }
  }

  async function buildMindMap() {
    setLoadingAI(true)
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    const source = headings.length > 0 ? 'headings' : 'generated'
    try {
      if (source === 'headings') {
        // Real headings: the hierarchy is built deterministically from each
        // heading's actual font size (see buildHeadingTree), so the AI is
        // only asked to annotate that already-correct tree, never to
        // reorganize it — see annotateHeadingTree in lib/ai.js.
        const tree = buildHeadingTree(headings)
        const { vocabulary: vocab } = await annotateHeadingTree({ tree, pageTexts, apiKey })
        setMindMap(tree)
        setVocabulary(vocab)
      } else {
        const { tree, vocabulary: vocab } = await buildDocumentStructure({ pageTexts, apiKey })
        setMindMap(tree)
        setVocabulary(vocab)
      }
      setMindMapSource(source)
    } catch (err) {
      console.error(err)
      alert(`Something went wrong building the map: ${err.message}`)
    } finally {
      setLoadingAI(false)
    }
  }

  async function handleScaleChange(newScale) {
    if (!pdfRef.current || !containerRef.current) return
    const savedPage = currentPage
    setScale(newScale)
    setLoadingPdf(true)
    try {
      await renderPages(pdfRef.current, containerRef.current, pageRefs, newScale, false)
      computeVisiblePage()
      requestAnimationFrame(() => {
        pageRefs.current[savedPage - 1]?.scrollIntoView({ behavior: 'auto', block: 'start' })
      })
    } finally {
      setLoadingPdf(false)
    }
  }

  function jumpToPage(page) {
    pageRefs.current[page - 1]?.scrollIntoView({
      behavior: prefs.reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  function jumpToQuote(page, quote) {
    const wrapper = pageRefs.current[page - 1]
    const found = wrapper ? highlightQuoteOnPage(wrapper, quote, prefs.reducedMotion) : false
    if (!found) jumpToPage(page)
  }

  // Clicking a heading should land you right on it, not just somewhere on the
  // page — headings are real text extracted from the page, so we can always
  // try to highlight the heading's own text at its actual position.
  function jumpToHeadingNode(node) {
    jumpToQuote(node.page, node.text)
  }

  async function getKeyPointsForNode(node) {
    const key = `${node.page}-${node.text}`
    if (keyPointsCacheRef.current.has(key)) return keyPointsCacheRef.current.get(key)
    const sourceText = pageTexts.find((p) => p.page === node.page)?.text || ''
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    const points = await extractKeyPoints({ sectionTitle: node.text, sourceText, apiKey })
    keyPointsCacheRef.current.set(key, points)
    return points
  }

  function handleDocMouseUp() {
    const sel = window.getSelection()
    const text = sel ? sel.toString().trim() : ''
    if (!text || text.length < 3) {
      setSelectionInfo(null)
      return
    }
    if (!sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return

    let node = sel.anchorNode
    while (node && !(node.nodeType === 1 && node.classList?.contains('pdf-page'))) {
      node = node.parentNode
    }
    const page = node ? Number(node.dataset.page) : currentPage
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - 256)
    const top = Math.min(rect.bottom + 8, window.innerHeight - 160)
    setSelectionInfo({ text, page, rect: { top, left } })
  }

  function saveAnchor(note) {
    if (!selectionInfo || !docId) return
    const anchor = {
      id: crypto.randomUUID(),
      page: selectionInfo.page,
      text: selectionInfo.text,
      note,
      createdAt: Date.now(),
    }
    setAnchors((prev) => {
      const next = [anchor, ...prev]
      saveAnchors(docId, next)
      return next
    })
    setSelectionInfo(null)
    window.getSelection()?.removeAllRanges()
  }

  // Lets the reader define a word or phrase they picked out of the text
  // themselves, rather than only ever seeing the auto-generated glossary.
  // Grounded the same way key points are: only the source page's own text is
  // given to the model, no outside knowledge.
  async function addSelectionToVocab() {
    if (!selectionInfo || !docId) return
    const term = selectionInfo.text
    if (term.length > 60) {
      alert('That selection is too long to add as a vocabulary term — try selecting just the word or phrase.')
      return
    }
    setVocabAdding(true)
    try {
      const contextText = pageTexts.find((p) => p.page === selectionInfo.page)?.text || ''
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
      const { definition } = await defineTerm({ term, contextText, apiKey })
      if (!definition) throw new Error('No definition came back')
      const entry = { term, definition, page: selectionInfo.page, custom: true }
      setCustomVocab((prev) => {
        const next = [entry, ...prev.filter((v) => v.term.toLowerCase() !== term.toLowerCase())]
        saveCustomVocab(docId, next)
        return next
      })
      setSelectionInfo(null)
      window.getSelection()?.removeAllRanges()
    } catch (err) {
      console.error(err)
      alert(`Could not define "${term}": ${err.message}`)
    } finally {
      setVocabAdding(false)
    }
  }

  function deleteAnchor(id) {
    setAnchors((prev) => {
      const next = prev.filter((a) => a.id !== id)
      if (docId) saveAnchors(docId, next)
      return next
    })
  }

  function dismissConfusion() {
    if (confusionSuggestion) dismissedPairsRef.current.add(confusionSuggestion.pairKey)
    setConfusionSuggestion(null)
  }

  function reviewConfusion(page) {
    jumpToPage(page)
    setConfusionSuggestion(null)
  }

  function closeReplay() {
    setReplaySteps(null)
  }

  function replayJump(page) {
    jumpToPage(page)
    setReplaySteps(null)
  }

  function startSidebarResize(e) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = prefs.sidebarWidth ?? 320

    function onMove(moveEvent) {
      const next = startWidth + (moveEvent.clientX - startX)
      const max = window.innerWidth - 200
      updatePrefs({ sidebarWidth: Math.round(Math.min(Math.max(next, 240), max)) })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const resurfacedPages = useMemo(() => {
    const map = {}
    if (!anchors.length || !pageTexts.length) return map
    anchors.forEach((a) => {
      const hits = []
      pageTexts.forEach((pt) => {
        if (pt.page === a.page || !pt.text) return
        if (conceptReappears(a.text, pt.text)) hits.push(pt.page)
      })
      if (hits.length) map[a.id] = hits.sort((x, y) => x - y)
    })
    return map
  }, [anchors, pageTexts])

  const hasAnyText = pageTexts.some((p) => p.text.trim().length > 0)

  const currentLabel = useMemo(() => {
    if (!mindMap) return `page ${currentPage}`
    return labelForPage(flattenTree(mindMap), currentPage)
  }, [mindMap, currentPage])

  // Powers the OrientationBar: WHERE AM I (the full ancestor chain to the
  // current page) and HOW DOES THIS CONNECT (that node's argument/dependency
  // chain, when the AI found one).
  const breadcrumbPath = useMemo(() => {
    if (!mindMap) return []
    return pathToPage(mindMap, currentPage)
  }, [mindMap, currentPage])

  const dependencyChain = useMemo(() => {
    if (!mindMap || breadcrumbPath.length === 0) return []
    return buildDependencyChain(mindMap, breadcrumbPath[breadcrumbPath.length - 1])
  }, [mindMap, breadcrumbPath])

  function continueWelcomeBack() {
    if (welcomeBack) jumpToPage(welcomeBack.page)
    setWelcomeBack(null)
  }

  return (
    <div className="app-shell" style={{ '--ui-scale': prefs.textScale }}>
      <a href="#doc-pane-main" className="skip-link">Skip to document</a>
      <nav className="sidebar" aria-label="Document map and tools" style={{ width: prefs.sidebarWidth ?? 320 }}>
        <h2 className="sidebar-brand">
          <img src="/favicon.svg" alt="" className="sidebar-logo" width={22} height={22} />
          Reorient Map
        </h2>
        <div className="visually-hidden" aria-live="polite">
          {numPages > 0 ? `Now viewing ${currentLabel}, page ${currentPage} of ${numPages}` : ''}
        </div>

        <input
          className="file-input"
          type="file"
          accept="application/pdf"
          onChange={handleFile}
          disabled={loadingPdf}
          aria-label="Choose a PDF document"
        />

        {!loadingPdf && (
          <WelcomeBackCard info={welcomeBack} onContinue={continueWelcomeBack} onDismiss={() => setWelcomeBack(null)} />
        )}

        <AccessibilityBar
          prefs={prefs}
          onPrefsChange={updatePrefs}
          scale={scale}
          onScaleChange={handleScaleChange}
          onReplay={triggerReplay}
          replayAvailable={numPages > 0}
        />

        {loadingPdf && (
          <p className="status-line" role="status" aria-live="polite">Reading PDF and finding headings…</p>
        )}
        {!loadingPdf && numPages > 0 && headings.length === 0 && hasAnyText && (
          <p className="status-line" role="status" aria-live="polite">
            No clear headings — Claude can group this document into topics instead.
          </p>
        )}
        {!loadingPdf && numPages > 0 && !hasAnyText && (
          <p className="status-line" role="status" aria-live="polite">
            No extractable text in this document (likely a scan) — a map can't be built.
          </p>
        )}

        {!loadingPdf && hasAnyText && (
          <button className="build-map-button" onClick={buildMindMap} disabled={loadingAI}>
            {loadingAI ? 'Building map…' : mindMap ? 'Rebuild map' : 'Build mind map'}
          </button>
        )}

        <ConfusionBanner suggestion={confusionSuggestion} onJump={reviewConfusion} onDismiss={dismissConfusion} />

        {mindMap ? (
          <>
            {mindMapSource === 'generated' && (
              <p className="source-note">
                <span className="graph-sparkle" aria-hidden="true">✦</span> This document has no explicit headings —
                Claude organized it into these topics from the text itself.
              </p>
            )}
            <div className="view-toggle" role="tablist" aria-label="Map view">
              <button type="button" role="tab" aria-selected={viewMode === 'tree'} onClick={() => setViewMode('tree')}>
                Tree
              </button>
              <button type="button" role="tab" aria-selected={viewMode === 'graph'} onClick={() => setViewMode('graph')}>
                Graph
              </button>
            </div>
            {viewMode === 'tree' ? (
              <MindMapTree
                tree={mindMap}
                currentPage={currentPage}
                onJumpToNode={jumpToHeadingNode}
                onExpandNode={getKeyPointsForNode}
                onJumpToQuote={jumpToQuote}
                density={prefs.density}
                visitCounts={visitCounts}
              />
            ) : (
              <GraphView
                tree={mindMap}
                currentPage={currentPage}
                onJumpToNode={jumpToHeadingNode}
                onExpandLeaf={getKeyPointsForNode}
                onJumpToQuote={jumpToQuote}
                density={prefs.density}
                visitCounts={visitCounts}
              />
            )}
          </>
        ) : (
          <ul className="raw-heading-list" style={{ listStyle: 'none', padding: 0 }}>
            {headings.map((h, i) => (
              <li key={i} style={{ padding: '6px 8px', fontSize: '13px', color: 'var(--text)', opacity: 0.6 }}>
                {h.text}
              </li>
            ))}
          </ul>
        )}

        <VocabPanel vocabulary={[...customVocab, ...vocabulary]} onJump={jumpToPage} />
        <AnchorPanel
          anchors={anchors}
          resurfacedPages={resurfacedPages}
          onJump={jumpToPage}
          onDelete={deleteAnchor}
        />
      </nav>

      <div
        className="sidebar-resizer"
        onMouseDown={startSidebarResize}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={Math.round(prefs.sidebarWidth ?? 320)}
        aria-valuemin={240}
        aria-valuemax={typeof window !== 'undefined' ? window.innerWidth - 200 : 1000}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') updatePrefs({ sidebarWidth: Math.max(240, (prefs.sidebarWidth ?? 320) - 20) })
          if (e.key === 'ArrowRight') {
            const max = window.innerWidth - 200
            updatePrefs({ sidebarWidth: Math.min(max, (prefs.sidebarWidth ?? 320) + 20) })
          }
        }}
      />

      <div className="doc-pane-column">
        <OrientationBar breadcrumbPath={breadcrumbPath} dependencyChain={dependencyChain} onJump={jumpToHeadingNode} />
        <main
          id="doc-pane-main"
          className="doc-pane"
          ref={containerRef}
          onMouseUp={handleDocMouseUp}
          onScroll={handleScroll}
          aria-label="Document pages"
          tabIndex={-1}
          style={{ filter: `brightness(${prefs.brightness ?? 100}%)` }}
        ></main>
      </div>

      <AnchorPopup
        selection={selectionInfo}
        onSave={saveAnchor}
        onCancel={() => setSelectionInfo(null)}
        onAddVocab={addSelectionToVocab}
        vocabAdding={vocabAdding}
      />
      <ReplayOverlay
        steps={replaySteps}
        reducedMotion={prefs.reducedMotion}
        onClose={closeReplay}
        onJump={replayJump}
      />
    </div>
  )
}

export default App
