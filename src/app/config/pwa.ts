import {
  getPwaCacheNamespace,
  getPwaResourceUrl,
  PWA_PUBLIC_RESOURCES,
  PWA_RESOURCE_INVENTORY_FILE,
} from './pwaResources'

export const PWA_BASE_URL = import.meta.env.BASE_URL
export const PWA_CACHE_NAMESPACE = getPwaCacheNamespace(PWA_BASE_URL)
export const PWA_RESOURCE_INVENTORY_URL = getPwaResourceUrl(PWA_BASE_URL, PWA_RESOURCE_INVENTORY_FILE)
export const PWA_REQUIRED_RESOURCES = ['index.html', ...PWA_PUBLIC_RESOURCES] as const

export function getPwaResourceUrlForApp(resource: string): string {
  return getPwaResourceUrl(PWA_BASE_URL, resource)
}
