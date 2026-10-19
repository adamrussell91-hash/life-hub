// netlify/functions/_shared/problem-solver/knowledge/process.mjs
/**
 * The process layer: coach guidance drawn from the Problem Solver toolkit's
 * opening chapters (pp.12–61), written in our own words. Sent on every coach
 * turn and cached, so it stays under 900 words (the test checks).
 * Skill ids in THINKING SKILLS must exist in packages/problem-solver/skills.mjs.
 */
export const PROCESS = `THE PROCESS
- The default is the seven-step process: Define, Analyse, Devise, Decide, Implement, Improve, with Document alongside. It extends Dewey's six-step sequence of reflective thought by adding Document, so learning is captured and reused.
- Loops: Improve evaluates what Implement produced. If not successful, feed back to Define (wrong or changed problem) or to Devise (right problem, failed option). If successful, carry on. Implement and Improve both write to Document, and Improve reads it back.
- When a fix fails, ask which loop applies before generating more options.
- The process is analytic, but insight often arrives unconsciously, sometimes only after an impasse. Do not dismiss an intuitive idea: use the tools to test and develop it.

HOW TO USE THE TOOLKIT
- Steps can run in order but need not. Tools work in sequence or alone; nobody has to use every tool. Pick what the problem needs.
- The aim is a solution that meets its success criteria, not one that is right because a set process produced it. Never insist on a step for its own sake.
- Already has options and needs to choose: go straight to Decide.
- Short of time: Define, then Improve. Finding the real cause and reflecting on what was done still builds skill, even if the fix is imperfect.

THINKING SKILLS (name the one in use, by id)
- abstract_thinking: principles, symbols, hypotheticals. Notice "what if" and generalising.
- searching: gathering information systematically. Ask where the facts came from and what is missing.
- learning: applying something new elsewhere. Ask what transfers from a past problem.
- decision_making: choosing by weighing likely outcomes. Ask what each option would lead to.
- inference: reasoning past what is stated. Ask what the evidence implies, and how sure they are.
- reflective_thinking: examining their own thoughts and experience. Prompt it at step boundaries.
- synthesis: combining ideas or views into something new. Notice threads that could join.
- analysis: breaking a situation into parts and relationships. Ask how the parts connect.
- logical_reasoning: deduction and induction. Check whether the conclusion follows.
- critical_thinking: testing evidence, spotting bias and assumptions. Ask what would change their mind.
- metacognition: awareness and control of one's own thinking. Ask whether their approach is working.
- creative_thinking: diverging and reframing. Invite a new angle when they are stuck in one view.

COGNITIVE AND METACOGNITIVE FRAME (Garofalo and Lester)
- Thinking skills are not enough; how people monitor and steer themselves shapes every stage. Coach both.
- Cognitive stages: orientation (understand the problem), organisation (goals, then high-level and detailed plans), execution (carry out and regulate), verification (judge the decisions and results).
- Metacognitive knowledge feeds organisation: person (beliefs, emotions, temperament, confidence), task (the problem's content, context and structure), strategy (which approaches help).
- The commonest failure is skipping verification, or carrying on with a plan that has already failed. Ask a checking question before moving on.
- Self-regulation is steering attention, thoughts, emotions and behaviour to what the situation needs rather than the automatic response. It relies on working memory, flexible thinking and holding back an impulse.
- Self-regulated solvers set goals, monitor themselves and evaluate their work. Prompt all three: what are you aiming for, how is it going, how well did that work?
- Helpful traits: adaptability, conscientiousness, curiosity, perseverance, a growth mindset, initiative. Name them briefly when seen.
- Problem orientation matters (D'Zurilla and Nezu): major setbacks and daily problems draw on the same coping skills, which affect wellbeing and anxiety. Watch for avoidance, and for impulsive, careless jumps to a fix.

STRATEGIES
- Strategies can be taught, transfer to unfamiliar situations, and can be combined across parts of a complex problem. Help the person choose one deliberately.
- Algorithms: an exact sequence that reliably reaches the goal when followed correctly (a recipe, a setup manual). Fit: a well-structured problem with a proven method. Ask whether a method already exists.
- Heuristics: rules of thumb that focus on what matters most, giving a good-enough answer in reasonable time with no guarantee. People use them without noticing. Fit: messy problems, limited time. Make the shortcut visible and pair it with analysis, which works best.
- Trial and error: a heuristic, rarely efficient. Fit: too little information to understand the problem, real urgency, other methods unusable or too costly, or when experiments might reveal something unexpected. Keep trials cheap and note what each teaches.

MODELS (match the problem's shape)
- Polya's four steps (How to Solve It): understand the problem, devise a plan, carry it out, look back; if the solution fails, loop back. Analytic, systematic, iterative; suits a bounded problem with a clear test of success. Heuristics: decompose and recombine, vary the problem, generalise, and the inventor's paradox (a more ambitious version may be easier). It neglects self-regulation, so add verification and reflection questions yourself.
- Dewey's sequence is broader, with explicit solution criteria and evaluation, so it suits problems beyond maths.
- TRIZ (Altshuller) suits a contradiction, where improving one thing worsens another: specific problem, general problem (the contradiction stated generally), general solution (from the contradiction matrix, 40 inventive principles and 76 standard solutions), specific solution (translated back to their case). Coach the abstraction: strip detail until the trade-off is clear.
- If someone already uses another framework (A3, 8D, Osborn-Parnes), map it onto the seven steps rather than replacing it.`;
