import { describe, expect, it } from 'vitest'
import { layoutFor } from './GraphView'

describe('layoutFor', () => {
  it('produces a smaller node width for a narrow available width than a wide one', () => {
    const narrow = layoutFor(240, 'comfortable')
    const wide = layoutFor(900, 'comfortable')
    expect(narrow.nodeW).toBeLessThan(wide.nodeW)
  })

  it('compact density shrinks the node width further at the same available width', () => {
    const comfortable = layoutFor(500, 'comfortable')
    const compact = layoutFor(500, 'compact')
    expect(compact.nodeW).toBeLessThan(comfortable.nodeW)
  })

  it('clamps rather than shrinking indefinitely below the narrow floor', () => {
    const tiny = layoutFor(50, 'comfortable')
    const narrowFloor = layoutFor(260, 'comfortable')
    expect(tiny.nodeW).toBe(narrowFloor.nodeW)
  })

  it('clamps rather than growing indefinitely above the wide ceiling', () => {
    const huge = layoutFor(4000, 'comfortable')
    const wideCeiling = layoutFor(820, 'comfortable')
    expect(huge.nodeW).toBe(wideCeiling.nodeW)
  })

  it('derives height, gap, and radius proportionally so they stay consistent with node width', () => {
    const layout = layoutFor(500, 'comfortable')
    expect(layout.nodeH).toBeGreaterThan(0)
    expect(layout.gap).toBeGreaterThan(0)
    expect(layout.minRadius).toBeGreaterThan(0)
  })
})
