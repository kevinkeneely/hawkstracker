import html2canvas from 'html2canvas'

// Properties we inline on SVG elements before capture. CSS variables
// (var(--text), etc.) don't propagate through html2canvas's SVG
// serialization, so we bake in the computed values for a short moment.
const SVG_PROPS = [
  'fill', 'stroke', 'color', 'opacity', 'stroke-width',
  'stroke-dasharray', 'stroke-opacity', 'fill-opacity',
  'font-family', 'font-size', 'font-weight',
]

function inlineSvgStyles(root) {
  const saved = []
  for (const el of root.querySelectorAll('svg, svg *')) {
    const computed = window.getComputedStyle(el)
    saved.push({ el, originalStyle: el.getAttribute('style') })
    const parts = []
    for (const prop of SVG_PROPS) {
      const val = computed.getPropertyValue(prop)
      if (val && val !== 'none') parts.push(`${prop}: ${val}`)
    }
    const existing = el.getAttribute('style') || ''
    el.setAttribute('style', existing ? `${existing}; ${parts.join('; ')}` : parts.join('; '))
  }
  return saved
}

function restoreSvgStyles(saved) {
  for (const { el, originalStyle } of saved) {
    if (originalStyle == null) el.removeAttribute('style')
    else el.setAttribute('style', originalStyle)
  }
}

async function urlToDataUri(url) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`)
  const blob = await resp.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function downloadNodeAsPng(node, filename) {
  if (!node) return
  const svgImages = Array.from(node.querySelectorAll('image'))
  const originalHrefs = svgImages.map(img => img.getAttribute('href'))
  let savedStyles = null
  try {
    // Pre-fetch SVG image srcs as data URIs so no cross-origin requests
    // happen during capture.
    await Promise.all(svgImages.map(async (img, i) => {
      const src = originalHrefs[i]
      if (!src) return
      try {
        const dataUri = await urlToDataUri(src)
        img.setAttribute('href', dataUri)
      } catch (e) {
        console.warn('Could not inline SVG image:', src, e)
      }
    }))

    // Inline computed CSS onto every SVG element so colors/strokes survive
    // html2canvas's SVG → data-URI → image rendering pipeline.
    savedStyles = inlineSvgStyles(node)

    const canvas = await html2canvas(node, {
      backgroundColor: '#111216',
      scale: 2,
      useCORS: false,
      logging: false,
    })
    canvas.toBlob((blob) => {
      if (!blob) throw new Error('Canvas toBlob returned null')
      const link = document.createElement('a')
      link.download = filename.endsWith('.png') ? filename : `${filename}.png`
      link.href = URL.createObjectURL(blob)
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    })
  } catch (err) {
    console.error('Image download failed:', err)
    alert('Could not save image. Try taking a screenshot instead.')
  } finally {
    if (savedStyles) restoreSvgStyles(savedStyles)
    svgImages.forEach((img, i) => {
      if (originalHrefs[i] != null) img.setAttribute('href', originalHrefs[i])
    })
  }
}
