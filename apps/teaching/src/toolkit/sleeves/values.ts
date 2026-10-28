import type { SleeveContent } from './types';

export const VALUE_SLEEVES: SleeveContent[] = [
  {
    id: 'value:clarity',
    goal: 'Make your meaning plain to someone who wasn’t in the room.',
    support: {
      see: 'A clear sentence names the text and the exact words it means.',
      weaker: 'It shows she is brave and this is what it means.',
      stronger: 'In The Hunger Games, Katniss volunteering for Prim shows her courage.',
      do: 'Swap every “it”, “this” and “they” for the thing you mean.',
      starters: ['In other words,', 'For example,', 'What I mean is'],
      checks: ['I name the text or idea I mean.', 'I point to the exact words or detail.', 'Each sentence makes one point.']
    },
    extend: {
      see: 'A clear argument lets a reader follow you with the text out of sight.',
      weaker: 'Katniss is clearly brave, which is significant for the story and the people.',
      stronger: 'Katniss volunteers before anyone else can move; that speed tells us her courage is instinct, ahead of any plan.',
      do: 'Read it as a stranger would. Wherever you stop to re-read, rewrite that sentence.',
      starters: ['Put simply,', 'The point is'],
      checks: ['A reader new to the text could follow me.', 'My words match how sure I am.', 'Every sentence reads clearly the first time.']
    }
  },
  {
    id: 'value:accuracy',
    goal: 'Make every fact and claim true, and know how you could check it.',
    support: {
      see: 'An accurate sentence matches the text or source exactly.',
      weaker: 'Katniss takes Peeta’s place at the Reaping.',
      stronger: 'Katniss takes Prim’s place at the Reaping.',
      do: 'Find the page, line or source for each fact you use and compare your wording with it.',
      starters: ['According to the text,', 'The source says', 'On page'],
      checks: ['I checked each name, date and number.', 'I matched my facts to the text or source.', 'I fixed every fact that differed from the source.']
    },
    extend: {
      see: 'An accurate answer also separates what the source states from what you conclude from it.',
      weaker: 'The Capitol rules everyone with fear, so all the districts hate it equally.',
      stronger: 'The Capitol rules through fear, and the text shows District 12 resenting it; other districts are only hinted at.',
      do: 'Mark each claim as stated in the source or inferred by you, then match your wording to its certainty.',
      starters: ['The source states', 'I infer that', 'This probably means'],
      checks: ['I can point to evidence for every claim.', 'I show which claims are inferences.', 'My wording matches how certain the evidence is.']
    }
  },
  {
    id: 'value:precision',
    goal: 'Swap vague words for exact ones: who, what, how much, when.',
    support: {
      see: 'A precise sentence uses exact names, numbers and details.',
      weaker: 'Some people in the arena die early on.',
      stronger: 'Eleven tributes die in the first day of the arena, most at the Cornucopia.',
      do: 'Circle each vague word, such as “things”, “some” or “a lot”, and replace it with the exact detail.',
      starters: ['Specifically,', 'Exactly', 'In particular,'],
      checks: ['I replaced vague words with exact ones.', 'I name who, what, when or how much.', 'Each detail comes from the text or source.']
    },
    extend: {
      see: 'A precise answer chooses the exact word that fits the situation, and the right amount of detail for the reader.',
      weaker: 'Katniss is upset when Rue dies.',
      stronger: 'Katniss grieves for Rue, and her anger turns that grief into a quiet act of defiance against the Capitol.',
      do: 'Pick your three most important words and test each against two close alternatives. Keep the one that fits best.',
      starters: ['More exactly,', 'The best word here is', 'To be specific,'],
      checks: ['I chose exact words over close alternatives.', 'My detail suits what the reader needs.', 'Each key word fits the situation.']
    }
  },
  {
    id: 'value:breadth',
    goal: 'Look at the question from more than one point of view.',
    support: {
      see: 'A broad answer names one other point of view and what it would say.',
      weaker: 'Katniss thinks the Games are cruel.',
      stronger: 'Katniss thinks the Games are cruel, while the Capitol audience sees them as entertainment.',
      do: 'Name one other person who sees this differently, then write what they would say.',
      starters: ['Another view is', 'From their side,', 'Someone else might say'],
      checks: ['I name a second point of view.', 'I say what that view would argue.', 'I show who holds each view.']
    },
    extend: {
      see: 'A broad answer weighs several viewpoints and shows why some are stronger or fit this situation better.',
      weaker: 'Some people like the Games and some dislike them, so it is a matter of opinion.',
      stronger: 'Peeta, Haymitch and the Capitol crowd each see the Games differently; Peeta’s view stays closest to what the arena shows.',
      do: 'Set out three viewpoints, including one you disagree with, then say which best fits the evidence and why.',
      starters: ['Taken together,', 'The view that fits best is', 'Each side sees'],
      checks: ['I include a view I disagree with.', 'I treat each view fairly.', 'I say which view fits the evidence best.']
    }
  },
  {
    id: 'value:depth',
    goal: 'Take on what makes the question hard, then deal with it.',
    support: {
      see: 'A deep answer names one thing that makes the question tricky and deals with it.',
      weaker: 'Katniss should kill Peeta to win.',
      stronger: 'Katniss wants to win, yet she cares for Peeta, so she has to choose between survival and loyalty.',
      do: 'Ask “what makes this hard to answer?”, name that complication, then write one sentence that deals with it.',
      starters: ['This is difficult because', 'The tricky part is', 'To deal with this,'],
      checks: ['I name what makes the question hard.', 'I deal with that complication.', 'I go past the first answer that came to mind.']
    },
    extend: {
      see: 'A deep answer faces the tension between two good ideas and follows it through to a position.',
      weaker: 'Rebelling against the Capitol is brave but also risky.',
      stronger: 'Rebelling protects Prim in the long run but puts her in danger now, so Katniss’s courage and her care for Prim pull against each other.',
      do: 'Find the two ideas that pull against each other, explain why each matters, then say how you resolve the pull.',
      starters: ['On one hand,', 'On the other hand,', 'What settles it is'],
      checks: ['I explain why each side matters.', 'I take a position on the tension.', 'My answer goes beneath the surface.']
    }
  },
  {
    id: 'value:relevance',
    goal: 'Connect every point back to the question.',
    support: {
      see: 'A relevant point answers the question that was asked.',
      weaker: 'The question asks about courage. District 12 is a coal mining district.',
      stronger: 'The question asks about courage. Katniss volunteers for Prim, so she shows courage.',
      do: 'Reread the question, then end each point with a sentence that links it back to that question.',
      starters: ['This answers the question because', 'This links to', 'So,'],
      checks: ['I reread the question before I wrote.', 'Each point links back to the question.', 'I cut details that stray from the answer.']
    },
    extend: {
      see: 'A relevant answer chooses the evidence that best answers this question, and says how it does.',
      weaker: 'Katniss hunts in the woods and also volunteers for Prim, and both show her character.',
      stronger: 'Because the question asks about sacrifice, I use the volunteering and leave the hunting out.',
      do: 'Underline the key word in the question, then choose the evidence that speaks most directly to that word.',
      starters: ['The key word is', 'This speaks directly to', 'It matters here because'],
      checks: ['I picked the evidence that fits the key word.', 'I explain how each point answers the question.', 'Every paragraph earns its place.']
    }
  },
  {
    id: 'value:significance',
    goal: 'Lead with what matters most and say why it matters.',
    support: {
      see: 'A significant answer puts the most important point first.',
      weaker: 'Katniss wears a mockingjay pin. She also takes Prim’s place at the Reaping.',
      stronger: 'Katniss takes Prim’s place at the Reaping, which sets the whole story in motion; the mockingjay pin comes later.',
      do: 'List your points, star the strongest one, and move it to the start of your answer.',
      starters: ['The most important point is', 'Above all,', 'This matters most because'],
      checks: ['I picked my strongest point.', 'I put that point first.', 'I say why it matters.']
    },
    extend: {
      see: 'A significant answer ranks points by their effect and explains what changes because of them.',
      weaker: 'The Reaping and the interview are both important events.',
      stronger: 'The Reaping matters more than the interview: it forces the choice that every later event depends on.',
      do: 'Rank your points by how much each one changes the outcome, then explain why the top point outranks the next.',
      starters: ['What changes because of this is', 'This outranks', 'The turning point is'],
      checks: ['I ranked my points.', 'I explain what each point changes.', 'I say why the top point matters most.']
    }
  },
  {
    id: 'value:coherence',
    goal: 'Make your ideas fit together and agree with each other.',
    support: {
      see: 'A coherent answer has ideas that agree with each other.',
      weaker: 'Katniss trusts everyone in the arena, so she hides from Cato.',
      stronger: 'Katniss trusts only Rue in the arena, so she hides from Cato.',
      do: 'Read your answer once through, then check each point against the one before it.',
      starters: ['This fits with', 'Building on that,', 'Together, these show'],
      checks: ['My points agree with each other.', 'Each point follows from the one before.', 'My ending matches my opening.']
    },
    extend: {
      see: 'A coherent answer holds one thread from start to finish and resolves any tensions it raises.',
      weaker: 'Katniss is a survivor, and she is also a rebel, and she is also a protector.',
      stronger: 'Protecting Prim ties Katniss’s survival to her rebellion: she survives for Prim and rebels for her.',
      do: 'Name the one idea that connects all your points, then edit any point that pulls against it.',
      starters: ['The thread running through is', 'This connects to', 'It all comes back to'],
      checks: ['One main idea connects my points.', 'I resolve any tensions between them.', 'My conclusion follows from everything before it.']
    }
  },
  {
    id: 'value:cogency',
    goal: 'Give reasons strong enough to convince a fair-minded reader.',
    support: {
      see: 'A cogent answer gives a reason that is true and actually supports the claim.',
      weaker: 'Katniss is brave because she lives in District 12.',
      stronger: 'Katniss is brave because she volunteers to die in Prim’s place.',
      do: 'Write your claim, add “because” and a reason, then ask: is the reason true, and does it prove the claim?',
      starters: ['I think this because', 'The evidence for this is', 'This proves the claim because'],
      checks: ['My reason is true.', 'My reason supports my claim.', 'A fair reader would accept my reason.']
    },
    extend: {
      see: 'A cogent answer anticipates the best objection and shows why the reasoning still holds.',
      weaker: 'Katniss is brave, and anyone who disagrees is wrong.',
      stronger: 'Some say Katniss acts from love alone; yet she knows the risk, and choosing it anyway is what makes it courage.',
      do: 'State the strongest objection to your claim, then answer it with a reason a fair reader would accept.',
      starters: ['A fair objection is', 'Even so,', 'This still holds because'],
      checks: ['I state the best objection fairly.', 'I answer it with a strong reason.', 'My reasons lead to my conclusion.']
    }
  }
];
