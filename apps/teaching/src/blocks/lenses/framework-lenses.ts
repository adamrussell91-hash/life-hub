import { dataLens, type DataLensSpec } from './data-lens';
import type { LensLevel, LensStep } from './types';

/**
 * Five frameworks as stepped lenses: Rosenshine, Willingham, MARGE, Wiliam's five strategies and
 * Berger. The steps follow the chapters of Teaching WalkThrus (checked against the book's own chapter
 * pages, 20 to 30). Lenses can reach students, so every prompt here is original wording
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
  path: 'Sequence and model → question and check → guide to independence → revisit · Rosenshine framework chapter',
  symbolPath: 'M4 18V6M4 6l5 4-5 4M12 6h8M12 12h8M12 18h8',
  steps: build([
    { id: 'model', title: 'Sequence and model', prompt: (f) => ({ support: `What is the first small piece of ${f}? How would someone show you it?`, core: `Break ${f} into small steps. Which step comes first, and what would a worked example of it look like?`, extend: `Order the steps of ${f}, justify the order, and say what support would make the hardest step manageable.` }), support: { support: 'One small step only.', core: 'Worked examples and temporary support help here.', extend: '' } },
    { id: 'check', title: 'Question and check', prompt: () => ({ support: 'Ask yourself one question. Can you answer it?', core: 'Write the questions that would show whether you really understand each step.', extend: 'Write questions that would catch a common mistake, and say how you would tell a real answer from a guess.' }), support: { support: 'Answer it without looking.', core: 'Check each step before moving on.', extend: '' } },
    { id: 'independence', title: 'Guide towards independence', prompt: () => ({ support: 'Try one yourself, with help nearby.', core: 'Practise with help first, then on your own. What did you get right without help?', extend: 'Plan the move from supported to independent practice and say how you will know you are ready for the next stage.' }), support: { support: 'Help is fine to start with.', core: 'Aim for mostly right answers.', extend: '' } },
    { id: 'revisit', title: 'Revisit', prompt: () => ({ support: 'When will you look at this again?', core: 'Plan when you will come back to this: at the start of next lesson, next week and next month.', extend: 'Plan a spaced return to this and decide what you will use to check it has stuck.' }), support: { support: 'Pick a day.', core: 'Short and often beats long and once.', extend: '' } }
  ]),
  writeItDown: writeUp(['Breaks it into small steps', 'Checks understanding step by step', 'Says how I will revisit it'], 'Write a short plan covering the first step, how you will check it, and when you will revisit it.'),
  examples: { support: 'First step: find the verb. Question: what is the verb in this sentence? I will look again on Friday.', core: 'Steps: find the subject, find the verb, check they agree. A worked example comes first, then a question for each step. I will practise with help, then alone, and review it next week.', extend: 'The order is subject, verb, agreement, because each depends on the last. The question that catches the usual mistake is “which word is the verb here?”. I will move from supported to independent sentences and use a short quiz next month to check it stuck.' }
};

const WILLINGHAM: DataLensSpec = {
  id: 'fw_willingham',
  label: 'Willingham',
  group: 'Frameworks',
  path: 'Think → story → connect → deepen → practise · Willingham framework chapter',
  symbolPath: 'M5 4h14v16H5zM9 9h6M9 13h6',
  steps: build([
    { id: 'think', title: 'Think about the right thing', prompt: (f) => ({ support: `What should you be thinking about while you work on ${f}?`, core: `Memory follows thinking. What should your mind be working on in ${f}, and what might distract you?`, extend: `Decide what you most need to remember about ${f} and design the thinking that would make it stick.` }), support: { support: 'The idea, not the activity.', core: '', extend: '' } },
    { id: 'story', title: 'Find the story', prompt: () => ({ support: 'Tell it as a short story: what happens?', core: 'Tell it as a story with a problem, a complication and an ending.', extend: 'Find the story underneath it, and say which part carries the most meaning.' }), support: { support: 'Start, middle, end.', core: 'Stories are easier to remember than lists.', extend: '' } },
    { id: 'connect', title: 'Connect it', prompt: () => ({ support: 'What does this link to that you already know?', core: 'Link it to something you already know and to a concrete example.', extend: 'Link it to two things you already know and say what each link explains.' }), support: { support: 'Anything counts.', core: '', extend: '' } },
    { id: 'deepen', title: 'Deepen it', prompt: () => ({ support: 'What is one more thing you can say about it now?', core: 'Move from what you first understood to how the ideas relate, and use it in a new case.', extend: 'Show how your first understanding changed, and apply it in a case you have not seen.' }), support: { support: 'One new thing.', core: 'Start specific, then connect.', extend: '' } },
    { id: 'practise', title: 'Practise', prompt: () => ({ support: 'Try it again a different way.', core: 'Practise it again later, in a different way, so you can use it easily.', extend: 'Plan practice that varies the situation, and say how you will know it is secure.' }), support: { support: 'A second go counts.', core: '', extend: '' } }
  ]),
  writeItDown: writeUp(['Names what to think about', 'Tells it as a story', 'Makes a connection', 'Shows deeper understanding'], 'Write a short account that tells the story of the idea, connects it, and shows how your understanding grew.'),
  examples: { support: 'It is about how a seed becomes a plant. A seed gets water and grows. It is like saving money. I will try drawing it again tomorrow.', core: 'I should think about why feedback loops keep going, not just the weather. The story: warming melts ice, which exposes darker water, which warms more. It connects to a microphone squeal. I understood the loop first, then how it speeds up. I will practise explaining a different loop.', extend: 'The thing to remember is that effects can feed their own causes. The story has a cause, a complication and a result. It links to interest on savings and to a microphone squeal. My first view was “melting causes warming”; now I see a self-reinforcing loop I can apply to a new case.' }
};

const MARGE: DataLensSpec = {
  id: 'fw_marge',
  label: 'MARGE',
  group: 'Frameworks',
  path: 'Motivate → attend → relate → generate → evaluate · MARGE framework chapter (Shimamura)',
  symbolPath: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 9v6M9 12h6',
  steps: build([
    { id: 'motivate', title: 'Motivate', prompt: (f) => ({ support: `Why is ${f} worth knowing?`, core: `What makes ${f} interesting or useful to you? Write a question you want answered.`, extend: `Find a reason ${f} matters beyond the lesson and write the question that would most drive you to learn it.` }), support: { support: 'A real reason helps.', core: '', extend: '' } },
    { id: 'attend', title: 'Attend', prompt: () => ({ support: 'What is the one thing to notice?', core: 'Choose what deserves your full attention, and put the rest aside.', extend: 'Say what you would miss if you were distracted, and how you will protect your attention.' }), support: { support: 'One thing.', core: '', extend: '' } },
    { id: 'relate', title: 'Relate', prompt: () => ({ support: 'What does this remind you of?', core: 'Link it to what you already know and organise the connections.', extend: 'Link it to a different topic and say what the link shows that neither shows alone.' }), support: { support: 'Start with “This is like…”', core: '', extend: '' } },
    { id: 'generate', title: 'Generate', prompt: () => ({ support: 'Explain it in your own words without looking.', core: 'Produce it yourself: explain it or recall it without re-reading.', extend: 'Create your own example, question and explanation without re-reading.' }), support: { support: 'It can be short.', core: '', extend: '' } },
    { id: 'evaluate', title: 'Evaluate', prompt: () => ({ support: 'What could you not remember? Check.', core: 'Test what you can really recall, find the gaps, and check against a reliable source.', extend: 'Judge how well you understand it, with evidence, and plan how to close the gaps.' }), support: { support: 'Feeling familiar is not knowing.', core: '', extend: '' } }
  ]),
  writeItDown: writeUp(['Says why it matters', 'Says what I focused on', 'Links it to something I know', 'Shows my own explanation', 'Names what I still need to check'], 'Write a reflection covering why it matters, your own explanation, and an honest check of the gaps.'),
  examples: { support: 'It matters because it explains the news. I noticed the turning point. It is like a story I know. In my words: ___. I could not remember the date.', core: 'I want to know why the change came so late. I focused on the turning point and linked it to a film I know. In my own words: ___. Checking my notes, I missed the cause.', extend: 'The question driving me is why the change came so late. I focused on the turning point and linked it to a proof by contradiction. My own example and counter-example: ___. The evidence I understand it is that I can predict the next scene; the gap is the cause.' }
};

const WILIAM: DataLensSpec = {
  id: 'fw_wiliam',
  label: 'Wiliam’s five strategies',
  group: 'Frameworks',
  path: 'Clarify → elicit → advance → learn with peers → take ownership · Wiliam framework chapter',
  symbolPath: 'M5 19V9M10 19V5M15 19v-7M20 19V8',
  steps: build([
    { id: 'clarify', title: 'Clarify learning intentions', prompt: (f) => ({ support: `What are you trying to learn in ${f}?`, core: `What is the aim in ${f}, and what would good work look like?`, extend: `State the aim in ${f} and how you would tell good work from nearly-good work.` }), support: { support: 'In your own words.', core: '', extend: '' } },
    { id: 'elicit', title: 'Elicit evidence of learning', prompt: () => ({ support: 'Show how you worked it out.', core: 'Show your thinking so it can be seen where your understanding is.', extend: 'Show your thinking and point to the step you are least sure of.' }), support: { support: 'Not just the answer.', core: '', extend: '' } },
    { id: 'advance', title: 'Feedback that moves you forward', prompt: () => ({ support: 'What is one thing to do next?', core: 'Use the feedback to write the next step you will take.', extend: 'Turn each piece of feedback into an action and say which matters most.' }), support: { support: 'One action.', core: '', extend: '' } },
    { id: 'peers', title: 'Learn with peers', prompt: () => ({ support: 'What could a classmate help with?', core: 'Share your work with a classmate and say what you learned from theirs.', extend: 'Give a classmate one specific suggestion and take one from them. What changed?' }), support: { support: 'Be kind and specific.', core: '', extend: '' } },
    { id: 'ownership', title: 'Take ownership', prompt: () => ({ support: 'What will you do differently next time?', core: 'Set your next goal and say how you will know you reached it.', extend: 'Set the next goal, say what evidence will show it, and what you will do if it does not.' }), support: { support: 'Make it small.', core: '', extend: '' } }
  ]),
  writeItDown: writeUp(['Says what good looks like', 'Shows my thinking', 'Names my next step', 'Says what I learned from a classmate'], 'Write a short plan: what good looks like, what the evidence showed, and what you will do next.'),
  examples: { support: 'Good work explains why. I showed my steps. Next time I will check my units.', core: 'Good work backs each claim with evidence. My steps showed I skipped one, and my partner agreed. My next goal is a source for every claim.', extend: 'Good work separates a claim from its evidence. My weakest step was the third. Feedback: add a source (action: find one today). A classmate suggested reordering. Goal: every claim sourced; my checklist will show it.' }
};

const BERGER: DataLensSpec = {
  id: 'fw_berger',
  label: 'Berger',
  group: 'Frameworks',
  path: 'Accomplish → study examples → revise repeatedly → critique → share · Berger framework chapter',
  symbolPath: 'M5 5h10v14H5zM9 9h10v10H9z',
  steps: build([
    { id: 'accomplish', title: 'Aim for something to be proud of', prompt: (f) => ({ support: `What would make you proud of your work on ${f}?`, core: `Describe the quality of work on ${f} that you would be proud to show.`, extend: `Set a demanding goal for ${f} and say what would earn real pride in it.` }), support: { support: 'Quality, not speed.', core: '', extend: '' } },
    { id: 'examples', title: 'Study excellent examples', prompt: () => ({ support: 'Look at a great example. What makes it good?', core: 'Study an excellent example and name three things that make it work.', extend: 'Compare two excellent examples and say what the standard really is.' }), support: { support: 'Point to one thing.', core: '', extend: '' } },
    { id: 'revise', title: 'Revise repeatedly', prompt: () => ({ support: 'Make a first try, then change one thing.', core: 'Make a draft, then revise it more than once.', extend: 'Revise through several drafts and record what each one improved.' }), support: { support: 'A first try is meant to change.', core: '', extend: '' } },
    { id: 'critique', title: 'Critique', prompt: () => ({ support: 'Say one kind and one helpful thing about a classmate’s work.', core: 'Give kind, specific, helpful feedback on the work, and take it the same way.', extend: 'Give two specific suggestions and choose the one piece of feedback you will act on.' }), support: { support: 'Kind, specific, helpful.', core: '', extend: '' } },
    { id: 'share', title: 'Share with an audience', prompt: () => ({ support: 'Who will see your best work?', core: 'Choose who this is for and what will make it worth their time.', extend: 'Decide who the real audience is and how their needs change the final piece.' }), support: { support: 'Real people make it matter.', core: '', extend: '' } }
  ]),
  writeItDown: writeUp(['Says what makes it worth being proud of', 'Names what an example taught me', 'Says how it changed between drafts', 'Says who it is for'], 'Write a note to your audience about how the work improved and what you would still change.'),
  examples: { support: 'I want it to be clear and neat. The example had a good title. My first draft was short, so I added one example. It will go on the wall.', core: 'I would be proud of a clear explanation. The example showed an argument, evidence and a conclusion. Draft 1 listed facts; after critique I explained why they matter. It is for next year’s class.', extend: 'My aim is an explanation a Year 7 could use alone. Two examples showed that excellence meant a clear claim first. Across three drafts I added an argument, cut a third and fixed the order. Critique said the middle was thin; I acted on that. The audience needs it short.' }
};

export const FRAMEWORK_LENSES = [ROSENSHINE, WILLINGHAM, MARGE, WILIAM, BERGER].map(dataLens);
