import * as THREE from 'three'

const TAU = Math.PI * 2

export const LOWPOLY_TREE_VINE_PARAMETER_DEFAULTS = Object.freeze({
  vineEnabled: false,
  vineCount: 6,
  vineDualAnchorCount: 3,
  vineSegments: 10,
  vineTubeSides: 4,
  vineBaseLength: 1.65,
  vineLengthVariation: 0.28,
  vineRadius: 0.06,
  vineTipRadius: 0.022,
  vineSlack: 1.08,
  vineGravity: 8.8,
  vineDrag: 0.978,
  vineWindStrength: 2.2,
  vineSolverHz: 60,
  vineSolverIterations: 5,
  vineBranchCount: 2,
  vineBranchLength: 0.32,
  vineBranchLengthVariation: 0.08,
  vineLeavesPerBranch: 2,
  vineLeafScale: 0.3,
  vineAnchorStride: 3,
  vineAnchorOffset: 1,
  vineSeed: 41,
  vineColorBase: 0x315a33,
  vineColorTip: 0x78973b,
  vineBranchColor: 0x45672f,
  vineLeafColorA: 0x4f944f,
  vineLeafColorB: 0x91b947,
})

function finite(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function bounded(value, fallback, min, max) {
  return Math.min(max, Math.max(min, finite(value, fallback)))
}

function integer(value, fallback, min, max) {
  return Math.round(bounded(value, fallback, min, max))
}

function color(value, fallback) {
  return integer(value, fallback, 0, 0xffffff)
}

function round4(value) {
  return Number(value.toFixed(4))
}

function deterministic01(seed, a, b = 0) {
  const value = Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719) * 43758.5453
  return value - Math.floor(value)
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function clonePoint(point) {
  return [finite(point?.[0], 0), finite(point?.[1], 0), finite(point?.[2], 0)]
}

export function normalizeLowpolyTreeVineParameters(params = {}) {
  const defaults = LOWPOLY_TREE_VINE_PARAMETER_DEFAULTS
  return {
    vineEnabled: params.vineEnabled === true,
    vineCount: integer(params.vineCount, defaults.vineCount, 0, 16),
    vineDualAnchorCount: integer(params.vineDualAnchorCount, defaults.vineDualAnchorCount, 0, 16),
    vineSegments: integer(params.vineSegments, defaults.vineSegments, 4, 24),
    vineTubeSides: integer(params.vineTubeSides, defaults.vineTubeSides, 3, 8),
    vineBaseLength: bounded(params.vineBaseLength, defaults.vineBaseLength, 0.35, 5),
    vineLengthVariation: bounded(params.vineLengthVariation, defaults.vineLengthVariation, 0, 0.75),
    vineRadius: bounded(params.vineRadius, defaults.vineRadius, 0.008, 0.2),
    vineTipRadius: bounded(params.vineTipRadius, defaults.vineTipRadius, 0.003, 0.12),
    vineSlack: bounded(params.vineSlack, defaults.vineSlack, 1, 1.8),
    vineGravity: bounded(params.vineGravity, defaults.vineGravity, 0, 24),
    vineDrag: bounded(params.vineDrag, defaults.vineDrag, 0.8, 0.999),
    vineWindStrength: bounded(params.vineWindStrength, defaults.vineWindStrength, 0, 8),
    vineSolverHz: integer(params.vineSolverHz, defaults.vineSolverHz, 30, 120),
    vineSolverIterations: integer(params.vineSolverIterations, defaults.vineSolverIterations, 1, 12),
    vineBranchCount: integer(params.vineBranchCount, defaults.vineBranchCount, 0, 6),
    vineBranchLength: bounded(params.vineBranchLength, defaults.vineBranchLength, 0.08, 0.8),
    vineBranchLengthVariation: bounded(params.vineBranchLengthVariation, defaults.vineBranchLengthVariation, 0, 0.4),
    vineLeavesPerBranch: integer(params.vineLeavesPerBranch, defaults.vineLeavesPerBranch, 0, 5),
    vineLeafScale: bounded(params.vineLeafScale, defaults.vineLeafScale, 0.08, 0.7),
    vineAnchorStride: integer(params.vineAnchorStride, defaults.vineAnchorStride, 1, 11),
    vineAnchorOffset: integer(params.vineAnchorOffset, defaults.vineAnchorOffset, 0, 15),
    vineSeed: integer(params.vineSeed, defaults.vineSeed, 0, 9999),
    vineColorBase: color(params.vineColorBase, defaults.vineColorBase),
    vineColorTip: color(params.vineColorTip, defaults.vineColorTip),
    vineBranchColor: color(params.vineBranchColor, defaults.vineBranchColor),
    vineLeafColorA: color(params.vineLeafColorA, defaults.vineLeafColorA),
    vineLeafColorB: color(params.vineLeafColorB, defaults.vineLeafColorB),
  }
}

function collectTreeAnchors(treeRecipe) {
  const anchors = []
  for (let index = 0; index < (treeRecipe.secondaryBranches || []).length; index++) {
    const point = treeRecipe.secondaryBranches[index]?.points?.at(-1)
    if (point) anchors.push({ level: 'secondary', index, position: clonePoint(point) })
  }
  for (let index = 0; index < (treeRecipe.branches || []).length; index++) {
    const point = treeRecipe.branches[index]?.points?.at(-1)
    if (point) anchors.push({ level: 'primary', index, position: clonePoint(point) })
  }
  const trunkTip = treeRecipe.points?.at(-1)
  if (trunkTip) anchors.push({ level: 'trunk', index: Math.max(0, treeRecipe.points.length - 1), position: clonePoint(trunkTip) })
  return anchors
}

export function createLowpolyTreeVineRecipe(treeRecipe = {}, params = treeRecipe.params || {}) {
  const resolved = normalizeLowpolyTreeVineParameters(params)
  const anchors = collectTreeAnchors(treeRecipe)
  const enabled = resolved.vineEnabled && resolved.vineCount > 0 && anchors.length > 0
  const count = enabled ? resolved.vineCount : 0
  const dualCount = Math.min(count, resolved.vineDualAnchorCount)
  const vines = []

  for (let index = 0; index < count; index++) {
    const startIndex = (resolved.vineAnchorOffset + index * resolved.vineAnchorStride) % anchors.length
    let endIndex = (startIndex + Math.max(1, Math.floor(anchors.length * 0.5)) + index) % anchors.length
    if (endIndex === startIndex && anchors.length > 1) endIndex = (endIndex + 1) % anchors.length
    const dualAnchored = index < dualCount && anchors.length > 1
    const start = anchors[startIndex]
    const end = dualAnchored ? anchors[endIndex] : null
    const variation = 1 + (deterministic01(resolved.vineSeed, index, 1) * 2 - 1) * resolved.vineLengthVariation
    const requestedLength = resolved.vineBaseLength * variation
    const length = end
      ? Math.max(requestedLength, distance(start.position, end.position) * resolved.vineSlack)
      : requestedLength
    const branchlets = []
    for (let branchIndex = 0; branchIndex < resolved.vineBranchCount; branchIndex++) {
      const t = (branchIndex + 1) / (resolved.vineBranchCount + 1)
      const branchVariation = 1 + (deterministic01(resolved.vineSeed, index, branchIndex + 7) * 2 - 1)
        * resolved.vineBranchLengthVariation
      branchlets.push({
        t: round4(0.16 + t * 0.72),
        side: (index + branchIndex) % 2 === 0 ? 1 : -1,
        length: round4(resolved.vineBranchLength * branchVariation),
        phase: round4(deterministic01(resolved.vineSeed, index, branchIndex + 19) * TAU),
        leafCount: resolved.vineLeavesPerBranch,
      })
    }
    vines.push({
      id: `vine-${String(index + 1).padStart(2, '0')}`,
      index,
      start,
      end,
      length: round4(length),
      radiusScale: round4(0.82 + deterministic01(resolved.vineSeed, index, 3) * 0.24),
      twist: round4(deterministic01(resolved.vineSeed, index, 5) * TAU),
      phase: round4(deterministic01(resolved.vineSeed, index, 9) * TAU),
      branchlets,
    })
  }

  return {
    version: 1,
    enabled,
    params: resolved,
    palette: {
      base: resolved.vineColorBase,
      tip: resolved.vineColorTip,
      branch: resolved.vineBranchColor,
      leafA: resolved.vineLeafColorA,
      leafB: resolved.vineLeafColorB,
    },
    vines,
  }
}

function sampleStaticVine(vine, segments) {
  const points = []
  const start = new THREE.Vector3().fromArray(vine.start.position)
  const end = vine.end ? new THREE.Vector3().fromArray(vine.end.position) : null
  const anchorDistance = end ? start.distanceTo(end) : 0
  const sag = end ? Math.max(0.12, (vine.length - anchorDistance) * 0.66 + 0.08) : 0
  for (let index = 0; index <= segments; index++) {
    const t = index / segments
    const arc = Math.sin(Math.PI * t)
    const curl = arc * 0.1
    if (end) {
      points.push(start.clone().lerp(end, t).add(new THREE.Vector3(
        Math.cos(vine.phase) * curl,
        -arc * sag,
        Math.sin(vine.phase) * curl,
      )))
    } else {
      points.push(start.clone().add(new THREE.Vector3(
        Math.cos(vine.phase + t * 2.1) * curl,
        -vine.length * t,
        Math.sin(vine.phase + t * 2.1) * curl,
      )))
    }
  }
  return points
}

function vineFrame(points, index, tangent, side, binormal) {
  const previous = points[Math.max(0, index - 1)]
  const next = points[Math.min(points.length - 1, index + 1)]
  tangent.copy(next).sub(previous).normalize()
  const reference = Math.abs(tangent.y) > 0.92
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0)
  side.crossVectors(tangent, reference).normalize()
  binormal.crossVectors(side, tangent).normalize()
}

export function buildLowpolyTreeVineGeometry(vineRecipe) {
  const system = vineRecipe?.vines ? vineRecipe : { enabled: false, vines: [], params: normalizeLowpolyTreeVineParameters() }
  const params = system.params || normalizeLowpolyTreeVineParameters()
  const positions = []
  const normals = []
  const colors = []
  const indices = []
  const baseColor = new THREE.Color(system.palette?.base ?? params.vineColorBase)
  const tipColor = new THREE.Color(system.palette?.tip ?? params.vineColorTip)
  const branchColor = new THREE.Color(system.palette?.branch ?? params.vineBranchColor)
  const leafA = new THREE.Color(system.palette?.leafA ?? params.vineLeafColorA)
  const leafB = new THREE.Color(system.palette?.leafB ?? params.vineLeafColorB)
  const colorScratch = new THREE.Color()
  const tangent = new THREE.Vector3()
  const side = new THREE.Vector3()
  const binormal = new THREE.Vector3()
  const radial = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const center = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const staticPaths = []

  function vertex(point, normal, vertexColor) {
    const index = positions.length / 3
    positions.push(point.x, point.y, point.z)
    normals.push(normal.x, normal.y, normal.z)
    colors.push(vertexColor.r, vertexColor.g, vertexColor.b)
    return index
  }

  for (const vine of system.vines || []) {
    const path = sampleStaticVine(vine, params.vineSegments)
    staticPaths.push(path)
    const firstVertex = positions.length / 3
    for (let ring = 0; ring < path.length; ring++) {
      const t = ring / Math.max(1, path.length - 1)
      vineFrame(path, ring, tangent, side, binormal)
      colorScratch.copy(baseColor).lerp(tipColor, t * 0.72)
      const radius = THREE.MathUtils.lerp(params.vineRadius, params.vineTipRadius, Math.pow(t, 1.08)) * vine.radiusScale
      for (let sideIndex = 0; sideIndex < params.vineTubeSides; sideIndex++) {
        const angle = sideIndex / params.vineTubeSides * TAU + vine.twist + ring * 0.11
        radial.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle))
        vertex(center.copy(path[ring]).addScaledVector(radial, radius), radial, colorScratch)
      }
    }
    for (let segment = 0; segment < path.length - 1; segment++) {
      const ringA = firstVertex + segment * params.vineTubeSides
      const ringB = ringA + params.vineTubeSides
      for (let sideIndex = 0; sideIndex < params.vineTubeSides; sideIndex++) {
        const next = (sideIndex + 1) % params.vineTubeSides
        indices.push(ringA + sideIndex, ringB + sideIndex, ringB + next)
        indices.push(ringA + sideIndex, ringB + next, ringA + next)
      }
    }
  }

  for (let vineIndex = 0; vineIndex < (system.vines || []).length; vineIndex++) {
    const vine = system.vines[vineIndex]
    const path = staticPaths[vineIndex]
    for (let branchIndex = 0; branchIndex < vine.branchlets.length; branchIndex++) {
      const branchlet = vine.branchlets[branchIndex]
      const pathIndex = Math.min(path.length - 2, Math.max(1, Math.round(branchlet.t * (path.length - 1))))
      vineFrame(path, pathIndex, tangent, side, binormal)
      const branchStart = path[pathIndex]
      direction.copy(side).multiplyScalar(branchlet.side * 0.82)
        .addScaledVector(binormal, Math.sin(branchlet.phase) * 0.32)
        .addScaledVector(tangent, 0.24)
        .addScaledVector(up, 0.14)
        .normalize()
      const branchEnd = center.copy(branchStart).addScaledVector(direction, branchlet.length).clone()
      const branchBase = positions.length / 3
      const branchSides = 3
      const branchRadius = params.vineRadius * 0.56
      for (let endIndex = 0; endIndex < 2; endIndex++) {
        const point = endIndex === 0 ? branchStart : branchEnd
        const radius = endIndex === 0 ? branchRadius : branchRadius * 0.18
        const reference = Math.abs(direction.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : up
        side.crossVectors(direction, reference).normalize()
        binormal.crossVectors(side, direction).normalize()
        for (let sideIndex = 0; sideIndex < branchSides; sideIndex++) {
          const angle = sideIndex / branchSides * TAU
          radial.copy(side).multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle))
          vertex(center.copy(point).addScaledVector(radial, radius), radial, branchColor)
        }
      }
      for (let sideIndex = 0; sideIndex < branchSides; sideIndex++) {
        const next = (sideIndex + 1) % branchSides
        indices.push(branchBase + sideIndex, branchBase + branchSides + sideIndex, branchBase + branchSides + next)
        indices.push(branchBase + sideIndex, branchBase + branchSides + next, branchBase + next)
      }

      for (let leafIndex = 0; leafIndex < branchlet.leafCount; leafIndex++) {
        const along = (leafIndex + 1) / branchlet.leafCount
        const leafCenter = branchStart.clone().lerp(branchEnd, 0.52 + along * 0.48)
        const leafNormal = tangent.clone().cross(direction).normalize()
        if (leafNormal.lengthSq() < 1e-6) leafNormal.set(0, 0, 1)
        const leafSide = direction.clone().cross(leafNormal).normalize()
        const leafScale = params.vineLeafScale * (0.88 + ((vineIndex + branchIndex + leafIndex) % 3) * 0.08)
        const leafColor = colorScratch.copy(leafA).lerp(leafB, ((vineIndex + branchIndex + leafIndex) % 5) / 4)
        const base = vertex(leafCenter.clone().addScaledVector(direction, -leafScale * 0.5), leafNormal, leafColor)
        const left = vertex(leafCenter.clone().addScaledVector(leafSide, -leafScale * 0.42), leafNormal, leafColor)
        const tip = vertex(leafCenter.clone().addScaledVector(direction, leafScale * 0.56), leafNormal, leafColor)
        const right = vertex(leafCenter.clone().addScaledVector(leafSide, leafScale * 0.42), leafNormal, leafColor)
        indices.push(base, left, tip, base, tip, right)
        indices.push(tip, left, base, right, tip, base)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return {
    geometry,
    stats: {
      vines: system.vines?.length || 0,
      dualAnchored: system.vines?.filter((vine) => vine.end).length || 0,
      sideBranches: system.vines?.reduce((sum, vine) => sum + vine.branchlets.length, 0) || 0,
      leaves: system.vines?.reduce((sum, vine) => sum + vine.branchlets.reduce((branchSum, branch) => branchSum + branch.leafCount, 0), 0) || 0,
      triangles: indices.length / 3,
    },
  }
}
