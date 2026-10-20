// Synthetic sample runs for the Problem Solver preview harness. No personal data.
import { again, applyStep, newLightning } from '../packages/problem-solver/lightning.mjs';
const node = (id, slot, text, title, extra = {}) => ({ id, slot, text, title, state: 'accepted', skills: ['analysis'], turnId: 't', ...extra });
const run = (tool, nodes, edges = []) => ({ id: `sample-${tool}`, tool, status: 'active', nodes, edges });

export const SAMPLES = {
  five_whys: run('five_whys', [
    node('p', 'problem', 'The weekly rota goes out late.', 'Late rota'),
    node('w1', 'why:1', 'There is no shared calendar.', 'No shared calendar'),
    node('w2', 'why:2', 'Shift swaps are agreed by text message.', 'Swaps by text', { state: 'contested', objection: 'That describes a habit, not a cause.' }),
    node('w3', 'why:3', 'Nobody owns the final check.', 'No final check'),
    node('r', 'root', 'Ownership of the rota was never assigned.', 'Unassigned ownership')
  ]),
  problem_tree: run(
    'problem_tree',
    [
      node('trunk', 'trunk', 'Deliveries arrive after the promised window.', 'Late deliveries'),
      node('c1', 'cause:1', 'Orders are batched once a day.', 'Daily batching'),
      node('c2', 'cause:2', 'Couriers are booked by hand.', 'Manual booking', { state: 'contested', objection: 'Is this a cause or a symptom?' }),
      node('c3', 'cause:3', 'Stock counts are out of date.', 'Stale stock counts'),
      node('c4', 'cause:4', 'Addresses are retyped at dispatch.', 'Retyped addresses'),
      node('e1', 'effect:1', 'Customers chase by phone.', 'Chasing calls'),
      node('e2', 'effect:2', 'Refunds are issued for missed slots.', 'Missed-slot refunds'),
      node('e3', 'effect:3', 'Repeat orders drop.', 'Fewer repeat orders')
    ],
    [
      { from: 'c1', to: 'e1', kind: 'relates' },
      { from: 'c3', to: 'e2', kind: 'relates' }
    ]
  ),
  concept_map: run(
    'concept_map',
    [
      node('theme', 'theme', 'Why the allotment yields less each year.', 'Falling yields'),
      node('c1', 'concept:1', 'Soil is compacted.', 'Compacted soil'),
      node('c2', 'concept:2', 'Watering is irregular.', 'Irregular watering', { state: 'contested', objection: 'Is this measured or a guess?' }),
      node('c3', 'concept:3', 'Crops are not rotated.', 'No rotation'),
      node('c4', 'concept:4', 'Pests overwinter in debris.', 'Overwintering pests'),
      node('c5', 'concept:5', 'Nutrients run low.', 'Low nutrients')
    ],
    [
      { from: 'theme', to: 'c1', kind: 'hierarchical' },
      { from: 'theme', to: 'c3', kind: 'hierarchical' },
      { from: 'c3', to: 'c5', kind: 'hierarchical' },
      { from: 'c1', to: 'c2', kind: 'association' },
      { from: 'c4', to: 'c5', kind: 'cross' }
    ]
  ),
  problem_statement: run('problem_statement', [
    node('problem', 'problem', 'One in four deliveries misses its window.', 'Quarter late'),
    node('impact', 'impact', 'Refunds cost about 3,000 a month and support time doubles.', 'Refunds and support load'),
    node('benefit', 'benefit', 'Customers keep ordering and the team stops firefighting.', 'Loyal customers'),
    node('statement', 'statement', 'One in four deliveries misses its promised window, costing roughly 3,000 a month in refunds and doubling support time. Fixing dispatch would keep customers ordering and free the team from firefighting.', 'Composed statement', { state: 'contested', objection: 'Check the 3,000 figure.' })
  ]),
  gap_basic: run('gap_basic', [
    node('cur', 'current', 'Deliveries often miss the promised window.', 'Late deliveries'),
    node('obj', 'objective', 'Nine in ten deliveries arrive inside the window.', 'On-time delivery', { state: 'contested', objection: 'Is nine in ten the right target?' }),
    node('k1', 'known:1', 'Orders are batched once a day.', 'Daily batching'),
    node('k2', 'known:2', 'Couriers are booked by hand.', 'Manual booking'),
    node('d1', 'done:1', 'Customers are told a window at checkout.', 'Window promised'),
    node('d2', 'done:2', 'Late parcels are refunded.', 'Refunds paid'),
    node('d3', 'done:3', 'Support chases couriers by phone.', 'Phone chasing'),
    node('d4', 'done:4', 'Addresses are retyped at dispatch.', 'Retyped addresses'),
    node('mk1', 'must_know:1', 'Which routes cause most delays.', 'Slow routes'),
    node('mk2', 'must_know:2', 'Courier capacity by hour.', 'Courier capacity'),
    node('md1', 'must_do:1', 'Dispatch twice a day.', 'Twice-daily dispatch'),
    node('a1', 'action:1', 'Pilot a second dispatch run.', 'Second dispatch'),
    node('a2', 'action:2', 'Import addresses automatically.', 'Auto addresses'),
    node('a3', 'action:3', 'Share live capacity with couriers.', 'Share capacity'),
    node('a4', 'action:4', 'Review routes monthly.', 'Monthly review')
  ]),
  gap_radar: {
    ...run('gap_radar', [
      node('cur', 'current', 'Deliveries often miss the promised window.', 'Late deliveries'),
      node('obj', 'objective', 'Dependable, predictable delivery.', 'Dependable delivery'),
      node('x1', 'axis:1', 'Dispatch speed', 'Dispatch speed'),
      node('x2', 'axis:2', 'Courier capacity', 'Courier capacity', { state: 'contested', objection: 'Overlaps with dispatch?' }),
      node('x3', 'axis:3', 'Address accuracy', 'Address accuracy'),
      node('x4', 'axis:4', 'Stock accuracy', 'Stock accuracy'),
      node('x5', 'axis:5', 'Customer updates', 'Customer updates'),
      node('x6', 'axis:6', 'Returns handling', 'Returns handling')
    ]),
    radar: { snapshots: [{ at: '2026-10-01T09:00:00Z', current: [4, 3, 6, 5, 2, 4], objective: [8, 8, 9, 8, 7, 8] }] }
  },
  'gap_radar:next': {
    ...run('gap_radar', [
      node('cur', 'current', 'Deliveries often miss the promised window.', 'Late deliveries'),
      node('obj', 'objective', 'Dependable, predictable delivery.', 'Dependable delivery'),
      node('x1', 'axis:1', 'Dispatch speed', 'Dispatch speed'),
      node('x2', 'axis:2', 'Courier capacity', 'Courier capacity', { state: 'contested', objection: 'Overlaps with dispatch?' }),
      node('x3', 'axis:3', 'Address accuracy', 'Address accuracy'),
      node('x4', 'axis:4', 'Stock accuracy', 'Stock accuracy'),
      node('x5', 'axis:5', 'Customer updates', 'Customer updates'),
      node('x6', 'axis:6', 'Returns handling', 'Returns handling')
    ]),
    radar: {
      snapshots: [
        { at: '2026-10-01T09:00:00Z', current: [4, 3, 6, 5, 2, 4], objective: [8, 8, 9, 8, 7, 8] },
        { at: '2026-11-01T09:00:00Z', current: [7, 6, 8, 6, 5, 5], objective: [8, 8, 9, 8, 7, 8] }
      ]
    }
  },
  smart: run('smart', [
    node('problem', 'problem', 'One in four deliveries misses its window, costing about 3,000 a month.', 'Quarter of deliveries late'),
    node('s', 's', 'Dispatch team, all warehouse orders, two runs a day.', 'Two daily runs'),
    node('m', 'm', 'Late share falls from 25 to 10 percent.', 'Late share', { state: 'contested', objection: 'Which baseline month?' }),
    node('a', 'a', 'Within current courier contracts and staffing.', 'Within contracts')
  ]),
  causal_map: run(
    'causal_map',
    [
      node('p', 'problem', 'The community garden loses most of its volunteers by midsummer.', 'Volunteers drift away'),
      node('c1', 'cause:1', 'Volunteers never know which beds need them on a given day.', 'Unclear daily jobs'),
      node('c2', 'cause:2', 'Watering falls to the same three people every week.', 'Uneven watering rota', { state: 'contested', objection: 'Is that a cause or a result of people leaving?' }),
      node('c3', 'cause:3', 'New starters get no welcome or tour.', 'No welcome'),
      node('i1', 'influence:1', 'Long summer evenings compete with holidays and sport.', 'Summer distractions'),
      node('i2', 'influence:2', 'The group chat is busy and important messages get lost.', 'Noisy group chat'),
      node('i3', 'influence:3', 'The tool shed key is held by one person.', 'Single shed key'),
      node('i4', 'influence:4', 'Council grants require logged volunteer hours.', 'Grant hour rules')
    ],
    [
      { from: 'c1', to: 'p', kind: 'plus' },
      { from: 'c2', to: 'p', kind: 'plus_strong' },
      { from: 'c3', to: 'p', kind: 'plus' },
      { from: 'i2', to: 'c1', kind: 'plus' },
      { from: 'i1', to: 'c2', kind: 'plus' },
      { from: 'i3', to: 'c2', kind: 'plus_strong' },
      { from: 'i4', to: 'c3', kind: 'minus' },
      { from: 'i2', to: 'c3', kind: 'plus' },
      { from: 'c3', to: 'c1', kind: 'plus' }
    ]
  ),
  // Five stakeholders, so the pager shows and the second set (the newest) is on screen.
  perspective_shift: run('perspective_shift', [
    node('s1', 'stakeholder:1', 'The evening cleaner who locks the sports hall at ten.', 'Evening cleaner'),
    node('s2', 'stakeholder:2', 'The junior football coach who runs the last session.', 'Junior coach'),
    node('s3', 'stakeholder:3', 'Parents who wait in the car park for pick-up.', 'Waiting parents', { state: 'contested', objection: 'Parents are several people with different needs; is there one view here?' }),
    node('s4', 'stakeholder:4', 'The treasurer who books and bills the hall.', 'Hall treasurer'),
    node('s5', 'stakeholder:5', 'Neighbours across the road from the car park.', 'Neighbours'),
    node('v1', 'view:1', 'Sessions overrun, so the cleaning starts late and the hall is locked after the shift ends.', 'Overruns eat shift'),
    node('v2', 'view:2', 'Why is the last slot only fifty minutes when the kit takes fifteen to pack away?', 'Slot too short'),
    node('v3', 'view:3', 'They wish they knew when the session will really end, so they could time the pick-up.', 'Unclear end time'),
    node('v4', 'view:4', 'What about the late fee in the booking terms, which is never charged?', 'Unused late fee'),
    node('n1', 'insight:1', 'It helps when the hall is empty by the time the shift starts.', 'Empty hall on time'),
    node('n2', 'insight:2', 'I can\'t finish properly when packing away eats the end of the session.', 'Packing time'),
    node('n3', 'insight:3', 'It helps when the end time is the time the children walk out.', 'Real finish time'),
    node('n4', 'insight:4', 'It helps when the booking matches how long the hall is really used.', 'Honest bookings'),
    node('v5', 'view:5', 'Engines idle and car doors slam late into the evening.', 'Late noise'),
    node('r', 'reframe', 'How might the last session of the evening end, kit packed and hall empty, by the time the cleaner\'s shift begins, without cutting the children\'s playing time?')
  ]),
  // A centre, four branches and nine items below them, one of them contested, and a review.
  radial_tree: run(
    'radial_tree',
    [
      node('root', 'root', 'Everything that goes into running the weekly repair café, broken down by area.', 'Repair café'),
      node('b1', 'node:1', 'Getting broken items logged and matched to a fixer.', 'Intake'),
      node('b2', 'node:2', 'The volunteer fixers and what they can mend.', 'Fixers'),
      node('b3', 'node:3', 'The hall, tables, power and tools.', 'Venue and kit'),
      node('b4', 'node:4', 'Telling people when and where it runs.', 'Publicity'),
      node('d1', 'node:5', 'A paper queue at the door that no one keeps in order.', 'Door queue'),
      node('d2', 'node:6', 'A sheet saying what was wrong and what was tried.', 'Repair notes'),
      node('d3', 'node:7', 'Two electricians who can test lamps and kettles.', 'Electrical'),
      node('d4', 'node:8', 'Menders who do clothes, bags and zips.', 'Sewing', { state: 'contested', objection: 'Sewing is a skill; the other items here are people. Mixing kinds blurs the level.' }),
      node('d5', 'node:9', 'Bike repairs, which need the yard outside.', 'Bikes'),
      node('d6', 'node:10', 'Extension leads, testers and the tool box.', 'Tools'),
      node('d7', 'node:11', 'Notices in the library and the corner shop.', 'Posters'),
      node('e1', 'node:12', 'A portable appliance tester borrowed each month.', 'PAT tester'),
      node('e2', 'node:13', 'Spare fuses and plugs bought from the café tin.', 'Spare parts'),
      node('rv', 'review', 'Fixers carry most of the tree and the venue hangs on one box of tools; publicity is thin, which may be why the same faces come each week.')
    ],
    [
      { from: 'b1', to: 'root', kind: 'parent' },
      { from: 'b2', to: 'root', kind: 'parent' },
      { from: 'b3', to: 'root', kind: 'parent' },
      { from: 'b4', to: 'root', kind: 'parent' },
      { from: 'd1', to: 'b1', kind: 'parent' },
      { from: 'd2', to: 'b1', kind: 'parent' },
      { from: 'd3', to: 'b2', kind: 'parent' },
      { from: 'd4', to: 'b2', kind: 'parent' },
      { from: 'd5', to: 'b2', kind: 'parent' },
      { from: 'd6', to: 'b3', kind: 'parent' },
      { from: 'd7', to: 'b4', kind: 'parent' },
      { from: 'e1', to: 'd6', kind: 'parent' },
      { from: 'e2', to: 'd6', kind: 'parent' }
    ]
  )
};

// The causal map after one more turn: a fourth cause that eases the problem, and its links.
SAMPLES['causal_map:next'] = {
  ...SAMPLES.causal_map,
  nodes: [...SAMPLES.causal_map.nodes, node('c4', 'cause:4', 'Monthly harvest days bring everyone together.', 'Shared harvest days')],
  edges: [...SAMPLES.causal_map.edges, { from: 'c4', to: 'p', kind: 'minus_strong' }, { from: 'i1', to: 'c4', kind: 'minus' }]
};

const session = (model, phase, steps) => ({
  id: `sample-${model}`, title: 'Late deliveries', revision: 1, kind: 'full', status: phase === 'finished' ? 'finished' : 'active', phase,
  frame: {}, model: { id: model, reason: '' }, links: [], steps, learnings: [], pendingLearning: null,
  turns: [], summary: '', suggestion: null, pendingKeep: null, runner: { status: 'idle', mode: 'turn', error: null }, createdAt: '', updatedAt: ''
});
const chain = [
  { ...SAMPLES.five_whys, id: 'run-whys', status: 'switched', switchReason: 'The causes branch, so a tree fits better.' },
  { ...SAMPLES.problem_tree, id: 'run-tree', status: 'done' },
  { ...SAMPLES.smart, id: 'run-smart', status: 'done' }
];
const step = (runs, status = 'done', objection = null) => ({ runs, status, objection });
SAMPLES.record = session('seven_step', 'devise', { define: step(chain), analyse: step([], 'skipped', 'No causes mapped.'), devise: step([], 'open') });
SAMPLES.record_polya = session('polya', 'identify', { identify: step([chain[0], { ...chain[1], status: 'active' }], 'open') });
SAMPLES.record_triz = session('triz', 'general_problem', { specific_problem: step(chain.slice(1)), general_problem: step([], 'open') });

// The radial tree after one more turn: a new item under the fixers, so that branch widens.
SAMPLES['radial_tree:next'] = {
  ...SAMPLES.radial_tree,
  nodes: [
    ...SAMPLES.radial_tree.nodes,
    node('d8', 'node:14', 'A volunteer who can sharpen knives and garden tools.', 'Sharpening')
  ],
  edges: [...SAMPLES.radial_tree.edges, { from: 'd8', to: 'b2', kind: 'parent' }]
};

// Force field: a small bakery weighing a four-day week. Unscored first, then scored, then a
// rescore a month on (drivers strengthened, restrainers weakened) so the morph and re-order show.
const forceNodes = [
  node('cur', 'current', 'Bakers work six days a week and two left this year.', 'Six-day weeks'),
  node('goal', 'goal', 'A four-day rota that keeps the shop open six days.', 'Four-day rota'),
  node('f1', 'for:1', 'The whole team asked for it at the last meeting.', 'Keen team'),
  node('f2', 'for:2', 'A rival bakery is hiring and offers shorter weeks.', 'Rival hiring'),
  node('f3', 'for:3', 'The new ovens can bake ahead overnight.', 'Bake-ahead ovens'),
  node('f4', 'for:4', 'Overtime costs would fall.', 'Lower overtime'),
  node('a1', 'against:1', 'Saturday mornings need every pair of hands.', 'Saturday rush'),
  node('a2', 'against:2', 'The owner fears wages will rise.', 'Wage worries', { state: 'contested', objection: 'Is that a cost, or a guess about one?' }),
  node('a3', 'against:3', 'Flour arrives at six every morning and someone must sign for it.', 'Early deliveries'),
  node('a4', 'against:4', 'Ten-hour shifts tire bakers out.', 'Long shifts')
];
SAMPLES.force_field_unscored = run('force_field', forceNodes);
SAMPLES.force_field = { ...run('force_field', forceNodes), scores: { snapshots: [{ at: '2026-10-01T09:00:00Z', for: [4, 3, 2, 3], against: [5, 3, 2, 3] }] } };
SAMPLES['force_field:next'] = {
  ...run('force_field', forceNodes),
  scores: {
    snapshots: [
      { at: '2026-10-01T09:00:00Z', for: [4, 3, 2, 3], against: [5, 3, 2, 3] },
      { at: '2026-11-01T09:00:00Z', for: [4, 3, 5, 3], against: [3, 2, 2, 3] }
    ]
  }
};

// From…to: a small lending library looking ahead. One row per trend direction, plus a
// second growing trend, then the insight across the rows.
SAMPLES.from_to = run('from_to', [
  node('a1', 'aspect:1', 'Who comes through the door on a weekday.', 'Weekday visitors'),
  node('t1', 'trend:1', 'More people work from home and want somewhere quiet nearby.', 'Remote workers', { tag: 'growing' }),
  node('f1', 'from:1', 'Mostly retired readers in the mornings.', 'Morning readers'),
  node('o1', 'to:1', 'A daytime quiet room for people working from home.', 'Quiet workspace'),
  node('a2', 'aspect:2', 'How books reach readers.', 'Lending'),
  node('t2', 'trend:2', 'Loans of printed books have held steady for five years.', 'Steady print loans', { tag: 'stable' }),
  node('f2', 'from:2', 'Shelves arranged by subject, borrowed at the desk.', 'Desk lending'),
  node('o2', 'to:2', 'Self-service lending with a small, rotating front shelf.', 'Self-service shelf'),
  node('a3', 'aspect:3', 'Where the running money comes from.', 'Funding'),
  node('t3', 'trend:3', 'The council grant shrinks a little every year.', 'Shrinking grant', { tag: 'declining', state: 'contested', objection: 'Is there a source for that, or is it last year only?' }),
  node('f3', 'from:3', 'Almost all funding is the yearly council grant.', 'One grant'),
  node('o3', 'to:3', 'A mix of grant, room hire and a friends scheme.', 'Mixed income'),
  node('a4', 'aspect:4', 'What volunteers do.', 'Volunteers'),
  node('t4', 'trend:4', 'Younger neighbours offer short, skilled stints.', 'Skilled short stints', { tag: 'growing' }),
  node('f4', 'from:4', 'A small rota of long-serving volunteers at the desk.', 'Desk rota'),
  node('o4', 'to:4', 'Short project roles: repair cafe, code club, story time.', 'Project roles'),
  node('i', 'insight', 'Home working and skilled volunteers are both growing: a quiet room run by short-stint volunteers could earn room-hire income and offset the shrinking grant.', 'Grow into the gap')
]);

// Intent statement: a community allotment that keeps losing plots to neglect.
SAMPLES.intent_statement = run('intent_statement', [
  node('pr', 'problem', 'A third of the allotment plots go untended each summer, and the waiting list keeps growing while weeds spread to the neighbouring beds.', 'Neglected plots'),
  node('st', 'stakeholders', 'Plot holders, the people on the waiting list, the committee that allocates plots, and the parish that leases the land.', 'Holders, waitlist, committee', { state: 'contested', objection: 'Does the parish need to act, or is it only affected?' }),
  node('fa', 'failures', 'Warning letters went unread, and a yearly inspection came too late to save the season.', 'Unread warnings'),
  node('ap', 'approach', 'Monthly walk-rounds by volunteer buddies, with half-plots offered to people on the waiting list straight away.', 'Buddies and half-plots'),
  node('op', 'opportunity', 'More families growing food, a shorter waiting list and less weed spread for everyone.', 'Shorter waiting list'),
  node('ri', 'risk', 'Buddies may drop off by August (fairly likely); a shared rota and a mid-season check-in reduce the gap.', 'Buddy drop-off')
]);

// Problem reduction: a primary school's lost-property pile that grows every term.
SAMPLES.problem_reduction = run('problem_reduction', [
  node('p', 'problem', 'Lost property piles up in the school hall every term, and most of it is binned unclaimed at the holidays while parents keep buying replacements.', 'Lost property pile-up'),
  node('s1', 'sub:1', 'Most jumpers and coats carry no name, so staff cannot return them.', 'Unnamed uniform'),
  node('s2', 'sub:2', 'Found items are left in three different places around the school.', 'Scattered drop points', { state: 'contested', objection: 'Is this a separate part, or just how the pile-up shows itself?' }),
  node('s3', 'sub:3', 'Parents do not know the box exists or when they can look through it.', 'Parents unaware'),
  node('o', 'priority', '2, 3, 1: one drop point first, since it is cheap and makes the rest possible; then tell parents; naming takes longest.', 'Cheapest first'),
  node('v1', 'solution:1', 'Offer iron-on name labels at cost through the parents\' association each September.', 'Labels at cost'),
  node('v2', 'solution:2', 'One labelled rail by the office, emptied into it by the cleaners each evening.', 'One office rail'),
  node('v3', 'solution:3', 'A photo of the rail in the Friday newsletter, and the rail wheeled out at pick-up on the last Friday of each month.', 'Friday photo and pick-up'),
  node('w', 'integrated', 'A single rail that everyone knows about, shown weekly and opened monthly, with more items named each year so staff can return them straight away.', 'One known rail')
]);

// Analogical reasoning: a village bakery's Saturday queue. Round 1 borrows from hospital
// triage and fails; round 2 borrows from airport bag drop, works, and is retained.
SAMPLES.analogical_reasoning = run('analogical_reasoning', [
  node('s', 'source', 'On Saturday mornings the bakery queue runs out of the door for forty minutes; people with one loaf wait behind large pre-orders, and some give up and leave.', 'Saturday queue'),
  node('t1', 'target:1', 'A hospital emergency department sees a surge of people with very different needs and sorts them as they arrive.', 'Hospital triage'),
  node('r1', 'rule:1', 'Sort arrivals by how long they will take to serve, not by when they came.', 'Sort by effort'),
  node('r2', 'rule:2', 'A short look at each arrival decides where they wait.', 'Quick first look'),
  node('f1', 'filtered:1', 'Keep sorting by effort: a staff member at the door sends one-loaf buyers to a fast till.', 'Door fast till'),
  node('a1', 'assess:1', 'Not solved: there is only one spare person on a Saturday, and the door job pulled them off the ovens.', 'No spare staff', { tag: 'unsolved' }),
  node('t2', 'target:2', 'An airport bag drop lets people who checked in online skip the desk and leave their bags at a separate point.', 'Airport bag drop'),
  node('r3', 'rule:3', 'Work done ahead of arrival moves people out of the main queue.', 'Work done ahead', { state: 'contested', objection: 'Does pre-ordering really match checking in, or just look like it?' }),
  node('r4', 'rule:4', 'A separate, self-serve point needs no extra staff.', 'Self-serve point'),
  node('r5', 'rule:5', 'Clear signs tell people which line is theirs before they join.', 'Signs before the line'),
  node('f2', 'filtered:2', 'Keep work ahead and self-serve: pre-orders are bagged and named on a shelf by the door, paid online, collected without queuing.', 'Pre-order shelf'),
  node('a2', 'assess:2', 'Solved: in a two-week trial the queue fell to ten minutes and nobody walked away.', 'Queue down to ten minutes', { tag: 'solved' }),
  node('k', 'retain', 'Move the work that can be done in advance out of the line entirely, and let it serve itself.', 'Move work out of the line')
]);

// Solution tree: a town library wants a quiet evening study room. Three ways in, each
// broken into actions, one of them taken a level further; one action is contested.
SAMPLES.solution_tree = run(
  'solution_tree',
  [
    node('a', 'aim', 'Students can revise in a quiet room at the town library every weekday evening during exam season.', 'Quiet evening study'),
    node('h1', 'how:1', 'Find a room that is free from six until closing.', 'Free up a room'),
    node('h2', 'how:2', 'Agree how the room is used so it stays quiet.', 'Set quiet rules'),
    node('h3', 'how:3', 'Make sure someone is on hand each evening.', 'Staff the evenings'),
    node('h4', 'how:4', 'Move the toddler music group from Tuesday evenings to Saturday mornings.', 'Move toddler group'),
    node('h5', 'how:5', 'Book the upstairs meeting room for study after six on weekdays.', 'Book meeting room'),
    node('h6', 'how:6', 'Put a sign and a sign-in sheet on the door.', 'Sign at the door', { state: 'contested', objection: 'A sign says what the rule is; it is not a way of keeping the room quiet.' }),
    node('h7', 'how:7', 'Fit a rack of phone pouches by the door, used on the honour system.', 'Phone pouches'),
    node('h8', 'how:8', 'Set up a rota of volunteers to open and close the room.', 'Volunteer rota'),
    node('h9', 'how:9', 'Ask the sixth-form college to count the evenings towards students\' volunteering hours.', 'Sixth-form helpers')
  ],
  [
    { from: 'h1', to: 'a', kind: 'parent' },
    { from: 'h2', to: 'a', kind: 'parent' },
    { from: 'h3', to: 'a', kind: 'parent' },
    { from: 'h4', to: 'h1', kind: 'parent' },
    { from: 'h5', to: 'h1', kind: 'parent' },
    { from: 'h6', to: 'h2', kind: 'parent' },
    { from: 'h7', to: 'h2', kind: 'parent' },
    { from: 'h8', to: 'h3', kind: 'parent' },
    { from: 'h9', to: 'h8', kind: 'parent' }
  ]
);

// The solution tree after one more turn: another action under the quiet rules, so that branch widens.
SAMPLES['solution_tree:next'] = {
  ...SAMPLES.solution_tree,
  nodes: [...SAMPLES.solution_tree.nodes, node('h10', 'how:10', 'Lay carpet tiles under the tables to soften chair noise.', 'Carpet tiles')],
  edges: [...SAMPLES.solution_tree.edges, { from: 'h10', to: 'h2', kind: 'parent' }]
};

// Lotus blossom: a small town theatre with empty seats midweek. Eight solutions round the
// problem; seven grow ideas, most of them six to eight, and one (membership) only two, so
// its flower shows ghost slots. One idea is still unplaced, two are picked, one is contested.
const LOTUS_IDEAS = {
  s1: [
    ['Let people choose what to pay on Tuesdays, from a floor of three pounds.', 'Choose your price'],
    ['Five-pound seats for anyone under twenty-six.', 'Under-26 fiver'],
    ['Release unsold seats at half price through a text alert at four o\'clock.', 'Four o\'clock alert'],
    ['Two tickets for the price of one on Wednesdays.', 'Two for one'],
    ['A discount for anyone living within a mile of the theatre.', 'Neighbour rate', { state: 'contested', objection: 'Who counts as a neighbour, and how would the box office check it at the door?' }],
    ['A standby queue at the door half an hour before curtain.', 'Standby queue'],
    ['Carers come free with the person they support.', 'Carers go free'],
    ['A second visit within a month costs half.', 'Half-price return']
  ],
  s2: [
    ['A teachers\' preview night before each run opens.', 'Teachers\' preview'],
    ['Study packs for the set texts we stage.', 'Study packs'],
    ['Coach costs shared with the next town\'s schools.', 'Shared coaches'],
    ['A drama workshop folded into the ticket price.', 'Workshop included'],
    ['Midweek matinees timed to the school day.', 'School-day matinee'],
    ['College students usher in return for free seats.', 'Student ushers'],
    ['A free seat for every tenth pupil booked.', 'Tenth seat free']
  ],
  s3: [
    ['Invite a director or actor to talk for twenty minutes before curtain.', 'Meet the director'],
    ['Short backstage tours before the show, booked with the ticket.', 'Backstage tour'],
    ['A reading group that meets in the bar before each new play.', 'Play reading club'],
    ['A local historian on the story behind the play.', 'History corner'],
    ['A costume designer shows the sketches.', 'Costume sketches'],
    ['The audience asks the cast questions afterwards.', 'Cast questions']
  ],
  s4: [
    ['A soup-and-bread supper served in the foyer before the show.', 'Foyer soup supper'],
    ['A set menu with the café over the road.', 'Café set menu'],
    ['Pre-order interval drinks with the ticket.', 'Interval pre-order'],
    ['A tasting night with the local brewery.', 'Brewery tasting'],
    ['Cake and tea at Wednesday matinees.', 'Matinee tea'],
    ['A pudding after the show for late diners.', 'Late pudding']
  ],
  s6: [
    ['A free ticket for every regular who brings a first-timer.', 'Free seat for you'],
    ['A postcard regulars can hand to a friend, worth a discount.', 'Friend postcard'],
    ['A first-timers\' night with a welcome at the door.', 'First-timers night'],
    ['A loyalty card stamped for each new face brought along.', 'Stamp card'],
    ['A group rate for four or more friends.', 'Group of four'],
    ['Work teams book a whole row at a team rate.', 'Team night out'],
    ['A neighbour swap: regulars pass on seats they cannot use.', 'Pass it on'],
    ['A friends\' bench in the foyer to meet before curtain.', 'Meeting bench']
  ],
  s7: [
    ['A one-hour play at six, done by seven.', 'Done by seven'],
    ['Comedy shorts on Thursday after work.', 'Thursday shorts'],
    ['A rehearsed reading of a new play.', 'New play reading'],
    ['A lunchtime show for office workers.', 'Lunchtime show'],
    ['A double bill of two short plays.', 'Double bill'],
    ['Standing tickets near the back for early shows.', 'Standing room']
  ],
  s8: [
    ['Ten midweek shows for the price of six, spread over a season.', 'Ten for six'],
    ['Members can swap a night they cannot make for another.', 'Free night swaps']
  ]
};
let lotusN = 0;
const lotusIdeas = [];
const lotusEdges = [];
for (const [sol, ideas] of Object.entries(LOTUS_IDEAS)) {
  for (const [text, title, extra] of ideas) {
    lotusN += 1;
    lotusIdeas.push(node(`i${lotusN}`, `idea:${lotusN}`, text, title, extra));
    lotusEdges.push({ from: `i${lotusN}`, to: sol, kind: 'petal' });
  }
}
SAMPLES.lotus_blossom = run(
  'lotus_blossom',
  [
    node('p', 'problem', 'Tuesday to Thursday shows play to a third-full house, and the box office cannot tell who is staying away or why.', 'Empty midweek seats'),
    node('s1', 'solution:1', 'Bring the price down on the nights that do not sell.', 'Cheaper midweek tickets'),
    node('s2', 'solution:2', 'Fill matinees and early shows with school and college groups.', 'School group deals'),
    node('s3', 'solution:3', 'Give people a reason to come early with a talk before the show.', 'Pre-show talks'),
    node('s4', 'solution:4', 'Sell the evening, not just the seat: a show with a simple supper.', 'Show and supper'),
    node('s5', 'solution:5', 'Get the midweek programme heard on local radio and in the free paper.', 'Local radio slots'),
    node('s6', 'solution:6', 'Ask regulars to bring someone who has never been.', 'Bring a friend'),
    node('s7', 'solution:7', 'Put on shorter shows that start at six, for people going home from work.', 'Early short shows'),
    node('s8', 'solution:8', 'A membership that only covers midweek nights.', 'Midweek membership'),
    ...lotusIdeas,
    node('i99', 'idea:99', 'Swap season tickets with the arts centre in the next town.', 'Season ticket swap'),
    node('f1', 'preferred:1', 'Cheap to run, fills seats that would be empty anyway, and the text list grows on its own.', 'Fills empty seats'),
    node('f2', 'preferred:2', 'Brings in exactly the people who have never been, using the regulars we already have.', 'Regulars become hosts')
  ],
  [...lotusEdges, { from: 'f1', to: 'i3', kind: 'marks' }, { from: 'f2', to: 'i29', kind: 'marks' }]
);

// Duncker diagram: a village hall whose winter heating bill keeps climbing. Two direct
// pathways (keep the heat in, buy heat for less) and one functionally opposite pathway
// (need less heat), which leads to a redefined problem; then the evaluation.
SAMPLES.duncker = run(
  'duncker',
  [
    node('p', 'problem', 'The village hall\'s heating bill has doubled in two winters, and the committee may have to raise hire charges that the playgroup cannot afford.', 'Heating bill doubled'),
    node('d', 'desired', 'The hall stays warm enough for every regular group all winter, on a heating budget the hire charges already cover.', 'Affordable warm hall'),
    node('pa1', 'pathway:1', 'Stop the heat we pay for from escaping.', 'Keep heat in', { tag: 'direct' }),
    node('pa2', 'pathway:2', 'Pay less for each unit of heat.', 'Cheaper heat', { tag: 'direct' }),
    node('pa3', 'pathway:3', 'Make it fine for the main hall not to be heated much at all.', 'Need less heat', { tag: 'opposite' }),
    node('s1', 'solution:1', 'Fit brush strips to the double doors and the fire exit.', 'Draught strips'),
    node('s2', 'solution:2', 'Lay insulation in the loft over the main hall.', 'Loft insulation'),
    node('s3', 'solution:3', 'Hang lined curtains over the tall windows.', 'Lined curtains'),
    node('s4', 'solution:4', 'Move to a fixed winter tariff agreed in summer.', 'Fixed tariff'),
    node('s5', 'solution:5', 'Apply for a community grant towards an air-source heat pump.', 'Heat pump grant', { state: 'contested', objection: 'Is a grant a way to pay less per unit, or only a way to fund one?' }),
    node('s6', 'solution:6', 'Run the small groups in the side room from November to February.', 'Winter side room'),
    node('s7', 'solution:7', 'Offer blankets and hot drinks at evening events instead of heating ahead.', 'Blankets and drinks'),
    node('rd', 'redefinition', 'How do we keep people warm in the hall, rather than how do we heat the whole building?', 'Warm the people'),
    node('ev', 'evaluation', 'Draught strips and the side room are cheap and quick; together they cut the bill by about a third. The heat pump is the biggest saving but needs a grant and a year. Warming people rather than the building still reaches the desired state for every group except the dance class, which keeps the main hall heated.', 'Strips and side room first')
  ],
  [
    { from: 's1', to: 'pa1', kind: 'under' },
    { from: 's2', to: 'pa1', kind: 'under' },
    { from: 's3', to: 'pa1', kind: 'under' },
    { from: 's4', to: 'pa2', kind: 'under' },
    { from: 's5', to: 'pa2', kind: 'under' },
    { from: 's6', to: 'pa3', kind: 'under' },
    { from: 's7', to: 'pa3', kind: 'under' }
  ]
);

// Contradiction: a small bike-repair co-op that wants quicker turnarounds, but rushing
// means more bikes come back. The worsening side is contested.
SAMPLES.contradiction = run('contradiction', [
  node('i', 'improving', 'How quickly a repaired bike is ready for collection, counted in days from drop-off.', 'Turnaround time'),
  node('w', 'worsening', 'The share of repaired bikes that come back within a month with the same fault.', 'Repeat repairs', { state: 'contested', objection: 'Does rushing cause the repeats, or do they come from cheap parts?' }),
  node('s', 'statement', 'The faster we turn repairs round, the more bikes come back with the same fault, because the final safety check is the step that gets squeezed.', 'Speed against quality')
]);

// Decision matrix: a repair café choosing where to meet each week. Five criteria (one contested),
// three options, percentage weights, then the chosen option. The next snapshot reweights after a
// visit to the arcade unit, so the totals count up and the lead moves to option 3.
const matrixNodes = [
  node('c1', 'criterion:1', 'Room hire for one evening, heating included.', 'Weekly cost'),
  node('c2', 'criterion:2', 'Room for six repair benches and a queue that does not block the door.', 'Bench space'),
  node('c3', 'criterion:3', 'Close to the bus stop, with step-free access.', 'Easy to reach'),
  node('c4', 'criterion:4', 'Open until nine on a weekday evening.', 'Evening access'),
  node('c5', 'criterion:5', 'Somewhere to unload heavy items such as lawnmowers.', 'Parking', { state: 'contested', objection: 'Most visitors walk in; does parking deserve a place here?' }),
  node('o1', 'option:1', 'The meeting room at the town library.', 'Library hall'),
  node('o2', 'option:2', 'The scout hut behind the playing field.', 'Scout hut'),
  node('o3', 'option:3', 'An empty unit in the market arcade, offered at a low rent.', 'Arcade unit'),
  node('ch', 'choice', 'Meet at the scout hut on Thursday evenings: it costs least per week, holds every bench and stays open late. Revisit the arcade unit if its rent offer is confirmed.', 'Scout hut')
];
const matrixFirst = { at: '2026-10-05T18:00:00Z', mode: 'percent', weights: [30, 25, 20, 15, 10], ratings: [[6, 7, 9, 5, 4], [8, 8, 6, 8, 7], [9, 6, 7, 6, 6]] };
SAMPLES.decision_matrix = { ...run('decision_matrix', matrixNodes), scores: { snapshots: [matrixFirst] } };
SAMPLES['decision_matrix:next'] = {
  ...run('decision_matrix', matrixNodes),
  scores: { snapshots: [matrixFirst, { at: '2026-10-12T18:00:00Z', mode: 'percent', weights: [20, 25, 25, 20, 10], ratings: [[6, 7, 9, 5, 4], [8, 8, 6, 8, 7], [9, 8, 8, 7, 6]] }] }
};
SAMPLES.decision_matrix_unscored = run('decision_matrix', matrixNodes.filter((n) => n.slot !== 'choice'));

// SWOT: a neighbourhood bakery weighing two ways to earn more outside the weekday rush. Option 2
// is the newest with items, so it shows by default; one weakness is contested.
const of = (from, to) => ({ from, to, kind: 'of' });
SAMPLES.swot = run(
  'swot',
  [
    node('g', 'goal', 'Bring in steady income on the quiet days without hiring more staff.', 'Steady quiet-day income'),
    node('o1', 'option:1', 'Open the shop on Sunday mornings as well.', 'Open on Sundays'),
    node('s1', 'strength:1', 'Regulars already ask for Sunday bread.', 'Regulars ask for it'),
    node('w1', 'weakness:1', 'The oven would need a seventh early start.', 'Another early start'),
    node('o2', 'option:2', 'Run a stall at the Saturday farmers market in the square.', 'Market stall'),
    node('s2', 'strength:2', 'The sourdough keeps well for a day out of the shop.', 'Bread that travels'),
    node('s3', 'strength:3', 'Two of the team have run stalls before.', 'Stall experience'),
    node('w2', 'weakness:2', 'No van; trays would go by hand cart.', 'No van', { state: 'contested', objection: 'Is the hand cart a real limit for one stall?' }),
    node('w3', 'weakness:3', 'The shop would be short-handed on Saturday mornings.', 'Thin Saturday cover'),
    node('p1', 'opportunity:1', 'The market is adding a covered food aisle in spring.', 'New covered aisle'),
    node('p2', 'opportunity:2', 'Visitors from the next town could find the shop.', 'New customers'),
    node('t1', 'threat:1', 'Two bakeries already trade at the market.', 'Established rivals'),
    node('t2', 'threat:2', 'Rain cuts the market crowd by half.', 'Wet weekends'),
    node('syn', 'synthesis', 'Build on bread that travels and the new covered aisle; shrink the cover problem with a rota; counter the rivals with sourdough they do not sell; turn the hand cart into a slow-start trial of four weeks.', 'Trial a covered stall'),
    node('ch', 'choice', 'Take a covered market stall for a four-week trial from March, with a Saturday rota so the shop stays covered.', 'Market stall trial')
  ],
  [of('s1', 'o1'), of('w1', 'o1'), of('s2', 'o2'), of('s3', 'o2'), of('w2', 'o2'), of('w3', 'o2'), of('p1', 'o2'), of('p2', 'o2'), of('t1', 'o2'), of('t2', 'o2')]
);

// Morphological analysis: a village hall designing a weekday lunch club. Five subjects with three
// to five forms each; two pairs that cannot go together (one contested); two scenarios. The
// newest, consistent scenario shows by default; morphological_clash shows the clashing one alone.
const morphOf = (from, to) => ({ from, to, kind: 'of' });
const morphNodes = [
  node('p', 'problem', 'Design a weekday lunch club for older neighbours that the hall can run with volunteers and a small grant.', 'Weekday lunch club'),
  node('s1', 'subject:1', 'What is served.', 'Menu'),
  node('s2', 'subject:2', 'Who cooks it.', 'Cooking'),
  node('s3', 'subject:3', 'How people get there.', 'Transport'),
  node('s4', 'subject:4', 'How it is paid for.', 'Paying'),
  node('s5', 'subject:5', 'When it runs.', 'Timing'),
  node('a11', 'attribute:1', 'Soup with fresh bread.', 'Soup and bread'),
  node('a12', 'attribute:2', 'A two-course hot meal.', 'Hot two courses'),
  node('a13', 'attribute:3', 'Sandwiches and cake.', 'Sandwich tea'),
  node('a14', 'attribute:4', 'A shared pot-luck table.', 'Pot luck'),
  node('a21', 'attribute:5', 'Volunteers cook in the hall kitchen.', 'Hall volunteers'),
  node('a22', 'attribute:6', 'The school kitchen sends meals over.', 'School kitchen'),
  node('a23', 'attribute:7', 'A local caterer delivers.', 'Caterer'),
  node('a31', 'attribute:8', 'Guests walk or come by bus.', 'Walk or bus'),
  node('a32', 'attribute:9', 'A volunteer driver rota.', 'Driver rota'),
  node('a33', 'attribute:10', 'The community minibus.', 'Minibus'),
  node('a34', 'attribute:11', 'Lifts shared between neighbours.', 'Shared lifts'),
  node('a41', 'attribute:12', 'A fixed price per meal.', 'Fixed price'),
  node('a42', 'attribute:13', 'Pay what you can.', 'Donations'),
  node('a43', 'attribute:14', 'The grant covers everything.', 'Grant-funded'),
  node('a44', 'attribute:15', 'A monthly membership.', 'Membership'),
  node('a45', 'attribute:16', 'Free for over-eighties.', 'Free over 80'),
  node('a51', 'attribute:17', 'Every weekday.', 'Every weekday'),
  node('a52', 'attribute:18', 'Twice a week.', 'Twice a week'),
  node('a53', 'attribute:19', 'Once a week, on market day.', 'Market day'),
  node('c1', 'contradiction:1', 'The school kitchen only cooks in term time and cannot supply every weekday all year.', 'School kitchen, every day'),
  node('c2', 'contradiction:2', 'A caterer needs a fixed price per head; pay what you can leaves the bill open.', 'Caterer, open bill', { state: 'contested', objection: 'Could the grant cover the gap between what is paid and the caterer\'s price?' }),
  node('sc1', 'scenario:1', 'Hot meals from the school kitchen every weekday, minibus, donations.', 'School-fed daily club'),
  node('sc2', 'scenario:2', 'Soup and bread cooked by volunteers twice a week, driver rota, fixed price.', 'Volunteer soup club')
];
const morphEdges = [
  ...['a11', 'a12', 'a13', 'a14'].map((a) => morphOf(a, 's1')),
  ...['a21', 'a22', 'a23'].map((a) => morphOf(a, 's2')),
  ...['a31', 'a32', 'a33', 'a34'].map((a) => morphOf(a, 's3')),
  ...['a41', 'a42', 'a43', 'a44', 'a45'].map((a) => morphOf(a, 's4')),
  ...['a51', 'a52', 'a53'].map((a) => morphOf(a, 's5')),
  { from: 'c1', to: 'a22', kind: 'pair' },
  { from: 'c1', to: 'a51', kind: 'pair' },
  { from: 'c2', to: 'a23', kind: 'pair' },
  { from: 'c2', to: 'a42', kind: 'pair' },
  ...['a12', 'a22', 'a33', 'a42', 'a51'].map((a) => ({ from: 'sc1', to: a, kind: 'picks' })),
  ...['a11', 'a21', 'a32', 'a41', 'a52'].map((a) => ({ from: 'sc2', to: a, kind: 'picks' }))
];
SAMPLES.morphological = run('morphological', [
  ...morphNodes,
  node('ev', 'evaluation', 'The volunteer soup club holds together and costs little to try; the school-fed club fails on term dates. Start with soup twice a week and review after a term.', 'Start with the soup club'),
  node('ch', 'choice', 'Run the volunteer soup club on Tuesdays and Thursdays from January, with a driver rota and a fixed price per bowl.', 'Volunteer soup club')
], morphEdges);
SAMPLES.morphological_scenarios = run('morphological', morphNodes, morphEdges);
SAMPLES.morphological_clash = run('morphological', morphNodes.filter((n) => n.id !== 'sc2'), morphEdges.filter((e) => e.from !== 'sc2'));

// Pareto analysis: a corner café counting complaints over eight weeks. Six items, one contested;
// three of them carry 81% of the total. pareto:next is a later count that re-orders the bars
// (four of six now reach 86%); pareto_unscored is the chart waiting for its figures.
const paretoNodes = [
  node('t', 'target', 'Complaints at the till and online, counted over eight weeks from the start of September.', 'Complaints, eight weeks'),
  node('i1', 'item:1', 'Customers wait more than ten minutes in the lunch queue.', 'Long lunch queue'),
  node('i2', 'item:2', 'Takeaway coffee is lukewarm by the time it is collected.', 'Cold coffee'),
  node('i3', 'item:3', 'The order handed over is not the one that was placed.', 'Wrong order'),
  node('i4', 'item:4', 'The card reader drops out and only cash is taken.', 'Card reader down', { state: 'contested', objection: 'Is this a complaint about the café or about the bank network?' }),
  node('i5', 'item:5', 'Oat milk has run out before noon.', 'No oat milk'),
  node('i6', 'item:6', 'Tables are not cleared between customers.', 'Tables not cleared')
];
const paretoFirst = { at: '2026-10-28T17:00:00Z', counts: [42, 8, 25, 14, 6, 5] };
SAMPLES.pareto = {
  ...run('pareto', [...paretoNodes, node('ch', 'choice', 'Start with the lunch queue: a second till from twelve to two, and pre-orders by text for regulars.', 'Second till at lunch')]),
  scores: { snapshots: [paretoFirst] }
};
SAMPLES['pareto:next'] = {
  ...SAMPLES.pareto,
  scores: { snapshots: [paretoFirst, { at: '2026-11-25T17:00:00Z', counts: [30, 12, 34, 10, 6, 8] }] }
};
SAMPLES.pareto_unscored = run('pareto', paretoNodes);

// pareto_many: twelve kinds of spend at a sports club over a season, in pounds (figures in the
// thousands), so the narrowest bars at 390px leave their figures to the key.
const spend = [
  ['Pitch hire', 4200], ['Floodlights', 3100], ['Kit', 2600], ['Travel', 1900], ['Referees', 1500], ['Insurance', 1200],
  ['Balls and cones', 900], ['First aid', 650], ['Kit washing', 400], ['Website', 300], ['Trophies', 90], ['Stamps', 20]
];
SAMPLES.pareto_many = {
  ...run('pareto', [
    node('t', 'target', 'What the club spent in the 2025 to 2026 season, from the treasurer’s ledger.', 'Season spend'),
    ...spend.map(([title], i) => node(`i${i + 1}`, `item:${i + 1}`, `${title} for the season.`, title, i === 2 ? { state: 'contested', objection: 'Is kit a club cost or the players’?' } : {}))
  ]),
  scores: { snapshots: [{ at: '2026-06-01T12:00:00Z', counts: spend.map(([, n]) => n) }] }
};

// DMAIC cycle: a village bakery cutting end-of-day bread waste. Pass 1 cut the waste but sold out
// of sourdough early, so the cycle went round again; pass 2 planned by loaf type, then Control.
// One contested node. dmaic_first is part way through pass 1 (Improve still to come, so faint).
const dmaicPass1 = [
  node('d1', 'define:1', 'Unsold loaves are binned at closing. The aim is to halve that in six weeks without running out before four. The owner and two counter staff are involved.', 'Halve binned bread'),
  node('m1', 'measure:1', 'Over two weeks, 31 loaves a day were binned on average; the time each loaf type sold out was logged daily.', '31 binned daily'),
  node('a1', 'analyse:1', 'Waste peaks on Mondays and on wet days, yet the bake plan is the same every day.', 'Identical daily bake')
];
SAMPLES.dmaic = run('dmaic', [
  ...dmaicPass1,
  node('i1', 'improve:1', 'Pilot for three weeks: bake a fifth less on Mondays and whenever rain is forecast.', 'Smaller wet-day bake'),
  node('r1', 'repeat:1', 'Waste fell to 22 a day, but sourdough sold out by one o’clock twice a week. Next pass, plan each loaf type on its own.', 'Sourdough sold out'),
  node('d2', 'define:2', 'Keep the gain on white loaves and stop sourdough selling out before three.', 'Plan per loaf'),
  node('m2', 'measure:2', 'Count waste and sell-out time per loaf type, every day for three weeks.', 'Count per loaf', { state: 'contested', objection: 'Three weeks takes in a bank holiday; will that skew the count?' }),
  node('a2', 'analyse:2', 'Sourdough sells steadily all day; white loaves go mostly before noon.', 'Sourdough sells steadily'),
  node('i2', 'improve:2', 'A second small sourdough bake at eleven, and the white bake trimmed on wet days.', 'Second sourdough bake'),
  node('c', 'control', 'A weekly waste tally on the board by the ovens. The owner reviews it each month and resets the plan every season.', 'Weekly waste tally')
]);
SAMPLES.dmaic_first = run('dmaic', dmaicPass1);

// 15% solutions: a volunteer repair café whose queue at the door runs long, where bigger changes
// wait on the committee. The sign-in volunteer looks for what is theirs to change now. Two actions
// are chosen and became tasks (one in progress, one to do). One contested node.
// fifteen_percent_now has the actions but nothing chosen yet; fifteen_percent:next picks a third.
const fifteenActions = [
  node('w', 'reflect', 'I run the sign-in desk on Saturdays, so how people are greeted, sorted and queued is mine to change without asking anyone.', 'The sign-in desk is mine'),
  node('a1', 'action:1', 'Sort arrivals by kind of repair at the door, so electrics, textiles and bikes queue for the right bench.', 'Sort at the door'),
  node('a2', 'action:2', 'Put a roll of numbered tickets on the desk so nobody has to hold a place in the line.', 'Numbered tickets'),
  node('a3', 'action:3', 'Text the regular fixers on Thursday with the items already booked in.', 'Thursday heads-up'),
  node('a4', 'action:4', 'Move the tea urn away from the door so the queue has room to stand.', 'Move the tea urn', { state: 'contested', objection: 'The hall keeper set the urn up; is it yours to move?' }),
  node('a5', 'action:5', 'Chalk the expected wait on the board by the door every half hour.', 'Chalk the wait time')
];
const fifteenChosen = [
  node('c1', 'chosen:1', 'Buy a ticket roll this week and hand out numbers from opening on Saturday.', 'From Saturday'),
  node('c2', 'chosen:2', 'Print a card of repair kinds and start sorting at the door at the next session.', 'Next session')
];
const fifteenEdges = [
  { from: 'c1', to: 'a2', kind: 'picks' },
  { from: 'c2', to: 'a1', kind: 'picks' }
];
SAMPLES.fifteen_percent = {
  ...run('fifteen_percent', [...fifteenActions, ...fifteenChosen], fifteenEdges),
  tasks: [
    { nodeId: 'c1', taskId: 'task-sample-1', status: 'in_progress' },
    { nodeId: 'c2', taskId: 'task-sample-2', status: 'open' }
  ]
};
SAMPLES['fifteen_percent:next'] = {
  ...run('fifteen_percent', [...fifteenActions, ...fifteenChosen, node('c3', 'chosen:3', 'Chalk the first wait time at ten on Saturday, then every half hour.', 'Saturday at ten')], [...fifteenEdges, { from: 'c3', to: 'a5', kind: 'picks' }]),
  tasks: [
    { nodeId: 'c1', taskId: 'task-sample-1', status: 'done' },
    { nodeId: 'c2', taskId: 'task-sample-2', status: 'removed' }
  ]
};
SAMPLES.fifteen_percent_now = run('fifteen_percent', fifteenActions);

// A school fete board: eleven cards across the four places, a WIP limit, one contested card, three
// linked tasks (k1 open, k5 started, k8 a review not yet started) and a pending proposal on k3.
// kanban:next starts k2 and the review k8 (both move into Doing, over the limit) and deletes k1's task.
const kanbanCards = [
  node('k1', 'card:1', 'Book the school hall for the fete on the second Saturday in June.', 'Book the hall', { tag: 'todo' }),
  node('k2', 'card:2', 'Ask the bakery on the high street whether they will donate two trays of cakes.', 'Ask for cakes', { tag: 'todo' }),
  node('k3', 'card:3', 'Print twenty posters and put them up in the library, the surgery and the corner shop.', 'Print posters', { tag: 'todo' }),
  node('k4', 'card:4', 'Borrow three trestle tables from the scout hut.', 'Borrow tables', { tag: 'todo', state: 'contested', objection: 'The scout hut is shut until June; is this one you can do in time?' }),
  node('k5', 'card:5', 'Draw the stall map so every stall has a pitch and the cake stall is near a power point.', 'Stall map', { tag: 'doing' }),
  node('k6', 'card:6', 'Make up a float of coins for the five stalls that take cash.', 'Cash float', { tag: 'doing' }),
  node('k7', 'card:7', 'Collect the raffle prizes promised on the parents\' list.', 'Raffle prizes', { tag: 'doing' }),
  node('k8', 'card:8', 'Go through the risk assessment with the head before it goes to the governors.', 'Risk assessment', { tag: 'review' }),
  node('k9', 'card:9', 'Agree the date with the parents\' committee.', 'Pick the date', { tag: 'done' }),
  node('k10', 'card:10', 'Open a shared sign-up sheet for stall holders.', 'Sign-up sheet', { tag: 'done' }),
  node('k11', 'card:11', 'Ask for helpers in the Friday newsletter.', 'Ask for helpers', { tag: 'done' }),
  node('kw', 'wip', 'No more than 3 cards in Doing at once, so each one gets finished.', 'Three at once')
];
SAMPLES.kanban = {
  ...run('kanban', kanbanCards),
  tasks: [
    { nodeId: 'k1', taskId: 'task-sample-k1', status: 'open' },
    { nodeId: 'k5', taskId: 'task-sample-k5', status: 'in_progress' },
    { nodeId: 'k8', taskId: 'task-sample-k8', status: 'open' }
  ],
  proposed: ['k3']
};
SAMPLES['kanban:next'] = {
  ...run('kanban', kanbanCards),
  tasks: [
    { nodeId: 'k1', taskId: 'task-sample-k1', status: 'removed' },
    { nodeId: 'k2', taskId: 'task-sample-k2', status: 'in_progress' },
    { nodeId: 'k5', taskId: 'task-sample-k5', status: 'in_progress' },
    { nodeId: 'k8', taskId: 'task-sample-k8', status: 'in_progress' }
  ],
  proposed: []
};

// A week of demands on a village choir's secretary before the spring concert: nine items over the
// four quadrants, one contested, two Do first items linked to tasks (e1 started, e2 open) and a
// pending proposal on e3. eisenhower:next finishes e1, deletes e2's task, adds a Do first item and
// moves e7 (once Eliminate) into Delegate.
const eisenItems = [
  node('e1', 'item:1', 'Send the venue the final seating plan; they need it by Thursday to set out the chairs.', 'Send seating plan', { tag: 'do' }),
  node('e2', 'item:2', 'Collect the hired scores from the library before it shuts for the bank holiday.', 'Collect hired scores', { tag: 'do' }),
  node('e3', 'item:3', 'Ring the accompanist to confirm the rehearsal time has moved to seven.', 'Confirm accompanist', { tag: 'do' }),
  node('e4', 'item:4', 'Write next season\'s grant application, due at the end of next month.', 'Grant application', { tag: 'schedule' }),
  node('e5', 'item:5', 'Plan the summer social so the date is in diaries before the holidays.', 'Plan summer social', { tag: 'schedule' }),
  node('e6', 'item:6', 'Print the programmes; the treasurer has the printer\'s account and offered to do it.', 'Print the programmes', { tag: 'delegate' }),
  node('e7', 'item:7', 'Answer the newsletter thread about the colour of the concert folders.', 'Folder colour thread', { tag: 'eliminate', state: 'contested', objection: 'Some members feel strongly about this; is dropping it fair to them?' }),
  node('e8', 'item:8', 'Re-sort the music cupboard by composer.', 'Re-sort the cupboard', { tag: 'eliminate' }),
  node('e9', 'item:9', 'Book the interval tea urn from the village hall.', 'Book tea urn', { tag: 'delegate' })
];
SAMPLES.eisenhower = {
  ...run('eisenhower', eisenItems),
  tasks: [
    { nodeId: 'e1', taskId: 'task-sample-e1', status: 'in_progress' },
    { nodeId: 'e2', taskId: 'task-sample-e2', status: 'open' }
  ],
  proposed: ['e3']
};
SAMPLES['eisenhower:next'] = {
  ...run('eisenhower', [
    ...eisenItems.map((item) => (item.id === 'e7' ? { ...item, tag: 'delegate' } : item)),
    node('e10', 'item:10', 'Email the soloists the running order tonight.', 'Send running order', { tag: 'do' })
  ]),
  tasks: [
    { nodeId: 'e1', taskId: 'task-sample-e1', status: 'done' },
    { nodeId: 'e2', taskId: 'task-sample-e2', status: 'removed' }
  ],
  proposed: ['e3']
};

// After action review: a community garden's first seed swap, reviewed the week after. The swap
// ran out of tables and seed packets ran short by midday; the learning is the longest answer.
// One contested node. after_action_review:next shortens what was learned, so the gauge morphs.
// after_action_review_first has only the first two answers, so two bars wait as faint outlines.
const aarNodes = [
  node('v1', 'intended', 'Run a two-hour seed swap at the garden gate: forty visitors, every packet labelled, and a sign-up list for spring volunteers.', 'Forty visitors, labelled packets'),
  node('v2', 'achieved', 'About sixty people came. Packets ran out by half past eleven, a third were unlabelled, and nine people signed up to volunteer.', 'Sixty came, packets ran out'),
  node('v3', 'differences', 'A post on the village noticeboard drew more people than planned, and the labelling was left to the morning itself.', 'Bigger crowd, late labelling', { state: 'contested', objection: 'Is "left to the morning" about the plan, or about one person running late?' }),
  node('v4', 'learned', 'Label every packet at a sorting evening the week before, not on the day. Plan for half again as many people as expected, with a reserve box held back until noon. Put the sign-up list at the exit rather than the entrance, where people linger. Ask two volunteers to share the welcome table so nobody is stuck there all morning.', 'Label early, plan for more')
];
SAMPLES.after_action_review = run('after_action_review', aarNodes);
SAMPLES['after_action_review:next'] = run('after_action_review', [
  ...aarNodes.slice(0, 3),
  node('v4', 'learned', 'Label every packet the week before, and plan for more people.', 'Label early, plan for more')
]);
SAMPLES.after_action_review_first = run('after_action_review', aarNodes.slice(0, 2));

// Double-loop learning: a community café keeps running out of milk on Saturdays. The first fix
// (an extra order on Fridays) held for a fortnight, then it came back, so the run goes round the
// outer loop: two governing assumptions, a reframe, a new strategy, a small test and a monitor.
// One contested node. double_loop:next adds a second strategy, so the marker moves back to Action
// strategy and the box counts "+1". double_loop_held stops at a fix that held: the Match arrow
// lights and the outer loop stays faint.
const loopNodes = [
  node('d1', 'problem', 'The café runs out of milk by eleven most Saturdays, and the late-morning queue gets turned away.', 'Out of milk by eleven'),
  node('d2', 'single', 'Whoever closes on Friday adds two extra crates to the standing order.', 'Two extra crates on Friday'),
  node('d3', 'recurs', 'It held for two weekends, then ran short again on the next three, even with the extra crates.', 'Short again within a month', { tag: 'yes' }),
  node('d4', 'governing:1', 'The order is set from last week\'s sales, so a busy week always follows a quiet one short.', 'Orders follow last week'),
  node('d5', 'governing:2', 'Volunteers are told never to over-order, because waste is counted and shortages are not.', 'Waste counts, shortages do not', { state: 'contested', objection: 'Is that a rule anyone wrote down, or how one person reads it?' }),
  node('d6', 'reframe', 'The problem is not the size of the order but that nobody plans Saturday from what is happening that weekend.', 'Nobody plans the weekend'),
  node('d7', 'strategy:1', 'Set Saturday\'s order on Thursday from the village events list and the weather, and log every shortage as well as waste.', 'Plan from the weekend ahead'),
  node('d8', 'test', 'Try it for four Saturdays; success is no turned-away queue and no more than one crate thrown away.', 'Four Saturdays, one crate'),
  node('d9', 'monitor', 'The Thursday volunteer keeps the log, and the committee looks at it at the end of each month.', 'Monthly look at the log')
];
SAMPLES.double_loop = run('double_loop', loopNodes);
SAMPLES['double_loop:next'] = run('double_loop', [
  ...loopNodes,
  node('d10', 'strategy:2', 'Keep a reserve crate in the back fridge that only opens after ten on a Saturday.', 'A reserve crate after ten')
]);
SAMPLES.double_loop_held = run('double_loop', [
  loopNodes[0],
  loopNodes[1],
  node('d3', 'recurs', 'No shortage in the six Saturdays since, and waste stayed under a crate a week.', 'Six clear Saturdays', { tag: 'no' }),
  node('d9', 'monitor', 'The Friday closer checks the fridge each week and flags any short Saturday.', 'Weekly fridge check')
]);

// Feedback matrix: a junior football club sorts the parents' and coaches' end-of-season feedback.
// Suggestions has four items, so it shows three and "+1 more". One contested node (a change).
// Part two has one theme of each tag with why and how satellites, and three actions.
// feedback_matrix:next adds a third how to the first theme, so its satellites spread and glide,
// and contests one of the Change cluster's hows, so its tag shows beside a satellite.
// feedback_matrix_first is part one only, before any theme.
const fbmItems = [
  node('f1', 'suggestion:1', 'Run a kit swap at the first training session so outgrown boots get passed on.', 'Kit swap at first training'),
  node('f2', 'suggestion:2', 'Post the season calendar in one place, not across three group chats.', 'One season calendar'),
  node('f3', 'suggestion:3', 'Pair each new family with one that has been here a season.', 'Buddy families'),
  node('f4', 'suggestion:4', 'Try a short warm-down the children lead themselves.', 'Child-led warm-down'),
  node('f5', 'compliment:1', 'Every child got roughly equal minutes across the season.', 'Fair playing time'),
  node('f6', 'compliment:2', 'The half-time fruit rota never missed a week.', 'Fruit rota held'),
  node('f7', 'change:1', 'Stop sending team sheets the night before a match; families cannot plan.', 'No more late team sheets', { state: 'contested', objection: 'Is it every week, or the two weeks the coach was ill?' }),
  node('f8', 'change:2', 'Drop the second weekly session in winter; turnout fell below half.', 'Drop winter second session'),
  node('f9', 'question:1', 'Who decides which parent drives to away fixtures?', 'Who drives to away games?')
];
const fbmThemes = [
  node('t1', 'theme:1', 'Families welcomed in with practical help at the start of the season.', 'Welcome families early', { tag: 'do_more' }),
  node('t2', 'theme:2', 'Nobody knows who arranges lifts to away fixtures.', 'Lifts to away games', { tag: 'question' }),
  node('t3', 'theme:3', 'Match information reaches families too late to plan around.', 'Late match information', { tag: 'change' }),
  node('y1', 'why:1', 'Families who feel at home in September are still coming in March.', 'Early welcome keeps families'),
  node('h1', 'how:1', 'Hold the kit swap at the first session every year.', 'Yearly kit swap'),
  node('h2', 'how:2', 'Give each new family a buddy family for the first month.', 'Buddy for a month'),
  node('y2', 'why:2', 'The same three parents end up driving every week.', 'Same drivers every week'),
  node('y3', 'why:3', 'Two away games were nearly missed for want of a car.', 'Near misses'),
  node('h3', 'how:3', 'Ask the committee to name one person who owns the lift list.', 'Name a lift organiser'),
  node('y4', 'why:4', 'Working parents need two days to swap a shift.', 'Shifts need notice'),
  node('h4', 'how:4', 'Pick the squad at Thursday training.', 'Squad on Thursday'),
  node('h5', 'how:5', 'Send the sheet by Thursday evening, whatever happens.', 'Sheet by Thursday night'),
  node('h6', 'how:6', 'Keep a standing reserve list so late drop-outs do not delay it.', 'Standing reserve list'),
  node('h7', 'how:7', 'Put the kit swap date in the welcome email.', 'Date in welcome email'),
  node('a1', 'action:1', 'Book the clubhouse for a kit swap on the first Saturday of the season.', 'Book the kit swap'),
  node('a2', 'action:2', 'Raise the lift organiser at the next committee meeting.', 'Lift organiser to committee'),
  node('a3', 'action:3', 'Coaches agree to send team sheets by Thursday evening from the first match.', 'Team sheets by Thursday')
];
const fbmEdges = [
  ['y1', 't1'], ['h1', 't1'], ['h2', 't1'],
  ['y2', 't2'], ['y3', 't2'], ['h3', 't2'],
  ['y4', 't3'], ['h4', 't3'], ['h5', 't3'], ['h6', 't3']
].map(([from, to]) => ({ id: `e-${from}`, from, to, kind: 'of' }));
SAMPLES.feedback_matrix = run('feedback_matrix', [...fbmItems, ...fbmThemes.filter((n) => n.id !== 'h7')], fbmEdges);
SAMPLES['feedback_matrix:next'] = run('feedback_matrix', [...fbmItems, ...fbmThemes.map((n) => (n.id === 'h6' ? { ...n, state: 'contested', objection: 'Would a reserve list just move the lateness to Friday?' } : n))], [...fbmEdges, { id: 'e-h7', from: 'h7', to: 't1', kind: 'of' }]);
SAMPLES.feedback_matrix_first = run('feedback_matrix', fbmItems.slice(0, 7));

// 5 Cs documentation: a village library leaves a record of how it cleared its returns backlog.
// Condense has three essentials, so its slice shows the latest and "+2". The name keeps an
// abbreviation the coach objected to, so the Correspond slice is contested (the one contested node)
// and every strict rule still passes. five_cs:next revises the name, so the marks and chip change.
// five_cs_first has only the first two answers, so three slices wait as faint paper.
const fiveCsNodes = [
  node('k1', 'contextualise', 'So the next volunteer coordinator can see why the returns backlog built up and how it was cleared, without asking around.', 'Handover to the next lead'),
  node('k2', 'categorise', 'Filed in the library committee folder under Volunteers, then Rota; every committee member can open it.', 'Committee folder, Volunteers'),
  node('k3', 'condense:1', 'The backlog came from one weekly returns shift, on the busiest day.', 'One shift, busiest day'),
  node('k4', 'condense:2', 'Two shorter shifts on Tuesday and Saturday cleared it in three weeks.', 'Two shorter shifts'),
  node('k5', 'condense:3', 'A sign on the returns trolley says when it was last emptied.', 'Sign on the trolley'),
  node('k6', 'correct', 'The first draft said the backlog began in spring; the issue log shows it began in late winter. Corrected by the coordinator in October.', 'Start date moved to winter'),
  node('k7', 'correspond', 'Library returns LRB 20261020 v1 Final', 'Library returns LRB', { state: 'contested', objection: 'Would someone new know what LRB stands for?' })
];
SAMPLES.five_cs = run('five_cs', fiveCsNodes);
SAMPLES['five_cs:next'] = run('five_cs', [
  ...fiveCsNodes.slice(0, 6),
  node('k7', 'correspond', 'Library returns backlog case file 20261020 v2 Final', 'Library returns backlog')
]);
SAMPLES.five_cs_first = run('five_cs', fiveCsNodes.slice(0, 2));

// Knowledge management: a community choir keeps what it learned running its first open rehearsal.
// Capture has three explicit and two tacit entries; the second tacit entry is contested (the one
// contested node), so its pill carries the tag. knowledge_management:next adds a fourth explicit
// entry, which drops into its list; knowledge_management_first has Consider and one explicit
// entry, so Share and Review wait as faint paper.
const kmNodes = [
  node('m1', 'consider', 'The sign-up sheet and the hall booking are saved; nothing says how the warm-up was run or who greeted newcomers at the door.', 'Warm-up and welcome not recorded'),
  node('m2', 'explicit:1', 'A one-page running order for an open rehearsal, kept in the shared choir folder.', 'Running order, one page'),
  node('m3', 'explicit:2', 'The hall checklist: keys, heating, chairs in a horseshoe, kettle on by half past six.', 'Hall checklist'),
  node('m4', 'explicit:3', 'The welcome email sent the week before, saved as a template.', 'Welcome email template'),
  node('m5', 'tacit:1', 'How the section leaders read a nervous room; a new leader shadows one at the next open night.', 'Reading the room, by shadowing'),
  node('m6', 'tacit:2', 'Choosing a first song everyone can join; the music lead talks it through at a committee evening.', 'Picking the first song', { state: 'contested', objection: 'Is one evening enough to pass that on?' }),
  node('m7', 'share', 'Link the folder from the members newsletter and ask each section to add one tip after every open night.', 'Newsletter link, section tips'),
  node('m8', 'review', 'Look again before the spring open night; update the running order and delete the old contact list.', 'Before spring, prune contacts')
];
SAMPLES.knowledge_management = run('knowledge_management', kmNodes);
SAMPLES['knowledge_management:next'] = run('knowledge_management', [
  ...kmNodes.slice(0, 4),
  node('m9', 'explicit:4', 'A map of the hall showing where newcomers sit and where coats go.', 'Hall map for newcomers'),
  ...kmNodes.slice(4)
]);
SAMPLES.knowledge_management_first = run('knowledge_management', kmNodes.slice(0, 2));

// Lightning: run states, not tool runs, built with the graph's own transitions. A shared printer
// that jams: lightning reaches Relax on the second strategy (working backwards) and waits on
// "What can I learn?"; lightning_loop tries every strategy, reframes once and is asked again
// whether taking something away would solve it; lightning_again finished a first round by
// taking something away, came back, and is now on guess and check.
const at = '2026-10-20T09:00:00.000Z';
const walk = (steps, state = newLightning(at)) => steps.reduce((s, step) => applyStep(s, step, at), state);
const opening = [{ node: 'start', answer: 'no' }, { node: 'goal', note: 'Print a full page without a jam.' }];
SAMPLES.lightning = walk([
  ...opening,
  { node: 'subtract', answer: 'no' },
  { node: 'one_step', answer: 'no' },
  { node: 'diagram', note: 'Sketched the paper path from tray to rollers.', answer: 'no' },
  { node: 'work_backwards', note: 'Worked back from a clean page to the tray settings.', answer: 'yes' }
]);
SAMPLES.lightning_loop = walk([
  ...opening,
  { node: 'subtract', answer: 'no' },
  { node: 'one_step', answer: 'no' },
  { node: 'diagram', answer: 'no' },
  { node: 'work_backwards', answer: 'no' },
  { node: 'make_list', note: 'Paper type, tray guide, rollers, firmware.', answer: 'no' },
  { node: 'take_break', answer: 'no' },
  { node: 'analogy', note: 'Asked how the office down the hall fixed theirs.', answer: 'no' },
  { node: 'reframing', answer: 'yes', note: 'Use the other tray for now.' },
  { node: 'goal', note: 'Print from the second tray today.' }
]);
SAMPLES.lightning_again = walk(
  [{ node: 'start', answer: 'no' }, { node: 'goal', note: 'Print a full page without a jam.' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'yes' }],
  again(
    walk([
      ...opening,
      { node: 'subtract', answer: 'yes' },
      { node: 'via_negativa', note: 'Took out the bent sheets at the bottom of the tray.', answer: 'yes' },
      { node: 'learn', note: 'Check the tray before blaming the printer.' },
      { node: 'next', note: 'Keep the paper flat in its box.' }
    ]),
    at
  )
);
