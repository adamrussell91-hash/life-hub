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
    load: () => request("/api/food-journal"),
    save: (journal, version) =>
      request("/api/food-journal", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ journal, if_version: version }),
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
    media: (body) => post("/api/food-journal-media", body),
    async upload(blob) {
      const { id, key, url } = await post("/api/food-journal-media", {
        action: "upload",
        mime: blob.type,
        size: blob.size,
      });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "content-type": blob.type },
        body: blob,
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) throw new Error("Photo upload failed. Try again.");
      return { id, key };
    },
  };
}
