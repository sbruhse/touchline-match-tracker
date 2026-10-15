const MAX_SAFE_RANK = BigInt(Number.MAX_SAFE_INTEGER)

/** Return a stable adult-size rank, or null when a label is not recognizable. */
export function getAdultSizeRank(value: unknown): bigint | null {
  if (typeof value !== 'string') return null
  const label = value.trim().toUpperCase()
  if (label === 'S') return 0n
  if (label === 'M') return 1n
  if (label === 'L') return 2n

  const repeatedX = /^(X+)(S|L)$/.exec(label)
  if (repeatedX) {
    const count = BigInt(repeatedX[1].length)
    return repeatedX[2] === 'S' ? -count : 2n + count
  }

  const numbered = /^([1-9]\d*)(XS|XL)$/.exec(label)
  if (!numbered) return null
  const count = BigInt(numbered[1])
  if (count > MAX_SAFE_RANK) return null
  return numbered[2] === 'XS' ? -count : 2n + count
}

/** Compare two adult size labels; null means at least one size is unknown. */
export function compareAdultSizeLabels(left: unknown, right: unknown): -1 | 0 | 1 | null {
  const leftRank = getAdultSizeRank(left)
  const rightRank = getAdultSizeRank(right)
  if (leftRank === null || rightRank === null) return null
  if (leftRank < rightRank) return -1
  if (leftRank > rightRank) return 1
  return 0
}

/** Automatic matching allows an exact fit or one adult size step larger. */
export function isAdultSizeExactOrOneLarger(playerSize: unknown, jerseySize: unknown): boolean {
  const playerRank = getAdultSizeRank(playerSize)
  const jerseyRank = getAdultSizeRank(jerseySize)
  if (playerRank === null || jerseyRank === null) return false
  const difference = jerseyRank - playerRank
  return difference === 0n || difference === 1n
}
