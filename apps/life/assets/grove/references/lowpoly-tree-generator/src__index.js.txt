import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { ADDITION, Brush, Evaluator } from 'three-bvh-csg'
import {
  LOWPOLY_TREE_VINE_PARAMETER_DEFAULTS,
  createLowpolyTreeVineRecipe,
} from './vines.js'

export {
  LOWPOLY_TREE_ANIMATION_MOTIONS,
  LOWPOLY_TREE_ANIMATION_PROFILE_DEFAULTS,
  createLowpolyTreeAnimationProfile,
  createLowpolyTreeLiveAnimationProfile,
} from './profile.js'
export {
  LOWPOLY_TREE_ARCHETYPES,
  createLowpolyTreeArchetypeParams,
  getLowpolyTreeArchetype,
} from './archetypes.js'
export {
  LOWPOLY_TREE_VINE_PARAMETER_DEFAULTS,
  buildLowpolyTreeVineGeometry,
  createLowpolyTreeVineRecipe,
  normalizeLowpolyTreeVineParameters,
} from './vines.js'

const TAU = Math.PI * 2

export const LOWPOLY_TREE_PARAMETER_DEFAULTS = Object.freeze({
  sections: 7,
  sides: 7,
  height: 2.7,
  yOffset: 0,
  baseRadius: 0.34,
  tipRadius: 0.045,
  taperPower: 1.28,
  baseSwell: 0.025,
  baseSwellCenter: 0.13,
  baseSwellWidth: 0.18,
  leanX: 0,
  leanZ: 0,
  bendX: 0.1,
  bendZ: 0,
  bendPeak: 0.5,
  curveStrength: 1,
  upperBendX: 0,
  upperBendZ: 0,
  sCurveX: 0,
  sCurveZ: 0,
  tipCurlX: 0,
  tipCurlZ: 0,
  tipCurlStart: 0.62,
  tipCurlPower: 1.8,
  waveX: 0.04,
  waveZ: 0.03,
  waveFreq: 1.25,
  wavePhase: 0,
  twistRadius: 0,
  twistTurns: 0,
  twistPhase: 0,
  profileTwistTurns: 0,
  profileTwistPhase: 0,
  knuckleAmp: 0.01,
  knuckleFreq: 2,
  curvePointOffsets: null,
  rootCount: 5,
  rootSegments: 4,
  rootProfileSides: 4,
  rootLength: 0.82,
  rootLengthVariation: 0.3,
  rootWidth: 0.28,
  rootHeight: 0.32,
  rootTaper: 1.4,
  rootTipScale: 0.1,
  rootSpread: 0.24,
  rootWander: 0.24,
  rootPhase: 0.12,
  rootPointOffsets: null,
  branchCount: 2,
  branchSegments: 4,
  branchSides: 4,
  branchStart: 0.44,
  branchSpacing: 0.1,
  branchLength: 1.2,
  branchLengthVariation: 0.18,
  branchRadiusScale: 0.74,
  branchTipScale: 0.16,
  branchTaper: 1.15,
  branchLift: 0.8,
  branchArc: 0.2,
  branchCurve: 0.18,
  branchSpread: 0.18,
  branchPhase: 0.35,
  primaryBranchPointOffsets: null,
  secondaryBranchCount: 2,
  secondaryBranchSegments: 3,
  secondaryBranchSides: 3,
  secondaryBranchStart: 0.56,
  secondaryBranchSpacing: 0.16,
  secondaryBranchLength: 0.58,
  secondaryBranchLengthVariation: 0.16,
  secondaryBranchRadiusScale: 0.52,
  secondaryBranchTipScale: 0.16,
  secondaryBranchTaper: 1.12,
  secondaryBranchLift: 0.72,
  secondaryBranchArc: 0.12,
  secondaryBranchCurve: 0.16,
  secondaryBranchSplitAngle: 0.72,
  secondaryBranchSpread: 0.14,
  secondaryBranchPhase: 0.2,
  secondaryBranchPointOffsets: null,
  secondaryBranchTipOffsets: null,
  canopyEnabled: true,
  canopyStyle: 'clustered',
  canopyClusterCount: 3,
  canopyRadius: 0.62,
  canopyHeightScale: 0.72,
  canopyDepthScale: 0.9,
  canopyAnchorSpread: 0.92,
  canopyVerticalSpread: 0.72,
  canopyLift: 0.08,
  canopySizeVariation: 0.18,
  canopyIrregularity: 0.14,
  canopyShoulder: 0.18,
  canopyColorVariation: 0.1,
  canopyRotation: 0,
  canopySeed: 17,
  barkColor: 0x2a1b14,
  canopyColorTop: 0x718042,
  canopyColorSide: 0x536834,
  canopyColorBottom: 0x303e25,
  ...LOWPOLY_TREE_VINE_PARAMETER_DEFAULTS,
})

const CSG_RESOLUTION_LEVELS = [
  { name: 'requested', trunkSections: Infinity, trunkSides: Infinity, rootSegments: Infinity, rootProfileSides: Infinity, branchSegments: Infinity, branchSides: Infinity },
  { name: 'reduced-limb-profile', trunkSections: Infinity, trunkSides: Infinity, rootSegments: Infinity, rootProfileSides: 4, branchSegments: Infinity, branchSides: 4 },
  { name: 'budget-root-profile', trunkSections: Infinity, trunkSides: Infinity, rootSegments: Infinity, rootProfileSides: 3, branchSegments: Infinity, branchSides: 4 },
  { name: 'budget-limbs', trunkSections: Infinity, trunkSides: Infinity, rootSegments: 3, rootProfileSides: 3, branchSegments: 3, branchSides: 3 },
  { name: 'budget-balanced', trunkSections: 8, trunkSides: 7, rootSegments: 3, rootProfileSides: 3, branchSegments: 3, branchSides: 3 },
  { name: 'budget-low', trunkSections: 5, trunkSides: 4, rootSegments: 3, rootProfileSides: 3, branchSegments: 3, branchSides: 3 },
  { name: 'budget-minimum', trunkSections: 4, trunkSides: 3, rootSegments: 3, rootProfileSides: 3, branchSegments: 3, branchSides: 3 },
]

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function peakedArc(value, peak) {
  const u = clamp01(value)
  const center = Math.min(0.95, Math.max(0.05, peak))
  if (u <= center) return Math.sin((u / center) * Math.PI * 0.5)
  return Math.sin(((1 - u) / (1 - center)) * Math.PI * 0.5)
}

function round4(value) {
  return Number(value.toFixed(4))
}

function deterministic01(seed, index, salt = 0) {
  const value = Math.sin((Number(seed) || 0) * 12.9898 + (index + 1) * 78.233 + salt * 37.719) * 43758.5453
  return value - Math.floor(value)
}

function colorValue(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.min(0xffffff, Math.round(number))) : fallback
}

function asVector3(point) {
  if (point?.isVector3) return point.clone()
  return new THREE.Vector3(point[0], point[1], point[2])
}

function sampleVectorValues(values, t, fallback = [0, 0, 0]) {
  if (!Array.isArray(values) || values.length === 0) return [...fallback]
  if (values.length === 1) return [...(values[0] || fallback)]
  const scaled = clamp01(t) * (values.length - 1)
  const index = Math.min(values.length - 2, Math.floor(scaled))
  const localT = scaled - index
  const a = values[index] || fallback
  const b = values[index + 1] || a
  return [
    lerp(Number(a[0]) || 0, Number(b[0]) || 0, localT),
    lerp(Number(a[1]) || 0, Number(b[1]) || 0, localT),
    lerp(Number(a[2]) || 0, Number(b[2]) || 0, localT),
  ]
}

function sampleNumberValues(values, t, fallback = 0) {
  if (!Array.isArray(values) || values.length === 0) return fallback
  if (values.length === 1) return Number(values[0]) || fallback
  const scaled = clamp01(t) * (values.length - 1)
  const index = Math.min(values.length - 2, Math.floor(scaled))
  const localT = scaled - index
  return lerp(Number(values[index]) || fallback, Number(values[index + 1]) || fallback, localT)
}

function frameNormalFor(tangent, previousNormal) {
  if (previousNormal) {
    const projected = previousNormal.clone().sub(tangent.clone().multiplyScalar(previousNormal.dot(tangent)))
    if (projected.lengthSq() > 1e-7) return projected.normalize()
  }
  const seed = Math.abs(tangent.y) < 0.82 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  return seed.sub(tangent.clone().multiplyScalar(seed.dot(tangent))).normalize()
}

function radiusAt(radii, index, count) {
  if (typeof radii === 'function') return radii(count <= 1 ? 0 : index / (count - 1), index)
  if (Array.isArray(radii)) return radii[index] ?? radii.at(-1) ?? 0.04
  return radii || 0.04
}

export function buildSweepTubeGeometry({
  points,
  radii,
  sides = 5,
  twistTurns = 0,
  twistPhase = 0,
  capStart = true,
  capEnd = true,
  flattenStartY = null,
  computeNormals = true,
}) {
  const pts = points.map(asVector3)
  const positions = []
  const indices = []
  let normal = null

  for (let i = 0; i < pts.length; i++) {
    const previous = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const tangent = next.clone().sub(previous).normalize()
    normal = frameNormalFor(tangent, normal)
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize()
    const radius = radiusAt(radii, i, pts.length)
    const u = pts.length <= 1 ? 0 : i / (pts.length - 1)
    const ringTwist = twistPhase + TAU * twistTurns * u
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * TAU + ringTwist
      const ring = normal.clone().multiplyScalar(Math.cos(angle) * radius)
        .add(binormal.clone().multiplyScalar(Math.sin(angle) * radius))
      const y = i === 0 && flattenStartY != null ? flattenStartY : pts[i].y + ring.y
      positions.push(pts[i].x + ring.x, y, pts[i].z + ring.z)
    }
  }

  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j
      const b = i * sides + ((j + 1) % sides)
      const c = (i + 1) * sides + j
      const d = (i + 1) * sides + ((j + 1) % sides)
      indices.push(a, b, c, b, d, c)
    }
  }

  if (capStart) {
    const center = positions.length / 3
    positions.push(pts[0].x, flattenStartY ?? pts[0].y, pts[0].z)
    for (let j = 0; j < sides; j++) indices.push(center, (j + 1) % sides, j)
  }
  if (capEnd) {
    const center = positions.length / 3
    const end = pts.at(-1)
    positions.push(end.x, end.y, end.z)
    const ring = (pts.length - 1) * sides
    for (let j = 0; j < sides; j++) indices.push(center, ring + j, ring + ((j + 1) % sides))
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  if (computeNormals) geometry.computeVertexNormals()
  return geometry
}

function trunkCenterAt(t, params) {
  const u = clamp01(t)
  const arc = peakedArc(u, params.bendPeak ?? 0.5)
  const upperArc = u <= 0.24 ? 0 : Math.sin(Math.PI * ((u - 0.24) / 0.76))
  const sCurve = Math.sin(TAU * u) * Math.sin(Math.PI * u)
  const curl = Math.pow(smoothstep(params.tipCurlStart ?? 0.62, 1, u), params.tipCurlPower ?? 1.8)
  const strength = params.curveStrength ?? 1
  const waveAngle = TAU * (params.waveFreq || 1) * u + (params.wavePhase || 0)
  const twistAngle = (params.twistPhase || 0) + TAU * (params.twistTurns || 0) * u
  const twistRadius = (params.twistRadius || 0) * arc * strength
  const x = (params.baseOffsetX || 0) * (1 - u)
    + (params.leanX || 0) * u
    + (params.bendX || 0) * arc * strength
    + (params.upperBendX || 0) * upperArc * strength
    + (params.sCurveX || 0) * sCurve * strength
    + (params.tipCurlX || 0) * curl * strength
    + (params.waveX || 0) * Math.sin(waveAngle) * arc * strength
    + Math.cos(twistAngle) * twistRadius
  const z = (params.baseOffsetZ || 0) * (1 - u)
    + (params.leanZ || 0) * u
    + (params.bendZ || 0) * arc * strength
    + (params.upperBendZ || 0) * upperArc * strength
    + (params.sCurveZ || 0) * sCurve * strength
    + (params.tipCurlZ || 0) * curl * strength
    + (params.waveZ || 0) * Math.cos(waveAngle) * arc * strength
    + Math.sin(twistAngle) * twistRadius
  return [round4(x), round4((params.yOffset || 0) + params.height * u), round4(z)]
}

function trunkRadiusAt(t, params) {
  const u = clamp01(t)
  const base = lerp(params.baseRadius, params.tipRadius, Math.pow(u, params.taperPower || 1.25))
  const swellDistance = (u - (params.baseSwellCenter || 0.13)) / (params.baseSwellWidth || 0.18)
  const swell = (params.baseSwell || 0) * Math.exp(-(swellDistance * swellDistance))
  const knuckle = (params.knuckleAmp || 0) * Math.sin(TAU * (params.knuckleFreq || 2) * u + (params.wavePhase || 0)) * u * (1 - u)
  return round4(Math.max(params.tipRadius * 0.72, base + swell + knuckle))
}

function buildGroundRootRecipes(params, basePoint) {
  const roots = []
  const count = Math.max(0, Math.round(params.rootCount || 0))
  const segments = Math.max(3, Math.round(params.rootSegments || 4))
  const baseScale = Math.min(1.5, Math.max(0.65, params.baseRadius / 0.34))
  const rootWidth = params.rootWidth * baseScale
  const rootHeight = params.rootHeight * baseScale

  for (let i = 0; i < count; i++) {
    const alternating = i % 2 === 0 ? 1 : -1
    const phase = params.rootPhase || 0
    const jitter = Math.sin((i + 1) * 2.399 + phase * 0.7) * (params.rootSpread || 0)
    const angle = phase + i * TAU / count + jitter
    const lengthVariation = 1 + Math.sin((i + 1) * 4.137 + phase) * (params.rootLengthVariation || 0)
    const widthVariation = 1 + Math.sin((i + 1) * 3.173 + phase * 1.4) * 0.18
    const heightVariation = 1 + Math.cos((i + 1) * 2.681 - phase) * 0.14
    const length = Math.max(0.2, params.rootLength * lengthVariation * (0.88 + baseScale * 0.12))
    const reach = params.baseRadius * 0.78 + length
    const startDistance = params.baseRadius * 0.55
    const points = []
    const widths = []
    const heights = []

    for (let j = 0; j < segments; j++) {
      const u = j / (segments - 1)
      const distance = startDistance + (reach - startDistance) * Math.pow(u, 0.82)
      const turn = angle + alternating * (params.rootWander || 0) * Math.sin(Math.PI * u)
      const taper = Math.pow(u, params.rootTaper || 1.2)
      const shoulder = 0.7 + Math.sin(Math.PI * u) * 0.45
      const variedWidth = rootWidth * widthVariation * shoulder
      const variedHeight = rootHeight * heightVariation
      const pointOffset = j === 0
        ? [0, 0, 0]
        : params.rootPointOffsets?.[i]?.[j] || [0, 0, 0]
      points.push([
        round4(basePoint[0] + Math.cos(turn) * distance + (Number(pointOffset[0]) || 0)),
        round4(Math.max(0, Number(pointOffset[1]) || 0)),
        round4(basePoint[2] + Math.sin(turn) * distance + (Number(pointOffset[2]) || 0)),
      ])
      widths.push(round4(lerp(variedWidth, Math.max(0.008, variedWidth * params.rootTipScale), taper)))
      heights.push(round4(lerp(variedHeight, Math.max(0.006, variedHeight * params.rootTipScale), taper)))
    }
    roots.push({ name: `ground-root-${i + 1}`, profileSides: params.rootProfileSides, points, widths, heights })
  }
  return roots
}

function buildPrimaryBranchRecipes(params, trunkPoints, trunkRadii) {
  const branches = []
  const count = Math.max(0, Math.round(params.branchCount || 0))
  const segments = Math.max(3, Math.round(params.branchSegments || 4))
  for (let i = 0; i < count; i++) {
    const startT = Math.min(0.9, Math.max(0.16, params.branchStart + i * params.branchSpacing))
    const center = sampleVectorValues(trunkPoints, startT)
    const trunkRadius = sampleNumberValues(trunkRadii, startT, params.baseRadius)
    const phase = params.branchPhase || 0
    const alternating = i % 2 === 0 ? 1 : -1
    const angle = phase
      + i * TAU / Math.max(1, count)
      + Math.sin((i + 1) * 2.731 + phase) * (params.branchSpread || 0)
    const lengthVariation = 1
      + Math.sin((i + 1) * 4.421 - phase) * (params.branchLengthVariation || 0)
    const length = Math.max(0.25, params.branchLength * lengthVariation)
    const baseRadius = Math.max(0.025, trunkRadius * params.branchRadiusScale)
    const points = []
    const radii = []

    for (let j = 0; j < segments; j++) {
      const u = j / (segments - 1)
      const reach = trunkRadius * 0.12 + length * Math.pow(u, 0.82)
      const turn = angle + alternating * (params.branchCurve || 0) * Math.sin(Math.PI * u)
      const rise = length * (
        (params.branchLift || 0) * u
        + (params.branchArc || 0) * Math.sin(Math.PI * u)
      )
      const taper = Math.pow(u, params.branchTaper || 1.15)
      const pointOffset = j === 0
        ? [0, 0, 0]
        : params.primaryBranchPointOffsets?.[i]?.[j] || [0, 0, 0]
      points.push([
        round4(center[0] + Math.cos(turn) * reach + (Number(pointOffset[0]) || 0)),
        round4(center[1] + rise + (Number(pointOffset[1]) || 0)),
        round4(center[2] + Math.sin(turn) * reach + (Number(pointOffset[2]) || 0)),
      ])
      radii.push(round4(lerp(
        baseRadius,
        Math.max(0.01, baseRadius * params.branchTipScale),
        taper,
      )))
    }
    branches.push({
      name: `primary-branch-${i + 1}`,
      sides: params.branchSides,
      startT: round4(startT),
      points,
      radii,
    })
  }
  return branches
}

function buildSecondaryBranchRecipes(params, primaryBranches) {
  if (primaryBranches.length === 0) return []
  const branches = []
  const count = Math.max(0, Math.round(params.secondaryBranchCount || 0))
  const segments = Math.max(3, Math.round(params.secondaryBranchSegments || 3))
  for (let i = 0; i < count; i++) {
    const parentIndex = i % primaryBranches.length
    const parent = primaryBranches[parentIndex]
    const tier = Math.floor(i / primaryBranches.length)
    const startT = Math.min(0.88, Math.max(0.28, params.secondaryBranchStart + tier * params.secondaryBranchSpacing))
    const center = sampleVectorValues(parent.points, startT)
    const parentRadius = sampleNumberValues(parent.radii, startT, parent.radii[0] || 0.08)
    const before = sampleVectorValues(parent.points, Math.max(0, startT - 0.08))
    const after = sampleVectorValues(parent.points, Math.min(1, startT + 0.08))
    const parentAngle = Math.atan2(after[2] - before[2], after[0] - before[0])
    const alternating = (i + tier) % 2 === 0 ? 1 : -1
    const angle = parentAngle
      + alternating * (params.secondaryBranchSplitAngle || 0)
      + (params.secondaryBranchPhase || 0)
      + Math.sin((i + 1) * 3.173) * (params.secondaryBranchSpread || 0)
    const lengthVariation = 1
      + Math.sin((i + 1) * 4.917 + (params.secondaryBranchPhase || 0))
      * (params.secondaryBranchLengthVariation || 0)
    const length = Math.max(0.16, params.secondaryBranchLength * lengthVariation)
    const baseRadius = Math.max(0.012, parentRadius * params.secondaryBranchRadiusScale)
    const tipOffset = params.secondaryBranchTipOffsets?.[i] || [0, 0, 0]
    const points = []
    const radii = []

    for (let j = 0; j < segments; j++) {
      const u = j / (segments - 1)
      const reach = parentRadius * 0.08 + length * Math.pow(u, 0.84)
      const turn = angle + alternating * (params.secondaryBranchCurve || 0) * Math.sin(Math.PI * u)
      const rise = length * (
        (params.secondaryBranchLift || 0) * u
        + (params.secondaryBranchArc || 0) * Math.sin(Math.PI * u)
      )
      const offsetWeight = Math.pow(u, 1.5)
      const taper = Math.pow(u, params.secondaryBranchTaper || 1.12)
      const pointOffset = j === 0
        ? [0, 0, 0]
        : params.secondaryBranchPointOffsets?.[i]?.[j] || [0, 0, 0]
      points.push([
        round4(
          center[0] + Math.cos(turn) * reach
          + (Number(tipOffset[0]) || 0) * offsetWeight
          + (Number(pointOffset[0]) || 0),
        ),
        round4(
          center[1] + rise
          + (Number(tipOffset[1]) || 0) * offsetWeight
          + (Number(pointOffset[1]) || 0),
        ),
        round4(
          center[2] + Math.sin(turn) * reach
          + (Number(tipOffset[2]) || 0) * offsetWeight
          + (Number(pointOffset[2]) || 0),
        ),
      ])
      radii.push(round4(lerp(
        baseRadius,
        Math.max(0.008, baseRadius * params.secondaryBranchTipScale),
        taper,
      )))
    }
    branches.push({
      name: `secondary-branch-${i + 1}`,
      parentBranchIndex: parentIndex,
      sides: params.secondaryBranchSides,
      startT: round4(startT),
      points,
      radii,
    })
  }
  return branches
}

function buildCanopyRecipe(params, trunkPoints, branches, secondaryBranches) {
  const count = params.canopyEnabled === false ? 0 : Math.max(0, Math.round(params.canopyClusterCount || 0))
  const tip = trunkPoints.at(-1) || [0, params.height || 2.7, 0]
  const secondaryParents = new Set(secondaryBranches.map((branch) => branch.parentBranchIndex))
  const terminalBranches = [
    ...secondaryBranches,
    ...branches.filter((_, index) => !secondaryParents.has(index)),
  ]
  const anchors = [tip, ...terminalBranches.map((branch) => branch.points.at(-1))]
  const anchorNames = ['trunk-tip', ...terminalBranches.map((branch) => branch.name)]
  const centroid = anchors.reduce((sum, point) => [
    sum[0] + point[0] / anchors.length,
    sum[1] + point[1] / anchors.length,
    sum[2] + point[2] / anchors.length,
  ], [0, 0, 0])
  const radius = Math.max(0.05, params.canopyRadius || 0.62)
  const seed = Math.round(params.canopySeed || 0)
  const clusters = []

  for (let i = 0; i < count; i++) {
    let anchor
    if (i < anchors.length) {
      anchor = anchors[i]
    } else {
      const angle = (params.canopyRotation || 0) + i * TAU / Math.max(1, count)
      const satelliteReach = radius * (0.55 + deterministic01(seed, i, 1) * 0.35)
      anchor = [
        centroid[0] + Math.cos(angle) * satelliteReach,
        centroid[1] + (deterministic01(seed, i, 2) - 0.3) * radius * 0.35,
        centroid[2] + Math.sin(angle) * satelliteReach,
      ]
    }
    const spread = params.canopyAnchorSpread ?? 0.92
    const sizeVariation = 1 + (deterministic01(seed, i, 3) * 2 - 1) * (params.canopySizeVariation || 0)
    const widthVariation = 0.9 + deterministic01(seed, i, 4) * 0.22
    const depthVariation = 0.9 + deterministic01(seed, i, 5) * 0.22
    const scale = [
      radius * sizeVariation * widthVariation,
      radius * sizeVariation * Math.max(0.18, params.canopyHeightScale || 0.72),
      radius * sizeVariation * Math.max(0.18, params.canopyDepthScale || 0.9) * depthVariation,
    ]
    const center = [
      centroid[0] + (anchor[0] - centroid[0]) * spread,
      centroid[1]
        + (anchor[1] - centroid[1]) * (params.canopyVerticalSpread ?? 0.72)
        + (params.canopyLift || 0)
        + (deterministic01(seed, i, 6) - 0.5) * radius * 0.12,
      centroid[2] + (anchor[2] - centroid[2]) * spread,
    ]

    // Keep every terminal tip visibly embedded in its canopy while preserving crown cohesion.
    if (i < anchors.length) {
      const delta = anchor.map((value, axis) => value - center[axis])
      const normalizedDistance = Math.hypot(
        delta[0] / Math.max(0.001, scale[0]),
        delta[1] / Math.max(0.001, scale[1]),
        delta[2] / Math.max(0.001, scale[2]),
      )
      const maxAttachmentDistance = 0.72
      if (normalizedDistance > maxAttachmentDistance) {
        const correction = 1 - maxAttachmentDistance / normalizedDistance
        for (let axis = 0; axis < 3; axis++) center[axis] += delta[axis] * correction
      }
    }

    clusters.push({
      name: `canopy-cluster-${i + 1}`,
      anchor: i < anchorNames.length ? anchorNames[i] : 'crown-fill',
      attachPoint: [round4(anchor[0]), round4(anchor[1]), round4(anchor[2])],
      center: center.map(round4),
      scale: scale.map(round4),
      rotation: [
        round4((deterministic01(seed, i, 7) - 0.5) * 0.18),
        round4((params.canopyRotation || 0) + deterministic01(seed, i, 8) * TAU),
        round4((deterministic01(seed, i, 9) - 0.5) * 0.18),
      ],
      irregularity: round4(Math.max(0, params.canopyIrregularity || 0)),
      shoulder: round4(Math.max(0, params.canopyShoulder || 0)),
      colorVariation: round4(Math.max(0, params.canopyColorVariation || 0)),
      seed: seed + i * 101,
    })
  }

  return {
    style: params.canopyStyle || 'clustered',
    clusters,
    palette: {
      bark: colorValue(params.barkColor, 0x2a1b14),
      top: colorValue(params.canopyColorTop, 0x718042),
      side: colorValue(params.canopyColorSide, 0x536834),
      bottom: colorValue(params.canopyColorBottom, 0x303e25),
    },
  }
}

export function createLowpolyTreeRecipe(params = {}, metadata = {}) {
  const resolved = { ...LOWPOLY_TREE_PARAMETER_DEFAULTS, ...params }
  const sections = Math.max(2, Math.round(resolved.sections))
  const points = []
  const radii = []
  for (let i = 0; i < sections; i++) {
    const t = sections <= 1 ? 0 : i / (sections - 1)
    const basePoint = trunkCenterAt(t, resolved)
    const offset = sampleVectorValues(resolved.curvePointOffsets, t)
    points.push([
      round4(basePoint[0] + offset[0]),
      round4(basePoint[1] + offset[1]),
      round4(basePoint[2] + offset[2]),
    ])
    radii.push(trunkRadiusAt(t, resolved))
  }
  const branches = buildPrimaryBranchRecipes(resolved, points, radii)
  const secondaryBranches = buildSecondaryBranchRecipes(resolved, branches)
  const canopy = buildCanopyRecipe(resolved, points, branches, secondaryBranches)
  const recipe = {
    version: 1,
    kind: metadata.kind || 'lowpolyTree',
    name: metadata.name || 'Lowpoly Tree',
    sides: resolved.sides,
    points,
    radii,
    roots: buildGroundRootRecipes(resolved, points[0]),
    branches,
    secondaryBranches,
    canopy,
    params: resolved,
  }
  recipe.vines = createLowpolyTreeVineRecipe(recipe, resolved)
  return recipe
}

function buildGroundRootSolidGeometry(root, { computeNormals = true } = {}) {
  const points = root.points.map(asVector3)
  const profilePoints = Math.max(3, Math.round(root.profileSides || 5))
  const positions = []
  const indices = []

  for (let i = 0; i < points.length; i++) {
    const previous = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const tangentX = next.x - previous.x
    const tangentZ = next.z - previous.z
    const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentZ))
    const lateralX = -tangentZ / tangentLength
    const lateralZ = tangentX / tangentLength
    for (let j = 0; j < profilePoints; j++) {
      const angle = Math.PI * (j / (profilePoints - 1))
      const lateral = Math.cos(angle) * root.widths[i]
      positions.push(
        points[i].x + lateralX * lateral,
        points[i].y + Math.max(0, Math.sin(angle) * root.heights[i]),
        points[i].z + lateralZ * lateral,
      )
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < profilePoints - 1; j++) {
      const a = i * profilePoints + j
      const b = a + 1
      const c = (i + 1) * profilePoints + j
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
    const nearA = i * profilePoints
    const farA = nearA + profilePoints - 1
    const nearB = (i + 1) * profilePoints
    const farB = nearB + profilePoints - 1
    indices.push(nearA, farA, nearB, farA, farB, nearB)
  }

  const addEndCap = (ringIndex, reverse) => {
    const center = positions.length / 3
    const point = points[ringIndex]
    positions.push(point.x, point.y + root.heights[ringIndex] * 0.32, point.z)
    const ring = ringIndex * profilePoints
    for (let j = 0; j < profilePoints - 1; j++) {
      const a = ring + j
      const b = ring + j + 1
      indices.push(center, reverse ? b : a, reverse ? a : b)
    }
    const first = ring
    const last = ring + profilePoints - 1
    indices.push(center, reverse ? first : last, reverse ? last : first)
  }
  addEndCap(0, false)
  addEndCap(points.length - 1, true)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  if (computeNormals) geometry.computeVertexNormals()
  return geometry
}

function setUniformGeometryColor(geometry, value) {
  const position = geometry.getAttribute('position')
  const color = new THREE.Color(value)
  const colors = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

function buildCanopyClusterGeometry(cluster, palette, detail) {
  const geometry = detail === 'budget-8'
    ? new THREE.OctahedronGeometry(1, 0)
    : new THREE.IcosahedronGeometry(1, 0)
  const position = geometry.getAttribute('position')
  const scale = asVector3(cluster.scale)
  const center = asVector3(cluster.center)
  const rotation = new THREE.Euler(...cluster.rotation)
  const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation)
  const vertex = new THREE.Vector3()

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i)
    const coordinateHash = Math.round((vertex.x * 31 + vertex.y * 47 + vertex.z * 61) * 1000)
    const distortion = 1 + (deterministic01(cluster.seed, coordinateHash, 11) * 2 - 1) * cluster.irregularity
    const shoulder = 1 + cluster.shoulder * vertex.y
    vertex.x *= shoulder
    vertex.z *= shoulder
    vertex.multiply(scale).multiplyScalar(distortion).applyMatrix4(matrix).add(center)
    position.setXYZ(i, vertex.x, vertex.y, vertex.z)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()

  const colors = new Float32Array(position.count * 3)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const edgeA = new THREE.Vector3()
  const edgeB = new THREE.Vector3()
  const color = new THREE.Color()
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i)
    b.fromBufferAttribute(position, i + 1)
    c.fromBufferAttribute(position, i + 2)
    edgeA.subVectors(b, a)
    edgeB.subVectors(c, a)
    normal.crossVectors(edgeA, edgeB).normalize()
    const baseColor = normal.y > 0.24 ? palette.top : normal.y < -0.2 ? palette.bottom : palette.side
    const variation = 1 + (deterministic01(cluster.seed, i / 3, 12) * 2 - 1) * cluster.colorVariation
    color.setHex(baseColor).multiplyScalar(variation)
    color.r = Math.min(1, Math.max(0, color.r))
    color.g = Math.min(1, Math.max(0, color.g))
    color.b = Math.min(1, Math.max(0, color.b))
    for (let j = 0; j < 3; j++) {
      colors[(i + j) * 3] = color.r
      colors[(i + j) * 3 + 1] = color.g
      colors[(i + j) * 3 + 2] = color.b
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

export function buildLowpolyCanopyGeometry(canopy, { detail = 'faceted-20' } = {}) {
  const palette = canopy?.palette || {
    top: LOWPOLY_TREE_PARAMETER_DEFAULTS.canopyColorTop,
    side: LOWPOLY_TREE_PARAMETER_DEFAULTS.canopyColorSide,
    bottom: LOWPOLY_TREE_PARAMETER_DEFAULTS.canopyColorBottom,
  }
  const clusters = (canopy?.clusters || []).map((cluster) => buildCanopyClusterGeometry(cluster, palette, detail))
  if (clusters.length === 0) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([], 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3))
    geometry.setIndex([])
    return geometry
  }
  const geometry = mergeGeometryParts(clusters)
  clusters.forEach((cluster) => cluster.dispose())
  return geometry
}

export function countLowpolyTreeTriangles(geometry) {
  const total = geometry.index ? geometry.index.count : geometry.getAttribute('position').count
  const count = Number.isFinite(geometry.drawRange.count)
    ? Math.min(total - geometry.drawRange.start, geometry.drawRange.count)
    : total - geometry.drawRange.start
  return Math.max(0, Math.floor(count / 3))
}

function fillSmallBoundaryHoles(geometry, { groundEpsilon = 0.0001, maxPerimeter = 0.2 } = {}) {
  const position = geometry.getAttribute('position')
  const index = geometry.index
  if (!index) return 0
  const edges = new Map()
  const addEdge = (a, b) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    const existing = edges.get(key)
    if (existing) existing.count++
    else edges.set(key, { a, b, count: 1 })
  }
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i)
    const b = index.getX(i + 1)
    const c = index.getX(i + 2)
    addEdge(a, b)
    addEdge(b, c)
    addEdge(c, a)
  }

  const nextByVertex = new Map()
  for (const edge of edges.values()) {
    if (edge.count !== 1) continue
    if (position.getY(edge.a) <= groundEpsilon || position.getY(edge.b) <= groundEpsilon) continue
    if (!nextByVertex.has(edge.a)) nextByVertex.set(edge.a, [])
    nextByVertex.get(edge.a).push(edge.b)
  }

  const visited = new Set()
  const loops = []
  for (const [start] of nextByVertex) {
    if (visited.has(start)) continue
    const loop = [start]
    let current = start
    let closed = false
    for (let guard = 0; guard < 16; guard++) {
      const next = (nextByVertex.get(current) || [])[0]
      visited.add(current)
      if (next == null) break
      if (next === start) {
        closed = true
        break
      }
      if (loop.includes(next)) break
      loop.push(next)
      current = next
    }
    if (closed && loop.length >= 3 && loop.length <= 8) loops.push(loop)
  }

  const positions = Array.from(position.array)
  const indices = Array.from(index.array)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  let repairedTriangles = 0
  for (const loop of loops) {
    let perimeter = 0
    for (let i = 0; i < loop.length; i++) {
      a.fromBufferAttribute(position, loop[i])
      b.fromBufferAttribute(position, loop[(i + 1) % loop.length])
      perimeter += a.distanceTo(b)
    }
    if (perimeter > maxPerimeter) continue
    if (loop.length === 3) {
      indices.push(loop[0], loop[2], loop[1])
      repairedTriangles++
      continue
    }
    const centerIndex = positions.length / 3
    const center = new THREE.Vector3()
    loop.forEach((vertex) => center.add(a.fromBufferAttribute(position, vertex)))
    center.multiplyScalar(1 / loop.length)
    positions.push(center.x, center.y, center.z)
    for (let i = 0; i < loop.length; i++) {
      indices.push(centerIndex, loop[(i + 1) % loop.length], loop[i])
      repairedTriangles++
    }
  }
  if (repairedTriangles > 0) {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
  }
  return repairedTriangles
}

function extractVisibleCsgSurface(geometry, groundEpsilon = 0.0001) {
  const position = geometry.getAttribute('position')
  const index = geometry.index
  const total = index ? index.count : position.count
  const start = Math.max(0, geometry.drawRange.start || 0)
  const count = Number.isFinite(geometry.drawRange.count) ? geometry.drawRange.count : total - start
  const end = Math.min(total, start + count)
  const positions = []
  let groundTrianglesRemoved = 0
  let degenerateTrianglesRemoved = 0
  const vertexIndexAt = (offset) => index ? index.getX(offset) : offset
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const edgeA = new THREE.Vector3()
  const edgeB = new THREE.Vector3()

  for (let i = start; i + 2 < end; i += 3) {
    const ia = vertexIndexAt(i)
    const ib = vertexIndexAt(i + 1)
    const ic = vertexIndexAt(i + 2)
    a.fromBufferAttribute(position, ia)
    b.fromBufferAttribute(position, ib)
    c.fromBufferAttribute(position, ic)
    if (Math.max(a.y, b.y, c.y) <= groundEpsilon) {
      groundTrianglesRemoved++
      continue
    }
    edgeA.subVectors(b, a)
    edgeB.subVectors(c, a)
    if (edgeA.cross(edgeB).lengthSq() <= 1e-12) {
      degenerateTrianglesRemoved++
      continue
    }
    for (const vertex of [ia, ib, ic]) {
      positions.push(
        position.getX(vertex),
        Math.abs(position.getY(vertex)) <= groundEpsilon ? 0 : position.getY(vertex),
        position.getZ(vertex),
      )
    }
  }

  const surface = new THREE.BufferGeometry()
  surface.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const welded = mergeVertices(surface, 1e-5)
  surface.dispose()
  welded.clearGroups()
  welded.setDrawRange(0, Infinity)
  const repairedTriangles = fillSmallBoundaryHoles(welded, { groundEpsilon })
  welded.computeVertexNormals()
  return { geometry: welded, groundTrianglesRemoved, degenerateTrianglesRemoved, repairedTriangles }
}

const CSG_EVALUATORS = new Map()

function getCsgEvaluator(useCDTClipping) {
  const key = useCDTClipping ? 'robust' : 'fast'
  if (CSG_EVALUATORS.has(key)) return CSG_EVALUATORS.get(key)
  const evaluator = new Evaluator()
  // Normals are cheaper and more coherent when recomputed once on the welded shell.
  evaluator.attributes = ['position']
  evaluator.useGroups = false
  evaluator.useCDTClipping = useCDTClipping
  CSG_EVALUATORS.set(key, evaluator)
  return evaluator
}

function unionSolids(trunkGeometry, solidGeometries, {
  useCDTClipping = true,
  strategy = 'balanced',
} = {}) {
  const evaluator = getCsgEvaluator(useCDTClipping)
  const brushes = [trunkGeometry, ...solidGeometries].map((geometry) => {
    const brush = new Brush(geometry)
    brush.updateMatrixWorld(true)
    return brush
  })
  const generated = []
  let csgPasses = 0

  let result
  if (strategy === 'sequential') {
    result = brushes[0]
    for (let index = 1; index < brushes.length; index++) {
      result = evaluator.evaluate(result, brushes[index], ADDITION)
      result.updateMatrixWorld(true)
      generated.push(result)
      csgPasses++
    }
  } else {
    let level = [...brushes]
    while (level.length > 1) {
      const nextLevel = []
      for (let i = 0; i < level.length; i += 2) {
        if (i + 1 >= level.length) {
          nextLevel.push(level[i])
          continue
        }
        const merged = evaluator.evaluate(level[i], level[i + 1], ADDITION)
        merged.updateMatrixWorld(true)
        generated.push(merged)
        nextLevel.push(merged)
        csgPasses++
      }
      level = nextLevel
    }
    result = level[0]
  }

  const csgTriangles = countLowpolyTreeTriangles(result.geometry)
  const visible = extractVisibleCsgSurface(result.geometry)
  const connectedComponents = countLowpolyTreeConnectedComponents(visible.geometry)
  const topology = auditLowpolyTreeGeometry(visible.geometry)
  const disposable = new Set([trunkGeometry, ...solidGeometries, ...generated.map((brush) => brush.geometry)])
  ;[...brushes, ...generated].forEach((brush) => brush.disposeCacheData?.())
  disposable.forEach((geometry) => {
    if (geometry !== visible.geometry) geometry.dispose()
  })
  return {
    ...visible,
    csgTriangles,
    csgPasses,
    connectedComponents,
    topology,
    csgStrategy: strategy,
    csgClipMode: useCDTClipping ? 'robust-cdt' : 'fast-legacy',
  }
}

function sampleValues(values, maxCount) {
  if (!Number.isFinite(maxCount) || values.length <= maxCount) return [...values]
  const sampled = []
  for (let i = 0; i < maxCount; i++) sampled.push(values[Math.round(i * (values.length - 1) / (maxCount - 1))])
  return sampled
}

function addRootCoreSocket(root, trunkBasePoint, trunkBaseRadius) {
  if (!root.points?.length) return root
  const base = asVector3(trunkBasePoint)
  const first = asVector3(root.points[0])
  const radial = first.clone().sub(base)
  radial.y = 0
  if (radial.lengthSq() < 1e-8) radial.set(1, 0, 0)
  radial.normalize()
  const socketDepth = Math.max(0.008, trunkBaseRadius * 0.08)
  const socketPoint = [
    round4(base.x + radial.x * socketDepth),
    round4(Math.max(0, base.y)),
    round4(base.z + radial.z * socketDepth),
  ]
  const firstWidth = root.widths?.[0] || trunkBaseRadius * 0.2
  const firstHeight = root.heights?.[0] || trunkBaseRadius * 0.2
  return {
    ...root,
    points: [socketPoint, ...root.points],
    widths: [round4(Math.max(firstWidth * 0.82, trunkBaseRadius * 0.22)), ...(root.widths || [])],
    heights: [round4(Math.max(firstHeight * 0.82, trunkBaseRadius * 0.24)), ...(root.heights || [])],
    coreSocket: true,
  }
}

function buildGeometryInputs(recipe, resolution, { computeNormals = false } = {}) {
  const points = sampleValues(recipe.points, resolution.trunkSections)
  const radii = sampleValues(recipe.radii, resolution.trunkSections)
  const sides = Math.min(recipe.sides || 7, resolution.trunkSides)
  const roots = (recipe.roots || []).map((root) => addRootCoreSocket({
    ...root,
    profileSides: Math.min(root.profileSides || 5, resolution.rootProfileSides),
    points: sampleValues(root.points, resolution.rootSegments),
    widths: sampleValues(root.widths, resolution.rootSegments),
    heights: sampleValues(root.heights, resolution.rootSegments),
  }, points[0], radii[0]))
  const resolveBranch = (branch) => ({
    ...branch,
    sides: Math.min(branch.sides || 5, resolution.branchSides),
    points: sampleValues(branch.points, resolution.branchSegments),
    radii: sampleValues(branch.radii, resolution.branchSegments),
  })
  const branches = (recipe.branches || []).map(resolveBranch)
  const secondaryBranches = (recipe.secondaryBranches || []).map(resolveBranch)
  const trunk = buildSweepTubeGeometry({
    sides,
    points,
    radii,
    twistTurns: recipe.params?.profileTwistTurns || 0,
    twistPhase: recipe.params?.profileTwistPhase || 0,
    capStart: true,
    capEnd: true,
    flattenStartY: 0,
    computeNormals,
  })
  const rootSolids = roots.map((root) => buildGroundRootSolidGeometry(root, { computeNormals }))
  const branchSolids = [...branches, ...secondaryBranches].map((branch) => buildSweepTubeGeometry({
    sides: branch.sides,
    points: branch.points,
    radii: branch.radii,
    twistTurns: (recipe.params?.profileTwistTurns || 0) * 0.35,
    twistPhase: recipe.params?.profileTwistPhase || 0,
    capStart: true,
    capEnd: true,
    computeNormals,
  }))
  return {
    trunk,
    solids: [...rootSolids, ...branchSolids],
    effectiveSections: points.length,
    effectiveSides: sides,
    effectiveRootSegments: roots[0]?.points.length || 0,
    effectiveRootProfileSides: roots[0]?.profileSides || 0,
    effectiveBranchSegments: branches[0]?.points.length || 0,
    effectiveBranchSides: branches[0]?.sides || 0,
    effectiveSecondaryBranchSegments: secondaryBranches[0]?.points.length || 0,
    effectiveSecondaryBranchSides: secondaryBranches[0]?.sides || 0,
  }
}

function mergeGeometryParts(geometries) {
  const positions = []
  const colors = []
  const indices = []
  const hasColors = geometries.some((geometry) => geometry.getAttribute('color'))
  let vertexOffset = 0
  for (const geometry of geometries) {
    const position = geometry.getAttribute('position')
    const color = geometry.getAttribute('color')
    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i))
      if (hasColors) {
        colors.push(
          color?.getX(i) ?? 1,
          color?.getY(i) ?? 1,
          color?.getZ(i) ?? 1,
        )
      }
    }
    if (geometry.index) {
      for (let i = 0; i < geometry.index.count; i++) indices.push(vertexOffset + geometry.index.getX(i))
    } else {
      for (let i = 0; i < position.count; i++) indices.push(vertexOffset + i)
    }
    vertexOffset += position.count
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (hasColors) merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  merged.setIndex(indices)
  merged.computeVertexNormals()
  return merged
}

function buildAtResolution(recipe, resolution, options) {
  const { trunk, solids, ...stats } = buildGeometryInputs(recipe, resolution)
  const balanced = unionSolids(trunk, solids, { ...options, strategy: 'balanced' })
  const balancedValid = balanced.connectedComponents === 1
    && balanced.topology.boundaryEdgesAboveGround === 0
    && balanced.topology.nonManifoldEdges === 0
  if (balancedValid || solids.length === 0) return { ...balanced, ...stats }

  const fallback = buildGeometryInputs(recipe, resolution)
  const sequential = unionSolids(fallback.trunk, fallback.solids, { ...options, strategy: 'sequential' })
  const score = (result) => {
    const connected = result.connectedComponents === 1 ? 1_000_000 : 0
    const boundaryPenalty = result.topology.boundaryEdgesAboveGround * 100
    const manifoldPenalty = result.topology.nonManifoldEdges * 250
    return connected - boundaryPenalty - manifoldPenalty
  }
  if (score(sequential) > score(balanced)) {
    balanced.geometry.dispose()
    return { ...sequential, ...stats }
  }
  sequential.geometry.dispose()
  return { ...balanced, ...stats }
}

export function buildLowpolyTreePreviewGeometry(recipe) {
  const input = buildGeometryInputs(recipe, CSG_RESOLUTION_LEVELS[0], { computeNormals: false })
  const woodSources = [input.trunk, ...input.solids]
  const barkColor = recipe.canopy?.palette?.bark ?? LOWPOLY_TREE_PARAMETER_DEFAULTS.barkColor
  woodSources.forEach((source) => setUniformGeometryColor(source, barkColor))
  const canopyGeometry = buildLowpolyCanopyGeometry(recipe.canopy)
  const canopyTriangles = countLowpolyTreeTriangles(canopyGeometry)
  const woodTriangles = woodSources.reduce((sum, source) => sum + countLowpolyTreeTriangles(source), 0)
  const sources = canopyTriangles > 0 ? [...woodSources, canopyGeometry] : woodSources
  const geometry = mergeGeometryParts(sources)
  sources.forEach((source) => source.dispose())
  return {
    geometry,
    stats: {
      preview: true,
      junctionMode: 'overlap-preview',
      mergedParts: woodSources.length + (recipe.canopy?.clusters?.length || 0),
      rootCount: recipe.roots?.length || 0,
      branchCount: recipe.branches?.length || 0,
      secondaryBranchCount: recipe.secondaryBranches?.length || 0,
      canopyCount: recipe.canopy?.clusters?.length || 0,
      woodTriangles,
      canopyTriangles,
      triangles: countLowpolyTreeTriangles(geometry),
      effectiveSections: input.effectiveSections,
      effectiveSides: input.effectiveSides,
      effectiveRootSegments: input.effectiveRootSegments,
      effectiveRootProfileSides: input.effectiveRootProfileSides,
      effectiveBranchSegments: input.effectiveBranchSegments,
      effectiveBranchSides: input.effectiveBranchSides,
      effectiveSecondaryBranchSegments: input.effectiveSecondaryBranchSegments,
      effectiveSecondaryBranchSides: input.effectiveSecondaryBranchSides,
      groundY: 0,
    },
  }
}

export function countLowpolyTreeConnectedComponents(geometry, tolerance = 1e-5) {
  const position = geometry.getAttribute('position')
  const index = geometry.index
  if (!position?.count) return 0
  const canonicalByPosition = new Map()
  const canonicalIds = new Array(position.count)
  const parents = []
  const scale = 1 / Math.max(1e-8, tolerance)
  for (let vertex = 0; vertex < position.count; vertex++) {
    const key = `${Math.round(position.getX(vertex) * scale)}:${Math.round(position.getY(vertex) * scale)}:${Math.round(position.getZ(vertex) * scale)}`
    let canonical = canonicalByPosition.get(key)
    if (canonical == null) {
      canonical = canonicalByPosition.size
      canonicalByPosition.set(key, canonical)
      parents[canonical] = canonical
    }
    canonicalIds[vertex] = canonical
  }
  const find = (value) => {
    let root = value
    while (parents[root] !== root) root = parents[root]
    while (parents[value] !== value) {
      const next = parents[value]
      parents[value] = root
      value = next
    }
    return root
  }
  const union = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parents[rootB] = rootA
  }
  const active = new Set()
  const count = index ? index.count : position.count
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const a = canonicalIds[index ? index.getX(offset) : offset]
    const b = canonicalIds[index ? index.getX(offset + 1) : offset + 1]
    const c = canonicalIds[index ? index.getX(offset + 2) : offset + 2]
    active.add(a)
    active.add(b)
    active.add(c)
    union(a, b)
    union(b, c)
  }
  return new Set([...active].map(find)).size
}

export function auditLowpolyTreeGeometry(geometry, groundEpsilon = 0.0001) {
  const position = geometry.getAttribute('position')
  const index = geometry.index
  const count = index ? index.count : position.count
  const canonicalByPosition = new Map()
  const canonicalIds = new Array(position.count)
  const canonicalY = []
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e5)}:${Math.round(position.getY(i) * 1e5)}:${Math.round(position.getZ(i) * 1e5)}`
    let canonical = canonicalByPosition.get(key)
    if (canonical == null) {
      canonical = canonicalByPosition.size
      canonicalByPosition.set(key, canonical)
      canonicalY[canonical] = position.getY(i)
    }
    canonicalIds[i] = canonical
  }
  const edges = new Map()
  const addEdge = (a, b) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    edges.set(key, (edges.get(key) || 0) + 1)
  }
  for (let i = 0; i < count; i += 3) {
    const a = canonicalIds[index ? index.getX(i) : i]
    const b = canonicalIds[index ? index.getX(i + 1) : i + 1]
    const c = canonicalIds[index ? index.getX(i + 2) : i + 2]
    addEdge(a, b)
    addEdge(b, c)
    addEdge(c, a)
  }
  let boundaryEdges = 0
  let boundaryEdgesAboveGround = 0
  let nonManifoldEdges = 0
  for (const [key, uses] of edges) {
    if (uses > 2) nonManifoldEdges++
    if (uses !== 1) continue
    boundaryEdges++
    const [a, b] = key.split(':').map(Number)
    if (Math.abs(canonicalY[a]) > groundEpsilon || Math.abs(canonicalY[b]) > groundEpsilon) {
      boundaryEdgesAboveGround++
    }
  }
  let belowGroundVertices = 0
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) < -groundEpsilon) belowGroundVertices++
  }
  return { boundaryEdges, boundaryEdgesAboveGround, nonManifoldEdges, belowGroundVertices }
}

function resolutionSignature(recipe, resolution) {
  return JSON.stringify({
    trunk: [
      Math.min(recipe.points.length, resolution.trunkSections),
      Math.min(recipe.sides || 7, resolution.trunkSides),
    ],
    roots: (recipe.roots || []).map((root) => [
      Math.min(root.points.length, resolution.rootSegments),
      Math.min(root.profileSides || 5, resolution.rootProfileSides),
    ]),
    branches: (recipe.branches || []).map((branch) => [
      Math.min(branch.points.length, resolution.branchSegments),
      Math.min(branch.sides || 5, resolution.branchSides),
    ]),
    secondaryBranches: (recipe.secondaryBranches || []).map((branch) => [
      Math.min(branch.points.length, resolution.branchSegments),
      Math.min(branch.sides || 5, resolution.branchSides),
    ]),
  })
}

export function buildLowpolyTreeGeometry(recipe, { triangleBudget = 500, resolutionHint = null } = {}) {
  let canopyDetail = 'faceted-20'
  let canopyGeometry = buildLowpolyCanopyGeometry(recipe.canopy, { detail: canopyDetail })
  let canopyTriangles = countLowpolyTreeTriangles(canopyGeometry)
  const woodTriangleBudget = Math.max(80, triangleBudget - canopyTriangles)
  let result = null
  const hintedLevelIndex = CSG_RESOLUTION_LEVELS.findIndex((level) => level.name === resolutionHint)
  const seenResolutions = new Set()
  const levels = CSG_RESOLUTION_LEVELS
    .slice(Math.max(0, hintedLevelIndex))
    .filter((level) => {
      const signature = resolutionSignature(recipe, level)
      if (seenResolutions.has(signature)) return false
      seenResolutions.add(signature)
      return true
    })
  let resolution = levels[0]
  for (const level of levels) {
    const candidate = buildAtResolution(recipe, level, { useCDTClipping: true })
    const candidateTriangles = countLowpolyTreeTriangles(candidate.geometry)
    const bestTriangles = result ? countLowpolyTreeTriangles(result.geometry) : Infinity
    const candidateConnected = candidate.connectedComponents === 1
    const resultConnected = result?.connectedComponents === 1
    const candidateValid = candidateConnected
      && candidate.topology.boundaryEdgesAboveGround === 0
      && candidate.topology.nonManifoldEdges === 0
    const resultValid = resultConnected
      && result?.topology.boundaryEdgesAboveGround === 0
      && result?.topology.nonManifoldEdges === 0
    const candidateDefects = candidate.topology.boundaryEdgesAboveGround
      + candidate.topology.nonManifoldEdges * 2
    const resultDefects = result
      ? result.topology.boundaryEdgesAboveGround + result.topology.nonManifoldEdges * 2
      : Infinity
    if (!result || (candidateValid && !resultValid) || (
      candidateValid === resultValid && candidateConnected && !resultConnected
    ) || (
      candidateValid === resultValid
      && candidateConnected === resultConnected
      && candidateDefects < resultDefects
    ) || (
      candidateValid === resultValid
      && candidateConnected === resultConnected
      && candidateDefects === resultDefects
      && Number.isFinite(triangleBudget)
      && candidateTriangles < bestTriangles
    )) {
      result?.geometry.dispose()
      result = candidate
      resolution = level
    } else {
      candidate.geometry.dispose()
    }
    if (candidateValid && candidateTriangles <= woodTriangleBudget) break
  }
  const woodTriangles = countLowpolyTreeTriangles(result.geometry)
  if (woodTriangles + canopyTriangles > triangleBudget && canopyTriangles > 0) {
    const budgetCanopy = buildLowpolyCanopyGeometry(recipe.canopy, { detail: 'budget-8' })
    const budgetCanopyTriangles = countLowpolyTreeTriangles(budgetCanopy)
    if (budgetCanopyTriangles < canopyTriangles) {
      canopyGeometry.dispose()
      canopyGeometry = budgetCanopy
      canopyTriangles = budgetCanopyTriangles
      canopyDetail = 'budget-8'
    } else {
      budgetCanopy.dispose()
    }
  }
  setUniformGeometryColor(
    result.geometry,
    recipe.canopy?.palette?.bark ?? LOWPOLY_TREE_PARAMETER_DEFAULTS.barkColor,
  )
  let geometry = result.geometry
  if (canopyTriangles > 0) {
    geometry = mergeGeometryParts([result.geometry, canopyGeometry])
    result.geometry.dispose()
  }
  canopyGeometry.dispose()
  const triangles = countLowpolyTreeTriangles(geometry)
  const topology = auditLowpolyTreeGeometry(geometry)
  return {
    geometry,
    stats: {
      junctionMode: 'csg-union',
      mergedParts: 1 + (recipe.roots?.length || 0) + (recipe.branches?.length || 0) + (recipe.secondaryBranches?.length || 0) + (recipe.canopy?.clusters?.length || 0),
      rootCount: recipe.roots?.length || 0,
      branchCount: recipe.branches?.length || 0,
      secondaryBranchCount: recipe.secondaryBranches?.length || 0,
      canopyCount: recipe.canopy?.clusters?.length || 0,
      triangleBudget,
      woodTriangleBudget,
      woodTriangles,
      canopyTriangles,
      canopyDetail,
      triangles,
      budgetSatisfied: triangles <= triangleBudget,
      resolutionLevel: resolution.name,
      effectiveSections: result.effectiveSections,
      effectiveSides: result.effectiveSides,
      effectiveRootSegments: result.effectiveRootSegments,
      effectiveRootProfileSides: result.effectiveRootProfileSides,
      effectiveBranchSegments: result.effectiveBranchSegments,
      effectiveBranchSides: result.effectiveBranchSides,
      effectiveSecondaryBranchSegments: result.effectiveSecondaryBranchSegments,
      effectiveSecondaryBranchSides: result.effectiveSecondaryBranchSides,
      csgTriangles: result.csgTriangles,
      csgPasses: result.csgPasses,
      csgStrategy: result.csgStrategy,
      csgClipMode: result.csgClipMode,
      resolutionHintUsed: hintedLevelIndex >= 0 ? resolutionHint : null,
      groundTrianglesRemoved: result.groundTrianglesRemoved,
      degenerateTrianglesRemoved: result.degenerateTrianglesRemoved,
      repairedTriangles: result.repairedTriangles,
      woodTopology: result.topology,
      woodConnectedComponents: result.connectedComponents,
      junctionGuaranteed: result.connectedComponents === 1
        && result.topology.boundaryEdgesAboveGround === 0
        && result.topology.nonManifoldEdges === 0,
      groundY: 0,
      topology,
    },
  }
}
