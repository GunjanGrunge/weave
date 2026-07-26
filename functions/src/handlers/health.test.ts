import { describe, expect, it } from "vitest";

import { buildHealthResponse } from "./health.js";

describe("buildHealthResponse", () => {
  it("returns the health payload", () => {
    expect(buildHealthResponse()).toEqual({ status: "ok" });
  });
});
