export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8
}

export function validateCredentials(
  email: string,
  password: string,
  { requirePassword = true } = {},
): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!isValidEmail(email)) {
    fields.email = 'Enter a valid email address'
  }
  if (requirePassword && !isValidPassword(password)) {
    fields.password = 'Password must be at least 8 characters'
  }
  return fields
}