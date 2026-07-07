/** Minimal full-screen image viewer: click an image to enlarge, click/Esc to close. */
export function openLightbox(src: string) {
  const overlay = document.createElement('div')
  overlay.className = 'cortex-lightbox'
  const img = document.createElement('img')
  img.src = src
  overlay.appendChild(img)
  const close = () => {
    overlay.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
  overlay.addEventListener('click', close)
  document.addEventListener('keydown', onKey)
  document.body.appendChild(overlay)
}
