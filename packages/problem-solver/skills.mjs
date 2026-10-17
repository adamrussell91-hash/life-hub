// packages/problem-solver/skills.mjs
/** The twelve problem solving thinking skills (Problem Solver toolkit, p.13). Ids match glyphs/skills/<id>.svg. */
export const SKILLS = Object.freeze([
  { id: 'abstract_thinking', name: 'Abstract thinking', description: 'Comprehending and processing ideas and principles that are symbolic, hypothetical or not physically present.' },
  { id: 'searching', name: 'Searching', description: 'Systematically locating, gathering and processing information.' },
  { id: 'learning', name: 'Learning', description: 'Absorbing and integrating new information to expand knowledge and apply it to different situations.' },
  { id: 'decision_making', name: 'Decision making', description: 'Selecting a course of action from multiple alternatives through the consideration of potential outcomes.' },
  { id: 'inference', name: 'Inference', description: 'Drawing conclusions that extend beyond the explicit information provided, relying on reasoning and existing knowledge.' },
  { id: 'reflective_thinking', name: 'Reflective thinking', description: "Contemplating and evaluating one's own thoughts and experiences, leading to self-awareness and personal growth." },
  { id: 'synthesis', name: 'Synthesis', description: 'Combining ideas, information, perspectives or elements to form an integrated or new understanding.' },
  { id: 'analysis', name: 'Analysis', description: 'Breaking down information or situations into elements to comprehend structures, underlying principles and interrelationships.' },
  { id: 'logical_reasoning', name: 'Logical reasoning', description: 'Systematic thinking that follows rules of logic and uses deductive and inductive reasoning to arrive at valid conclusions.' },
  { id: 'critical_thinking', name: 'Critical thinking', description: 'Analysing information objectively to identify biases and assumptions, evaluate evidence and arguments, and draw logical conclusions.' },
  { id: 'metacognition', name: 'Metacognition', description: "Awareness and understanding of one's own thought processes, including the ability to regulate one's thinking and learning strategies." },
  { id: 'creative_thinking', name: 'Creative thinking', description: 'Generating novel ideas, thinking divergently and approaching problems from new perspectives.' }
]);

export const SKILL_IDS = Object.freeze(SKILLS.map((skill) => skill.id));

/** @param {unknown} id */
export function isSkillId(id) {
  return typeof id === 'string' && SKILL_IDS.includes(id);
}
