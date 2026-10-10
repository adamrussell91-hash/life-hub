import * as THREE from 'three'

const _point = new THREE.Vector3()
const _start = new THREE.Vector3()
const _end = new THREE.Vector3()
const _segment = new THREE.Vector3()
const _closest = new THREE.Vector3()
const _projection = new THREE.Vector3()
const _euler = new THREE.Euler()
const _rotation = new THREE.Quaternion()
const _secondaryRotation = new THREE.Quaternion()
const _walkPosition = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _posePositionA = new THREE.Vector3()
const _posePositionB = new THREE.Vector3()
const _poseQuaternionA = new THREE.Quaternion()
const _poseQuaternionB = new THREE.Quaternion()

const TAU = Math.PI * 2

export const LOWPOLY_TREE_ANIMATION_PRESETS = Object.freeze({
  idle: Object.freeze({ clip: 'TreeIdle', kind: 'wind', duration: 5.2, strength: 0.38, samples: 17, loop: true }),
  wind: Object.freeze({ clip: 'TreeWind', kind: 'wind', duration: 4, strength: 1, samples: 17, loop: true }),
  walk: Object.freeze({ clip: 'TreeWalk', kind: 'walk', duration: 2.4, strength: 1, samples: 17, loop: true }),
  run: Object.freeze({ clip: 'TreeRun', kind: 'walk', duration: 1.25, strength: 1.65, samples: 21, loop: true }),
  stomp: Object.freeze({ clip: 'TreeStomp', kind: 'stomp', duration: 1.15, strength: 1.35, samples: 17, loop: false }),
  attack: Object.freeze({ clip: 'TreeAttack', kind: 'attack', duration: 0.95, strength: 1.25, samples: 17, loop: false }),
})

function vectorFromPoint(point) {
  return new THREE.Vector3(point[0], point[1], point[2])
}

function nearestPointIndex(points, target) {
  let bestIndex = 0
  let bestDistance = Infinity
  for (let index = 0; index < points.length; index++) {
    const point = points[index]
    const distance = target.distanceToSquared(_point.set(point[0], point[1], point[2]))
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }
  return bestIndex
}

function addBoneChain({
  allBones,
  animatedBones,
  walkBones = [],
  name,
  level,
  points,
  parentBone = null,
  parentPosition = null,
  chainIndex = 0,
  windAnimated = true,
  walkAnimated = false,
}) {
  const bones = []
  let previousBone = parentBone
  let previousPosition = parentPosition
  const divisor = Math.max(1, points.length - 1)
  for (let index = 0; index < points.length; index++) {
    const worldPosition = vectorFromPoint(points[index])
    const bone = new THREE.Bone()
    bone.name = `${name}-${String(index).padStart(2, '0')}`
    bone.position.copy(previousPosition ? worldPosition.clone().sub(previousPosition) : worldPosition)
    bone.userData.treeRigLevel = level
    bone.userData.treeRigT = index / divisor
    bone.userData.treeRigChain = chainIndex
    if (previousBone) previousBone.add(bone)
    bones.push(bone)
    allBones.push(bone)
    const entry = {
      bone,
      level,
      chainIndex,
      pointIndex: index,
      t: index / divisor,
      phase: allBones.length * 0.73 + level.length * 0.41,
      restPosition: bone.position.clone(),
      restQuaternion: bone.quaternion.clone(),
    }
    if (windAnimated && index > 0) {
      animatedBones.push({
        ...entry,
      })
    }
    if (walkAnimated) walkBones.push(entry)
    previousBone = bone
    previousPosition = worldPosition
  }
  return bones
}

function addCurveSegments(target, points, bones, level) {
  for (let index = 0; index < points.length - 1; index++) {
    target.push({
      start: vectorFromPoint(points[index]),
      end: vectorFromPoint(points[index + 1]),
      startBone: bones[index],
      endBone: bones[index + 1],
      level,
    })
  }
}

function closestSegmentInfluence(position, segments) {
  let best = null
  let bestDistance = Infinity
  for (const segment of segments) {
    _start.copy(segment.start)
    _end.copy(segment.end)
    _segment.subVectors(_end, _start)
    const lengthSquared = _segment.lengthSq()
    const t = lengthSquared > 1e-8
      ? THREE.MathUtils.clamp(_projection.copy(position).sub(_start).dot(_segment) / lengthSquared, 0, 1)
      : 0
    _closest.copy(_start).addScaledVector(_segment, t)
    const distance = _closest.distanceToSquared(position)
    if (distance < bestDistance) {
      bestDistance = distance
      best = { ...segment, t }
    }
  }
  return best
}

function addSkinAttributes(geometry, bones, segments) {
  const position = geometry.getAttribute('position')
  const skinIndices = new Uint16Array(position.count * 4)
  const skinWeights = new Float32Array(position.count * 4)
  const boneIndices = new Map(bones.map((bone, index) => [bone, index]))

  for (let index = 0; index < position.count; index++) {
    _point.fromBufferAttribute(position, index)
    const offset = index * 4
    const influence = closestSegmentInfluence(_point, segments)
    if (!influence) {
      skinIndices[offset] = 0
      skinWeights[offset] = 1
      continue
    }
    const startIndex = boneIndices.get(influence.startBone) ?? 0
    const endIndex = boneIndices.get(influence.endBone) ?? startIndex
    const endWeight = THREE.MathUtils.smoothstep(influence.t, 0, 1)
    skinIndices[offset] = startIndex
    skinIndices[offset + 1] = endIndex
    skinWeights[offset] = 1 - endWeight
    skinWeights[offset + 1] = endWeight
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4))
}

function rotationForEntry(entry, timeSeconds, strength, target, duration = 4) {
  const levelStrength = entry.level === 'trunk' ? 0.028 : entry.level === 'primary' ? 0.052 : 0.078
  const cycle = timeSeconds / Math.max(0.1, duration) * TAU
  const amount = levelStrength * entry.t * strength
  const bendX = Math.sin(cycle + entry.phase) * amount * 0.52
  const bendZ = (
    Math.sin(cycle + entry.phase * 1.31) * 0.78
    + Math.sin(cycle * 2 + entry.phase * 0.47) * 0.22
  ) * amount
  return target.setFromEuler(_euler.set(bendX, 0, bendZ, 'XYZ'))
}

function walkCycle(timeSeconds, duration) {
  return timeSeconds / Math.max(0.1, duration) * TAU
}

function walkBodyPosition(entry, timeSeconds, duration, strength, target) {
  const cycle = walkCycle(timeSeconds, duration)
  const bob = (0.5 - Math.cos(cycle * 2) * 0.5) * 0.055 * strength
  const sway = Math.sin(cycle) * 0.025 * strength
  return target.copy(entry.restPosition).add(_point.set(sway, bob, 0))
}

function walkTrunkRotation(entry, timeSeconds, duration, strength, target) {
  const cycle = walkCycle(timeSeconds, duration)
  const rootAmount = entry.pointIndex === 0 ? 1 : entry.t
  const pitch = Math.sin(cycle) * 0.018 * strength * (1 - rootAmount * 0.28)
  const yaw = Math.sin(cycle * 0.5) * 0.012 * strength * rootAmount
  const roll = Math.sin(cycle + Math.PI * 0.5) * 0.028 * strength * (0.45 + rootAmount * 0.55)
  return target.setFromEuler(_euler.set(pitch, yaw, roll, 'XYZ'))
}

function walkRootRotation(entry, timeSeconds, duration, strength, target) {
  const cycle = walkCycle(timeSeconds, duration)
  const stepPhase = (entry.chainIndex % 2) * Math.PI + Math.floor(entry.chainIndex / 2) * 0.16
  const wave = Math.sin(cycle + stepPhase)
  const lift = Math.max(0, wave)
  const planted = Math.max(0, -wave)
  const baseLift = lift * (0.29 - entry.t * 0.08) - planted * 0.018
  const curl = lift * entry.t * 0.12
  const swing = Math.cos(cycle + stepPhase) * (0.055 - entry.t * 0.018)
  target.setFromAxisAngle(entry.liftAxis, (baseLift + curl) * strength)
  _secondaryRotation.setFromAxisAngle(_up, swing * strength)
  return target.multiply(_secondaryRotation)
}

function safeSampleTimes(duration, samples) {
  const safeDuration = Math.max(0.1, Number(duration) || 0.1)
  const safeSamples = Math.max(2, Math.round(Number(samples) || 2))
  return {
    duration: safeDuration,
    times: Array.from({ length: safeSamples }, (_, index) => index / (safeSamples - 1) * safeDuration),
  }
}

export function resetLowpolyTreeRigPose(rig, updateSkeleton = true) {
  if (!rig) return
  for (const entry of rig.restPose) {
    entry.bone.position.copy(entry.position)
    entry.bone.quaternion.copy(entry.quaternion)
    entry.bone.scale.copy(entry.scale)
  }
  if (updateSkeleton) rig.skeleton.update()
}

export function createLowpolyTreeRig(treeRoot, recipe, {
  meshName = 'csg-union-wood-and-lowpoly-canopy',
} = {}) {
  const sourceMesh = treeRoot.getObjectByName(meshName)
  if (!sourceMesh?.isMesh || !sourceMesh.geometry) throw new Error(`Tree rig source mesh not found: ${meshName}`)
  const trunkPoints = recipe.points || []
  if (trunkPoints.length < 2) throw new Error('Tree rig requires at least two trunk points')

  const allBones = []
  const animatedBones = []
  const walkRootBones = []
  const walkTrunkBones = []
  const segments = []
  const trunkBones = addBoneChain({
    allBones,
    animatedBones,
    walkBones: walkTrunkBones,
    name: 'rm-tree-trunk',
    level: 'trunk',
    points: trunkPoints,
    walkAnimated: true,
  })
  addCurveSegments(segments, trunkPoints, trunkBones, 'trunk')

  const rootBoneChains = []
  for (let rootIndex = 0; rootIndex < (recipe.roots || []).length; rootIndex++) {
    const root = recipe.roots[rootIndex]
    if (!root.points?.length) continue
    const chain = addBoneChain({
      allBones,
      animatedBones,
      walkBones: walkRootBones,
      name: `rm-tree-root-${String(rootIndex).padStart(2, '0')}`,
      level: 'root',
      points: root.points,
      chainIndex: rootIndex,
      windAnimated: false,
      walkAnimated: true,
    })
    const direction = vectorFromPoint(root.points.at(-1)).sub(vectorFromPoint(root.points[0]))
    direction.y = 0
    if (direction.lengthSq() < 1e-8) direction.set(1, 0, 0)
    direction.normalize()
    const liftAxis = new THREE.Vector3(-direction.z, 0, direction.x).normalize()
    for (const entry of walkRootBones.slice(-chain.length)) entry.liftAxis = liftAxis.clone()
    rootBoneChains[rootIndex] = chain
    addCurveSegments(segments, root.points, chain, 'root')
  }

  const primaryBoneChains = []
  for (let branchIndex = 0; branchIndex < (recipe.branches || []).length; branchIndex++) {
    const branch = recipe.branches[branchIndex]
    if (!branch.points?.length) continue
    const attachment = vectorFromPoint(branch.points[0])
    const parentIndex = nearestPointIndex(trunkPoints, attachment)
    const chain = addBoneChain({
      allBones,
      animatedBones,
      walkBones: [],
      name: `rm-tree-primary-${String(branchIndex).padStart(2, '0')}`,
      level: 'primary',
      points: branch.points,
      parentBone: trunkBones[parentIndex],
      parentPosition: vectorFromPoint(trunkPoints[parentIndex]),
    })
    primaryBoneChains[branchIndex] = chain
    addCurveSegments(segments, branch.points, chain, 'primary')
  }

  const secondaryBoneChains = []
  for (let branchIndex = 0; branchIndex < (recipe.secondaryBranches || []).length; branchIndex++) {
    const branch = recipe.secondaryBranches[branchIndex]
    if (!branch.points?.length) continue
    const parentBranchIndex = branch.parentBranchIndex ?? branchIndex % Math.max(1, primaryBoneChains.length)
    const parentBranch = recipe.branches?.[parentBranchIndex]
    const parentChain = primaryBoneChains[parentBranchIndex]
    if (!parentBranch?.points?.length || !parentChain?.length) continue
    const attachment = vectorFromPoint(branch.points[0])
    const parentIndex = nearestPointIndex(parentBranch.points, attachment)
    const chain = addBoneChain({
      allBones,
      animatedBones,
      walkBones: [],
      name: `rm-tree-secondary-${String(branchIndex).padStart(2, '0')}`,
      level: 'secondary',
      points: branch.points,
      parentBone: parentChain[parentIndex],
      parentPosition: vectorFromPoint(parentBranch.points[parentIndex]),
    })
    secondaryBoneChains[branchIndex] = chain
    addCurveSegments(segments, branch.points, chain, 'secondary')
  }

  addSkinAttributes(sourceMesh.geometry, allBones, segments)
  const skinnedMesh = new THREE.SkinnedMesh(sourceMesh.geometry, sourceMesh.material)
  skinnedMesh.name = sourceMesh.name
  skinnedMesh.position.copy(sourceMesh.position)
  skinnedMesh.quaternion.copy(sourceMesh.quaternion)
  skinnedMesh.scale.copy(sourceMesh.scale)
  skinnedMesh.castShadow = sourceMesh.castShadow
  skinnedMesh.receiveShadow = sourceMesh.receiveShadow
  skinnedMesh.frustumCulled = sourceMesh.frustumCulled
  skinnedMesh.userData = { ...sourceMesh.userData, treeRigged: true }

  const parent = sourceMesh.parent
  sourceMesh.removeFromParent()
  parent.add(skinnedMesh)
  skinnedMesh.add(trunkBones[0])
  for (const chain of rootBoneChains) {
    if (chain?.[0]) skinnedMesh.add(chain[0])
  }
  treeRoot.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(allBones)
  skinnedMesh.bind(skeleton)

  const restPose = allBones.map((bone) => ({
    bone,
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
    scale: bone.scale.clone(),
  }))

  const rig = {
    mesh: skinnedMesh,
    skeleton,
    bones: allBones,
    animatedBones,
    restPose,
    segments,
    trunkBones,
    rootBoneChains,
    primaryBoneChains,
    secondaryBoneChains,
    walkRootBones,
    walkTrunkBones,
  }
  treeRoot.userData.treeRig = {
    boneCount: allBones.length,
    trunkBones: trunkBones.length,
    rootBones: rootBoneChains.reduce((sum, chain) => sum + (chain?.length || 0), 0),
    primaryBones: primaryBoneChains.reduce((sum, chain) => sum + (chain?.length || 0), 0),
    secondaryBones: secondaryBoneChains.reduce((sum, chain) => sum + (chain?.length || 0), 0),
  }
  return rig
}

export function updateLowpolyTreeRig(rig, timeSeconds, strength = 1, duration = 4) {
  if (!rig) return
  resetLowpolyTreeRigPose(rig, false)
  for (const entry of rig.animatedBones) {
    rotationForEntry(entry, timeSeconds, strength, _rotation, duration)
    entry.bone.quaternion.copy(entry.restQuaternion).multiply(_rotation)
  }
  rig.skeleton.update()
}

export function updateLowpolyTreeWalkRig(rig, timeSeconds, strength = 1, duration = 2.4, {
  windStrength = 0,
  windTimeSeconds = timeSeconds,
  windDuration = 4,
} = {}) {
  if (!rig) return
  resetLowpolyTreeRigPose(rig, false)
  const bodyEntry = rig.walkTrunkBones[0]
  if (bodyEntry) walkBodyPosition(bodyEntry, timeSeconds, duration, strength, bodyEntry.bone.position)
  for (const entry of rig.walkTrunkBones) {
    walkTrunkRotation(entry, timeSeconds, duration, strength, _rotation)
    entry.bone.quaternion.copy(entry.restQuaternion).multiply(_rotation)
  }
  for (const entry of rig.walkRootBones) {
    walkRootRotation(entry, timeSeconds, duration, strength, _rotation)
    entry.bone.quaternion.copy(entry.restQuaternion).multiply(_rotation)
  }
  if (windStrength > 0) {
    for (const entry of rig.animatedBones) {
      rotationForEntry(entry, windTimeSeconds, windStrength, _rotation, windDuration)
      entry.bone.quaternion.multiply(_rotation)
    }
  }
  rig.skeleton.update()
}

export function createLowpolyTreeWindClip(rig, {
  duration = 4,
  strength = 1,
  samples = 9,
} = {}) {
  const tracks = []
  const sampleData = safeSampleTimes(duration, samples)
  const times = sampleData.times
  for (const entry of rig.animatedBones) {
    const values = []
    for (const time of times) {
      rotationForEntry(entry, time, strength, _rotation, sampleData.duration)
      const quaternion = entry.restQuaternion.clone().multiply(_rotation)
      values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${entry.bone.name}.quaternion`, times, values))
  }
  return new THREE.AnimationClip('TreeWind', sampleData.duration, tracks)
}

export function createLowpolyTreeWalkClip(rig, {
  duration = 2.4,
  strength = 1,
  samples = 17,
} = {}) {
  const tracks = []
  const sampleData = safeSampleTimes(duration, samples)
  const times = sampleData.times
  const bodyEntry = rig.walkTrunkBones[0]
  if (bodyEntry) {
    const values = []
    for (const time of times) {
      walkBodyPosition(bodyEntry, time, sampleData.duration, strength, _walkPosition)
      values.push(_walkPosition.x, _walkPosition.y, _walkPosition.z)
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${bodyEntry.bone.name}.position`, times, values))
  }
  for (const entry of rig.walkTrunkBones) {
    const values = []
    for (const time of times) {
      walkTrunkRotation(entry, time, sampleData.duration, strength, _rotation)
      const quaternion = entry.restQuaternion.clone().multiply(_rotation)
      values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${entry.bone.name}.quaternion`, times, values))
  }
  for (const entry of rig.walkRootBones) {
    const values = []
    for (const time of times) {
      walkRootRotation(entry, time, sampleData.duration, strength, _rotation)
      const quaternion = entry.restQuaternion.clone().multiply(_rotation)
      values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${entry.bone.name}.quaternion`, times, values))
  }
  return new THREE.AnimationClip('TreeWalk', sampleData.duration, tracks)
}

function resolvedAnimationPreset(presetId, overrides = {}) {
  const preset = LOWPOLY_TREE_ANIMATION_PRESETS[presetId]
  if (!preset) throw new Error(`Unknown tree animation preset: ${presetId}`)
  return { ...preset, ...overrides }
}

function applyWindOverlay(rig, timeSeconds, strength, duration) {
  if (strength <= 0) return
  for (const entry of rig.animatedBones) {
    rotationForEntry(entry, timeSeconds, strength, _rotation, duration)
    entry.bone.quaternion.multiply(_rotation)
  }
}

function updateLowpolyTreeActionRig(rig, kind, timeSeconds, strength, duration, {
  windStrength = 0,
  windTimeSeconds = timeSeconds,
  windDuration = 4,
} = {}) {
  resetLowpolyTreeRigPose(rig, false)
  const u = THREE.MathUtils.clamp(timeSeconds / Math.max(0.1, duration), 0, 1)
  const envelope = Math.sin(Math.PI * u)
  const pulse = Math.sin(TAU * u) * envelope
  const bodyEntry = rig.walkTrunkBones[0]
  if (bodyEntry) {
    bodyEntry.bone.position.copy(bodyEntry.restPosition)
    if (kind === 'stomp') bodyEntry.bone.position.y += pulse * 0.09 * strength
    else bodyEntry.bone.position.z += envelope * envelope * 0.18 * strength
  }

  const impact = Math.max(0, -Math.sin(TAU * u)) * envelope
  const lunge = envelope * envelope
  for (const entry of rig.walkTrunkBones) {
    if (kind === 'stomp') {
      _rotation.setFromEuler(_euler.set(
        -impact * 0.055 * (0.35 + entry.t * 0.65) * strength,
        0,
        pulse * 0.045 * (0.45 + entry.t * 0.55) * strength,
        'XYZ',
      ))
    } else {
      _rotation.setFromEuler(_euler.set(
        -lunge * 0.12 * (0.4 + entry.t * 0.6) * strength,
        pulse * 0.045 * entry.t * strength,
        pulse * 0.035 * (1 - entry.t * 0.4) * strength,
        'XYZ',
      ))
    }
    entry.bone.quaternion.copy(entry.restQuaternion).multiply(_rotation)
  }

  for (const entry of rig.walkRootBones) {
    const amount = kind === 'stomp'
      ? (-impact * 0.2 + envelope * 0.025) * (1 - entry.t * 0.28)
      : -lunge * 0.055 * (1 - entry.t * 0.22)
    _rotation.setFromAxisAngle(entry.liftAxis, amount * strength)
    entry.bone.quaternion.copy(entry.restQuaternion).multiply(_rotation)
  }
  applyWindOverlay(rig, windTimeSeconds, windStrength, windDuration)
  rig.skeleton.update()
}

export function updateLowpolyTreePresetRig(rig, presetId, timeSeconds, overrides = {}) {
  if (!rig) return
  const preset = resolvedAnimationPreset(presetId, overrides)
  if (preset.kind === 'wind') {
    updateLowpolyTreeRig(rig, timeSeconds, preset.strength, preset.duration)
    return
  }
  if (preset.kind === 'walk') {
    updateLowpolyTreeWalkRig(rig, timeSeconds, preset.strength, preset.duration, overrides)
    return
  }
  updateLowpolyTreeActionRig(rig, preset.kind, timeSeconds, preset.strength, preset.duration, overrides)
}

function createBakedPoseClip(rig, {
  name,
  duration,
  samples,
  samplePose,
}) {
  const sampleData = safeSampleTimes(duration, samples)
  const captured = new Map(rig.bones.map((bone) => [bone, { positions: [], quaternions: [] }]))
  for (const time of sampleData.times) {
    samplePose(time)
    for (const bone of rig.bones) {
      const values = captured.get(bone)
      values.positions.push(bone.position.x, bone.position.y, bone.position.z)
      let x = bone.quaternion.x
      let y = bone.quaternion.y
      let z = bone.quaternion.z
      let w = bone.quaternion.w
      const previous = values.quaternions
      if (previous.length >= 4) {
        const offset = previous.length - 4
        const dot = previous[offset] * x + previous[offset + 1] * y + previous[offset + 2] * z + previous[offset + 3] * w
        if (dot < 0) {
          x = -x
          y = -y
          z = -z
          w = -w
        }
      }
      values.quaternions.push(x, y, z, w)
    }
  }
  resetLowpolyTreeRigPose(rig)

  const restByBone = new Map(rig.restPose.map((entry) => [entry.bone, entry]))
  const tracks = []
  for (const bone of rig.bones) {
    const rest = restByBone.get(bone)
    const values = captured.get(bone)
    let positionChanged = false
    let quaternionChanged = false
    for (let index = 0; index < sampleData.times.length; index++) {
      const positionOffset = index * 3
      const quaternionOffset = index * 4
      _posePositionA.fromArray(values.positions, positionOffset)
      _poseQuaternionA.fromArray(values.quaternions, quaternionOffset)
      positionChanged ||= _posePositionA.distanceToSquared(rest.position) > 1e-10
      quaternionChanged ||= 1 - Math.abs(_poseQuaternionA.dot(rest.quaternion)) > 1e-8
    }
    if (positionChanged) {
      tracks.push(new THREE.VectorKeyframeTrack(`${bone.name}.position`, sampleData.times, values.positions))
    }
    if (quaternionChanged) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, sampleData.times, values.quaternions))
    }
  }
  return new THREE.AnimationClip(name, sampleData.duration, tracks)
}

export function createLowpolyTreePresetClip(rig, presetId, overrides = {}) {
  const preset = resolvedAnimationPreset(presetId, overrides)
  let clip
  if (preset.kind === 'wind') {
    clip = createLowpolyTreeWindClip(rig, preset)
  } else if (preset.kind === 'walk') {
    clip = createLowpolyTreeWalkClip(rig, preset)
  } else {
    clip = createBakedPoseClip(rig, {
      ...preset,
      name: preset.clip,
      samplePose: (time) => updateLowpolyTreeActionRig(
        rig,
        preset.kind,
        time,
        preset.strength,
        preset.duration,
      ),
    })
  }
  clip.name = preset.clip
  clip.userData = { preset: presetId, loop: preset.loop }
  return clip
}

export function createLowpolyTreePresetClips(rig, {
  presetIds = Object.keys(LOWPOLY_TREE_ANIMATION_PRESETS),
  overrides = {},
} = {}) {
  return presetIds.map((presetId) => createLowpolyTreePresetClip(rig, presetId, overrides[presetId]))
}

export function captureLowpolyTreeRigPose(rig) {
  return {
    version: 1,
    bones: Object.fromEntries(rig.bones.map((bone) => [bone.name, {
      position: bone.position.toArray(),
      quaternion: bone.quaternion.toArray(),
    }])),
  }
}

export function applyLowpolyTreeRigPose(rig, pose, updateSkeleton = true) {
  if (!rig || !pose?.bones) return
  const restByBone = new Map(rig.restPose.map((entry) => [entry.bone, entry]))
  for (const bone of rig.bones) {
    const rest = restByBone.get(bone)
    const value = pose.bones[bone.name]
    bone.position.fromArray(value?.position || rest.position.toArray())
    bone.quaternion.fromArray(value?.quaternion || rest.quaternion.toArray()).normalize()
    bone.scale.copy(rest.scale)
  }
  if (updateSkeleton) rig.skeleton.update()
}

function normalizedPoseKeys(keyframes) {
  return (keyframes || [])
    .filter((keyframe) => keyframe?.pose?.bones)
    .map((keyframe) => ({
      phase: THREE.MathUtils.clamp(Number(keyframe.phase) || 0, 0, 1),
      pose: keyframe.pose,
    }))
    .sort((a, b) => a.phase - b.phase)
}

function resolvePoseKeyPair(keys, phase, loop) {
  if (keys.length === 1) return { previous: keys[0], next: keys[0], amount: 0 }
  let previous = keys[0]
  let next = keys.at(-1)
  let previousPhase = previous.phase
  let nextPhase = next.phase
  if (loop) {
    previous = keys.at(-1)
    previousPhase = previous.phase - 1
    next = keys[0]
    nextPhase = next.phase
  }
  for (const key of keys) {
    if (key.phase <= phase) {
      previous = key
      previousPhase = key.phase
    }
    if (key.phase > phase) {
      next = key
      nextPhase = key.phase
      break
    }
  }
  if (loop && nextPhase <= previousPhase) nextPhase += 1
  let samplePhase = phase
  if (loop && samplePhase < previousPhase) samplePhase += 1
  return {
    previous,
    next,
    amount: next === previous
      ? 0
      : THREE.MathUtils.clamp(
        (samplePhase - previousPhase) / Math.max(1e-8, nextPhase - previousPhase),
        0,
        1,
      ),
  }
}

function interpolatePoseAmount(amount, interpolation) {
  if (interpolation === 'constant') return 0
  if (interpolation === 'smooth') return amount * amount * (3 - 2 * amount)
  return amount
}

export function applyLowpolyTreeKeyframes(rig, keyframes, timeSeconds, {
  duration = 3,
  loop = true,
  interpolation = 'linear',
} = {}) {
  const keys = normalizedPoseKeys(keyframes)
  if (keys.length === 0) {
    resetLowpolyTreeRigPose(rig)
    return
  }
  const rawPhase = timeSeconds / Math.max(0.1, duration)
  const phase = loop
    ? THREE.MathUtils.euclideanModulo(rawPhase, 1)
    : THREE.MathUtils.clamp(rawPhase, 0, 1)
  const restByBone = new Map(rig.restPose.map((entry) => [entry.bone, entry]))
  for (const bone of rig.bones) {
    const rest = restByBone.get(bone)
    const boneKeys = keys.filter((key) => key.pose.bones[bone.name])
    if (boneKeys.length === 0) {
      bone.position.copy(rest.position)
      bone.quaternion.copy(rest.quaternion)
      bone.scale.copy(rest.scale)
      continue
    }
    const pair = resolvePoseKeyPair(boneKeys, phase, loop)
    const amount = interpolatePoseAmount(pair.amount, interpolation)
    const a = pair.previous.pose.bones[bone.name]
    const b = pair.next.pose.bones[bone.name]
    _posePositionA.fromArray(a.position)
    _posePositionB.fromArray(b.position)
    bone.position.copy(_posePositionA).lerp(_posePositionB, amount)
    _poseQuaternionA.fromArray(a.quaternion).normalize()
    _poseQuaternionB.fromArray(b.quaternion).normalize()
    bone.quaternion.copy(_poseQuaternionA).slerp(_poseQuaternionB, amount)
    bone.scale.copy(rest.scale)
  }
  rig.skeleton.update()
}

export function createLowpolyTreeKeyframeClip(rig, keyframes, {
  name = 'TreeCustom',
  duration = 3,
  samples = 25,
  loop = true,
  interpolation = 'linear',
} = {}) {
  if (normalizedPoseKeys(keyframes).length === 0) throw new Error('Tree custom animation requires at least one pose key')
  return createBakedPoseClip(rig, {
    name,
    duration,
    samples,
    samplePose: (time) => applyLowpolyTreeKeyframes(rig, keyframes, time, { duration, loop, interpolation }),
  })
}
