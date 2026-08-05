export function buildSkincareModel({ events, date, routines, nowHourKey }) {
  if (!date) throw new RangeError('Skincare display date is unavailable');
  const records = (events ?? [])
    .map(event => ({ record: event.record, path: event.path, body: event.body }))
    .filter(entry => entry.record?.type === 'skincare' && entry.record.date === date);

  const am = records.find(entry => entry.record.routine === 'am' && !String(entry.body ?? '').startsWith('Procedure:'));
  const pm = records.find(entry => entry.record.routine === 'pm' && !String(entry.body ?? '').startsWith('Procedure:'));
  const procedures = records.filter(entry => String(entry.body ?? '').startsWith('Procedure:'));

  return {
    date,
    currentRoutine: nowHourKey === 'am' || nowHourKey === 'pm' ? nowHourKey : 'pm',
    routines,
    amLogged: Boolean(am),
    pmLogged: Boolean(pm),
    amRecord: am?.record ?? null,
    pmRecord: pm?.record ?? null,
    procedures: procedures.map(entry => ({
      path: entry.path,
      notes: entry.body,
      products: entry.record.products ?? []
    }))
  };
}
