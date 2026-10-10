import type {
  JournalFixture,
  JournalMedia,
  JournalMoment,
} from '@/journal/types';

const TRIP_ID = 'trp_kl_ist_fixture';

const svgDataUrl = (width: number, height: number, label: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#e8e4dc"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="#5c574f">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const LONG_REFLECTION = [
  'The humid air lifted after the storm, and the city felt briefly honest.',
  'Street vendors reset their stalls while pigeons argued over spilled grain.',
  'I walked without a map, trusting the river of voices and cooking smoke.',
  'Every corner offered a photograph I did not take, saving room for memory.',
  'A mosque call rolled across rooftops and made the traffic pause in sympathy.',
  'By evening my notebook was damp, ink feathering where I pressed too hard.',
  'I slept with the window open, listening for rain that never quite returned.',
].join('\n');

const LONG_PLACE_NAME =
  'Sultan Abdul Samad Building and Merdeka Square Heritage Walkway';

function buildMedia(): JournalMedia[] {
  const items: { id: string; w: number; h: number; label: string }[] = [
    { id: 'med_kul_1', w: 1200, h: 800, label: 'KL 1' },
    { id: 'med_kul_2a', w: 800, h: 800, label: 'KL 2a' },
    { id: 'med_kul_2b', w: 800, h: 800, label: 'KL 2b' },
    { id: 'med_kul_g1', w: 1200, h: 800, label: 'KL g1' },
    { id: 'med_kul_g2', w: 1200, h: 800, label: 'KL g2' },
    { id: 'med_kul_g3', w: 1200, h: 800, label: 'KL g3' },
    { id: 'med_kul_g4', w: 1200, h: 800, label: 'KL g4' },
    { id: 'med_kul_portrait', w: 900, h: 1125, label: 'Portrait' },
    { id: 'med_ist_1', w: 1200, h: 800, label: 'IST 1' },
    { id: 'med_ist_2', w: 1200, h: 800, label: 'IST 2' },
    { id: 'med_ist_3', w: 1200, h: 800, label: 'IST 3' },
  ];
  return items.map(({ id, w, h, label }) => ({
    id,
    url: svgDataUrl(w, h, label),
    width: w,
    height: h,
    lifecycle: 'live',
  }));
}

function buildMoments(): JournalMoment[] {
  return [
    {
      id: 'mom_kul_single',
      leg_id: 'leg_kul',
      local_date: '2026-03-01',
      local_time: '09:15',
      media_ids: ['med_kul_1'],
      display_order: 1,
      lifecycle: 'live',
      place: { name: 'Petronas Towers' },
      coordinates: { lat: 3.1579, lon: 101.7116 },
      location_source: 'exif',
      text: 'First light on the towers before the tour buses arrived.',
    },
    {
      id: 'mom_kul_pair',
      leg_id: 'leg_kul',
      local_date: '2026-03-01',
      local_time: '11:40',
      media_ids: ['med_kul_2a', 'med_kul_2b'],
      display_order: 2,
      lifecycle: 'live',
      place: { name: 'Central Market' },
      coordinates: { lat: 3.1456, lon: 101.6958 },
      location_source: 'exif',
    },
    {
      id: 'mom_kul_gallery',
      leg_id: 'leg_kul',
      local_date: '2026-03-01',
      local_time: '15:05',
      media_ids: [
        'med_kul_g1',
        'med_kul_g2',
        'med_kul_g3',
        'med_kul_g4',
      ],
      display_order: 3,
      lifecycle: 'live',
      place: { name: 'Batu Caves' },
      coordinates: { lat: 3.2379, lon: 101.684 },
      location_source: 'exif',
      text: 'Steps, colour, and a chorus of horns from the road below.',
    },
    {
      id: 'mom_kul_portrait',
      leg_id: 'leg_kul',
      local_date: '2026-03-01',
      local_time: '17:20',
      media_ids: ['med_kul_portrait'],
      display_order: 4,
      lifecycle: 'live',
      place: { name: 'Jalan Alor' },
      text: 'Portrait frame — no GPS on this file.',
    },
    {
      id: 'mom_kul_long_place',
      leg_id: 'leg_kul',
      local_date: '2026-03-01',
      local_time: '19:00',
      media_ids: [],
      display_order: 5,
      lifecycle: 'live',
      place: { name: LONG_PLACE_NAME },
      text: 'Evening stroll with nowhere particular to be.',
    },
    {
      id: 'mom_kul_text',
      leg_id: 'leg_kul',
      local_date: '2026-03-02',
      local_time: '08:30',
      media_ids: [],
      display_order: 1,
      lifecycle: 'live',
      text: 'Quiet morning notes before packing — text-only moment.',
    },
    {
      id: 'mom_ist_pair',
      leg_id: 'leg_ist',
      local_date: '2026-03-04',
      local_time: '10:45',
      media_ids: ['med_ist_2', 'med_ist_3'],
      display_order: 1,
      lifecycle: 'live',
      place: { name: 'Sultanahmet' },
      coordinates: { lat: 41.0054, lon: 28.9768 },
      location_source: 'exif',
    },
    {
      id: 'mom_ist_reflection',
      leg_id: 'leg_ist',
      local_date: '2026-03-04',
      local_time: '20:10',
      media_ids: ['med_ist_1'],
      display_order: 2,
      lifecycle: 'live',
      place: { name: 'Karaköy waterfront' },
      coordinates: { lat: 41.0256, lon: 28.9744 },
      location_source: 'manual',
      text: LONG_REFLECTION,
    },
  ];
}

export function klIstanbulFixture(): JournalFixture {
  const media = buildMedia();
  const moments = buildMoments();

  return {
    id: 'jrn_kl_ist_fixture',
    schema_version: 1,
    trip_id: TRIP_ID,
    title: 'Kuala Lumpur & Istanbul',
    revision: 1,
    lifecycle: 'live',
    legs: [
      {
        id: 'leg_kul',
        trip_id: TRIP_ID,
        pattern_id: 'kul',
        destination: 'Kuala Lumpur',
        timezone: 'Asia/Kuala_Lumpur',
        city_id: 'kul',
        start_date: '2026-03-01',
        end_date: '2026-03-02',
        order: 0,
        lifecycle: 'live',
      },
      {
        id: 'leg_ist',
        trip_id: TRIP_ID,
        pattern_id: 'ist',
        destination: 'Istanbul',
        timezone: 'Europe/Istanbul',
        city_id: 'ist',
        start_date: '2026-03-04',
        end_date: '2026-03-06',
        order: 1,
        lifecycle: 'live',
      },
    ],
    days: [
      {
        id: 'day_kul_2026_03_01',
        leg_id: 'leg_kul',
        local_date: '2026-03-01',
        lifecycle: 'live',
      },
      {
        id: 'day_kul_2026_03_02',
        leg_id: 'leg_kul',
        local_date: '2026-03-02',
        lifecycle: 'live',
        empty_marker: true,
      },
      {
        id: 'day_ist_2026_03_04',
        leg_id: 'leg_ist',
        local_date: '2026-03-04',
        lifecycle: 'live',
      },
    ],
    moments,
    media,
    transitions: [
      {
        id: 'trn_kul_ist',
        from_leg_id: 'leg_kul',
        to_leg_id: 'leg_ist',
        mode: 'flight',
        local_date: '2026-03-03',
        departure_label: 'Kuala Lumpur (KUL)',
        arrival_label: 'Istanbul (IST)',
        lifecycle: 'live',
      },
    ],
  };
}
