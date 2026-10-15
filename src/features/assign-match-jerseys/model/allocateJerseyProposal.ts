import { getAdultSizeRank } from '../../../entities/jersey-set'

export interface JerseyAssignmentPlayer {
  id: string
  size: string | null
}

export interface JerseyAssignmentStock {
  id: string
  number: number
  size: string
  ownerPlayerId: string | null
}

export interface JerseyProposalRow {
  playerId: string
  jerseyId: string | null
  error: string | null
}

export interface JerseyProposalOptions {
  historicalNumbers?: ReadonlyMap<string, number>
  random?: () => number
  seed?: string | number
}

type OwnershipTier = 'private' | 'team'
type SizeTier = 'exact' | 'one-larger'

interface CandidateEdge {
  playerId: string
  number: number
  jerseys: JerseyAssignmentStock[]
  historyMatch: boolean
}

interface FlowEdge {
  to: number
  reverseIndex: number
  capacity: number
  initialCapacity: number
  cost: number
  assignment?: { playerId: string; number: number }
}

const MAX_RANDOM_COST = 1_000_000

function stableCompare(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function seededRandom(seed: string | number): () => number {
  const seedText = String(seed)
  let state = 2_166_136_261
  for (let index = 0; index < seedText.length; index += 1) {
    state = Math.imul(state ^ seedText.charCodeAt(index), 16_777_619)
  }
  let value = state >>> 0
  return () => {
    value = (value + 0x6D2B79F5) | 0
    let mixed = value
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

function boundedRandomCost(random: () => number): number {
  const value = random()
  const normalized = Number.isFinite(value) ? Math.max(0, Math.min(value, 0.999999999)) : 0.5
  return Math.floor(normalized * MAX_RANDOM_COST)
}

function edgeKey(playerId: string, number: number): string {
  return JSON.stringify([playerId, number])
}

function addFlowEdge(graph: FlowEdge[][], from: number, to: number, cost: number): FlowEdge {
  const forward: FlowEdge = {
    to,
    reverseIndex: graph[to].length,
    capacity: 1,
    initialCapacity: 1,
    cost,
  }
  const reverse: FlowEdge = {
    to: from,
    reverseIndex: graph[from].length,
    capacity: 0,
    initialCapacity: 0,
    cost: -cost,
  }
  graph[from].push(forward)
  graph[to].push(reverse)
  return forward
}

/** Find a minimum-cost maximum matching between players and unique back numbers. */
function minimumCostMaximumMatching(
  players: readonly JerseyAssignmentPlayer[],
  candidateEdges: readonly CandidateEdge[],
  edgeCosts: ReadonlyMap<string, number>,
): Map<string, number> {
  const playerIds = players.map(({ id }) => id).sort(stableCompare)
  const numbers = [...new Set(candidateEdges.map(({ number }) => number))].sort((a, b) => a - b)
  const source = 0
  const playerNode = new Map(playerIds.map((id, index) => [id, index + 1]))
  const numberOffset = playerIds.length + 1
  const numberNode = new Map(numbers.map((number, index) => [number, numberOffset + index]))
  const sink = numberOffset + numbers.length
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => [])

  for (const id of playerIds) addFlowEdge(graph, source, playerNode.get(id)!, 0)
  for (const number of numbers) addFlowEdge(graph, numberNode.get(number)!, sink, 0)

  const assignmentEdges: FlowEdge[] = []
  for (const edge of [...candidateEdges].sort((left, right) =>
    stableCompare(edgeKey(left.playerId, left.number), edgeKey(right.playerId, right.number)))) {
    assignmentEdges.push(addFlowEdge(
      graph,
      playerNode.get(edge.playerId)!,
      numberNode.get(edge.number)!,
      edgeCosts.get(edgeKey(edge.playerId, edge.number)) ?? 0,
    ))
    const addedEdge = assignmentEdges.at(-1)!
    addedEdge.assignment = { playerId: edge.playerId, number: edge.number }
  }

  while (true) {
    const distances = Array<number>(graph.length).fill(Number.POSITIVE_INFINITY)
    const previousNode = Array<number>(graph.length).fill(-1)
    const previousEdge = Array<number>(graph.length).fill(-1)
    distances[source] = 0

    for (let iteration = 0; iteration < graph.length - 1; iteration += 1) {
      let changed = false
      for (let from = 0; from < graph.length; from += 1) {
        if (!Number.isFinite(distances[from])) continue
        for (let edgeIndex = 0; edgeIndex < graph[from].length; edgeIndex += 1) {
          const edge = graph[from][edgeIndex]
          if (edge.capacity <= 0) continue
          const candidateDistance = distances[from] + edge.cost
          if (candidateDistance >= distances[edge.to]) continue
          distances[edge.to] = candidateDistance
          previousNode[edge.to] = from
          previousEdge[edge.to] = edgeIndex
          changed = true
        }
      }
      if (!changed) break
    }

    if (previousNode[sink] < 0) break
    for (let node = sink; node !== source; node = previousNode[node]) {
      const from = previousNode[node]
      const edge = graph[from][previousEdge[node]]
      edge.capacity -= 1
      graph[node][edge.reverseIndex].capacity += 1
    }
  }

  const assignments = new Map<string, number>()
  for (const edge of assignmentEdges) {
    if (edge.initialCapacity === 1 && edge.capacity === 0 && edge.assignment) {
      assignments.set(edge.assignment.playerId, edge.assignment.number)
    }
  }
  return assignments
}

function sizeDifference(playerSize: string | null, jerseySize: string): bigint | null {
  const playerRank = getAdultSizeRank(playerSize)
  const jerseyRank = getAdultSizeRank(jerseySize)
  return playerRank === null || jerseyRank === null ? null : jerseyRank - playerRank
}

function matchingTier(
  players: readonly JerseyAssignmentPlayer[],
  jerseys: readonly JerseyAssignmentStock[],
  tier: OwnershipTier,
  sizeTier: SizeTier,
  claimedNumbers: ReadonlySet<number>,
  history: ReadonlyMap<string, number>,
  random: () => number,
): Map<string, JerseyAssignmentStock> {
  const edgesByIdentity = new Map<string, CandidateEdge>()
  for (const player of players) {
    const eligible = jerseys.filter((jersey) => {
      if (claimedNumbers.has(jersey.number)) return false
      if (tier === 'private' && jersey.ownerPlayerId !== player.id) return false
      if (tier === 'team' && jersey.ownerPlayerId !== null) return false
      const difference = sizeDifference(player.size, jersey.size)
      return sizeTier === 'exact' ? difference === 0n : difference === 1n
    })
    const byNumber = new Map<number, JerseyAssignmentStock[]>()
    for (const jersey of eligible) {
      byNumber.set(jersey.number, [...(byNumber.get(jersey.number) ?? []), jersey])
    }
    for (const [number, matchingJerseys] of byNumber) {
      edgesByIdentity.set(edgeKey(player.id, number), {
        playerId: player.id,
        number,
        jerseys: matchingJerseys.sort((left, right) => stableCompare(left.id, right.id)),
        historyMatch: tier === 'team' && history.get(player.id) === number,
      })
    }
  }

  const edges = [...edgesByIdentity.values()].sort((left, right) =>
    stableCompare(edgeKey(left.playerId, left.number), edgeKey(right.playerId, right.number)))
  const edgeCosts = new Map<string, number>()
  const itemCosts = new Map<string, number>()
  for (const edge of edges) {
    edgeCosts.set(edgeKey(edge.playerId, edge.number), boundedRandomCost(random))
    for (const jersey of edge.jerseys) {
      itemCosts.set(JSON.stringify([edge.playerId, edge.number, jersey.id]), boundedRandomCost(random))
    }
  }

  const historyPenalty = (players.length + 1) * MAX_RANDOM_COST + 1
  const costs = new Map<string, number>()
  for (const edge of edges) {
    const lotteryCost = edgeCosts.get(edgeKey(edge.playerId, edge.number))!
    costs.set(edgeKey(edge.playerId, edge.number),
      lotteryCost + (tier === 'team' && history.has(edge.playerId) && !edge.historyMatch ? historyPenalty : 0))
  }

  const numbers = minimumCostMaximumMatching(players, edges, costs)
  const assigned = new Map<string, JerseyAssignmentStock>()
  for (const [playerId, number] of numbers) {
    const edge = edgesByIdentity.get(edgeKey(playerId, number))!
    const chosen = [...edge.jerseys].sort((left, right) => {
      const leftCost = itemCosts.get(JSON.stringify([playerId, number, left.id]))!
      const rightCost = itemCosts.get(JSON.stringify([playerId, number, right.id]))!
      return leftCost - rightCost || stableCompare(left.id, right.id)
    })[0]
    assigned.set(playerId, chosen)
  }
  return assigned
}

/** Build an automatic proposal through private/team, exact/larger priority rounds. */
export function allocateJerseyProposal(
  players: readonly JerseyAssignmentPlayer[],
  jerseys: readonly JerseyAssignmentStock[],
  options: JerseyProposalOptions = {},
): JerseyProposalRow[] {
  const playerIds = new Set<string>()
  for (const player of players) {
    if (!player.id.trim() || playerIds.has(player.id)) throw new Error('Proposal players need unique stable identities.')
    playerIds.add(player.id)
  }
  const jerseyIds = new Set<string>()
  for (const jersey of jerseys) {
    if (!jersey.id.trim() || jerseyIds.has(jersey.id)) throw new Error('Proposal jerseys need unique physical identities.')
    if (!Number.isSafeInteger(jersey.number) || jersey.number < 0) throw new Error('Proposal jersey numbers must be nonnegative whole numbers.')
    jerseyIds.add(jersey.id)
  }

  const random = options.random ?? (options.seed === undefined ? Math.random : seededRandom(options.seed))
  const history = options.historicalNumbers ?? new Map<string, number>()
  const assignments = new Map<string, JerseyAssignmentStock>()
  const claimedNumbers = new Set<number>()

  for (const [ownership, size] of [
    ['private', 'exact'],
    ['private', 'one-larger'],
    ['team', 'exact'],
    ['team', 'one-larger'],
  ] as const) {
    const remaining = players.filter(({ id }) => !assignments.has(id))
    const assigned = matchingTier(remaining, jerseys, ownership, size, claimedNumbers, history, random)
    for (const [playerId, jersey] of assigned) {
      assignments.set(playerId, jersey)
      claimedNumbers.add(jersey.number)
    }
  }

  return players.map((player) => {
    const jersey = assignments.get(player.id)
    if (jersey) return { playerId: player.id, jerseyId: jersey.id, error: null }
    return {
      playerId: player.id,
      jerseyId: null,
      error: getAdultSizeRank(player.size) === null
        ? 'Player size is missing or is not a recognized adult size.'
        : 'No eligible unclaimed jersey is available for this player.',
    }
  })
}
