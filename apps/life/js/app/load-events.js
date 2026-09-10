import { parseEventDocument } from '../core/records.js';

export async function loadEventManifest({
  fetchImpl = fetch,
  manifestUrl = '/fixtures/manifest.json',
  loadYaml
}) {
  const manifestResponse = await fetchImpl(manifestUrl);
  if (!manifestResponse.ok) throw new Error('Fixture manifest is unavailable');

  const manifest = await manifestResponse.json();
  if (!Array.isArray(manifest.files)) {
    throw new TypeError('Fixture manifest files must be an array');
  }

  const events = [];
  const warnings = [];

  for (const file of manifest.files) {
    try {
      const response = await fetchImpl(file.url);
      if (!response.ok) throw new Error('unavailable');
      events.push(parseEventDocument(await response.text(), file.path, loadYaml));
    } catch (error) {
      warnings.push({
        path: typeof file?.path === 'string' ? file.path : 'unknown fixture',
        code: error?.message === 'unavailable' ? 'unavailable' : 'invalid'
      });
    }
  }

  return { events, warnings };
}
