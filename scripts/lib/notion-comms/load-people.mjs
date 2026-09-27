const BATCH_SIZE = 10;

export async function loadHubPeople({ store, listKeys, getJSON, parse }) {
  const keys = await listKeys(store);
  const records = [];
  for (let offset = 0; offset < keys.length; offset += BATCH_SIZE) {
    const batch = await Promise.all(keys.slice(offset, offset + BATCH_SIZE).map((key) => getJSON(store, key)));
    records.push(...batch);
  }
  return records.map(parse).filter(Boolean).map((person) => ({ display_name: person.display_name, aliases: person.aliases, ref: `shared:person:${person.id}` }));
}
