import type { SleeveContent } from './types';

export const SKILL_SLEEVES: SleeveContent[] = [
  {
    id: 'skill:apply',
    goal: 'Take a rule or idea and use it on the case in front of you.',
    support: {
      see: 'Applying means naming the rule, looking at the case, then showing how they fit.',
      weaker: 'The Capitol is unfair.',
      stronger: 'A fair game gives everyone an equal chance; the Reaping picks Prim at random, but the richer districts train their tributes, so the rule fails here.',
      do: 'Write the rule, describe the new case, then say where the rule fits the case.',
      starters: ['The rule is', 'In this case,', 'It fits because'],
      checks: ['I name the rule.', 'I describe the case closely.', 'I show where the rule fits.']
    },
    extend: {
      see: 'Strong applying also notices where the rule stretches, bends or stops fitting the case.',
      weaker: 'The rule fits and everything is fine.',
      stronger: 'The rule “help those in need” fits Katniss and Rue, but it strains when helping one tribute puts another in danger.',
      do: 'Apply the rule to the case, find the spot where it fits least well, and say what that shows about the rule.',
      starters: ['The rule fits because', 'It strains when', 'This shows the rule needs'],
      checks: ['I find where the rule fits least well.', 'I say what that shows about the rule.', 'My conclusion respects both rule and case.']
    }
  },
  {
    id: 'skill:assess',
    goal: 'Judge how good, useful or true something is, and say why.',
    support: {
      see: 'Assessing means choosing a measure, weighing strengths and weaknesses, then giving a judgement.',
      weaker: 'Katniss’s plan was okay.',
      stronger: 'Judged by survival, Katniss’s plan to find water first was good: it kept her alive, though it left her exposed.',
      do: 'Choose what you judge by, list one strength and one weakness, then give your judgement with the main reason.',
      starters: ['Judged by', 'Its strength is', 'Overall, it was'],
      checks: ['I say what I judge it by.', 'I give a strength and a weakness.', 'I state my judgement and its main reason.']
    },
    extend: {
      see: 'Strong assessing says how much each strength and weakness counts and who would see it differently.',
      weaker: 'Peeta’s plan has good and bad parts, so it is fair.',
      stronger: 'Peeta’s plan to appear weak protects him, which counts heavily, but its risk to Katniss counts against it; a viewer in the Capitol might see only the show.',
      do: 'Weigh the strengths against the weaknesses, say which counts for more, and say who might judge differently.',
      starters: ['The strongest point is', 'This counts for more because', 'Someone else might judge'],
      checks: ['I say which point counts most.', 'I explain how I weighed them.', 'I consider another person’s judgement.']
    }
  },
  {
    id: 'skill:analyse',
    goal: 'Break it into parts and show how they connect.',
    support: {
      see: 'Analysing means naming the parts, saying what each does, then showing how they work together.',
      weaker: 'The Games are a big event with lots of things in them.',
      stronger: 'The Games have three parts: the Reaping picks the tributes, training ranks them, and the arena tests them.',
      do: 'Name the main parts, write one sentence on what each does, then one sentence on how they connect.',
      starters: ['The parts are', 'This part does', 'Together they'],
      checks: ['I name the main parts.', 'I say what each part does.', 'I show how the parts connect.']
    },
    extend: {
      see: 'Strong analysis shows which part matters most and how changing one part changes the others.',
      weaker: 'The Capitol has many things that help it rule.',
      stronger: 'The Capitol rules through fear, hunger and spectacle; fear depends on the Games, so removing the Games would weaken the other parts too.',
      do: 'Break the whole into parts, then test it: remove one part and say what happens to the rest.',
      starters: ['The part that matters most is', 'If this part changed,', 'The parts depend on each other because'],
      checks: ['I say which part matters most.', 'I test what happens if one part changes.', 'My parts add up to the whole.']
    }
  },
  {
    id: 'skill:calculate',
    goal: 'Work out an answer step by step, then check it makes sense.',
    support: {
      see: 'A calculation shows the method, each step of working, and a check on the answer.',
      weaker: '12 + 8 + 5 is 25.',
      stronger: 'Method: add the three groups. Working: 12 + 8 = 20, then 20 + 5 = 25. Check: 25 is close to 12 + 8 + 8, so it fits.',
      do: 'Write your method, show each step on its own line, then check the answer against a rough estimate.',
      starters: ['My method is', 'Step 1:', 'Check:'],
      checks: ['I wrote my method first.', 'I show every step of my working.', 'I checked the answer with an estimate.']
    },
    extend: {
      see: 'A strong calculation explains why the method suits the problem and what the answer means.',
      weaker: 'The answer is 3.5.',
      stronger: 'A mean suits this data because every score counts; the mean of 3.5 goals per game says the team scores between three and four a match.',
      do: 'Say why your method suits the problem, work it through, check it, then say what the answer means in context.',
      starters: ['This method suits the problem because', 'The answer means', 'A second way to check is'],
      checks: ['I explain why I chose this method.', 'I check the answer a second way.', 'I say what the answer means in context.']
    }
  },
  {
    id: 'skill:classify',
    goal: 'Sort things into groups by what they share.',
    support: {
      see: 'Classifying means naming a category, saying what belongs in it, and what separates it from other categories.',
      weaker: 'Katniss, Peeta and Cato are all different.',
      stronger: 'Katniss and Cato are both fighters, but Katniss is a hunter and Cato is a trained career.',
      do: 'Name the category, say what makes something belong in it, then say how it differs from the next category.',
      starters: ['These belong to the category of', 'Something belongs here when', 'The difference between the groups is'],
      checks: ['I name each category.', 'I say what makes things belong in it.', 'I show how the groups differ.']
    },
    extend: {
      see: 'Strong classifying tests the groups on tricky cases and picks the sorting that is most useful.',
      weaker: 'I sorted the characters into two groups.',
      stronger: 'Sorting by survival skill puts Peeta last, but sorting by strategy puts him near the top, so the choice of category changes the result.',
      do: 'Sort by one rule, find a case that sits between two groups, then say which rule is more useful and why.',
      starters: ['Sorted by', 'The hardest case to place is', 'This sorting is more useful because'],
      checks: ['I find a case that is hard to place.', 'I compare two ways of sorting.', 'I say which sorting is more useful.']
    }
  },
  {
    id: 'skill:compare',
    goal: 'Show how two things are alike, how they differ, and which matters.',
    support: {
      see: 'Comparing names what two things share, how they differ, and which difference matters most.',
      weaker: 'District 12 and the Capitol are different.',
      stronger: 'Both are places people live, but District 12 is poor and the Capitol is rich; the gap in food matters most.',
      do: 'Write one way they are alike, one way they differ, and which difference matters most.',
      starters: ['They are alike because', 'They differ in that', 'The difference that matters most is'],
      checks: ['I name something they share.', 'I name how they differ.', 'I say which difference matters most.']
    },
    extend: {
      see: 'Strong comparing uses the same points for both things and ends with what the comparison shows.',
      weaker: 'Katniss is brave. Peeta is kind.',
      stronger: 'On risk, Katniss faces danger with action while Peeta faces it with words; on trust, both build alliances. The comparison shows courage has more than one form.',
      do: 'Pick two or three points of comparison, apply each to both things, then say what the comparison shows.',
      starters: ['On the point of', 'In contrast,', 'This comparison shows'],
      checks: ['I compare both things on the same points.', 'I weigh which difference counts most.', 'I say what the comparison shows.']
    }
  },
  {
    id: 'skill:deduce',
    goal: 'Show a conclusion that must follow from what you know.',
    support: {
      see: 'Deducing means stating what you know, showing what follows, then drawing the conclusion.',
      weaker: 'Katniss must be at the Reaping.',
      stronger: 'All tributes come from the Reaping, and Katniss is a tribute, so Katniss was chosen at the Reaping.',
      do: 'Write two facts you accept, then write the conclusion that has to follow from them.',
      starters: ['We know that', 'It follows that', 'So,'],
      checks: ['I state what I know.', 'My conclusion has to follow from it.', 'I checked each fact is true.']
    },
    extend: {
      see: 'Strong deducing checks the form: the conclusion follows only if the facts are true and joined correctly.',
      weaker: 'Some tributes are fighters and Katniss is a tribute, so Katniss is a fighter.',
      stronger: 'All tributes face danger and Katniss is a tribute, so Katniss faces danger; “some” would block that conclusion.',
      do: 'Set out the facts, test that each is true, then check that the conclusion follows from them step by step.',
      starters: ['If it is true that', 'The conclusion follows because', 'This only works if'],
      checks: ['I test that every fact is true.', 'I check the conclusion follows step by step.', 'I say what would make it fail.']
    }
  },
  {
    id: 'skill:define',
    goal: 'Say exactly what a word or idea means.',
    support: {
      see: 'A definition names the kind of thing, then what makes it different from others of that kind.',
      weaker: 'Courage is being courageous.',
      stronger: 'Courage is a strength of character that lets someone act when they feel afraid.',
      do: 'Write “___ is a kind of ___ that ___”, then give one example to test it.',
      starters: ['___ is a kind of', 'It differs from others because', 'An example is'],
      checks: ['I name the kind of thing it is.', 'I say what makes it different.', 'I tested my definition with an example.']
    },
    extend: {
      see: 'A strong definition survives testing: you try an example and a counterexample and fix the wording.',
      weaker: 'A hero is someone who helps people.',
      stronger: 'A hero helps others at a cost to themselves; a firefighter fits, and a person who donates spare change shows the cost part matters.',
      do: 'Write a definition, test it with one example and one counterexample, then reword it to fit both.',
      starters: ['My definition is', 'A case that tests it is', 'So I reword it to'],
      checks: ['I test with an example and a counterexample.', 'I reword the definition after testing.', 'It fits the cases I tried.']
    }
  },
  {
    id: 'skill:describe',
    goal: 'Say what it is like, with the main features in a clear order.',
    support: {
      see: 'A description looks closely, names the main features, and puts them in a sensible order.',
      weaker: 'The arena is a place with things in it.',
      stronger: 'The arena has a Cornucopia at its centre, a forest on one side and a desert on the other.',
      do: 'Look closely, write the three main features, then arrange them so a reader can picture them.',
      starters: ['It has', 'First,', 'Next to this,'],
      checks: ['I name the main features.', 'My order helps a reader picture it.', 'Each detail is specific.']
    },
    extend: {
      see: 'A strong description chooses the features that matter and gives the reader the right picture of the whole.',
      weaker: 'The arena has trees, sand, a lake, a field, rocks and a cave.',
      stronger: 'The arena is a hostile landscape: the Cornucopia tempts, the forest hides, and the desert exposes.',
      do: 'Pick the features that matter most for your reader’s purpose and arrange them to build one overall picture.',
      starters: ['The overall impression is', 'The most striking feature is', 'Each part adds'],
      checks: ['I chose the features that matter most.', 'My order builds one overall picture.', 'The description suits my reader’s purpose.']
    }
  },
  {
    id: 'skill:evaluate',
    goal: 'Judge how strong an idea or argument is, using criteria.',
    support: {
      see: 'Evaluating means setting criteria, weighing strengths and weaknesses against them, then judging.',
      weaker: 'The plan was good.',
      stronger: 'Judged on safety and speed, the plan was strong: it moved fast, but it carried a high risk.',
      do: 'Choose two criteria, test the idea against each, then write your judgement and the reason.',
      starters: ['My criteria are', 'Against this criterion,', 'My judgement is'],
      checks: ['I set criteria before judging.', 'I weigh strengths and weaknesses.', 'My judgement follows from them.']
    },
    extend: {
      see: 'Strong evaluating justifies its criteria, weighs them against each other, and says how confident the judgement is.',
      weaker: 'It is a good argument because it has good points.',
      stronger: 'Criteria of truth and fairness both matter, but truth counts more here; on that basis the argument is strong, though short of conclusive.',
      do: 'Justify your criteria, say which counts most, reach a judgement, and say how sure you are.',
      starters: ['I use these criteria because', 'The most important criterion is', 'I am fairly sure because'],
      checks: ['I justify my criteria.', 'I say which criterion counts most.', 'I say how confident my judgement is.']
    }
  },
  {
    id: 'skill:examine',
    goal: 'Look closely, ask questions, and say what the details show.',
    support: {
      see: 'Examining means noticing details, asking questions about them, and saying what they show.',
      weaker: 'The Mockingjay pin is a pin.',
      stronger: 'The Mockingjay pin is gold and shaped like a bird; I wonder why Madge gave it, and it shows she trusts Katniss.',
      do: 'List three details you notice, ask a question about one, then say what it shows.',
      starters: ['I notice', 'I wonder why', 'This shows'],
      checks: ['I list specific details.', 'I ask a question about one.', 'I say what the details show.']
    },
    extend: {
      see: 'Strong examining follows a surprising detail and tests more than one possible meaning.',
      weaker: 'The detail shows something about the character.',
      stronger: 'Katniss sings to Rue, a surprising moment of gentleness; it could show grief, or defiance of the Capitol, and the audience’s reaction suggests defiance.',
      do: 'Find the most surprising detail, ask why it is there, and test two possible meanings.',
      starters: ['What surprises me is', 'It could mean', 'The evidence favours'],
      checks: ['I pick a surprising detail.', 'I test two possible meanings.', 'I choose the meaning that fits the evidence best.']
    }
  },
  {
    id: 'skill:explain',
    goal: 'Make clear how or why something happens: what, why, so.',
    support: {
      see: 'Explaining states what, gives the cause, then links them with “because” and “so”.',
      weaker: 'Katniss goes to the Games.',
      stronger: 'Katniss goes to the Games because she volunteers for Prim, so she takes the danger on herself.',
      do: 'State what happened, give the cause, then join them: “… because … so …”.',
      starters: ['This happens because', 'As a result,', 'So'],
      checks: ['I state what I am explaining.', 'I give the cause or reason.', 'I link them with because and so.']
    },
    extend: {
      see: 'Strong explaining traces a chain of causes and says which link matters most.',
      weaker: 'The districts are poor because the Capitol takes food.',
      stronger: 'The Capitol takes food, so the districts go hungry, so people sign up for tesserae, so more names enter the Reaping; the hunger link matters most because everything else depends on it.',
      do: 'Trace the chain from cause to effect in at least three links, then say which link matters most.',
      starters: ['This led to', 'Each step caused', 'The key link is'],
      checks: ['I trace at least three links.', 'Each link causes the next.', 'I say which link matters most.']
    }
  },
  {
    id: 'skill:identify',
    goal: 'Find it, name it, and point to where it is.',
    support: {
      see: 'Identifying means knowing what you are looking for, finding it, and naming it with its location.',
      weaker: 'There is a technique in the text.',
      stronger: 'In the opening chapter, “the reaping” is repeated, which is a technique called repetition.',
      do: 'Write what you were looking for, name what you found, and point to the exact place.',
      starters: ['I found', 'It is called', 'You can see it in'],
      checks: ['I know what I am looking for.', 'I name what I found.', 'I point to where it is.']
    },
    extend: {
      see: 'Strong identifying separates the best match from near matches and says how you can tell.',
      weaker: 'This is a metaphor or a simile.',
      stronger: 'This is a simile because it uses “like”; a metaphor would say the two things are the same.',
      do: 'Name what you found, say how you know, and check it against the closest alternative.',
      starters: ['I can tell because', 'It is closest to', 'The alternative would be'],
      checks: ['I say how I know.', 'I compare it with the closest alternative.', 'I point to the exact words.']
    }
  },
  {
    id: 'skill:infer',
    goal: 'Work out what is likely from clues, and name the clue.',
    support: {
      see: 'Inferring means finding clues, asking what they suggest, and naming the clue behind your inference.',
      weaker: 'Haymitch is drunk.',
      stronger: 'Haymitch stumbles and drinks all day; I infer he is trying to forget the past, because he cannot stop shaking.',
      do: 'Find two clues, say what they suggest together, then state your inference and the clue it rests on.',
      starters: ['The clues are', 'This suggests', 'I infer ___ because'],
      checks: ['I find specific clues.', 'I state my inference clearly.', 'I name the clue it rests on.']
    },
    extend: {
      see: 'Strong inferring offers more than one reading of the clues and picks the one with the best support.',
      weaker: 'The clue means one thing.',
      stronger: 'Her smile could mean pride or fear; the shaking hand supports fear, and the scene that follows confirms it.',
      do: 'Give two possible inferences from the clues, then say which one the evidence supports best.',
      starters: ['One possibility is', 'Another reading is', 'The best supported is'],
      checks: ['I offer two possible inferences.', 'I choose the better supported one.', 'I say how sure I am.']
    }
  },
  {
    id: 'skill:justify',
    goal: 'Back your claim with reasons and evidence.',
    support: {
      see: 'Justifying means stating a claim, giving a reason, then backing the reason with evidence.',
      weaker: 'Katniss is a good sister.',
      stronger: 'Katniss is a good sister because she protects Prim; she volunteers to take her place at the Reaping.',
      do: 'Write your claim, add “because” and a reason, then add evidence or an example.',
      starters: ['I claim that', 'This is because', 'The evidence is'],
      checks: ['I state my claim.', 'I give a reason for it.', 'I back the reason with evidence.']
    },
    extend: {
      see: 'Strong justifying picks the best reasons, links each to the claim, and tests them against a challenge.',
      weaker: 'It is right. I have many reasons.',
      stronger: 'My strongest reason is that Prim would be lost in the arena; a critic might say Katniss only wanted glory, but her actions in the arena point the other way.',
      do: 'Give your strongest reason with evidence, explain why it supports the claim, then answer one challenge.',
      starters: ['My strongest reason is', 'This supports my claim because', 'A challenge might be'],
      checks: ['I choose my strongest reason.', 'I explain how it supports the claim.', 'I answer a challenge to it.']
    }
  },
  {
    id: 'skill:summarise',
    goal: 'Give the main points briefly, in your own words.',
    support: {
      see: 'A summary states the main idea, adds the key points, and shortens it in your own words.',
      weaker: 'Katniss goes to the arena and things happen and then it ends.',
      stronger: 'Katniss volunteers for Prim, survives the arena with help from Rue and Peeta, and defies the Capitol at the end.',
      do: 'Find the main idea, pick the three key points, then write it briefly in your own words.',
      starters: ['The main idea is', 'The key points are', 'In short,'],
      checks: ['I state the main idea.', 'I include the key points only.', 'I use my own words.']
    },
    extend: {
      see: 'A strong summary suits its reader: it keeps what that reader needs and leaves out the rest.',
      weaker: 'It was a long book with lots of events.',
      stronger: 'For a reader who has seen the film, I focus on what the book adds: Katniss’s thoughts about the Capitol.',
      do: 'Decide who the summary is for, keep what they need, shorten the rest, and check the main idea survives.',
      starters: ['For this reader,', 'What matters here is', 'In one sentence,'],
      checks: ['I wrote for a specific reader.', 'I kept what that reader needs.', 'The main idea survives in fewer words.']
    }
  }
];
