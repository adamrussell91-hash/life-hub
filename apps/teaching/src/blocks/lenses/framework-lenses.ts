import { dataLens, type DataLensSpec } from './data-lens';
import type { LensLevel, LensStep } from './types';

/**
 * Five whole-unit frameworks as stepped lenses: Rosenshine, Willingham, MARGE, Wiliam's five
 * strategies and Berger. Lenses can reach students, so every prompt here is original wording
 * for students, never the book's. The picker line names the source as a framework chapter of
 * Teaching WalkThrus, not a WalkThru. Adam can rewrite any prompt per block in the lens setup.
 */
type Text = Record<LensLevel, string>;
type Row = { id: string; title: string; prompt: (focus: string) => Text; support: Text };

function build(rows: Row[]): DataLensSpec['steps'] {
  return (level, focus): LensStep[] => rows.map((row) => ({ id: row.id, title: row.title, prompt: row.prompt(focus)[level], support: row.support[level] }));
}

const FRAME = 'My first thought about ___ was ___. After thinking it through, ___ because ___.';
function writeUp(core: string[], extend: string): DataLensSpec['writeItDown'] {
  return (level) =>
    level === 'extend'
      ? { challenge: extend, checklist: [...core, 'Joins the ideas instead of listing them'] }
      : { frame: FRAME, checklist: level === 'support' ? core.slice(0, 2) : core };
}

const ROSENSHINE: DataLensSpec = {
  id: 'fw_rosenshine',
  label: 'Rosenshine',
  group: 'Frameworks',
  path: 'Recall → small step → check → review · Rosenshine framework chapter',
  symbolPath: 'M4 18V6M4 6l5 4-5 4M12 6h8M12 12h8M12 18h8',
  steps: build([
    { id: 'recall', title: 'Recall first', prompt: (f) => ({ support: `Write what you remember about ${f}.`, core: `Without notes, write what you already know about ${f}.`, extend: `Without notes, write everything you can recall about ${f} and mark what you are least sure of.` }), support: { support: 'Even one or two words is a good start.', core: 'Try before you look anything up.', extend: '' } },
    { id: 'small', title: 'Take one small step', prompt: (f) => ({ support: `What is one new thing about ${f}?`, core: `Name the next new idea about ${f} and say how it builds on what you recalled.`, extend: `Name the next idea about ${f} and explain why it has to come after the ones you recalled.` }), support: { support: 'One idea only.', core: 'Link new to known.', extend: '' } },
    { id: 'check', title: 'Check yourself', prompt: () => ({ support: 'Explain the new idea in your own words.', core: 'Close your notes and explain the new idea in your own words. Then check.', extend: 'Explain the idea to someone who has never met it, then find the gap in your own explanation.' }), support: { support: 'Say it out loud first if that helps.', core: 'Where did you get stuck?', extend: '' } },
    { id: 'review', title: 'Plan your review', prompt: () => ({ support: 'What will you need to remember next week?', core: 'What should you review tomorrow, next week and next month so this sticks?', extend: 'Design a review schedule for this idea and say what you will ask yourself each time.' }), support: { support: 'Pick one thing.', core: 'Spaced, not all at once.', extend: '' } }
  ]),
  writeItDown: writeUp(['Says what I already knew', 'Says what is new', 'Says how I will review it'], 'Write a short explanation of the new idea and what you will do to keep it.'),
  examples: { support: 'I already knew that plants need light. New: plants make food from light, water and air. I will test myself on it on Friday.', core: 'I recalled that plants need light. The new step is photosynthesis, which builds on that. I explained it without notes and missed the role of water, so I will review it tomorrow and next week.', extend: 'Recall: light, roots. New: photosynthesis follows because the plant needs a source of energy for growth. My explanation skipped where the carbon comes from, so my review will start with that question.' }
};

const WILLINGHAM: DataLensSpec = {
  id: 'fw_willingham',
  label: 'Willingham',
  group: 'Frameworks',
  path: 'Meaning → story → connect → practise · Willingham framework chapter',
  symbolPath: 'M5 4h14v16H5zM9 9h6M9 13h6',
  steps: build([
    { id: 'meaning', title: 'What is it really about?', prompt: (f) => ({ support: `In one sentence, what is ${f} about?`, core: `What should you be thinking about while you study ${f}? Name the idea, not the topic.`, extend: `Name the idea underneath ${f} that everything else hangs from.` }), support: { support: 'Not the title: the idea.', core: '', extend: '' } },
    { id: 'story', title: 'Find the story', prompt: () => ({ support: 'Who or what is involved, and what changes?', core: 'Tell it as a story: what is the problem, what gets in the way, and how does it end?', extend: 'Tell it as a story with a cause, a conflict, a complication and a result. Which part is the most important?' }), support: { support: 'Start, middle, end.', core: 'A story is easier to remember than a list.', extend: '' } },
    { id: 'connect', title: 'Connect it', prompt: () => ({ support: 'What does this remind you of?', core: 'Connect it to something you already know. How are they alike and different?', extend: 'Connect it to two other things you know and say what that connection explains.' }), support: { support: 'Anything counts.', core: '', extend: '' } },
    { id: 'practise', title: 'Practise to remember', prompt: () => ({ support: 'Write one question you could ask yourself about this.', core: 'Write a question that makes you think about the meaning. Answer it from memory.', extend: 'Write two questions that need understanding, not just recall. Answer them from memory.' }), support: { support: 'Memory comes from thinking.', core: '', extend: '' } }
  ]),
  writeItDown: writeUp(['Names the idea, not the topic', 'Tells it as a story', 'Makes a connection'], 'Write a short account that tells the story of the idea and connects it to something else you know.'),
  examples: { support: 'It is about how a small change can grow. The story: a seed gets water and grows. It reminds me of saving money.', core: 'The idea is feedback loops, not just weather. The problem is warming; the complication is that melting ice makes more warming. It connects to a microphone squeal. Question: why does the loop keep going?', extend: 'Underneath it is the idea that effects can feed their own causes. Cause: warming. Conflict: nothing slows it. Complication: ice that melts exposes darker water. Result: faster warming. It connects to savings interest and to a microphone squeal.' }
};

const MARGE: DataLensSpec = {
  id: 'fw_marge',
  label: 'MARGE',
  group: 'Frameworks',
  path: 'Attend → relate → generate → evaluate · MARGE framework chapter',
  symbolPath: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 9v6M9 12h6',
  steps: build([
    { id: 'attend', title: 'Attend', prompt: (f) => ({ support: `What is the main thing to notice about ${f}?`, core: `Put everything else aside. What is the one thing about ${f} worth your full attention?`, extend: `What would you miss about ${f} if you were distracted, and why does it matter?` }), support: { support: 'One thing.', core: '', extend: '' } },
    { id: 'relate', title: 'Relate', prompt: () => ({ support: 'What do you already know that links to this?', core: 'Link it to something you already know. What does the link tell you?', extend: 'Find a link to something from a different topic and say what it shows that neither does alone.' }), support: { support: 'Start with “This is like…”', core: '', extend: '' } },
    { id: 'generate', title: 'Generate', prompt: () => ({ support: 'Make up an example of your own.', core: 'Make something new from it: your own example, question or explanation.', extend: 'Create an example, a question and a counter-example of your own.' }), support: { support: 'It can be small.', core: '', extend: '' } },
    { id: 'evaluate', title: 'Evaluate', prompt: () => ({ support: 'How sure are you that you got it? What would you check?', core: 'Check your own understanding. What do you still not know, and what will you do about it?', extend: 'Judge how well you understand it, with evidence. What would show you were wrong?' }), support: { support: 'Say what you are unsure about.', core: '', extend: '' } }
  ]),
  writeItDown: writeUp(['Says what I focused on', 'Links it to something I know', 'Shows my own example', 'Says what I still need to check'], 'Write a short reflection that includes your own example and an honest check of what you still do not understand.'),
  examples: { support: 'I noticed the ending. It is like a story I know. My example: ___. I am not sure about the last part.', core: 'I focused on the turning point. It links to a film I know where a character also reverses. My own example: a team that wins by changing its plan. I still do not know why the change came so late.', extend: 'I focused on the turning point because the rest depends on it. It links to a maths proof by contradiction. My example and counter-example: ___. The evidence I understand it is that I can predict the next scene; what would prove me wrong is ___.' }
};

const WILIAM: DataLensSpec = {
  id: 'fw_wiliam',
  label: 'Wiliam’s five strategies',
  group: 'Frameworks',
  path: 'Goal → evidence → feedback → classmates → own it · Wiliam framework chapter',
  symbolPath: 'M5 19V9M10 19V5M15 19v-7M20 19V8',
  steps: build([
    { id: 'goal', title: 'Know the goal', prompt: (f) => ({ support: `What are you trying to get better at in ${f}?`, core: `What would good work on ${f} look like? Describe it before you start.`, extend: `Describe good work on ${f} and how you would tell it from nearly-good work.` }), support: { support: 'In your own words.', core: '', extend: '' } },
    { id: 'evidence', title: 'Show your thinking', prompt: () => ({ support: 'Write down how you worked it out.', core: 'Show the steps you took so someone can see where your thinking went.', extend: 'Show your steps and point to the one you are least sure of.' }), support: { support: 'Not just the answer.', core: '', extend: '' } },
    { id: 'feedback', title: 'Use feedback to move forward', prompt: () => ({ support: 'What is one thing to do next?', core: 'Read the feedback and write the next step you will take.', extend: 'Turn each piece of feedback into an action and say which one will matter most.' }), support: { support: 'One action.', core: '', extend: '' } },
    { id: 'classmates', title: 'Learn with classmates', prompt: () => ({ support: 'What could a classmate help you with, or you help them with?', core: 'Share your work with a classmate. What did you learn from theirs?', extend: 'Give a classmate one specific suggestion and take one from them. What changed?' }), support: { support: 'Be kind and specific.', core: '', extend: '' } },
    { id: 'own', title: 'Own your learning', prompt: () => ({ support: 'What will you do differently next time?', core: 'What is your next goal, and how will you know you reached it?', extend: 'Set your next goal, say what evidence will show you reached it, and what you will do if it does not.' }), support: { support: 'Make it small.', core: '', extend: '' } }
  ]),
  writeItDown: writeUp(['Says what good looks like', 'Shows my thinking', 'Names my next step'], 'Write a short plan: what good looks like, what feedback showed, and what you will do next.'),
  examples: { support: 'Good work explains why. I showed my steps. Next time I will check my units.', core: 'Good work uses evidence for every claim. I showed my steps and my partner pointed out I skipped one. My next goal is to give a source for each claim.', extend: 'Good work separates a claim from its evidence. My weakest step was the third. Feedback: add a source (action: find one today). Partner suggestion: reorder paragraphs. Goal: every claim sourced; evidence will be my own checklist.' }
};

const BERGER: DataLensSpec = {
  id: 'fw_berger',
  label: 'Berger',
  group: 'Frameworks',
  path: 'Draft → critique → redraft → make public · Berger framework chapter',
  symbolPath: 'M5 5h10v14H5zM9 9h10v10H9z',
  steps: build([
    { id: 'draft', title: 'Make a first draft', prompt: (f) => ({ support: `Make a first try at ${f}.`, core: `Make a first draft on ${f}. It is meant to be improved.`, extend: `Make a bold first draft on ${f} and mark where you took a risk.` }), support: { support: 'It does not have to be good.', core: '', extend: '' } },
    { id: 'critique', title: 'Give and take critique', prompt: () => ({ support: 'Share it. Say one kind thing and one helpful thing.', core: 'Share your draft. Give feedback that is kind, specific and helpful, and take it the same way.', extend: 'Give two specific, helpful points on a classmate’s draft. Pick the one piece of feedback you will act on.' }), support: { support: 'Kind, specific, helpful.', core: '', extend: '' } },
    { id: 'redraft', title: 'Improve it', prompt: () => ({ support: 'Change one thing and make it better.', core: 'Redraft using the feedback. What is now better?', extend: 'Redraft, and write what you changed, what you kept and why.' }), support: { support: 'Just one change counts.', core: '', extend: '' } },
    { id: 'public', title: 'Make it public', prompt: () => ({ support: 'Who will see your best work?', core: 'Choose who this work is for and what you will do to make it worth their time.', extend: 'Decide who the real audience is and how their needs change the final piece.' }), support: { support: 'Real people make it matter.', core: '', extend: '' } }
  ]),
  writeItDown: writeUp(['Says what changed between drafts', 'Names the feedback I used', 'Says who it is for'], 'Write a short note to your audience on how the work improved and what you would still change.'),
  examples: { support: 'My first draft was short. A friend said add an example. I added one, and it will go on the wall.', core: 'Draft 1 listed facts. Feedback: say why they matter. Draft 2 explains each one. It is for the Year 7s who will use it.', extend: 'Draft 1 listed facts; feedback pointed out no argument. In draft 2 I kept the facts but organised them around one claim. The audience, next year’s class, needs it short, so I cut a third.' }
};

export const FRAMEWORK_LENSES = [ROSENSHINE, WILLINGHAM, MARGE, WILIAM, BERGER].map(dataLens);
