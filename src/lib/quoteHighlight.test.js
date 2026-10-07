// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { highlightQuoteOnPage } from './quoteHighlight'

function makePage(spanTexts) {
  const wrapper = document.createElement('div')
  const textLayer = document.createElement('div')
  textLayer.className = 'textLayer'
  spanTexts.forEach((text) => {
    const span = document.createElement('span')
    span.textContent = text
    textLayer.appendChild(span)
  })
  wrapper.appendChild(textLayer)
  document.body.appendChild(wrapper)
  return wrapper
}

beforeEach(() => {
  document.body.innerHTML = ''
  // jsdom doesn't implement scrollIntoView; the function calls it but the
  // return value doesn't depend on it, so a no-op stub is enough here.
  Element.prototype.scrollIntoView = () => {}
})

describe('highlightQuoteOnPage', () => {
  it('highlights and returns true for a quote that appears exactly once', () => {
    const page = makePage(['Introduction', 'This section covers the tumor microenvironment.', 'Next section'])
    const result = highlightQuoteOnPage(page, 'tumor microenvironment', true)
    expect(result).toBe(true)
    expect(page.querySelectorAll('.quote-highlight')).toHaveLength(1)
  })

  it('bails out instead of guessing when a short quote is ambiguous', () => {
    const page = makePage(['See Results.', 'As shown in Results, the effect was significant.'])
    const result = highlightQuoteOnPage(page, 'Results', true)
    expect(result).toBe(false)
    expect(page.querySelectorAll('.quote-highlight')).toHaveLength(0)
  })

  it('still highlights the first match for a long quote that recurs verbatim', () => {
    const longPhrase = 'the observed reduction in tumor volume was statistically significant across all cohorts'
    const page = makePage([longPhrase, 'unrelated filler text', longPhrase])
    const result = highlightQuoteOnPage(page, longPhrase, true)
    expect(result).toBe(true)
    expect(page.querySelectorAll('.quote-highlight').length).toBeGreaterThan(0)
  })

  it('returns false when the quote is not present on the page at all', () => {
    const page = makePage(['Introduction', 'Some unrelated content.'])
    const result = highlightQuoteOnPage(page, 'nonexistent phrase', true)
    expect(result).toBe(false)
  })

  it('returns false when there is no text layer', () => {
    const wrapper = document.createElement('div')
    document.body.appendChild(wrapper)
    expect(highlightQuoteOnPage(wrapper, 'anything', true)).toBe(false)
  })
})
