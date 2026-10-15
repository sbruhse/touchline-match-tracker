export function parsePreferredNumberDraft(value: string): number | null {
  const digits = value.trim()
  if (!digits) return null
  if (!/^\d+$/.test(digits)) throw new Error('Enter a whole number using digits 0–9, or leave the field blank.')
  const number = Number(digits)
  if (!Number.isSafeInteger(number)) throw new Error('Enter a whole number within the supported range.')
  return number
}
