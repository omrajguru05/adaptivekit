const STORAGE_KEY = 'ak.sid'

function randomId(): string {
  const bytes = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0
  }
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, '0')
  }
  return out
}

export function resolveSessionId(explicit?: string): string {
  if (explicit) return explicit
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY)
    if (existing) return existing
    const fresh = randomId()
    sessionStorage.setItem(STORAGE_KEY, fresh)
    return fresh
  } catch {
    return randomId()
  }
}
