import { describe, expect, it } from 'vitest'
import { buildDependencyChain, labelForPage, flattenTree, pathToPage } from './treeUtils'

const sampleTree = [
  {
    text: 'Introduction',
    page: 1,
    dependsOn: [],
    children: [],
  },
  {
    text: 'Methods',
    page: 2,
    dependsOn: ['Introduction'],
    children: [
      { text: 'Data Collection', page: 3, dependsOn: ['Methods'], children: [] },
      { text: 'Analysis', page: 4, dependsOn: ['Data Collection'], children: [] },
    ],
  },
  {
    text: 'Results',
    page: 6,
    dependsOn: ['Analysis'],
    children: [],
  },
]

describe('pathToPage', () => {
  it('returns the root-to-node ancestor chain for an exact page match', () => {
    const path = pathToPage(sampleTree, 3)
    expect(path.map((n) => n.text)).toEqual(['Methods', 'Data Collection'])
  })

  it('falls back to the closest preceding node when there is no exact match', () => {
    const path = pathToPage(sampleTree, 5)
    expect(path.map((n) => n.text)).toEqual(['Methods', 'Analysis'])
  })

  it('returns a single-element path for a top-level node with no ancestors', () => {
    const path = pathToPage(sampleTree, 1)
    expect(path.map((n) => n.text)).toEqual(['Introduction'])
  })

  it('returns an empty path for an empty tree', () => {
    expect(pathToPage([], 3)).toEqual([])
  })
})

describe('buildDependencyChain', () => {
  it('walks dependsOn backward to build a root-cause-first chain ending at the node', () => {
    const results = flattenTree(sampleTree).find((n) => n.text === 'Results')
    const chain = buildDependencyChain(sampleTree, results)
    expect(chain.map((n) => n.text)).toEqual(['Introduction', 'Methods', 'Data Collection', 'Analysis', 'Results'])
  })

  it('returns just the node itself when it has no dependencies', () => {
    const intro = flattenTree(sampleTree).find((n) => n.text === 'Introduction')
    const chain = buildDependencyChain(sampleTree, intro)
    expect(chain.map((n) => n.text)).toEqual(['Introduction'])
  })

  it('stops instead of looping when dependsOn text does not resolve to a real node', () => {
    const orphan = { text: 'Orphan', page: 9, dependsOn: ['Nonexistent Section'], children: [] }
    const chain = buildDependencyChain(sampleTree, orphan)
    expect(chain.map((n) => n.text)).toEqual(['Orphan'])
  })

  it('is protected against a dependency cycle', () => {
    const cyclicTree = [
      { text: 'A', page: 1, dependsOn: ['B'], children: [] },
      { text: 'B', page: 2, dependsOn: ['A'], children: [] },
    ]
    const nodeA = cyclicTree[0]
    const chain = buildDependencyChain(cyclicTree, nodeA)
    expect(chain.length).toBeLessThanOrEqual(2)
    expect(chain[chain.length - 1].text).toBe('A')
  })
})

describe('labelForPage (regression)', () => {
  it('still returns just the label string, unaffected by pathToPage existing', () => {
    expect(labelForPage(flattenTree(sampleTree), 3)).toBe('Data Collection')
  })
})
