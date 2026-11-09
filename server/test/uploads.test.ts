import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createImageStorage, detectImageMime } from '../src/integrations/images'
import { makeApp, registerAndVerify, resetDb, testConfig } from './helpers'

vi.spyOn(console, 'log').mockImplementation(() => {})

const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)])
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 2)])
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(50, 3)])
const pdf = Buffer.from('%PDF-1.4 esto no es una foto')

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'eco-uploads-'))

describe('detectImageMime', () => {
  it('reconoce JPEG, PNG y WebP por sus bytes y rechaza otros', () => {
    expect(detectImageMime(jpg)).toBe('image/jpeg')
    expect(detectImageMime(png)).toBe('image/png')
    expect(detectImageMime(webp)).toBe('image/webp')
    expect(detectImageMime(pdf)).toBeNull()
    expect(detectImageMime(Buffer.alloc(2))).toBeNull()
  })
})

describe('POST /api/uploads', () => {
  let dir: string
  let app: ReturnType<typeof makeApp>
  let token: string

  beforeEach(async () => {
    await resetDb()
    dir = tmpDir()
    app = makeApp({ uploadsDir: dir })
    token = (await registerAndVerify(app)).token
  })

  const upload = (files: { buffer: Buffer; name: string; type: string }[], auth = true) => {
    let req = request(app).post('/api/uploads')
    if (auth) req = req.set('Authorization', `Bearer ${token}`)
    for (const f of files) req = req.attach('files', f.buffer, { filename: f.name, contentType: f.type })
    return req
  }

  it('guarda fotos válidas y las sirve', async () => {
    const res = await upload([
      { buffer: jpg, name: 'a.jpg', type: 'image/jpeg' },
      { buffer: png, name: 'b.png', type: 'image/png' },
    ])
    expect(res.status).toBe(201)
    expect(res.body.urls).toHaveLength(2)
    for (const url of res.body.urls) expect(url).toMatch(/^http:\/\/localhost:3000\/uploads\/[\w-]+\.(jpg|png)$/)
    expect(fs.readdirSync(dir)).toHaveLength(2)
    const served = await request(app).get(new URL(res.body.urls[0]).pathname)
    expect(served.status).toBe(200)
    expect(Buffer.compare(served.body, jpg)).toBe(0)
  })

  it('rechaza un archivo que no es imagen aunque diga ser JPG', async () => {
    const res = await upload([
      { buffer: jpg, name: 'a.jpg', type: 'image/jpeg' },
      { buffer: pdf, name: 'foto.jpg', type: 'image/jpeg' },
    ])
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual({ code: 'INVALID_IMAGE', message: 'Solo se aceptan fotos JPG, PNG o WebP.' })
    expect(fs.readdirSync(dir)).toHaveLength(0)
  })

  it('rechaza fotos de más de 2 MB', async () => {
    const big = Buffer.concat([jpg, Buffer.alloc(2 * 1024 * 1024 + 1 - jpg.length)])
    const res = await upload([{ buffer: big, name: 'a.jpg', type: 'image/jpeg' }])
    expect(res.status).toBe(413)
    expect(res.body.error).toEqual({ code: 'FILE_TOO_LARGE', message: 'Cada foto puede pesar hasta 2 MB.' })
  })

  it('rechaza más de 5 fotos', async () => {
    const res = await upload(Array.from({ length: 6 }, (_, i) => ({ buffer: jpg, name: `${i}.jpg`, type: 'image/jpeg' })))
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual({ code: 'TOO_MANY_FILES', message: 'Puedes subir hasta 5 fotos.' })
  })

  it('exige al menos un archivo y sesión', async () => {
    expect((await request(app).post('/api/uploads').set('Authorization', `Bearer ${token}`)).body.error.code).toBe('VALIDATION')
    expect((await upload([{ buffer: jpg, name: 'a.jpg', type: 'image/jpeg' }], false)).status).toBe(401)
  })
})

describe('createImageStorage', () => {
  it('en modo local solo reconoce sus propias URLs', () => {
    const storage = createImageStorage(testConfig({ uploadsDir: tmpDir() }))
    expect(storage.mode).toBe('local')
    expect(storage.owns('http://localhost:3000/uploads/abc-123.jpg')).toBe(true)
    expect(storage.owns('http://localhost:3000/uploads/../.env')).toBe(false)
    expect(storage.owns('http://localhost:3000/uploads/a/b.jpg')).toBe(false)
    expect(storage.owns('https://evil.pe/uploads/a.jpg')).toBe(false)
  })

  it('en modo local borra el archivo de una URL propia', async () => {
    const dir = tmpDir()
    const storage = createImageStorage(testConfig({ uploadsDir: dir }))
    const url = await storage.save({ buffer: jpg, mime: 'image/jpeg' })
    expect(fs.readdirSync(dir)).toHaveLength(1)
    await storage.remove(url)
    await storage.remove('https://images.unsplash.com/photo-1')
    expect(fs.readdirSync(dir)).toHaveLength(0)
  })

  it('con CLOUDINARY_URL sube a la carpeta ecoestudiante', async () => {
    const calls: { folder?: string }[] = []
    const destroyed: string[] = []
    const cloudinary = {
      config: () => ({ cloud_name: 'demo' }),
      uploadBuffer: async (_buffer: Buffer, options: { folder: string }) => {
        calls.push(options)
        return { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/ecoestudiante/abc.jpg' }
      },
      destroy: async (publicId: string) => void destroyed.push(publicId),
    }
    const storage = createImageStorage(testConfig({ cloudinaryUrl: 'cloudinary://k:s@demo' }), { cloudinary })
    expect(storage.mode).toBe('cloudinary')
    const url = await storage.save({ buffer: jpg, mime: 'image/jpeg' })
    expect(calls[0].folder).toBe('ecoestudiante')
    expect(storage.owns(url)).toBe(true)
    expect(storage.owns('https://res.cloudinary.com/otro/image/upload/v1/ecoestudiante/x.jpg')).toBe(false)
    expect(storage.owns('https://res.cloudinary.com/demo/image/upload/v1/otra-carpeta/x.jpg')).toBe(false)
    await storage.remove(url)
    expect(destroyed).toEqual(['ecoestudiante/abc'])
  })
})
