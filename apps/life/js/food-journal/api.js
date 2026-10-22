export function createFoodJournalApi(fetchImpl) {
  async function request(path, init) {
    const res = await fetchImpl(path, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(30000),
      }),
      value = await res.json().catch(() => null);
    if (!res.ok || !value?.ok)
      throw Object.assign(
        new Error(value?.error?.message || "Food Journal request failed."),
        { status: res.status },
      );
    return value.data;
  }
  const post = (path, body) =>
    request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    places: (q, gps = {}) =>
      request(
        "/api/travel-places?" +
          new URLSearchParams({
            q,
            ...(Number.isFinite(gps.lat)
              ? { lat: String(gps.lat), lon: String(gps.lon) }
              : {}),
          }),
      ),
    foodPlaces: (gps, q = "") =>
      request(
        "/api/food-places?" +
          new URLSearchParams({ lat: String(gps.lat), lon: String(gps.lon), q }),
      ),
    load: () => request("/api/food-journal"),
    save: (journal, version, removeMeals = []) =>
      request("/api/food-journal", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          journal,
          if_version: version,
          ...(removeMeals.length ? { remove_meals: removeMeals } : {}),
        }),
      }),
    async assist(body) {
      // The API starts the background run itself; see food-journal-assist.
      const { id } = await post("/api/food-journal-assist", body);
      for (let attempt = 0; attempt < 150; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const job = await request(
          "/api/food-journal-assist?id=" + encodeURIComponent(id),
        );
        if (job.status === "done") {
          if (!job.result?.ok)
            throw new Error(
              job.result?.error?.message ||
                "Research did not finish. Try again.",
            );
          return job.result.data;
        }
      }
      throw new Error("Research took too long. Try again.");
    },
    translate: (text) =>
      post("/api/food-journal-process", { action: "translate", text }),
    media: (body) => post("/api/food-journal-media", body),
    // A dish photo's JPEG, read by the function rather than from the bucket.
    async photo(key) {
      const { jpeg } = await post("/api/food-journal-media", {
        action: "bytes",
        key,
      });
      return new Blob([Uint8Array.from(atob(jpeg), (c) => c.charCodeAt(0))], {
        type: "image/jpeg",
      });
    },
    // The function stores the photo, so no browser PUT to R2 is needed.
    upload: (blob) =>
      request("/api/food-journal-media", {
        method: "POST",
        headers: { "content-type": "image/jpeg" },
        body: blob,
        signal: AbortSignal.timeout(60000),
      }),
  };
}
