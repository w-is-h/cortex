export type Theme = 'light' | 'dark'

const KEY = 'cortex.theme'

/** Stored preference, defaulting to dark (cortex's original look). */
export function getTheme(): Theme {
  return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  root.style.background = theme === 'dark' ? '#0b0c0f' : '#f5f6f8'
}

export function setTheme(theme: Theme) {
  localStorage.setItem(KEY, theme)
  applyTheme(theme)
}
