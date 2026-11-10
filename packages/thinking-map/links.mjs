// packages/thinking-map/links.mjs
// The map's new links, written as data: links between the tools that were Books, links from
// tool steps to the Knowledge protocols, and a few tool-level links. Each carries a one-line
// `why` for the review table (scripts/print-thinking-map-links.mjs). The catalogues' own
// `pairsWell` and `seeAlso` links are imported by index.mjs and are not repeated here.

const l = (from, to, why) => Object.freeze({ from, to, why });

/** Links between Wayfinder, Change Navigator, Team Builder, Conversation Guide and Thought Starter. */
export const BOOK_LINKS = Object.freeze([
  // Wayfinder <-> Change Navigator
  l('rb_chesterton', 'ch_anti_change', 'Before taking a fence down, see why the change is being resisted.'),
  l('ch_change', 'rb_comfort', 'Where a change sits on its curve often depends on leaving a comfort zone.'),
  l('rb_amara', 'ch_future', 'Short-term over-reading and long-term under-reading both shape a picture of the future.'),
  l('ch_innovation', 'rb_maya', 'A new idea lands when it is advanced but still acceptable.'),
  l('ch_sustainability', 'rb_one_step', 'A change that lasts is usually built one small step at a time.'),
  // Wayfinder <-> Team Builder
  l('rb_brooks', 'cb_two_pizza', 'Adding people to a late job is a question of how big the team should be.'),
  l('cb_premortem', 'rb_murphy', 'Imagining the failure first is Murphy’s Law put to work.'),
  l('rb_goodhart', 'cb_north_star', 'A shared metric stops measuring once it becomes the target.'),
  l('rb_triviality', 'cb_consent', 'When a group argues over small things, a consent round moves it on.'),
  // Wayfinder <-> Conversation Guide
  l('rb_wiio', 'cm_four_layers', 'If a message usually fails, look at the layers it is heard on.'),
  l('rb_korzybski', 'cm_decoding', 'The map is not the territory: what was sent is not what was read.'),
  l('cm_meetings', 'rb_triviality', 'Meetings drift to the easy topics; name the hard one.'),
  // Wayfinder <-> Thought Starter
  l('rb_ten_ten_ten', 'qb_making_decisions', 'After the time test, look at how you usually decide.'),
  l('rb_big_fish', 'qb_who_you_are', 'How you rate yourself depends on the pond; ask who you are outside it.'),
  l('qb_your_future', 'rb_one_step', 'Turn a picture of the future into the next step closer.'),
  l('rb_region_beta', 'qb_happiness', 'Putting up with a mild problem says something about what makes you happy.'),
  // Change Navigator <-> Team Builder
  l('cb_tuckman', 'ch_change', 'A team’s stages are a change curve for a group.'),
  l('ch_change', 'cb_reorg', 'A change at work often arrives as a reorganisation.'),
  l('ch_swarm_intelligence', 'cb_workshops', 'A workshop is one way to draw on what a group knows.'),
  l('ch_transparency', 'cb_trust_triangle', 'Openness is one corner of trust.'),
  // Change Navigator <-> Conversation Guide
  l('ch_othering', 'cm_standpoint', 'Seeing someone as other is a standpoint question.'),
  l('cm_framing', 'ch_objectivity', 'How a change is framed shapes what looks objective.'),
  l('ch_counterculture', 'cm_social_judgement', 'Whether a counter view is heard depends on where listeners already stand.'),
  // Change Navigator <-> Thought Starter
  l('ch_meaning_of_life', 'qb_principles_and_values', 'Before weighing meaning, write down what you value.'),
  l('qb_last_year', 'ch_change', 'Looking back on a year shows which changes are under way.'),
  l('ch_future', 'qb_your_future', 'A model of the future meets your own picture of it.'),
  // Team Builder <-> Conversation Guide
  l('cb_radical_candor', 'cm_feedback', 'Caring and challenging both need a way to say it.'),
  l('cb_ladder', 'cm_nonviolent', 'Climb down the ladder, then say what you observed and need.'),
  l('cm_nonviolent', 'cb_trust_triangle', 'A conversation that names needs rebuilds trust.'),
  l('cb_integrative', 'cm_negotiation', 'A group decision may need principled negotiation first.'),
  l('cb_psych_safety', 'cm_listening', 'Safety in a team starts with being listened to.'),
  // Team Builder <-> Thought Starter
  l('cb_purpose', 'qb_career', 'A team’s purpose meets your own working life.'),
  l('qb_what_your_colleague_thinks_about_you', 'cb_four_in_one', 'How a colleague sees you is one of four perspectives.'),
  l('cb_burnout', 'qb_mind_and_body', 'Burnout shows in mind and body first.'),
  // Conversation Guide <-> Thought Starter
  l('cm_proust', 'qb_who_you_really_are', 'A questionnaire about yourself leads to the deeper chapter.'),
  l('qb_communicating', 'cm_listening', 'From how you communicate to listening on purpose.'),
  l('cm_apology', 'qb_your_friends', 'An apology often belongs to a friendship.'),
  l('qb_what_your_partner_thinks_about_you', 'cm_four_layers', 'What a partner hears may sit on a different layer.')
]);

/** Links from tool steps (or tools) to the Knowledge protocols. */
export const PROTOCOL_LINKS = Object.freeze([
  // Mirror: values pulling against behaviour
  l('tool:decision-book', 'protocol:mirror', 'The values compass shows a clash between what you do and what you want.'),
  l('dm_crossroads', 'protocol:mirror', 'A crossroads that keeps coming back may be a values conflict.'),
  l('qb_principles_and_values', 'protocol:mirror', 'Written values can be read against what you actually do.'),
  l('ch_unhappiness', 'protocol:mirror', 'Unhappiness with a change can be a gap between aspiration and capacity.'),
  l('gt_motivation', 'protocol:mirror', 'Motivation that will not come may be a values conflict.'),
  // Refinery: a choice resting on one argument
  l('tool:decision-book', 'protocol:refinery', 'The choice rests on one argument that needs testing.'),
  l('cm_rhetoric', 'protocol:refinery', 'An argument to make needs building and breaking before it is used.'),
  l('cm_sophism', 'protocol:refinery', 'A suspicious argument can be rebuilt to see what survives.'),
  // Tribunal: an entrenched frame
  l('tool:problem-solver', 'protocol:tribunal', 'The frame is stuck on its second rewrite; open three reframes.'),
  l('ps:triz', 'protocol:tribunal', 'A contradiction that resists every principle may be framed wrongly.'),
  l('gt_procrastination', 'protocol:tribunal', 'A delay that keeps returning is an entrenched pattern.'),
  l('rb_comfort', 'protocol:tribunal', 'Falling back into the comfort zone again needs a new frame.'),
  // Horizon: change over time, direction
  l('tool:change-book', 'protocol:horizon', 'A change in progress can be mapped against the future you want.'),
  l('ch_future', 'protocol:horizon', 'A model of the future leads to a mapped direction.'),
  l('dm_future', 'protocol:horizon', 'How you will decide in future is a direction question.'),
  l('qb_your_future', 'protocol:horizon', 'Your own picture of the future can be mapped against present trajectories.'),
  // Consilium: an ethical choice
  l('tool:decision-book', 'protocol:consilium', 'The choice has an ethical side worth deliberating.'),
  l('dm_prisoners', 'protocol:consilium', 'Co-operation versus self-interest is an ethical question.'),
  l('qb_principles_and_values', 'protocol:consilium', 'Principles that clash can be deliberated without a verdict.'),
  l('ch_climate_disaster', 'protocol:consilium', 'A shared harm is weighed from several ethical standpoints.'),
  // Cartographers: a step that needs reading
  l('tool:problem-solver', 'protocol:cartographers', 'The analysis needs reading before it can go on.'),
  l('gt_book_of_books', 'protocol:cartographers', 'What you have read can be turned into a map.'),
  l('ch_science', 'protocol:cartographers', 'Testing a model of the world needs the literature mapped.'),
  // Fates: an open "what could we even do" step
  l('tool:problem-solver', 'protocol:fates', 'The Devise step is wide open; spin, cut and weigh ideas.'),
  l('gt_brainstorming', 'protocol:fates', 'A brainstorm can run as a live dialectic.'),
  l('cb_workshops', 'protocol:fates', 'A group with no options yet can start from three voices.'),
  // Witness: a closed thread
  l('gt_project_evaluation', 'protocol:witness', 'A finished project can have its thinking audited.'),
  l('cb_postmortem', 'protocol:witness', 'A postmortem asks how far to trust the reasoning, not only the result.'),
  l('dm_feedback_analysis', 'protocol:witness', 'Comparing what you expected with what happened invites an audit.'),
  // Refinery: a view worth testing rather than defending
  l('rb_scout', 'protocol:refinery', 'A view you have been defending can be built, broken and rebuilt to see what survives.')
]);

/** Tool-level links, so every tool has a way in and out. */
export const TOOL_LINKS = Object.freeze([
  l('ps:seven_step', 'tool:decision-book', 'The Decide step is really a choice to settle.'),
  l('ps:polya', 'tool:get-things-done', 'A plan that will not start needs a small experiment.'),
  l('tool:question-book', 'tool:decision-book', 'Once you know what matters, settle the choice.'),
  l('tool:communication-book', 'tool:collaboration-book', 'A conversation is often part of how a group works.'),
  l('tool:collaboration-book', 'tool:communication-book', 'A group problem often comes down to one conversation.'),
  l('tool:rules-book', 'tool:problem-solver', 'Once the situation is read, it may be a problem to solve.'),
  l('tool:change-book', 'tool:get-things-done', 'A change you want to make needs a first step.'),
  l('tool:get-things-done', 'tool:question-book', 'Not starting may be about what you want.')
]);

/** Every new link, in table order. */
export const NEW_LINKS = Object.freeze([...BOOK_LINKS, ...PROTOCOL_LINKS, ...TOOL_LINKS]);
