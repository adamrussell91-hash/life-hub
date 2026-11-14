/**
 * An invented journal for the Lisbon and Porto test trip
 * (`fixtures/test-trip.json`). The mock API seeds it so local screenshots and
 * browser checks show a journal with real-shaped photos. No real trip, person
 * or place of business is described.
 */
import type { JournalDocument } from '@/api/journal';
import type { JournalMedia, JournalMoment } from '@/journal/types';

/** Served by the mock API from `fixtures/journal-photos/`. */
export const LISBON_PORTO_PHOTOS: Record<string, { width: number; height: number }> = {
  rooftops: { width: 660, height: 880 },
  arch: { width: 960, height: 640 },
  tram: { width: 640, height: 800 },
  street: { width: 640, height: 800 },
  coffees: { width: 720, height: 720 },
  ribeira: { width: 900, height: 600 },
  sunset: { width: 720, height: 900 },
  night: { width: 660, height: 825 },
  dinner: { width: 720, height: 720 },
  coffee2: { width: 720, height: 900 },
  salad: { width: 720, height: 720 },
  beach: { width: 960, height: 640 },
};

/** Drawn, invented keepsakes. Media rows only: no moment shows them. */
export const LISBON_PORTO_KEEPSAKE_PHOTOS: Record<string, { width: number; height: number }> = {
  'keep-ticket': { width: 760, height: 440 },
  'keep-poster': { width: 600, height: 840 },
  'keep-coaster': { width: 600, height: 600 },
};

const LEG_LISBON = 'leg_lplisbon01';
const LEG_PORTO = 'leg_lpporto001';
const SOUND_ID = 'med_lpsoundbells';

function photoId(name: string): string {
  return `med_lp${name}`;
}

/** A short silent clip, so the sound player has something real to play. */
function silentWav(seconds: number): string {
  const rate = 4000;
  const samples = rate * seconds;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

interface MomentSeed {
  id: string;
  leg: string;
  date: string;
  time: string;
  place: string;
  at: [number, number];
  photos?: string[];
  sound?: boolean;
  text?: string;
  meal?: string;
  partner?: boolean;
}

const MOMENTS: MomentSeed[] = [
  { id: 'mom_lparch001', leg: LEG_LISBON, date: '2027-03-03', time: '09:40', place: 'Praça do Comércio', at: [38.7075, -9.1364], photos: ['arch'], text: 'Straight off the airport metro and into the light. Bags still on our backs.' },
  { id: 'mom_lptram001', leg: LEG_LISBON, date: '2027-03-03', time: '11:15', place: 'Rua da Bica', at: [38.7105, -9.1466], photos: ['tram'], text: 'Tram 28 squeezes past with a hand’s width to spare. Nobody on the pavement even looks up.' },
  { id: 'mom_lpcafe001', leg: LEG_LISBON, date: '2027-03-03', time: '13:05', place: 'Café Aurora', at: [38.711, -9.1421], photos: ['coffees'], meal: 'visit_lpcafe01', text: 'Still warm. We ordered a second round before finishing the first.' },
  { id: 'mom_lpgraca01', leg: LEG_LISBON, date: '2027-03-03', time: '18:20', place: 'Miradouro da Graça', at: [38.7163, -9.1313], photos: ['rooftops'], sound: true, text: 'Sat on the wall until the light went orange. Bells, swifts, a busker two terraces down.' },
  { id: 'mom_lpalfama1', leg: LEG_LISBON, date: '2027-03-04', time: '16:15', place: 'Alfama', at: [38.7118, -9.13], photos: ['street'], text: 'Got deliberately lost. Every staircase ends in someone’s laundry.' },
  { id: 'mom_lppartner', leg: LEG_LISBON, date: '2027-03-04', time: '17:00', place: 'Alfama', at: [38.7121, -9.1291], partner: true, text: 'I would have turned back two staircases earlier.' },
  { id: 'mom_lpfado001', leg: LEG_LISBON, date: '2027-03-04', time: '21:50', place: 'Rua dos Remédios', at: [38.7129, -9.1262], text: 'Fado through an open door on the walk home. We stood in the street for three songs.' },
  { id: 'mom_lpribeira', leg: LEG_PORTO, date: '2027-03-05', time: '16:45', place: 'Cais da Ribeira', at: [41.1408, -8.613], photos: ['ribeira'], text: 'First look at the river. The whole city leans in toward it.' },
  { id: 'mom_lpbridge1', leg: LEG_PORTO, date: '2027-03-05', time: '19:30', place: 'Ponte Dom Luís I', at: [41.1399, -8.6094], photos: ['sunset', 'night'], text: 'Walked the top deck at sunset, then waited for the lights to come on.' },
  { id: 'mom_lpdinner1', leg: LEG_PORTO, date: '2027-03-05', time: '20:50', place: 'Taberna do Cais', at: [41.1411, -8.6152], photos: ['dinner'], meal: 'visit_lpdinner', text: 'Shared one. Should have ordered two.' },
  { id: 'mom_lpcoffee2', leg: LEG_PORTO, date: '2027-03-06', time: '10:05', place: 'Rua das Flores', at: [41.1436, -8.6146], photos: ['coffee2'], text: 'Rain on the window. Second coffee, no plans.' },
  { id: 'mom_lpmarket1', leg: LEG_PORTO, date: '2027-03-06', time: '13:05', place: 'Mercado do Bolhão', at: [41.1493, -8.6068], photos: ['salad'], text: 'Lunch standing up at the market.\nThe stallholder chose for us and would not hear otherwise.\nOlives first, then cheese, then something pickled that neither of us could name.\nShe wrapped the leftovers in paper without being asked.\nWe ate them on a bench outside in the last of the rain.\nA man beside us fed the pigeons from his own lunch.\nWe stayed until the church clock struck two.\nThen we walked downhill because downhill always ends at the river.' },
  { id: 'mom_lpbeach01', leg: LEG_PORTO, date: '2027-03-06', time: '18:10', place: 'Praia dos Ingleses, Foz', at: [41.1505, -8.6765] , photos: ['beach'], text: 'Cold feet in the Atlantic, hot chips on the wall.' },
];

export function lisbonPortoJournal(tripId: string): JournalDocument {
  const media: JournalMedia[] = Object.entries(LISBON_PORTO_PHOTOS).map(([name, size]) => ({
    id: photoId(name),
    url: `/api/mock-photo/${name}.jpg`,
    width: size.width,
    height: size.height,
    lifecycle: 'live',
    content_type: 'image/jpeg',
    upload_state: 'backed_up',
  }));
  for (const [name, size] of Object.entries(LISBON_PORTO_KEEPSAKE_PHOTOS)) {
    media.push({
      id: photoId(name.replace('-', '')),
      url: `/api/mock-photo/${name}.jpg`,
      width: size.width,
      height: size.height,
      lifecycle: 'live',
      content_type: 'image/jpeg',
      upload_state: 'backed_up',
    });
  }
  media.push({
    id: SOUND_ID,
    url: silentWav(3),
    lifecycle: 'live',
    content_type: 'audio/wav',
    upload_state: 'backed_up',
    duration_s: 3,
  });

  const perDay = new Map<string, number>();
  const moments: JournalMoment[] = MOMENTS.map((seed) => {
    const key = `${seed.leg}|${seed.date}`;
    const order = perDay.get(key) ?? 0;
    perDay.set(key, order + 1);
    const media_ids = (seed.photos ?? []).map(photoId);
    if (seed.sound) media_ids.push(SOUND_ID);
    return {
      id: seed.id,
      leg_id: seed.leg,
      local_date: seed.date,
      local_time: seed.time,
      place: { name: seed.place },
      coordinates: { lat: seed.at[0], lon: seed.at[1] },
      location_source: 'exif',
      text: seed.text,
      media_ids,
      display_order: order,
      lifecycle: 'live',
      ...(seed.partner ? { author: 'partner' as const } : {}),
      ...(seed.meal ? { meal: { food_visit_id: seed.meal } } : {}),
    };
  });

  return {
    id: 'jrn_lisbonportotest',
    schema_version: 1,
    trip_id: tripId,
    title: '',
    revision: 1,
    lifecycle: 'live',
    leg_ids: [LEG_LISBON, LEG_PORTO],
    preferences: {
      journal_souvenirs_v1: {
        sv_lptramticket: {
          id: 'sv_lptramticket', title: 'Tram 28 ticket', note: 'Still in my coat pocket.', kind: 'ticket', source: 'photo',
          media_id: photoId('keepticket'), leg_id: LEG_LISBON, local_date: '2027-03-03', local_time: '11:20',
          lifecycle: 'live', created_at: '2027-03-03T11:20:00.000Z',
        },
        sv_lpfadoflyer: {
          id: 'sv_lpfadoflyer', title: 'Fado night flyer', kind: 'poster', source: 'photo',
          media_id: photoId('keepposter'), moment_id: 'mom_lpfado001',
          lifecycle: 'live', created_at: '2027-03-04T22:40:00.000Z',
        },
        sv_lpcoaster: {
          id: 'sv_lpcoaster', title: 'Coaster from the tavern', kind: 'round', source: 'photo',
          media_id: photoId('keepcoaster'), moment_id: 'mom_lpdinner1',
          lifecycle: 'live', created_at: '2027-03-05T21:30:00.000Z',
        },
        // A record from before keepsakes: a name and nothing else.
        sv_lpmagnet: {
          id: 'sv_lpmagnet', title: 'Tile fridge magnet', moment_id: 'mom_lpmarket1',
          lifecycle: 'live', created_at: '2027-03-06T13:30:00.000Z',
        },
      },
    },
    legs: [
      { id: LEG_LISBON, trip_id: tripId, pattern_id: 'generic', destination: 'Lisbon', timezone: 'Europe/Lisbon', city_id: 'lis', start_date: '2027-03-03', end_date: '2027-03-05', order: 0, lifecycle: 'live' },
      { id: LEG_PORTO, trip_id: tripId, pattern_id: 'generic', destination: 'Porto', timezone: 'Europe/Lisbon', city_id: 'opo', start_date: '2027-03-05', end_date: '2027-03-07', order: 1, lifecycle: 'live' },
    ],
    days: [
      { id: 'day_lp0303', leg_id: LEG_LISBON, local_date: '2027-03-03', lifecycle: 'live' },
      { id: 'day_lp0304', leg_id: LEG_LISBON, local_date: '2027-03-04', lifecycle: 'live' },
      { id: 'day_lp0305', leg_id: LEG_PORTO, local_date: '2027-03-05', lifecycle: 'live' },
      { id: 'day_lp0306', leg_id: LEG_PORTO, local_date: '2027-03-06', lifecycle: 'live' },
      { id: 'day_lp0307', leg_id: LEG_PORTO, local_date: '2027-03-07', lifecycle: 'live', empty_marker: true },
    ],
    moments,
    media,
    transitions: [
      { id: 'trn_lplisopo01', from_leg_id: LEG_LISBON, to_leg_id: LEG_PORTO, mode: 'train', lifecycle: 'live', local_date: '2027-03-05', itinerary_item_id: 'itm_testtrain01' },
    ],
    operations: [],
  };
}
