import { afterEach, describe, expect, it, vi } from 'vitest'
import { annotateHeadingTree, extractKeyPoints } from './ai'

function mockClaudeResponse(points) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ text: JSON.stringify(points) }] }),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('extractKeyPoints anti-hallucination filter', () => {
  const sourceText = 'The treatment reduced tumor volume by 40 percent over eight weeks in the trial cohort.'

  it('keeps a key point whose quote is a genuine substring of the source', () => {
    return mockAndRun(
      [{ point: 'Tumor volume dropped substantially.', quote: 'reduced tumor volume by 40 percent' }],
      sourceText,
    ).then((result) => {
      expect(result).toHaveLength(1)
      expect(result[0].point).toBe('Tumor volume dropped substantially.')
    })
  })

  it('drops a key point whose quote does not actually appear in the source', () => {
    return mockAndRun(
      [{ point: 'Made up claim.', quote: 'the treatment cured every patient completely' }],
      sourceText,
    ).then((result) => {
      expect(result).toHaveLength(0)
    })
  })

  it('is whitespace/case-insensitive when checking the quote against the source', () => {
    return mockAndRun(
      [{ point: 'Reduction over time.', quote: 'REDUCED   tumor volume BY 40 percent' }],
      sourceText,
    ).then((result) => {
      expect(result).toHaveLength(1)
    })
  })

  it('returns an empty array when the source text is empty, without calling the model', async () => {
    global.fetch = vi.fn()
    const result = await extractKeyPoints({ sectionTitle: 'Empty', sourceText: '', apiKey: 'test' })
    expect(result).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  async function mockAndRun(points, source) {
    mockClaudeResponse(points)
    return extractKeyPoints({ sectionTitle: 'Results', sourceText: source, apiKey: 'test-key' })
  }
})

describe('annotateHeadingTree', () => {
  it('maps AI-returned dependency indices back onto the real node text, mutating the tree in place', async () => {
    // Node 0 = Introduction, node 1 = Background, node 2 = Results (child of Background)
    const tree = [
      { text: 'Introduction', page: 1, children: [], dependsOn: [] },
      {
        text: 'Background',
        page: 2,
        children: [{ text: 'Results', page: 3, children: [], dependsOn: [] }],
        dependsOn: [],
      },
    ]
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify({ dependsOn: { '1': [0], '2': [0] }, vocabulary: [] }) }],
      }),
    })

    const result = await annotateHeadingTree({ tree, pageTexts: [], apiKey: 'test-key' })

    expect(tree[0].dependsOn).toEqual([])
    expect(tree[1].dependsOn).toEqual(['Introduction'])
    expect(tree[1].children[0].dependsOn).toEqual(['Introduction'])
    expect(result.vocabulary).toEqual([])
  })

  it('discards a dependency index that points forward or at itself, never creating a future reference', async () => {
    const tree = [
      { text: 'Introduction', page: 1, children: [], dependsOn: [] },
      { text: 'Background', page: 2, children: [], dependsOn: [] },
    ]
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      // Node 0 claiming to depend on node 1 (itself is earlier) is invalid —
      // 1 is not < 0, so it must be dropped rather than trusted blindly.
      json: async () => ({ content: [{ text: JSON.stringify({ dependsOn: { '0': [1] }, vocabulary: [] }) }] }),
    })

    await annotateHeadingTree({ tree, pageTexts: [], apiKey: 'test-key' })

    expect(tree[0].dependsOn).toEqual([])
  })

  it('returns an empty vocabulary and makes no request for an empty tree', async () => {
    global.fetch = vi.fn()
    const result = await annotateHeadingTree({ tree: [], pageTexts: [], apiKey: 'test-key' })
    expect(result).toEqual({ vocabulary: [] })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
