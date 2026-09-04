import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCTION_TIDY_ORIGIN,
  PRODUCTION_API_BASE,
  resolveApiBase,
} from "./config";

describe("resolveApiBase", () => {
  it("uses same-origin /api on localhost", () => {
    expect(resolveApiBase("localhost")).toBe("/api");
    expect(resolveApiBase("127.0.0.1")).toBe("/api");
  });

  it("points notes, search, quiz, and auth at the umbrella Knowledge prefix", () => {
    expect(resolveApiBase("knowledge-hub.adam-russell.com")).toBe(PRODUCTION_API_BASE);
    expect(PRODUCTION_API_BASE).toBe("https://api.adam-russell.com/api/knowledge");
  });
});

it("publishes the dedicated Worker tidy origin", () => {
  expect(DEFAULT_PRODUCTION_TIDY_ORIGIN).toBe("https://knowledge-tidy.adam-russell.com");
});
