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
