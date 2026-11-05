import { describe, expect, it } from "vitest";
import { tabTitle } from "./pageTitle";

describe("tabTitle", () => {
  it("names each view", () => {
    expect(tabTitle("list")).toBe("Archive · Knowledge Hub");
    expect(tabTitle("protocols")).toBe("Thinking · Knowledge Hub");
  });

  it("names the open note", () => {
    expect(tabTitle("page", "An invented note")).toBe("An invented note · Knowledge Hub");
  });

  it("shows the hub when there is no name", () => {
    expect(tabTitle("page", "  ")).toBe("Knowledge Hub");
    expect(tabTitle("page")).toBe("Knowledge Hub");
  });
});
