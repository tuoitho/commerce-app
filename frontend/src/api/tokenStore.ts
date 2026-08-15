let inMemoryAccessToken: string | null = null

export const tokenStore = {
  getToken(): string | null {
    return inMemoryAccessToken
  },
  setToken(token: string | null): void {
    inMemoryAccessToken = token
  },
  clearToken(): void {
    inMemoryAccessToken = null
  },
}
