// Synthetic sample runs for the Problem Solver preview harness. No personal data.
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
