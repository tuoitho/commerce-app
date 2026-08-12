import { describe, expect, it } from 'vitest'

import { isValidEmail, isValidPassword, validateCredentials } from './validation'

describe('validateCredentials', () => {
  describe('email', () => {
    it('accepts a valid email', () => {
      expect(isValidEmail('user@example.com')).toBe(true)
    })
    it('rejects an invalid email', () => {
      expect(isValidEmail('not-an-email')).toBe(false)
      expect(isValidEmail('a@b')).toBe(false)
      expect(isValidEmail('')).toBe(false)
    })
  })

  describe('password', () => {
    it('accepts a password of 8 or more characters', () => {
      expect(isValidPassword('12345678')).toBe(true)
    })
    it('rejects a short password', () => {
      expect(isValidPassword('1234567')).toBe(false)
    })
  })

  it('returns field errors for invalid input', () => {
    const fields = validateCredentials('nope', 'short')
    expect(fields.email).toBeDefined()
    expect(fields.password).toBeDefined()
  })

  it('returns no errors for valid input', () => {
    const fields = validateCredentials('user@example.com', 'password123')
    expect(Object.keys(fields)).toHaveLength(0)
  })

  it('omits password check when requirePassword is false', () => {
    const fields = validateCredentials('user@example.com', '', { requirePassword: false })
    expect(fields.password).toBeUndefined()
    expect(fields.email).toBeUndefined()
  })
})