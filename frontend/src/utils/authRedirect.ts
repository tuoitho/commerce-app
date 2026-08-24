export interface LocalRouteContract {
  pathname: string
  search: string
  hash: string
}

declare const localAppPathBrand: unique symbol
export type LocalAppPathContract = string & { readonly [localAppPathBrand]: true }

export function isLocalAppPath(path: string): path is LocalAppPathContract {
  if (!path || typeof path !== 'string') return false
  // Must start with exactly one '/' and not '//' and not '/\'
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
    return false
  }
  return true
}

export function getSafeLoginReturn(encodedRedirect: string | null): LocalAppPathContract {
  if (!encodedRedirect || typeof encodedRedirect !== 'string') {
    return '/' as LocalAppPathContract
  }

  let decoded = encodedRedirect
  try {
    decoded = decodeURIComponent(encodedRedirect)
  } catch {
    return '/' as LocalAppPathContract
  }

  if (isLocalAppPath(decoded)) {
    return decoded
  }

  return '/' as LocalAppPathContract
}

export function createFavoriteLoginRedirect(route: LocalRouteContract): `/login?redirect=${string}` {
  const pathname = route.pathname || '/'
  const search = route.search || ''
  const hash = route.hash || ''
  const fullPath = `${pathname}${search}${hash}`
  const validPath = isLocalAppPath(fullPath) ? fullPath : '/'
  return `/login?redirect=${encodeURIComponent(validPath)}`
}
