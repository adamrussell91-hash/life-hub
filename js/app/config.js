// The site (life-hub.adam-russell.com, on GitHub Pages) and the API
// (api.adam-russell.com, on Netlify) are sibling subdomains of the same registrable
// domain -- this is what makes the session cookie a first-party cookie instead of a
// third-party one, so browsers stop blocking it. Not a secret, just where the API
// lives. Leave blank for local dev, where the site and the mock API share an origin.
export const API_BASE_URL = 'https://api.adam-russell.com';
