export const PWA_MANIFEST_FILE = 'manifest.webmanifest'
export const PWA_RESOURCE_INVENTORY_FILE = 'pwa-assets.json'

export const PWA_PUBLIC_RESOURCES = [
  PWA_MANIFEST_FILE,
  PWA_RESOURCE_INVENTORY_FILE,
  'icons/touchline.svg',
  'icons/pwa-64x64.png',
  'icons/pwa-192x192.png',
  'icons/pwa-512x512.png',
  'icons/maskable-icon-512x512.png',
  'icons/apple-touch-icon-180x180.png',
  'icons/favicon.ico',
  'fonts/licenses/OFL-DM-Sans.txt',
  'fonts/licenses/OFL-DM-Mono.txt',
  'fonts/licenses/OFL-Space-Grotesk.txt',
] as const

export function normalizePwaBasePath(base: string): string {
  const path = base.startsWith('/') ? base : new URL(base, 'https://touchline.invalid').pathname
  const segments = path.split('/').filter(Boolean)
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`
}

export function getPwaCacheNamespace(base: string): string {
  const baseKey = normalizePwaBasePath(base).split('/').filter(Boolean).join('-') || 'root'
  return `touchline-${baseKey}`
}

export function getPwaResourceUrl(base: string, resource: string): string {
  return `${normalizePwaBasePath(base)}${resource.replace(/^\/+/, '')}`
}

export function isPathWithinPwaScope(path: string, base: string): boolean {
  const pathname = new URL(path, 'https://touchline.invalid').pathname
  const scope = normalizePwaBasePath(base)
  return pathname === scope.slice(0, -1) || pathname.startsWith(scope)
}
