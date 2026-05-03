export const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined'

export function ready(fn: () => void): void {
  if (!isBrowser) return
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true })
  } else {
    fn()
  }
}
