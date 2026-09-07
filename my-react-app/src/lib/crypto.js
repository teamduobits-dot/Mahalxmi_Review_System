// Lightweight perceptual-ish image hash for duplicate-screenshot detection.
// Pure JS (no WASM) — downsamples the image to 8x8 grayscale and compares
// signatures with a Hamming-like distance. Good enough to flag the exact
// same screenshot being reused; never used to auto-reject.

export async function imageHash(blobOrFile) {
  try {
    const url = URL.createObjectURL(blobOrFile)
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Could not decode image'))
      i.src = url
    })
    const size = 8
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, size, size)
    URL.revokeObjectURL(url)
    const { data } = ctx.getImageData(0, 0, size, size)
    const grays = []
    let sum = 0
    for (let p = 0; p < size * size; p++) {
      const g = Math.round(
        0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2]
      )
      grays.push(g)
      sum += g
    }
    const avg = sum / grays.length
    let hash = ''
    for (const g of grays) hash += g >= avg ? '1' : '0'
    return hash
  } catch {
    return null
  }
}

export function hashDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 1
  let diff = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++
  return diff / a.length
}
