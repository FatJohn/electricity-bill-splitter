export const BASE_TEMPERATURE = 26
export const TEMPERATURE_RATE = 0.08
export const MIN_TEMPERATURE_FACTOR = 0.8
export const MAX_TEMPERATURE_FACTOR = 1.5
export const ECO_MODE_FACTOR = 0.85
export const MIN_INPUT_TEMPERATURE = 16
export const MAX_INPUT_TEMPERATURE = 32
export const MAX_DAILY_HOURS = 24

export type ResidentInput = {
  id: string
  name: string
  temperature: number
  hoursPerDay: number
  eco: boolean
}

export type ResidentResult = ResidentInput & {
  temperatureFactor: number
  modeFactor: number
  weight: number
  sharePercent: number
  baseFee: number
  airconFee: number
  totalFee: number
}

export type CalculationErrorCode =
  | 'NO_RESIDENTS'
  | 'INVALID_MONEY'
  | 'BASE_TOTAL_TOO_LARGE'
  | 'TOTAL_TOO_SMALL'
  | 'INVALID_RESIDENT'
  | 'NO_USAGE_WEIGHT'

export type CalculationError = {
  code: CalculationErrorCode
  message: string
}

export type CalculationSuccess = {
  ok: true
  totalBill: number
  baseFee: number
  baseTotal: number
  variableBill: number
  totalWeight: number
  residents: ResidentResult[]
}

export type CalculationResult =
  | CalculationSuccess
  | { ok: false; error: CalculationError }

export type BillInput = {
  totalBill: number
  baseFee: number
  residents: ResidentInput[]
}

export function getTemperatureFactor(temperature: number): number {
  if (!Number.isFinite(temperature)) {
    return Number.NaN
  }

  const factor = 1 + (BASE_TEMPERATURE - temperature) * TEMPERATURE_RATE
  return Math.min(MAX_TEMPERATURE_FACTOR, Math.max(MIN_TEMPERATURE_FACTOR, factor))
}

function isValidCurrency(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function error(code: CalculationErrorCode, message: string): CalculationResult {
  return { ok: false, error: { code, message } }
}

type DecimalParts = {
  coefficient: bigint
  scale: number
}

function parseDecimal(value: number): DecimalParts {
  const [mantissa, exponentText] = value.toString().toLowerCase().split('e')
  const exponent = exponentText ? Number(exponentText) : 0
  const [integerPart, fractionalPart = ''] = mantissa.split('.')
  const digits = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, '') || '0'
  const rawScale = fractionalPart.length - exponent

  if (rawScale < 0) {
    return {
      coefficient: BigInt(digits) * 10n ** BigInt(-rawScale),
      scale: 0,
    }
  }

  return { coefficient: BigInt(digits), scale: rawScale }
}

function allocateWithLargestRemainder(
  variableBill: number,
  weightedResidents: Array<{ index: number; weight: number }>,
): number[] {
  if (variableBill === 0) {
    return weightedResidents.map(() => 0)
  }

  const decimalWeights = weightedResidents.map(({ weight }) => parseDecimal(weight))
  const commonScale = decimalWeights.reduce(
    (largest, { scale }) => Math.max(largest, scale),
    0,
  )
  const scaledWeights = decimalWeights.map(({ coefficient, scale }) => (
    coefficient * 10n ** BigInt(commonScale - scale)
  ))
  const totalWeightUnits = scaledWeights.reduce((sum, weight) => sum + weight, 0n)
  const bill = BigInt(variableBill)

  const shares = weightedResidents.map(({ index }, position) => {
    const numerator = bill * scaledWeights[position]
    const floor = numerator / totalWeightUnits
    const remainder = numerator % totalWeightUnits
    return { index, position, floor, remainder }
  })

  let remaining = bill - shares.reduce((sum, { floor }) => sum + floor, 0n)

  const order = [...shares].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1
    }

    return left.index - right.index
  })

  if (remaining < 0n || remaining > BigInt(order.length)) {
    throw new Error('Largest remainder allocation invariant violated')
  }

  const remainingUnits = Number(remaining)
  const fees = shares.map(({ floor }) => Number(floor))
  for (let position = 0; position < remainingUnits; position += 1) {
    fees[order[position].position] += 1
  }

  return fees
}

export function calculateBill(input: BillInput): CalculationResult {
  if (input.residents.length === 0) {
    return error('NO_RESIDENTS', '請至少新增一位住戶，才能分攤電費。')
  }

  if (!isValidCurrency(input.totalBill) || !isValidCurrency(input.baseFee)) {
    return error('INVALID_MONEY', '總電費與基礎電費必須是 0 以上的整數金額。')
  }

  const baseTotal = input.baseFee * input.residents.length
  if (!Number.isSafeInteger(baseTotal)) {
    return error('BASE_TOTAL_TOO_LARGE', '住戶數量或基礎電費太大，超出可安全計算的金額範圍。')
  }

  const variableBill = input.totalBill - baseTotal
  if (variableBill < 0) {
    return error('TOTAL_TOO_SMALL', '總電費不足以支付所有人的基礎電費，請調整金額。')
  }

  const weightedResidents = input.residents.map((resident, index) => {
    if (resident.name.trim().length === 0) {
      return { index, resident, invalidMessage: '請填寫每位住戶的姓名。' }
    }

    if (
      !Number.isFinite(resident.temperature) ||
      resident.temperature < MIN_INPUT_TEMPERATURE ||
      resident.temperature > MAX_INPUT_TEMPERATURE
    ) {
      return {
        index,
        resident,
        invalidMessage: `溫度請填 ${MIN_INPUT_TEMPERATURE}°C 到 ${MAX_INPUT_TEMPERATURE}°C。`,
      }
    }

    if (
      !Number.isFinite(resident.hoursPerDay) ||
      resident.hoursPerDay < 0 ||
      resident.hoursPerDay > MAX_DAILY_HOURS
    ) {
      return {
        index,
        resident,
        invalidMessage: `每日使用時數請填 0 到 ${MAX_DAILY_HOURS} 小時。`,
      }
    }

    const temperatureFactor = getTemperatureFactor(resident.temperature)
    const modeFactor = resident.eco ? ECO_MODE_FACTOR : 1
    const weight = resident.hoursPerDay * temperatureFactor * modeFactor

    return { index, resident, temperatureFactor, modeFactor, weight }
  })

  const invalidResident = weightedResidents.find((item) => 'invalidMessage' in item)
  const invalidMessage = invalidResident && 'invalidMessage' in invalidResident
    ? invalidResident.invalidMessage
    : undefined
  if (typeof invalidMessage === 'string') {
    return error('INVALID_RESIDENT', invalidMessage)
  }

  const validWeightedResidents = weightedResidents as Array<{
    index: number
    resident: ResidentInput
    temperatureFactor: number
    modeFactor: number
    weight: number
  }>
  const totalWeight = validWeightedResidents.reduce((sum, item) => sum + item.weight, 0)

  if (!Number.isFinite(totalWeight) || totalWeight < 0) {
    return error('INVALID_RESIDENT', '住戶資料無法轉換成有效的冷氣權重。')
  }

  if (totalWeight === 0 && variableBill > 0) {
    return error('NO_USAGE_WEIGHT', '目前所有住戶的冷氣時數都是 0，無法分攤冷氣費。')
  }

  const airconFees = allocateWithLargestRemainder(
    variableBill,
    validWeightedResidents,
  )

  return {
    ok: true,
    totalBill: input.totalBill,
    baseFee: input.baseFee,
    baseTotal,
    variableBill,
    totalWeight,
    residents: validWeightedResidents.map((item, resultIndex) => ({
      ...item.resident,
      temperatureFactor: item.temperatureFactor,
      modeFactor: item.modeFactor,
      weight: item.weight,
      sharePercent: totalWeight === 0 ? 0 : (item.weight / totalWeight) * 100,
      baseFee: input.baseFee,
      airconFee: airconFees[resultIndex],
      totalFee: input.baseFee + airconFees[resultIndex],
    })),
  }
}
