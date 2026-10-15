export function parseJerseyNumberDraft(value: string): number {
  const digits = value.trim()
  if (!/^\d+$/.test(digits)) throw new Error('Enter a whole number using digits 0–9.')
  const number = Number(digits)
  if (!Number.isSafeInteger(number)) throw new Error('Enter a whole number within the supported range.')
  return number
}
