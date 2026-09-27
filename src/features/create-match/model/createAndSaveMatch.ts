import { createMatch, type MatchStore } from '../../../entities/match'

export async function createAndSaveMatch(
  homeTeam: string,
  awayTeam: string,
  store: Pick<MatchStore, 'persist'>,
): Promise<string> {
  const match = createMatch(homeTeam, awayTeam)
  await store.persist(match)
  return match.id
}
