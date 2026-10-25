/**
 * Synthetic Network Ecology world for local dev. Invented names only.
 * Shaped like a real network: a chained mainland of organisations, a few
 * lone islands, long institution names, meeting clusters (which the map
 * must not name) and a big open sea of unattached people.
 */
import type { NetworkEcologyCluster, NetworkEcologyWorld } from '../src/domain/types';

const ORGS: Array<[string, NetworkEcologyCluster['habitat'], number]> = [
  ['Harbourview Grammar School', 'savannah', 28],
  ['Institute for Teaching and School Leadership Excellence', 'forest', 9],
  ['Coastal Education Standards Authority', 'reef', 14],
  ['Department of Education and Training', 'savannah', 18],
  ['Riverbend University', 'forest', 6],
  ['Northshore Catholic College', 'forest', 5],
  ['Education Research Organisation', 'reef', 7],
  ['Gifted Learners Association', 'savannah', 8],
  ['Applied Sciences University of the Bay', 'forest', 4],
  ['Westvale College', 'savannah', 12],
  ['The Ethics Forum', 'sandbank', 3],
  ['Hillcrest Teachers Guild', 'reef', 6],
  ['Eastbay Primary School', 'forest', 4],
  ['Kestrel Ridge High School', 'island', 4],
  ['Saltmarsh Learning Lab', 'island', 3],
  ['Pinegrove Tutoring Co-op', 'island', 2]
];

const MEETINGS = [
  'Accreditation Meeting - Jordan Avery',
  'Gifted Education Junior School Meeting',
  'Accreditation Mentoring Check-in'
];

export function mockNetworkEcologyWorld(): NetworkEcologyWorld {
  const nodes: NetworkEcologyWorld['nodes'] = [
    { ref: 'shared:person:me', kind: 'person', display_name: 'Sam Rivera', is_self: true, last_contacted: null }
  ] as NetworkEcologyWorld['nodes'];
  const clusters: NetworkEcologyCluster[] = [];
  let n = 0;
  const person = (quiet: boolean) => {
    n += 1;
    const ref = `shared:person:p${n}`;
    const first = ['Alex', 'Jamie', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery', 'Rowan'][n % 8];
    const last = ['Nguyen', 'Patel', 'Okafor', 'Silva', 'Brooks', 'Larsen', 'Moreau'][n % 7];
    nodes.push({
      ref,
      kind: 'person',
      display_name: `${first} ${last}`,
      last_contacted: quiet ? '2023-02-01' : '2026-09-01',
      is_self: false
    } as NetworkEcologyWorld['nodes'][number]);
    return ref;
  };
  let prev: string[] = [];
  ORGS.forEach(([label, habitat, size], i) => {
    const id = `shared:organisation:o${i}`;
    nodes.push({ ref: id, kind: 'organisation', display_name: label } as NetworkEcologyWorld['nodes'][number]);
    const members = Array.from({ length: size }, (_, k) => person(k % 4 === 0));
    // Mainland orgs share a person or two with the previous one.
    if (habitat !== 'island' && prev.length) members.push(...prev.slice(0, 1 + (i % 2)));
    if (i === 0) members.push('shared:person:me');
    clusters.push({ id, kind: 'organisation', label, member_refs: members, habitat, since: 2015 + (i % 8) } as NetworkEcologyCluster);
    if (habitat !== 'island') prev = members;
  });
  const harbour = clusters[0].member_refs;
  MEETINGS.forEach((label, i) => {
    clusters.push({
      id: `professional:meeting:m${i}`,
      kind: 'event',
      label,
      member_refs: [...harbour.slice(i * 3, i * 3 + 4), ...clusters[2].member_refs.slice(0, 3)],
      habitat: 'wetland',
      since: 2026,
      event_date: '2026-10-20'
    } as NetworkEcologyCluster);
  });
  for (let i = 0; i < 300; i += 1) person(i % 3 === 0);
  const orgClusters = clusters.filter((c) => c.kind === 'organisation');
  return {
    nodes,
    edges: [],
    links: [],
    clusters,
    bridge_people: [],
    timeline: { '2026': { clusters: orgClusters, bridge_people: [] } },
    upcoming_events: []
  } as unknown as NetworkEcologyWorld;
}
