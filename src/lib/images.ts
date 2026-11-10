import { apiUpload } from './api'

/** Shrinks a photo so several fit in the phone's local storage. */
export async function compressImage(file: File, maxSide = 900, quality = 0.72): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.')
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('No pudimos leer la imagen.'))
      el.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Sube al servidor las fotos nuevas (las que siguen como `data:` URL) y devuelve todas las
 * URLs en el mismo orden. Las que ya son http(s) se conservan tal cual.
 */
export async function uploadImages(images: string[]): Promise<string[]> {
  const pending = images.filter((src) => src.startsWith('data:'))
  if (!pending.length) return images
  const form = new FormData()
  for (const [i, src] of pending.entries()) {
    const blob = await (await fetch(src)).blob()
    form.append('files', blob, `foto-${i + 1}.${blob.type === 'image/png' ? 'png' : 'jpg'}`)
  }
  const { urls } = await apiUpload<{ urls: string[] }>('/uploads', form)
  let next = 0
  return images.map((src) => (src.startsWith('data:') ? urls[next++] : src))
}
