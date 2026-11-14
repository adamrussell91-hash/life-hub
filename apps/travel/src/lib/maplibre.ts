/**
 * The one way Travel loads MapLibre.
 *
 * MapLibre 6 starts its tile worker from `maplibre-gl-worker.mjs` beside its own module,
 * through a URL the bundler cannot see, so the build never copied the file. Production
 * 404'd it and every map drew only the raster relief: no streets, labels, stops or route.
 * `?url` makes Vite emit the worker as an asset, and setWorkerUrl points MapLibre at it
 * before any map is created.
 */
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);

export * from 'maplibre-gl';
