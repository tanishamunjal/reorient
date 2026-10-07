import { describe, expect, it } from 'vitest'
import { buildHeadingTree, extractHeadings, isLikelyHeading, isNoise, looksLikeAuthorList, mergeHeadingBlocks } from './pdfText'

describe('isLikelyHeading', () => {
  const bodySize = 10

  it('accepts a short, bold, capitalized fragment larger than body text', () => {
    expect(isLikelyHeading('Introduction', 14, bodySize, false)).toBe(true)
    expect(isLikelyHeading('Materials And Methods', bodySize, bodySize, true)).toBe(true)
  })

  it('rejects lowercase-starting text (mid-sentence fragments)', () => {
    expect(isLikelyHeading('was measured using', 14, bodySize, true)).toBe(false)
  })

  it('rejects text ending in sentence punctuation', () => {
    expect(isLikelyHeading('This is a full sentence.', 14, bodySize, true)).toBe(false)
  })

  it('rejects text with more than 18 words', () => {
    const longText = new Array(20).fill('Word').join(' ')
    expect(isLikelyHeading(longText, 14, bodySize, true)).toBe(false)
  })

  it('rejects text that is neither larger than body size nor bold', () => {
    expect(isLikelyHeading('Regular Text', bodySize, bodySize, false)).toBe(false)
  })

  it('rejects bullet-prefixed text', () => {
    expect(isLikelyHeading('• Some point', 14, bodySize, true)).toBe(false)
  })
})

describe('isNoise', () => {
  it('flags journal/publisher boilerplate', () => {
    expect(isNoise('ISSN 2345-6789')).toBe(true)
    expect(isNoise('Journal homepage: www.elsevier.com/locate/example')).toBe(true)
    expect(isNoise('https://doi.org/10.1016/j.example.2024.01.001')).toBe(true)
    expect(isNoise('© 2024 The Authors. All rights reserved.')).toBe(true)
  })

  it('does not flag a normal section heading', () => {
    expect(isNoise('Results and Discussion')).toBe(false)
  })

  it('flags standardized journal front/back-matter labels', () => {
    expect(isNoise('Article History')).toBe(true)
    expect(isNoise('KEYWORDS')).toBe(true)
    expect(isNoise('ORCID')).toBe(true)
    expect(isNoise('Declaration of interest')).toBe(true)
    expect(isNoise('Reviewer disclosure')).toBe(true)
  })

  it('does not flag a real heading that merely contains one of those words', () => {
    expect(isNoise('Funding Disparities in Rural Healthcare')).toBe(false)
  })
})

describe('looksLikeAuthorList', () => {
  it('recognizes a comma/"and"-separated list of Title Case names on an early page', () => {
    expect(looksLikeAuthorList('Jane Smith, John Doe, and Priya Patel', 1)).toBe(true)
  })

  it('does not flag the same shape once past the opening pages', () => {
    expect(looksLikeAuthorList('Jane Smith, John Doe, and Priya Patel', 5)).toBe(false)
  })

  it('still recognizes names with trailing footnote/affiliation markers', () => {
    // The exact real-world case that was slipping through: superscript-style
    // footnote markers set off with a space before a comma.
    expect(
      looksLikeAuthorList('Sidra Khot *, Anandha Krishnaveni *, Sankalp Gharat , Munira Momin , Chintan Bhavsar', 1)
    ).toBe(true)
  })

  it('recognizes names with markers glued directly on with no space', () => {
    expect(looksLikeAuthorList('Sidra Khot¹, Anandha Krishnaveni², Sankalp Gharat³', 1)).toBe(true)
  })

  it('recognizes accented names', () => {
    expect(looksLikeAuthorList('José García, François Müller, Renée Dubois', 1)).toBe(true)
  })

  it('does not flag an ordinary heading', () => {
    expect(looksLikeAuthorList('Results and Discussion', 1)).toBe(false)
  })
})

describe('mergeHeadingBlocks', () => {
  it('glues consecutive same-style lines close together into one block', () => {
    const lines = [
      { text: 'Innovative Drug Delivery', size: 16, allBold: true, page: 1, column: 0, y: 700 },
      { text: 'Strategies for Glioblastoma', size: 16, allBold: true, page: 1, column: 0, y: 685 },
    ]
    const blocks = mergeHeadingBlocks(lines, 10)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('Innovative Drug Delivery Strategies for Glioblastoma')
  })

  it('does not merge lines that are far apart vertically', () => {
    const lines = [
      { text: 'Abstract', size: 14, allBold: true, page: 1, column: 0, y: 700 },
      { text: 'Introduction', size: 14, allBold: true, page: 1, column: 0, y: 400 },
    ]
    const blocks = mergeHeadingBlocks(lines, 10)
    expect(blocks).toHaveLength(2)
  })

  it('does not merge lines from different columns', () => {
    const lines = [
      { text: 'Left Column Heading', size: 14, allBold: true, page: 1, column: 0, y: 700 },
      { text: 'Right Column Heading', size: 14, allBold: true, page: 1, column: 1, y: 700 },
    ]
    const blocks = mergeHeadingBlocks(lines, 10)
    expect(blocks).toHaveLength(2)
  })
})

describe('extractHeadings', () => {
  const bodySize = 10

  it('keeps a real heading and drops author lists and noise', () => {
    const lines = [
      { text: 'Innovative Drug Delivery Strategies', size: 18, allBold: true, page: 1, column: 0, y: 700 },
      { text: 'Jane Smith, John Doe, and Priya Patel', size: 12, allBold: true, page: 1, column: 0, y: 650 },
      { text: 'ISSN 2345-6789', size: 12, allBold: true, page: 1, column: 0, y: 600 },
      { text: 'Introduction', size: 14, allBold: true, page: 2, column: 0, y: 700 },
    ]
    const headings = extractHeadings(lines, bodySize)
    expect(headings.map((h) => h.text)).toEqual(['Innovative Drug Delivery Strategies', 'Introduction'])
  })

  it('deduplicates a title that reappears verbatim as a running header on a later page', () => {
    const lines = [
      { text: 'Innovative Drug Delivery Strategies For Glioblastoma', size: 18, allBold: true, page: 1, column: 0, y: 700 },
      { text: 'Innovative Drug Delivery Strategies For Glioblastoma', size: 12, allBold: true, page: 3, column: 0, y: 750 },
    ]
    const headings = extractHeadings(lines, bodySize)
    expect(headings).toHaveLength(1)
    expect(headings[0].page).toBe(1)
  })

  it('keeps distinct headings that happen to share a short common prefix', () => {
    const lines = [
      { text: 'Results', size: 14, allBold: true, page: 4, column: 0, y: 700 },
      { text: 'Discussion', size: 14, allBold: true, page: 6, column: 0, y: 700 },
    ]
    const headings = extractHeadings(lines, bodySize)
    expect(headings).toHaveLength(2)
  })

  it('drops a running header/footer that repeats heading-style text on 3+ pages', () => {
    const lines = [
      { text: 'Chapter 7', size: 12, allBold: true, page: 5, column: 0, y: 780 },
      { text: 'Chapter 7', size: 12, allBold: true, page: 6, column: 0, y: 780 },
      { text: 'Chapter 7', size: 12, allBold: true, page: 7, column: 0, y: 780 },
      { text: 'Chapter 7', size: 12, allBold: true, page: 8, column: 0, y: 780 },
      { text: 'Photosynthesis', size: 16, allBold: true, page: 5, column: 0, y: 700 },
    ]
    const headings = extractHeadings(lines, bodySize)
    expect(headings.map((h) => h.text)).toEqual(['Photosynthesis'])
  })

  it('keeps a heading that only repeats once or twice (real title reprinted as a running header)', () => {
    const lines = [
      { text: 'Photosynthesis', size: 16, allBold: true, page: 5, column: 0, y: 700 },
      { text: 'Photosynthesis', size: 12, allBold: true, page: 6, column: 0, y: 780 },
    ]
    const headings = extractHeadings(lines, bodySize)
    expect(headings).toHaveLength(1)
    expect(headings[0].page).toBe(5)
  })
})

describe('buildHeadingTree', () => {
  it('nests a smaller heading under the nearest earlier larger one', () => {
    const headings = [
      { text: 'Introduction', size: 18, page: 1 },
      { text: 'Background', size: 14, page: 2 },
      { text: 'Related Work', size: 14, page: 3 },
      { text: 'Methods', size: 18, page: 4 },
    ]
    const tree = buildHeadingTree(headings)
    expect(tree.map((n) => n.text)).toEqual(['Introduction', 'Methods'])
    expect(tree[0].children.map((n) => n.text)).toEqual(['Background', 'Related Work'])
    expect(tree[1].children).toEqual([])
  })

  it('treats equal-size headings as siblings, never nesting one under the other', () => {
    const headings = [
      { text: 'Results', size: 16, page: 1 },
      { text: 'Discussion', size: 16, page: 2 },
      { text: 'Conclusion', size: 16, page: 3 },
    ]
    const tree = buildHeadingTree(headings)
    expect(tree).toHaveLength(3)
    tree.forEach((n) => expect(n.children).toEqual([]))
  })

  it('supports three real levels of nesting', () => {
    const headings = [
      { text: 'Part One', size: 20, page: 1 },
      { text: 'Chapter 1', size: 16, page: 2 },
      { text: 'Section 1.1', size: 12, page: 3 },
      { text: 'Section 1.2', size: 12, page: 4 },
      { text: 'Chapter 2', size: 16, page: 5 },
    ]
    const tree = buildHeadingTree(headings)
    expect(tree).toHaveLength(1)
    expect(tree[0].children).toHaveLength(2)
    expect(tree[0].children[0].children.map((n) => n.text)).toEqual(['Section 1.1', 'Section 1.2'])
    expect(tree[0].children[1].children).toEqual([])
  })
})
