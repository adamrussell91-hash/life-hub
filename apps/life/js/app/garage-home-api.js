function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function createGarageHomeApi(fetchImpl = fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch is unavailable');

  async function request(options) {
    const response = await fetchImpl('/api/garage-home', options);
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      throw httpError(payload?.error?.message ?? 'Garage & Home request failed', response.status, payload?.error?.code ?? 'request_failed');
    }
    return payload.data ?? null;
  }

  const post = body => request({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  return {
    load: () => request(),
    scan: () => post({ action: 'scan' }),
    mail: mail => post({ action: 'mail', mail }),
    forgetSender: from => post({ action: 'forget-sender', from }),
    savePlace: place => post({ action: 'place', place }),
    removePlace: id => post({ action: 'remove-place', id }),
    addVisit: visit => post({ action: 'visit', visit }),
    removeVisit: id => post({ action: 'remove-visit', id }),
    togglePrep: (forDate, item) => post({ action: 'prep', forDate, item }),
    toggleNeeded: (placeId, item) => post({ action: 'needed', placeId, item }),
    setAutoFile: patch => post({ action: 'autofile', patch }),
    importPack: pack => post({ action: 'import', pack })
  };
}
