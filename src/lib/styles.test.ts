import { beforeEach, describe, expect, it, vi } from "vitest";

import { authenticatedFetch } from "./api";
import {
  bookStyleQueryKey,
  fetchStyleConfig,
  parseStyleConfigResponse,
  styleCatalogQueryKey,
  StyleConflictError,
  updateBookStyle,
} from "./styles";

vi.mock("./api", () => ({ authenticatedFetch: vi.fn() }));

const config = {
  presets: [
    {
      id: "warm-character-driven",
      label: "Warm & Character-Driven",
      description: "Human, intimate scenes.",
      active: true,
    },
  ],
  defaultPresetId: "warm-character-driven",
};

describe("style API", () => {
  beforeEach(() => vi.mocked(authenticatedFetch).mockReset());

  it("parses catalog and optional book state", () => {
    expect(
      parseStyleConfigResponse({
        config,
        style: { presetIds: ["warm-character-driven"], customInstruction: "Keep it close." },
        styleRevision: 2,
      }),
    ).toEqual({
      ...config,
      style: { presetIds: ["warm-character-driven"], customInstruction: "Keep it close." },
      styleRevision: 2,
    });
  });

  it("treats a missing network revision as legacy revision zero", () => {
    expect(
      parseStyleConfigResponse({
        config,
        style: { presetIds: ["warm-character-driven"] },
      }),
    ).toMatchObject({ styleRevision: 0 });
  });

  it("rejects malformed catalog responses", () => {
    expect(
      parseStyleConfigResponse({ config: { ...config, defaultPresetId: "missing" } }),
    ).toBeUndefined();
    expect(
      parseStyleConfigResponse({
        config: { ...config, presets: [{ ...config.presets[0], active: "yes" }] },
      }),
    ).toBeUndefined();
  });

  it("loads the catalog without a book id", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ config }), { status: 200 }),
    );

    await expect(fetchStyleConfig()).resolves.toEqual(config);
    expect(authenticatedFetch).toHaveBeenCalledWith("/getStyleConfig", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("surfaces canonical state from an update conflict", async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Style changed elsewhere.",
          style: { presetIds: ["warm-character-driven"] },
          styleRevision: 4,
        }),
        { status: 409 },
      ),
    );

    await expect(
      updateBookStyle("book-1", { presetIds: [], customInstruction: "Direct." }, 3),
    ).rejects.toEqual(
      new StyleConflictError("Style changed elsewhere.", {
        style: { presetIds: ["warm-character-driven"] },
        styleRevision: 4,
      }),
    );
  });

  it("validates successful updates and rejects non-JSON responses", async () => {
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            style: { presetIds: ["warm-character-driven"] },
            styleRevision: 3,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("<html>error</html>", { status: 502 }));

    await expect(
      updateBookStyle("book-1", { presetIds: ["warm-character-driven"] }, 2),
    ).resolves.toEqual({
      style: { presetIds: ["warm-character-driven"] },
      styleRevision: 3,
    });
    await expect(fetchStyleConfig()).rejects.toThrow(/unreadable/i);
  });

  it("provides stable cache keys scoped by writer and book", () => {
    expect(styleCatalogQueryKey("user-a")).toEqual(["style-config", "user-a", "catalog"]);
    expect(bookStyleQueryKey("user-a", "book-1")).not.toEqual(
      bookStyleQueryKey("user-a", "book-2"),
    );
  });
});
