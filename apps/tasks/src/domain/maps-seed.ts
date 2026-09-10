import { TransitMapSchema, type TransitMap } from '@/schemas/map';
import { yearLinePoints } from '@/domain/maps-layout';

const STAMP = '2026-08-20T00:00:00.000Z';

function col(
  id: string,
  name: string,
  letter: string,
  color: TransitMap['lines'][number]['color'],
  x: number
) {
  return {
    id,
    name,
    letter,
    color,
    points: yearLinePoints(x)
  };
}

function station(
  id: string,
  line_id: string,
  label: string,
  starts_on: string,
  ends_on: string,
  extras: Partial<TransitMap['stations'][number]> = {}
) {
  return {
    id,
    line_id,
    label,
    y: 80,
    height: 110,
    tracks: extras.tracks ?? ['junior', 'rozelle', 'senior'],
    in_stroke: 'solid' as const,
    out_stroke: 'solid' as const,
    starts_on,
    ends_on,
    link: null,
    planning: 'planned' as const,
    ...extras
  };
}

function tick(
  id: string,
  label: string,
  attach: TransitMap['ticks'][number]['attach'],
  starts_on: string,
  extras: Partial<TransitMap['ticks'][number]> = {}
) {
  return {
    id,
    label,
    attach,
    stroke: 'solid' as const,
    connects_to: null,
    starts_on,
    ends_on: null,
    link: null,
    planning: 'planned' as const,
    ...extras
  };
}

export function mindWorks2026Map(): TransitMap {
  return TransitMapSchema.parse({
    schema_version: 1,
    id: 'map_mindworks_2026',
    title: 'MindWorks 2026',
    year: 2026,
    created_at: STAMP,
    updated_at: STAMP,
    lines: [
      col('line_justice', 'Justice', 'J', 'blue', 200),
      col('line_innovation', 'Innovation', 'I', 'yellow', 440),
      col('line_expression', 'Expression', 'E', 'green', 680),
      col('line_reasoning', 'Reasoning', 'R', 'purple', 920)
    ],
    stations: [
      station('st_ydp', 'line_justice', 'Young Diplomats Program', '2026-01-27', '2026-04-10', {
        tracks: ['junior']
      }),
      station('st_advocacy', 'line_justice', 'Diplomacy and Advocacy', '2026-04-27', '2026-07-03', {
        tracks: ['senior']
      }),
      station('st_mock', 'line_justice', 'NSW Law Society Mock Trial', '2026-07-20', '2026-10-30', {
        in_stroke: 'dotted',
        tracks: ['senior']
      }),
      station('st_ycl', 'line_innovation', 'Young Creators Lab', '2026-01-27', '2026-07-03', {
        tracks: ['junior']
      }),
      station('st_future', 'line_innovation', 'Future Solutions Lab', '2026-07-20', '2026-12-17', {
        tracks: ['senior']
      }),
      station('st_studio', 'line_expression', 'StudioGAT', '2026-01-27', '2026-12-17', {
        tracks: ['junior', 'rozelle', 'senior']
      }),
      station('st_psych', 'line_reasoning', 'Foundations Psychology', '2026-01-27', '2026-07-03', {
        tracks: ['junior']
      }),
      station(
        'st_ethics',
        'line_reasoning',
        'Foundations Ethics and Philosophy',
        '2026-07-20',
        '2026-12-17',
        { tracks: ['junior'] }
      )
    ],
    ticks: [
      tick(
        'tk_muna',
        'Rotary MUNA',
        { kind: 'line', line_id: 'line_justice', y: 200, track: 'junior' },
        '2026-05-15'
      ),
      tick(
        'tk_locke',
        'John Locke Essay Competition',
        { kind: 'station', station_id: 'st_mock', side: 'right', offset: 0.25 },
        '2026-08-05',
        { connects_to: 'Reasoning' }
      ),
      tick(
        'tk_moot',
        'Bond University Mooting',
        { kind: 'event', event_id: 'tk_locke', side: 'bottom' },
        '2026-09-10',
        { stroke: 'dotted', connects_to: 'Justice' }
      ),
      tick(
        'tk_davinci',
        'da Vinci Decathlon',
        { kind: 'line', line_id: 'line_innovation', y: 260, track: 'rozelle' },
        '2026-05-22',
        { connects_to: 'Rotary MUNA' }
      ),
      tick(
        'tk_unsw',
        'UNSW Mathematics Competition',
        { kind: 'event', event_id: 'tk_davinci', side: 'bottom' },
        '2026-08-18',
        { connects_to: 'Innovation' }
      ),
      tick(
        'tk_evatt',
        'UN Evatt Competition',
        { kind: 'station', station_id: 'st_advocacy', side: 'right', offset: 0.55 },
        '2026-08-01',
        { connects_to: 'Rotary MUNA' }
      )
    ]
  });
}
