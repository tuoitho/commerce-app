import type { Location } from 'react-router-dom'

export function getInternalReturnPath(state: unknown): string {
  if (!state || typeof state !== 'object' || !('from' in state)) return '/'
  const from = state.from
  if (!from || typeof from !== 'object' || !('pathname' in from) || typeof from.pathname !== 'string') return '/'
  const search = 'search' in from ? from.search : ''
  const hash = 'hash' in from ? from.hash : ''
  if (
    !from.pathname.startsWith('/') ||
    from.pathname.startsWith('//') ||
    from.pathname.includes('\\') ||
    typeof search !== 'string' ||
    typeof hash !== 'string' ||
    (search !== '' && !search.startsWith('?')) ||
    (hash !== '' && !hash.startsWith('#'))
  ) return '/'

  const location = from as Pick<Location, 'pathname'>
  const candidate = `${location.pathname}${search}${hash}`
  try {
    if (new URL(candidate, window.location.origin).origin !== window.location.origin) return '/'
  } catch {
    return '/'
  }
  return candidate
}
