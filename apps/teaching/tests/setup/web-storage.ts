/**
 * Node 22.4+ ships its own global localStorage / sessionStorage. Without
 * --localstorage-file they read as undefined, and they shadow happy-dom's, so
 * `localStorage.clear()` throws. Give each happy-dom test file working DOM
 * storage; files on the node environment are left alone.
 */
const isHappyDom = 'happyDOM' in globalThis;
for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (isHappyDom && globalThis[name] === undefined) {
    Object.defineProperty(globalThis, name, { value: new Storage(), configurable: true, writable: true });
  }
}
