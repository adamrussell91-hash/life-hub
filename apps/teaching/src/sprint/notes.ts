import { el } from '@/quiz/dom';

/** A teacher note: fixed help text that folds open under a Kit card. */
export type KitNote = { what: string; students: string; setup: string };

export type KitNoteKey = 'overview' | 'settings' | 'understand' | 'criteria' | 'reflection' | 'requirements' | 'idea_guide' | 'phases' | 'groups';

export const KIT_NOTES: Record<KitNoteKey, KitNote> = {
  overview: {
    what: 'Groups move through five phases: Understand, Sketch, Decide, Prototype, Test. Each phase happens in class or at home and closes at a time you set.',
    students: 'A phase opens when the one before it closes, or sooner once everyone in the group has handed it in. In Decide each group picks one idea, then builds it together and pitches it in Test.',
    setup: 'Work down the Kit, then press Try it as a student and run the whole sprint with a practice group of two before your class sees it.'
  },
  settings: {
    what: 'How much help shows, who picks each group’s idea, how many ideas each student writes, and the class lock.',
    students: 'Guided adds sentence starters and tighter checks. The class lock stops work for a few hours after you end a class part, so class work stays class work.',
    setup: 'Teacher confirms lets you check each group’s pick before they build. 2 hours of lock suits a lesson that ends at lunch or the end of the day.'
  },
  understand: {
    what: 'The steps students go through to work out the problem before they design anything. Five they do alone, five the group does together in a shared space.',
    students: 'Alone: they spot words in the brief, name the audience, dig for the real problem, say it in their own words and sort what they know into a limits grid. Together: they vote on one problem statement, agree one audience, see everyone’s limits in one grid, choose up to 3 questions for you and read your answers. The agreed problem, audience and answers go with them to Sketch.',
    setup: 'Slides suit younger classes: one step at a time. Answer the group’s questions from its board on the progress map. If you switch off Vote, you choose each group’s problem yourself.'
  },
  criteria: {
    what: 'One list used three times: students link each idea to a criterion, vote with the criteria in Decide, and you mark the prototype with them.',
    students: 'They see each criterion on their idea cards, on the vote, and in pitch feedback, judged Starting · Showing · Strong.',
    setup: 'Keep to 3 or 4. Write each one as something students can do, such as “Uses a quote from the poems as evidence”.'
  },
  reflection: {
    what: 'The last piece of Test: two questions students answer at home after the pitch, marked with their own criterion.',
    students: 'They answer both prompts once feedback on their pitch is back.',
    setup: 'Ask what the feedback showed their idea does well, and what they would change next and why.'
  },
  requirements: {
    what: 'Must-haves, yes or no. Up to 6.',
    students: 'At each phase you tag (U S D P T), students tick the requirement and say where it is in their work.',
    setup: 'Tag each one at two or more phases, so students keep coming back to it. Make every one something a student can point to.'
  },
  idea_guide: {
    what: 'The good idea checklist and a model idea. Both show while students sketch and decide.',
    students: 'They read the checklist against their own ideas, and see a worked model with notes on what each part does.',
    setup: 'Write the model on a different topic from the challenge, so students copy its shape and come up with their own content. One note per checklist line it shows.'
  },
  phases: {
    what: 'When each phase opens and closes. You set only the close; each phase opens when the one above it closes.',
    students: 'They see a countdown to the close. A group that all hands in early opens the next phase early.',
    setup: 'For a class phase, tick Lock work when the lesson ends and set the bell time, or press End class part on the progress map yourself. Click a bar to edit it.'
  },
  groups: {
    what: 'The groups for this sprint only. Your class list stays as it is.',
    students: 'They join with their initials and see their group name and teammates.',
    setup: 'Press Make even groups, then move students with the menus. Groups of 3 or 4 work best.'
  }
};

/** "How this works", closed until the teacher opens it. `open` keeps it open across repaints. */
export function noteEl(key: KitNoteKey, open: Set<string>, summary = 'How this works'): HTMLElement {
  const note = KIT_NOTES[key];
  const d = el('details', 'kit-note');
  d.dataset.note = key;
  d.open = open.has(key);
  d.addEventListener('toggle', () => { if (d.open) open.add(key); else open.delete(key); });
  d.append(el('summary', '', summary));
  for (const [label, text] of [['What it’s for', note.what], ['What students see', note.students], ['Setting it up', note.setup]] as const) {
    const p = el('p');
    p.append(el('b', '', `${label}. `), text);
    d.append(p);
  }
  return d;
}
