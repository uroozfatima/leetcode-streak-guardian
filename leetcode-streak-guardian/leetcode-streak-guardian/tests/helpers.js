// Minimal fake of chrome.storage.local for Node tests.
export function installFakeChrome() {
  const data = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) { return key in data ? { [key]: structuredClone(data[key]) } : {}; },
        async set(obj) { for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v); },
      },
    },
  };
  return data;
}

/** Fake fetch that answers each GraphQL operation by name. */
export function fakeFetch(handlers) {
  return async (_url, init) => {
    const { query } = JSON.parse(init.body);
    const name = /query (\w+)/.exec(query)[1];
    const h = handlers[name];
    if (h instanceof Error) throw h;
    const { status = 200, body } = h;
    return { status, ok: status >= 200 && status < 300, json: async () => (typeof body === "string" ? JSON.parse(body) : body) };
  };
}
