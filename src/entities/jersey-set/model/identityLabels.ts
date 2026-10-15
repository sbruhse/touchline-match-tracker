import type { Jersey, JerseySet } from './jerseySet'

interface StableIdentity {
  id: string
  title: string
}

function compactId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, '') || id
}

function suffixFor(item: StableIdentity, group: readonly StableIdentity[]): string {
  const compact = compactId(item.id)
  let length = Math.min(4, compact.length)
  while (length < compact.length && group.some((other) =>
    other.id !== item.id && compactId(other.id).slice(0, length).toLowerCase() === compact.slice(0, length).toLowerCase(),
  )) {
    length += 1
  }
  if (group.some((other) => other.id !== item.id && compactId(other.id) === compact)) return item.id
  return compact.slice(0, length)
}

function labelsFor(items: readonly StableIdentity[]): ReadonlyMap<string, string> {
  const groups = new Map<string, StableIdentity[]>()
  for (const item of items) groups.set(item.title, [...(groups.get(item.title) ?? []), item])

  const labels = new Map<string, string>()
  for (const group of groups.values()) {
    if (group.length === 1) {
      labels.set(group[0].id, group[0].title)
      continue
    }
    for (const item of group) labels.set(item.id, `${item.title} · ${suffixFor(item, group)}`)
  }
  return labels
}

export function createJerseySetIdentityLabels(sets: readonly Pick<JerseySet, 'id' | 'name'>[]): ReadonlyMap<string, string> {
  return labelsFor(sets.map(({ id, name }) => ({ id, title: name })))
}

export function createJerseyIdentityLabels(jerseys: readonly Pick<Jersey, 'id' | 'number' | 'size'>[]): ReadonlyMap<string, string> {
  return labelsFor(jerseys.map(({ id, number, size }) => ({ id, title: `Number ${number}, size ${size}` })))
}
