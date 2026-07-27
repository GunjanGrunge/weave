import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { POLISH_ASPECTS } from "./polish-aspects";

describe("polish aspect catalog", () => {
  it("stays byte-identical to the backend catalog", () => {
    const frontendSource = readFileSync("src/lib/polish-aspects.ts", "utf8");
    const backendSource = readFileSync("functions/src/config/polishAspects.ts", "utf8");

    expect(frontendSource).toBe(backendSource);
    expect(new Set(POLISH_ASPECTS.map((aspect) => aspect.id)).size).toBe(
      POLISH_ASPECTS.length,
    );
  });
});
