/**
 * Portable screenshot/output directory for browser specs.
 * Override with CALENDAR_HUB_ARTIFACTS (or ARTIFACTS_DIR); default os.tmpdir().
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function calendarHubArtifactsDir(name) {
  const root =
    process.env.CALENDAR_HUB_ARTIFACTS ||
    process.env.ARTIFACTS_DIR ||
    os.tmpdir();
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
