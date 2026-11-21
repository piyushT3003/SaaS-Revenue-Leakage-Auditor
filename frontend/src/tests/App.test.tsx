import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CategoryPill, Delta, Pill } from '@/components/ui'
import { inr, inrCompact, pct, titleCase } from '@/lib/format'

describe('money formatting (display only — values come from the API as exact decimal strings)', () => {
  it('uses Indian digit grouping', () => {
    expect(inr('12480000')).toBe('₹1,24,80,000')
    expect(inr('-60000.00')).toBe('-₹60,000')
    expect(inr('15205', { sign: true })).toBe('+₹15,205')
    expect(inr(null)).toBe('—')
  })
  it('compacts for chart axes', () => {
    expect(inrCompact(12480000)).toBe('₹1.2Cr')
    expect(inrCompact(876000)).toBe('₹8.8L')
  })
  it('formats percentages and labels', () => {
    expect(pct('32.6')).toBe('32.6%')
    expect(pct(null)).toBe('—')
    expect(titleCase('MID_MARKET')).toBe('Mid-Market')
    expect(titleCase('PARTIALLY_MATCHED')).toBe('Partially Matched')
  })
})

describe('status components', () => {
  it('renders status and category pills', () => {
    render(<><Pill value="IN_PROGRESS" /><CategoryPill value="PRICING_MISMATCH" label="Pricing Mismatch" /></>)
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Pricing Mismatch')).toBeInTheDocument()
  })
  it('shows a favourable delta in green and an unfavourable one when inverted', () => {
    const { rerender } = render(<Delta value="6.8" type="pct" />)
    expect(screen.getByText('+6.8%').className).toContain('accent-green')
    rerender(<Delta value="12.4" type="pct" invert />)
    expect(screen.getByText('+12.4%').className).toContain('accent-red')
  })
})
