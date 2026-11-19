export function isCompareTrayVisible(pathname: string, itemCount: number): boolean {
  return itemCount > 0 && pathname !== '/compare' && !pathname.startsWith('/live/')
}
