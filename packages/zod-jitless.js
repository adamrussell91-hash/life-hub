/**
 * Zod 4 probes for `new Function` the first time it builds an object schema, to decide
 * whether to compile fast parsers. The hubs ship a Content-Security-Policy without
 * 'unsafe-eval', so that probe is reported as a CSP violation even though Zod catches it.
 * `jitless` skips the probe and the compiled path. Zod keeps this setting on globalThis,
 * so one call covers every copy of Zod in the bundle. Import this first in each entry.
 */
import { config } from 'zod';

config({ jitless: true });
