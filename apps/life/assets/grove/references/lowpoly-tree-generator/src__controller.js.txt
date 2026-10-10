export function createLowpolyTreeAnimationController({ clips = [] } = {}) {
  const clipNames = new Set(clips
    .map((clip) => typeof clip === 'string' ? clip : clip.name)
    .filter(Boolean))
  const stateDefinitions = [
    { id: 'idle', clip: 'TreeIdle', loop: true },
    { id: 'walk', clip: 'TreeWalk', loop: true },
    { id: 'run', clip: 'TreeRun', loop: true },
    { id: 'stomp', clip: 'TreeStomp', loop: false },
    { id: 'attack', clip: 'TreeAttack', loop: false },
    { id: 'custom', clip: 'TreeCustom', loop: true },
  ]
  const states = stateDefinitions.filter((state) => clipNames.has(state.clip))
  const stateIds = new Set(states.map((state) => state.id))
  const transitions = [
    { from: 'idle', to: 'walk', when: { parameter: 'speed', op: '>', value: 0.12 }, blend: 0.18 },
    { from: 'walk', to: 'idle', when: { parameter: 'speed', op: '<', value: 0.08 }, blend: 0.22 },
    { from: 'walk', to: 'run', when: { parameter: 'speed', op: '>', value: 0.72 }, blend: 0.16 },
    { from: 'run', to: 'walk', when: { parameter: 'speed', op: '<', value: 0.62 }, blend: 0.18 },
    { from: '*', to: 'attack', when: { trigger: 'attack' }, blend: 0.08 },
    { from: '*', to: 'stomp', when: { trigger: 'stomp' }, blend: 0.08 },
    { from: 'attack', to: 'idle', when: { event: 'complete' }, blend: 0.16 },
    { from: 'stomp', to: 'idle', when: { event: 'complete' }, blend: 0.2 },
    { from: '*', to: 'custom', when: { trigger: 'custom' }, blend: 0.12 },
  ].filter((transition) => (
    (transition.from === '*' || stateIds.has(transition.from)) && stateIds.has(transition.to)
  ))
  return {
    version: 1,
    type: 'rand-monster-tree-animation-controller',
    entry: stateIds.has('idle') ? 'idle' : states[0]?.id || null,
    parameters: [
      { id: 'speed', type: 'number', default: 0 },
      { id: 'wind', type: 'number', default: 1 },
      { id: 'attack', type: 'trigger' },
      { id: 'stomp', type: 'trigger' },
      { id: 'custom', type: 'trigger' },
    ],
    layers: [
      { id: 'base', mode: 'override', states: states.map((state) => state.id) },
      ...(clipNames.has('TreeWind')
        ? [{ id: 'wind', mode: 'additive', clip: 'TreeWind', weightParameter: 'wind' }]
        : []),
    ],
    states,
    transitions,
  }
}
