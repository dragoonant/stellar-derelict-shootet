// The Flux-generated surfaces (tools/gen-textures.sh). Loaded once at startup with the models; anything that fails to
// load is simply absent and the flat colour it would have covered stays, with one console warning.
import { MirroredRepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three'

export const TEXTURE_NAMES = ['ground', 'rock', 'chitin', 'shell', 'flesh', 'plate', 'metal', 'sky'] as const
export type TexName = (typeof TEXTURE_NAMES)[number]

/** Filled as textures arrive; materials made later read from it. */
export const TEX: Partial<Record<TexName, Texture>> = {}

export async function loadTextures(base: string, onEach: () => void): Promise<void> {
  const loader = new TextureLoader()
  await Promise.all(
    TEXTURE_NAMES.map(async (name) => {
      try {
        const t = await loader.loadAsync(`${base}assets/tex/${name}.jpg`)
        t.colorSpace = SRGBColorSpace
        // mirrored repeat tiles any image without a seam
        t.wrapS = t.wrapT = MirroredRepeatWrapping
        t.anisotropy = 4
        TEX[name] = t
      } catch {
        console.warn(`Bug Front: texture "${name}" did not load; using flat colour.`)
      }
      onEach()
    }),
  )
}

/** A copy of a texture with its own repeat (the image is shared). */
export function tiled(name: TexName, rx: number, ry = rx): Texture | null {
  const t = TEX[name]
  if (!t) return null
  const c = t.clone()
  c.repeat.set(rx, ry)
  c.needsUpdate = true
  return c
}
