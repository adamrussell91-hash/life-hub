import type { SleeveContent } from './types';

export const TOOL_SLEEVES: SleeveContent[] = [
  {
    id: 'tool:analogy',
    goal: 'Compare it to something else to show what it is like.',
    support: {
      see: 'A good analogy links two different things through one shared feature.',
      weaker: 'The Capitol is like a place with rules.',
      stronger: 'The Capitol is like a puppeteer because they both control others from above.',
      do: 'Pick something familiar, then say one way it is like your topic and one way it differs.',
      starters: ['___ is like ___ because they both', 'It is similar to', 'A difference is'],
      checks: ['My comparison uses something familiar.', 'I name the feature the two share.', 'I name one way they differ.']
    },
    extend: {
      see: 'A strong analogy is tested: it shows where the comparison helps and where it breaks down.',
      weaker: 'The Games are like a sport because people watch them.',
      stronger: 'The Games are like a sport because crowds cheer, but players in a sport choose to play, so the comparison shows what the Capitol takes away.',
      do: 'Run the comparison through similarities, differences and what each tells you, then judge how well it fits.',
      starters: ['The comparison holds because', 'It breaks down when', 'This suggests that'],
      checks: ['I test the comparison from both sides.', 'I say where it stops working.', 'I explain what it helps the reader see.']
    }
  },
  {
    id: 'tool:argument',
    goal: 'Set out your reasons and the conclusion they lead to.',
    support: {
      see: 'A clear argument states the conclusion and the reasons that lead to it.',
      weaker: 'Katniss is a hero and people like her.',
      stronger: 'Because Katniss protects Prim and defies the Capitol, it follows that she is a hero.',
      do: 'Write your conclusion, then list two reasons that lead to it.',
      starters: ['Because ___ and ___, it follows that', 'My conclusion is', 'The reasons are'],
      checks: ['I state my conclusion.', 'I list at least two reasons.', 'Each reason supports the conclusion.']
    },
    extend: {
      see: 'A strong argument also names what it takes for granted, so the reader can judge it.',
      weaker: 'The Games are wrong because they are bad.',
      stronger: 'The Games are wrong because they force children to fight; this assumes that children cannot consent to danger.',
      do: 'Lay out conclusion and reasons, then name the assumption that links them and decide if it is fair.',
      starters: ['This assumes that', 'The argument depends on', 'A reader could accept this if'],
      checks: ['I name an assumption my argument uses.', 'I say whether the assumption is fair.', 'My conclusion follows from my reasons.']
    }
  },
  {
    id: 'tool:counterargument',
    goal: 'Meet the strongest view against yours and answer it.',
    support: {
      see: 'A counterargument states an opposing view fairly, then replies to it.',
      weaker: 'Some people disagree, but they are wrong.',
      stronger: 'Someone might argue that Katniss only volunteered out of love, but she also knew the danger and chose it anyway.',
      do: 'Write the best reason someone could have to disagree with you, then give your reply.',
      starters: ['Someone might argue', 'This is a fair point, but', 'I reply that'],
      checks: ['I state the opposing view fairly.', 'I reply with a reason.', 'My reply links to my original claim.']
    },
    extend: {
      see: 'A strong reply credits what is strong in the opposing view, then either answers it or refines the claim.',
      weaker: 'Peeta might disagree, but Katniss is right.',
      stronger: 'Peeta’s view that kindness is a weapon has force in the arena, so I refine my claim: survival needs both skill and trust.',
      do: 'Choose the opposing view that worries you most, say what it gets right, then answer it or adjust your claim.',
      starters: ['The strongest objection is', 'It is right that', 'So I refine my claim to'],
      checks: ['I pick the strongest opposing view.', 'I say what it gets right.', 'I answer it or adjust my claim.']
    }
  },
  {
    id: 'tool:counterexample',
    goal: 'Test a general claim by hunting for a case that breaks it.',
    support: {
      see: 'A counterexample is one real case that the general claim fails to cover.',
      weaker: 'All tributes want to fight.',
      stronger: 'That is false for Rue, who spends the Games hiding and helping Katniss.',
      do: 'Take your general claim and search for one specific case that breaks it.',
      starters: ['That is false. For example,', 'A case that breaks this is', 'This fails for'],
      checks: ['I picked a general claim to test.', 'I found one specific case that breaks it.', 'I say exactly why it breaks the claim.']
    },
    extend: {
      see: 'A strong counterexample leads to a better claim that fits the cases you found.',
      weaker: 'Some people break rules.',
      stronger: 'Katniss breaks the Capitol’s rules, which shows “everyone obeys” is false; a better claim is that most people obey when disobeying costs too much.',
      do: 'Find a counterexample, then reword the claim so it fits both the original cases and the new one.',
      starters: ['That claim holds except when', 'A better claim is', 'This case changes the claim to'],
      checks: ['I test the claim against several cases.', 'I reword the claim to fit what I found.', 'My new claim is true for every case.']
    }
  },
  {
    id: 'tool:criteria',
    goal: 'Decide what counts as good, then test each case against it.',
    support: {
      see: 'Criteria are the standards you choose before you judge, and each case is tested against them.',
      weaker: 'Katniss is a good leader because she is good.',
      stronger: 'To count as a good leader, she must protect others and inspire them; Katniss does both.',
      do: 'List two things a good one must have, then check your case against each.',
      starters: ['To count as ___, it must', 'The first criterion is', 'This meets the criterion because'],
      checks: ['I list my criteria first.', 'I test the case against each criterion.', 'My judgement matches the criteria.']
    },
    extend: {
      see: 'Strong criteria are tested: you look for a case that meets them yet seems wrong, and fix them.',
      weaker: 'A good leader is someone who wins.',
      stronger: 'If winning is the criterion, President Snow is a good leader, which seems wrong, so I add that a leader must serve others.',
      do: 'Set criteria, apply them, then hunt for a case that meets them but seems wrong and revise.',
      starters: ['These criteria allow', 'That seems wrong, so I add', 'The criteria I now use are'],
      checks: ['I test my criteria with a tricky case.', 'I revise a criterion that fails.', 'My final criteria match my judgement.']
    }
  },
  {
    id: 'tool:distinction',
    goal: 'Show how two similar ideas differ.',
    support: {
      see: 'A good distinction names the kind both belong to, then the one thing that separates them.',
      weaker: 'Courage and bravery are different words.',
      stronger: 'Both are strengths of character, but courage faces a danger you fear while recklessness ignores it.',
      do: 'Name the kind both things belong to, then finish: one is ___ while the other is ___.',
      starters: ['Both are ___, but', 'The difference is', '___ is ___ while ___ is'],
      checks: ['I name the kind both belong to.', 'I name the one thing that separates them.', 'My pair is easy to tell apart.']
    },
    extend: {
      see: 'A strong distinction tests itself on examples and says why the difference matters to the question.',
      weaker: 'Fear and respect are different things.',
      stronger: 'Both are responses to power, but fear obeys because of a threat while respect follows because of trust; this explains why the Capitol needs force.',
      do: 'Make the distinction, test it on one example from each side, then say what it changes about your answer.',
      starters: ['Both are ___, but', 'This matters because', 'An example of each is'],
      checks: ['I test the distinction on two examples.', 'I say what it changes in my answer.', 'The difference holds up in both cases.']
    }
  },
  {
    id: 'tool:example',
    goal: 'Show what you mean with a case the reader can picture.',
    support: {
      see: 'A good example is a specific case that shows exactly what your general point means.',
      weaker: 'Katniss helps people.',
      stronger: 'For example, Katniss covers Rue with flowers after she dies.',
      do: 'After your point, add “for example” and a specific person, place or event.',
      starters: ['For example,', 'One case is', 'This is seen when'],
      checks: ['My example is specific.', 'My example matches my point.', 'I say how it shows my point.']
    },
    extend: {
      see: 'A strong example is chosen to suit the reader, and a second example shows the point holds more than once.',
      weaker: 'Katniss is brave. For example, she is brave.',
      stronger: 'Katniss is brave when she volunteers; she shows it again when she protects Rue, so the pattern holds.',
      do: 'Choose the example your reader will recognise fastest, add a second from a different setting, then explain how each fits.',
      starters: ['A familiar case is', 'The same happens in', 'This pattern shows'],
      checks: ['My example suits my reader.', 'I give a second, different example.', 'I explain how each example fits.']
    }
  },
  {
    id: 'tool:generalisation',
    goal: 'Say how widely your claim holds: all, most or some.',
    support: {
      see: 'A careful generalisation picks the right size word: all, most or some.',
      weaker: 'The districts all love the Capitol.',
      stronger: 'Some people in the districts accept the Capitol, but many resent it.',
      do: 'Underline each group word, such as “everyone” or “always”, and replace it with all, most or some.',
      starters: ['Most', 'Some', 'In many cases,'],
      checks: ['I picked all, most or some on purpose.', 'My size word fits the evidence I have.', 'I give one example for my claim.']
    },
    extend: {
      see: 'A strong generalisation says how far it reaches and what would change it.',
      weaker: 'Teenagers in stories are brave.',
      stronger: 'Teen heroes in many survival stories, like Katniss, grow braver as the risk rises; a story where they stay timid would limit the claim.',
      do: 'State your generalisation, say how many cases you checked, then name what evidence would shrink it.',
      starters: ['This holds for', 'It would change if', 'Based on the cases I checked,'],
      checks: ['I say how many cases I checked.', 'I name what would limit my claim.', 'My claim stays within my evidence.']
    }
  },
  {
    id: 'tool:implication',
    goal: 'Follow your idea forward: if it is true, what comes next?',
    support: {
      see: 'An implication spells out what must follow if the idea is true.',
      weaker: 'The Capitol has power.',
      stronger: 'If the Capitol holds all the food, then the districts must obey it to eat.',
      do: 'Suppose your idea is true, then write one thing that would follow.',
      starters: ['If that is true, then', 'This would mean', 'As a result,'],
      checks: ['I start with an idea I accept as true.', 'I write what would follow.', 'My result follows from the idea.']
    },
    extend: {
      see: 'A strong implication follows the idea several steps, then judges whether the result is acceptable.',
      weaker: 'If everyone obeys, things stay the same.',
      stronger: 'If everyone obeys the Capitol, the Games continue, children keep dying, and the districts have to accept that, so the idea is hard to defend.',
      do: 'Follow your idea through two or three steps, then decide if you can accept where it ends.',
      starters: ['If that is true, then', 'And then', 'I can accept that because'],
      checks: ['I follow the idea at least two steps.', 'I judge the final result.', 'I keep or change my idea in response.']
    }
  },
  {
    id: 'tool:question',
    goal: 'Turn what you know into an open question worth exploring.',
    support: {
      see: 'An open question has many possible answers and needs reasons.',
      weaker: 'Who is Katniss’s sister?',
      stronger: 'Why does Katniss risk her life for her sister?',
      do: 'Take a question with one right answer and reword it to start with “why” or “how”.',
      starters: ['I wonder why', 'I wonder how', 'I wonder whether'],
      checks: ['My question starts with why or how.', 'Many answers are possible.', 'It needs reasons to answer it.']
    },
    extend: {
      see: 'A strong question opens up the whole issue, so answering it means weighing different ideas.',
      weaker: 'Why do the Games happen?',
      stronger: 'Whom do the Games serve, and what would the districts need to end them?',
      do: 'Ask a question that goes beyond the text, and one that would make a classmate stop and think.',
      starters: ['I wonder whether', 'What if', 'How far'],
      checks: ['My question reaches beyond the text.', 'It makes a reader weigh ideas.', 'It could start a discussion.']
    }
  },
  {
    id: 'tool:reasons',
    goal: 'Back what you say with a reason.',
    support: {
      see: 'A reason answers “why do you think that?” in a sentence.',
      weaker: 'Peeta is a good person.',
      stronger: 'I think Peeta is a good person because he gives Katniss bread when his family has little.',
      do: 'After each claim, write “because” and the reason.',
      starters: ['I think ___ because', 'The reason is', 'This is true because'],
      checks: ['Each claim has a reason.', 'My reasons use “because”.', 'My reasons connect to the claim.']
    },
    extend: {
      see: 'A strong reason is one a reader could check, and it carries the claim by itself.',
      weaker: 'Katniss is brave because she is strong.',
      stronger: 'Katniss is brave because she chooses danger knowingly, and the text shows her weighing the risk before she volunteers.',
      do: 'Give your best reason, then test it: could a reader accept this reason and still doubt the claim?',
      starters: ['The strongest reason is', 'This reason works because', 'A reader could check this by'],
      checks: ['A reader could check my reason.', 'My best reason leads to the claim.', 'I refine any reason that falls short.']
    }
  },
  {
    id: 'tool:suggestion',
    goal: 'Offer an idea for others to try out.',
    support: {
      see: 'A suggestion puts forward an idea in a tentative way, so others can add to it.',
      weaker: 'Katniss should do something different.',
      stronger: 'What if Katniss teamed up with Rue earlier in the Games?',
      do: 'Start a sentence with “What if” or “Maybe” and put forward one new idea.',
      starters: ['What if', 'Maybe', 'Could it be that'],
      checks: ['I offer a new idea.', 'My wording invites others in.', 'My idea connects to the topic.']
    },
    extend: {
      see: 'A strong suggestion explains why it is worth trying and what it might lead to.',
      weaker: 'What if everything was different?',
      stronger: 'What if the districts shared their food in secret? It might give them power to bargain, though the Capitol would notice.',
      do: 'Put forward an idea, say why it is worth trying, and predict one result.',
      starters: ['What if', 'It is worth trying because', 'This might lead to'],
      checks: ['I say why the idea is worth trying.', 'I predict a likely result.', 'I name a risk or a limit.']
    }
  }
];
