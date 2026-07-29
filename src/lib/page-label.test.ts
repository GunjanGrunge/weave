import { describe, expect, it } from "vitest";

import { pageLabel } from "./page-label";

describe("pageLabel", () => {
  it("labels only nested book chat routes as Book Chat", () => {
    expect(pageLabel("/books/book-1/chat")).toBe("Book Chat");
    expect(pageLabel("/books/book-1/manuscript")).toBe("Manuscript");
    expect(pageLabel("/chat")).toBe("Story Platform");
  });
});
