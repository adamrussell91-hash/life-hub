const MOTION_IDS = Object.freeze(['idle', 'walk', 'run', 'attack', 'stomp'])

export const LOWPOLY_TREE_ANIMATION_PROFILE_DEFAULTS = Object.freeze({
  idle: Object.freeze({ duration: 4, strength: 0.58, windStrength: 0.32, actionDuration: 4 }),
  walk: Object.freeze({ duration: 1.12, strength: 1.48, windStrength: 0.54, actionDuration: 1.12 }),
  run: Object.freeze({ duration: 0.62, strength: 2.18, windStrength: 0.78, actionDuration: 0.62 }),
  attack: Object.freeze({ duration: 0.72, strength: 2.05, windStrength: 0.46, actionDuration: 0.95 }),
  stomp: Object.freeze({ duration: 0.9, strength: 2.2, windStrength: 0.62, actionDuration: 1.15 }),
  tuning: Object.freeze({ body: 1, branches: 1, roots: 1 }),
})

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function normalizeMotion(value = {}, fallback) {
  return {
    duration: clamp(finite(value.duration, fallback.duration), 0.08, 20),
    strength: clamp(finite(value.strength, fallback.strength), 0, 6),
    windStrength: clamp(finite(value.windStrength, fallback.windStrength), 0, 3),
    actionDuration: clamp(finite(value.actionDuration, fallback.actionDuration), 0.08, 20),
  }
}

function normalizeTuning(value = {}, fallback = LOWPOLY_TREE_ANIMATION_PROFILE_DEFAULTS.tuning) {
  return {
    body: clamp(finite(value.body, fallback.body), 0, 3),
    branches: clamp(finite(value.branches, fallback.branches), 0, 3),
    roots: clamp(finite(value.roots, fallback.roots), 0, 3),
  }
}

export function createLowpolyTreeAnimationProfile(value = {}, base = LOWPOLY_TREE_ANIMATION_PROFILE_DEFAULTS) {
  const profile = {}
  for (const id of MOTION_IDS) {
    profile[id] = normalizeMotion(value[id], base[id] || LOWPOLY_TREE_ANIMATION_PROFILE_DEFAULTS[id])
  }
  profile.tuning = normalizeTuning(value.tuning, base.tuning)
  return profile
}

function cloneProfile(profile) {
  return createLowpolyTreeAnimationProfile(profile)
}

export function createLowpolyTreeLiveAnimationProfile(initial = {}) {
  let profile = createLowpolyTreeAnimationProfile(initial)
  const listeners = new Set()

  function emit() {
    for (const listener of listeners) listener(profile)
  }

  return {
    get() {
      return profile
    },
    snapshot() {
      return cloneProfile(profile)
    },
    set(next = {}) {
      profile = createLowpolyTreeAnimationProfile(next, profile)
      emit()
      return profile
    },
    patchMotion(id, patch = {}) {
      if (!MOTION_IDS.includes(id)) throw new RangeError(`Unknown tree animation motion: ${id}`)
      profile = {
        ...profile,
        [id]: normalizeMotion({ ...profile[id], ...patch }, profile[id]),
      }
      emit()
      return profile[id]
    },
    patchTuning(patch = {}) {
      profile = {
        ...profile,
        tuning: normalizeTuning({ ...profile.tuning, ...patch }, profile.tuning),
      }
      emit()
      return profile.tuning
    },
    reset() {
      profile = createLowpolyTreeAnimationProfile()
      emit()
      return profile
    },
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('Tree animation profile listener must be a function')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const LOWPOLY_TREE_ANIMATION_MOTIONS = MOTION_IDS
