import { toPng } from 'html-to-image'

// Render a DOM node to PNG and trigger a browser download.
// Works on iOS Safari, mobile Chrome, and desktop.
export async function downloadNodeAsPng(node, filename) {
  if (!node) return
  try {
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      backgroundColor: '#111216', // matches app dark background
      cacheBust: true,
    })
    const link = document.createElement('a')
    link.download = filename.endsWith('.png') ? filename : `${filename}.png`
    link.href = dataUrl
    link.click()
  } catch (err) {
    console.error('Image download failed:', err)
    alert('Could not save image. Try taking a screenshot instead.')
  }
}
