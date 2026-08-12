const STORAGE_KEY = 'access_token'

let accessToken: string | null = localStorage.getItem(STORAGE_KEY)

export const tokenStore = {
  get(): string | null {
    return accessToken ?? localStorage.getItem(STORAGE_KEY)
  },
  set(token: string | null): void {
    accessToken = token
    if (token === null) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, token)
    }
  },
}