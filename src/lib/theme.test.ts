import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDarkTheme, setDarkTheme, subscribeToTheme } from "./theme";

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("updates the DOM, persistence, and subscribers together", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    setDarkTheme(true);

    expect(getDarkTheme()).toBe(true);
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("story:theme")).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
