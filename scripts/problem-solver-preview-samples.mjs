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
