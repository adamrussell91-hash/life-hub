/**
 * Curriculum network data for student endpoints. Only the fields a map needs
 * leave the server: line ids, modes, names and colours; stop line ids and depth.
 */

const MODES = new Set(['train', 'metro', 'light_rail']);
const LEVELS = new Set(['introduced', 'reinforced', 'mastered']);

export function publicNetworkLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines
    .filter(line => line && typeof line.id === 'string' && MODES.has(line.mode))
    .slice(0, 24)
    .map(line => ({
      id: line.id,
      mode: line.mode,
      name: typeof line.name === 'string' ? line.name.slice(0, 60) : '',
      ...(typeof line.short === 'string' && line.short ? { short: line.short.slice(0, 4) } : {}),
      colour: typeof line.colour === 'string' ? line.colour : 'wave'
    }));
}

export function publicLineStops(stops) {
  if (!Array.isArray(stops)) return [];
  return stops
    .filter(stop => stop && typeof stop.line_id === 'string')
    .slice(0, 16)
    .map(stop => ({
      line_id: stop.line_id,
      ...(LEVELS.has(stop.level) ? { level: stop.level } : {})
    }));
}
