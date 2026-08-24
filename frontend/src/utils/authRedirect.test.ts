import { describe, it, expect } from 'vitest'
import {
  isLocalAppPath,
  getSafeLoginReturn,
  createFavoriteLoginRedirect,
} from './authRedirect'

describe('authRedirect helpers', () => {
  describe('isLocalAppPath', () => {
    it('accepts valid local application paths', () => {
      expect(isLocalAppPath('/')).toBe(true)
      expect(isLocalAppPath('/products')).toBe(true)
      expect(isLocalAppPath('/products?q=phone#results')).toBe(true)
      expect(isLocalAppPath('/favorites')).toBe(true)
    })

    it('rejects external URLs, protocol-relative, slash-backslash, and non-slash paths', () => {
      expect(isLocalAppPath('')).toBe(false)
      expect(isLocalAppPath('https://evil.example')).toBe(false)
      expect(isLocalAppPath('http://evil.example/login')).toBe(false)
      expect(isLocalAppPath('//evil.example')).toBe(false)
      expect(isLocalAppPath('/\\evil.example')).toBe(false)
      expect(isLocalAppPath('products')).toBe(false)
    })
  })

  describe('createFavoriteLoginRedirect (FAVORITE-AUTH-REDIRECT-001)', () => {
    it('constructs /login?redirect=<encoded> for valid local route', () => {
      const redirectUrl = createFavoriteLoginRedirect({
        pathname: '/products',
        search: '?q=phone',
        hash: '#results',
      })
      expect(redirectUrl).toBe('/login?redirect=%2Fproducts%3Fq%3Dphone%23results')
    })

    it('defaults empty route to /', () => {
      const redirectUrl = createFavoriteLoginRedirect({
        pathname: '',
        search: '',
        hash: '',
      })
      expect(redirectUrl).toBe('/login?redirect=%2F')
    })
  })

  describe('getSafeLoginReturn (FAVORITE-AUTH-REDIRECT-004)', () => {
    it('returns decoded local path when given valid encoded path', () => {
      expect(getSafeLoginReturn('%2Fproducts%3Fq%3Dphone%23results')).toBe(
        '/products?q=phone#results'
      )
      expect(getSafeLoginReturn('/favorites')).toBe('/favorites')
      expect(getSafeLoginReturn('%2Ffavorites')).toBe('/favorites')
    })

    it('falls back to / for empty, external, protocol-relative, slash-backslash, or malformed encodings', () => {
      expect(getSafeLoginReturn(null)).toBe('/')
      expect(getSafeLoginReturn('')).toBe('/')
      expect(getSafeLoginReturn('https://evil.example')).toBe('/')
      expect(getSafeLoginReturn('//evil.example')).toBe('/')
      expect(getSafeLoginReturn('/\\evil.example')).toBe('/')
      expect(getSafeLoginReturn('%2F%5Cevil.example')).toBe('/')
      expect(getSafeLoginReturn('%E0%A4%A')).toBe('/')
    })
  })
})
