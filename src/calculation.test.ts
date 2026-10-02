import { describe, expect, it } from 'vitest'
import {
  calculateBill,
  getTemperatureFactor,
  type CalculationResult,
  type CalculationSuccess,
  type ResidentInput,
} from './calculation'

const resident = (overrides: Partial<ResidentInput> = {}): ResidentInput => ({
  id: 'resident',
  name: '住戶',
  temperature: 26,
  hoursPerDay: 1,
  eco: false,
  ...overrides,
})

function success(result: CalculationResult): CalculationSuccess {
  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result
}

describe('temperature factors', () => {
  it('uses 26°C as the baseline and changes by 0.08 per degree', () => {
    expect(getTemperatureFactor(26)).toBe(1)
    expect(getTemperatureFactor(24)).toBeCloseTo(1.16)
    expect(getTemperatureFactor(21)).toBeCloseTo(1.4)
  })

  it('clamps the factor between 0.8 and 1.5', () => {
    expect(getTemperatureFactor(-10)).toBe(1.5)
    expect(getTemperatureFactor(40)).toBe(0.8)
    expect(getTemperatureFactor(Number.NaN)).toBeNaN()
  })
})

describe('calculateBill', () => {
  it('calculates the example and allocates the variable bill exactly', () => {
    const result = success(
      calculateBill({
        totalBill: 7733,
        baseFee: 600,
        residents: [
          resident({ id: 'a', name: 'A', temperature: 24, hoursPerDay: 14 }),
          resident({ id: 'b', name: 'B', temperature: 21, hoursPerDay: 10 }),
          resident({ id: 'c', name: 'C', temperature: 24, hoursPerDay: 4 }),
          resident({ id: 'd', name: 'D', temperature: 26, hoursPerDay: 8, eco: true }),
        ],
      }),
    )

    expect(result.residents.map((item) => item.airconFee)).toEqual([2078, 1791, 594, 870])
    expect(result.residents.map((item) => item.totalFee)).toEqual([2678, 2391, 1194, 1470])
    expect(result.residents.reduce((sum, item) => sum + item.totalFee, 0)).toBe(7733)
    expect(result.residents.reduce((sum, item) => sum + item.airconFee, 0)).toBe(5333)
  })

  it('keeps an extreme safe-integer bill exact during allocation', () => {
    const totalBill = 9007199254740857
    const result = success(
      calculateBill({
        totalBill,
        baseFee: 0,
        residents: [
          resident({ id: 'a', name: 'A', temperature: 16, hoursPerDay: 13.5 }),
          resident({ id: 'b', name: 'B', temperature: 23, hoursPerDay: 19, eco: true }),
          resident({ id: 'c', name: 'C', temperature: 30, hoursPerDay: 0 }),
          resident({ id: 'd', name: 'D', temperature: 20, hoursPerDay: 5.5 }),
        ],
      }),
    )

    const allocated = result.residents.reduce((sum, item) => sum + BigInt(item.airconFee), 0n)
    expect(allocated).toBe(BigInt(totalBill))
    expect(result.residents.every((item) => Number.isSafeInteger(item.airconFee))).toBe(true)
  })

  it('supports scientific-notation weights without losing the bill remainder', () => {
    const result = success(
      calculateBill({
        totalBill: 7,
        baseFee: 0,
        residents: [
          resident({ id: 'small', name: '小權重', hoursPerDay: 1e-7 }),
          resident({ id: 'larger', name: '較大權重', hoursPerDay: 2e-7 }),
        ],
      }),
    )

    expect(result.residents.map((item) => item.airconFee)).toEqual([2, 5])
    expect(result.residents.reduce((sum, item) => sum + item.airconFee, 0)).toBe(7)
  })

  it('uses input order to break equal largest remainders', () => {
    const result = success(
      calculateBill({
        totalBill: 5,
        baseFee: 0,
        residents: [
          resident({ id: 'first', name: '先', hoursPerDay: 1 }),
          resident({ id: 'second', name: '後', hoursPerDay: 1 }),
          resident({ id: 'third', name: '再後', hoursPerDay: 1 }),
        ],
      }),
    )

    expect(result.residents.map((item) => item.airconFee)).toEqual([2, 2, 1])
  })

  it('applies the eco factor to the weight', () => {
    const result = success(
      calculateBill({
        totalBill: 100,
        baseFee: 0,
        residents: [resident({ id: 'eco', name: '省電', eco: true })],
      }),
    )

    expect(result.residents[0].modeFactor).toBe(0.85)
    expect(result.residents[0].weight).toBeCloseTo(0.85)
    expect(result.residents[0].sharePercent).toBe(100)
    expect(result.residents[0].airconFee).toBe(100)
  })

  it('reports invalid or impossible inputs without producing results', () => {
    expect(
      calculateBill({ totalBill: 100, baseFee: 0, residents: [] }),
    ).toMatchObject({ ok: false, error: { code: 'NO_RESIDENTS' } })
    expect(
      calculateBill({ totalBill: 100, baseFee: 60, residents: [resident(), resident({ id: 'two' })] }),
    ).toMatchObject({ ok: false, error: { code: 'TOTAL_TOO_SMALL' } })
    expect(
      calculateBill({ totalBill: 100, baseFee: 0, residents: [resident({ hoursPerDay: 0 })] }),
    ).toMatchObject({ ok: false, error: { code: 'NO_USAGE_WEIGHT' } })
    expect(
      calculateBill({ totalBill: 100, baseFee: 0, residents: [resident({ hoursPerDay: 25 })] }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_RESIDENT' } })
  })

  it('allows zero variable cost with zero weights and assigns zero percent', () => {
    const result = success(
      calculateBill({
        totalBill: 1200,
        baseFee: 600,
        residents: [
          resident({ id: 'one', name: '一', hoursPerDay: 0 }),
          resident({ id: 'two', name: '二', hoursPerDay: 0 }),
        ],
      }),
    )

    expect(result.variableBill).toBe(0)
    expect(result.residents.map((item) => item.sharePercent)).toEqual([0, 0])
    expect(result.residents.map((item) => item.totalFee)).toEqual([600, 600])
  })
})
