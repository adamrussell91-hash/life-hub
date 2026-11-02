// Test providers must be injected mocks. Keep accidental production/default
// fetch calls inside the test process while allowing local integration servers.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async function testFetch(input, init) {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    return Promise.reject(
      new Error("External fetch requires an injected test mock."),
    );
  }
  return nativeFetch(input, init);
};

// netlify/functions/_shared/safe-fetch.mjs resolves names and opens its own
// pinned sockets in production. Under test it uses these instead: every name
// resolves to one fixed public address (no real DNS), and requests go through
// the guarded fetch above, so an un-mocked outbound call still fails loudly.
// Tests that exercise the address checks pass their own lookupImpl.
globalThis[Symbol.for("life-hub.test-network")] = {
  lookup: async () => [{ address: "93.184.215.14", family: 4 }],
};
