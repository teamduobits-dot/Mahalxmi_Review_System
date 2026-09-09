export async function compressImageFile(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const width = Math.max(1, Math.round(img.width * scale))
        const height = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        URL.revokeObjectURL(url)

        const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Could not process the image.'))
            const ext = mime === 'image/png' ? 'png' : 'jpg'
            resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${ext}`, { type: mime }))
          },
          mime,
          quality
        )
      } catch (error) {
        URL.revokeObjectURL(url)
        reject(error)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file does not look like a valid image.'))
    }

    img.src = url
  })
}

export async function inspectQrImage(file) {
  const fallback = await basicImageInfo(file)

  if ('BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      const bitmap = await createImageBitmap(file)
      const found = await detector.detect(bitmap)
      bitmap.close()
      if (found.length > 0) {
        return { ok: true, reason: '' }
      }
    } catch {
      // fallback below
    }
  }

  const squareish = fallback.width > 0 && fallback.height > 0
    ? Math.max(fallback.width, fallback.height) / Math.min(fallback.width, fallback.height) <= 1.25
    : false

  if (squareish) {
    return {
      ok: false,
      reason: 'We could not detect a QR code clearly. If this is really your UPI QR image, you can still continue.',
    }
  }

  return {
    ok: false,
    reason: 'This image does not look like a QR image. Please upload only your UPI QR image. You can still continue if you are sure.',
  }
}

function basicImageInfo(file) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ width: 0, height: 0 })
    }
    img.src = url
  })
}
