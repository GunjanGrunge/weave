import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Firestore server-authoritative scene rules", () => {
  it("does not restore a broad nested allow and keeps session state unlisted", async () => {
    const rules = await readFile(resolve("..", "firestore.rules"), "utf8");

    expect(rules).not.toContain("match /{subcollection}/{document=**}");
    expect(rules).not.toMatch(/match \/sessions/);
    expect(rules).not.toMatch(/match \/generationRequests/);
    expect(rules).toContain("allow write: if false;");
    expect(rules).toContain("match /scenes/{sceneId}");
    expect(rules).toContain("match /messages/{messageId}");
    expect(rules).toMatch(
      /match \/usage\/\{usageId\}\s*\{\s*allow read: if ownsBook\(bookId\);\s*allow write: if false;/,
    );
    expect(rules).toMatch(
      /match \/facts\/\{factId\}\s*\{\s*allow read: if ownsBook\(bookId\);\s*allow write: if false;/,
    );
    expect(rules).toMatch(
      /match \/characters\/\{characterId\}\s*\{\s*allow read: if ownsBook\(bookId\);\s*allow write: if false;/,
    );
    expect(rules).not.toMatch(/match \/memorySources/);
    expect(rules).toMatch(/match \/books\/\{bookId\}[\s\S]*?allow write: if false;/);
    expect(rules).not.toMatch(/match \/(styles|styleConfig|config)/);
  });
});
