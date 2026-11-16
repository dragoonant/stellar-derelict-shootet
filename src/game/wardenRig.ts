// Makes a fixed-pose generated figure walk. The Stellar Derelict Wardens are single fused meshes with no skeleton, so
// this bakes the mesh into figure space (feet on y = 0, facing +z, a set height), drops the display base, and skins it
// to four bones by position alone: everything below the hips follows the left or right leg, the rest follows the torso.
// It is a puppet, not a character rig: enough for a walk, a lean into the aim and a recoil. A rigged, animated model
// from a GPU session replaces it (HANDOFF-GPU.md).
import { Bone, Box3, BufferAttribute, BufferGeometry, Group, Skeleton, SkinnedMesh, Vector3, type Material, type Mesh, type Object3D } from 'three'

export interface FigureProto {
  geometry: BufferGeometry
  material: Material | Material[]
  hipY: number
}

export interface Puppet {
  object: Group
  torso: Bone
  legL: Bone
  legR: Bone
}

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * Share of a vertex that follows the legs (0 above the hips, 1 below) and, of that, the share on the left leg.
 * `bootL` and `bootR` are where each boot stands: a vertex below the hips but away from the line from hip to boot is
 * a weapon or a hand held low, and stays with the torso.
 */
export function legWeights(x: number, y: number, z: number, hipY: number, bootL: { x: number; z: number }, bootR: { x: number; z: number }): { leg: number; left: number } {
  const left = smooth(-0.05, 0.05, x)
  const boot = x >= 0 ? bootL : bootR
  const t = Math.min(1, Math.max(0, 1 - y / hipY)) // 0 at the hip, 1 at the sole
  const ax = (x >= 0 ? HIP_X : -HIP_X) * (1 - t) + boot.x * t
  const az = boot.z * t
  const reach = 0.3 + 0.14 * t // boots are bigger than thighs
  const near = 1 - smooth(reach, reach + 0.1, Math.hypot(x - ax, z - az))
  return { leg: (1 - smooth(hipY - 0.14, hipY + 0.06, y)) * near, left }
}
const HIP_X = 0.2

export function bakeFigure(scene: Object3D, height: number): FigureProto {
  scene.getObjectByName('base')?.removeFromParent()
  scene.updateMatrixWorld(true)
  let mesh: Mesh | null = null
  scene.traverse((o) => {
    if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh
  })
  if (!mesh) throw new Error('no mesh in the figure')
  const src = mesh as Mesh
  const box = new Box3().setFromObject(src)
  const size = box.getSize(new Vector3())
  const centre = box.getCenter(new Vector3())
  const k = height / (size.y || 1)
  const pos = src.geometry.getAttribute('position')
  const nor = src.geometry.getAttribute('normal')
  const n = pos.count
  const P = new Float32Array(n * 3)
  const N = new Float32Array(n * 3)
  const index = new Uint16Array(n * 4)
  const weight = new Float32Array(n * 4)
  const hipY = height * 0.37 // "hips to soles about one head" of a 2.8-head figure
  const v = new Vector3()
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(src.matrixWorld)
    P.set([(v.x - centre.x) * k, (v.y - box.min.y) * k, (v.z - centre.z) * k], i * 3)
  }
  // where the boots stand: the middle of everything in the bottom tenth, each side
  const boots = [{ x: 0, z: 0, n: 0 }, { x: 0, z: 0, n: 0 }]
  for (let i = 0; i < n; i++) {
    if ((P[i * 3 + 1] as number) > height * 0.1) continue
    const b = boots[(P[i * 3] as number) >= 0 ? 0 : 1] as { x: number; z: number; n: number }
    b.x += P[i * 3] as number
    b.z += P[i * 3 + 2] as number
    b.n++
  }
  const [bootL, bootR] = boots.map((b, i) => (b.n > 0 ? { x: b.x / b.n, z: b.z / b.n } : { x: i === 0 ? HIP_X : -HIP_X, z: 0 })) as [{ x: number; z: number }, { x: number; z: number }]
  for (let i = 0; i < n; i++) {
    v.set(P[i * 3] as number, P[i * 3 + 1] as number, P[i * 3 + 2] as number)
    const w = legWeights(v.x, v.y, v.z, hipY, bootL, bootR)
    index.set([1, 2, 3, 0], i * 4)
    weight.set([1 - w.leg, w.leg * w.left, w.leg * (1 - w.left), 0], i * 4)
    if (nor) {
      v.fromBufferAttribute(nor, i).transformDirection(src.matrixWorld)
      N.set([v.x, v.y, v.z], i * 3)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(P, 3))
  if (nor) geometry.setAttribute('normal', new BufferAttribute(N, 3))
  const uv = src.geometry.getAttribute('uv')
  if (uv) geometry.setAttribute('uv', uv)
  geometry.setIndex(src.geometry.getIndex())
  geometry.setAttribute('skinIndex', new BufferAttribute(index, 4))
  geometry.setAttribute('skinWeight', new BufferAttribute(weight, 4))
  geometry.userData.shared = true
  geometry.computeBoundingSphere()
  return { geometry, material: src.material, hipY }
}

export function puppet(proto: FigureProto): Puppet {
  const root = new Bone()
  const torso = new Bone()
  const legL = new Bone()
  const legR = new Bone()
  torso.position.set(0, proto.hipY, 0)
  legL.position.set(HIP_X, proto.hipY, 0)
  legR.position.set(-HIP_X, proto.hipY, 0)
  root.add(torso, legL, legR)
  const mesh = new SkinnedMesh(proto.geometry, proto.material)
  mesh.add(root)
  mesh.updateMatrixWorld(true)
  mesh.bind(new Skeleton([root, torso, legL, legR]))
  mesh.frustumCulled = false
  const object = new Group()
  object.add(mesh)
  return { object, torso, legL, legR }
}
