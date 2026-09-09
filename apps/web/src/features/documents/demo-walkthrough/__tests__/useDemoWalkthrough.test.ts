import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEMO_WALKTHROUGH_STORAGE_KEY, useDemoWalkthrough } from "../useDemoWalkthrough";

describe("useDemoWalkthrough", () => {
  afterEach(() => {
    localStorage.removeItem(DEMO_WALKTHROUGH_STORAGE_KEY);
  });

  it("shows the compact banner by default", () => {
    const { result } = renderHook(() => useDemoWalkthrough());
    expect(result.current.showBanner).toBe(true);
    expect(result.current.showPanel).toBe(false);
  });

  it("expands the full guide without dismissing", () => {
    const { result } = renderHook(() => useDemoWalkthrough());

    act(() => result.current.openGuide());
    expect(result.current.showBanner).toBe(false);
    expect(result.current.showPanel).toBe(true);
  });

  it("stays hidden after dismiss until reopened", () => {
    const { result } = renderHook(() => useDemoWalkthrough());

    act(() => result.current.dismiss());
    expect(result.current.showBanner).toBe(false);
    expect(result.current.showPanel).toBe(false);
    expect(localStorage.getItem(DEMO_WALKTHROUGH_STORAGE_KEY)).toBe("1");

    act(() => result.current.openGuide());
    expect(result.current.showBanner).toBe(false);
    expect(result.current.showPanel).toBe(true);
  });

  it("respects a previous dismiss on mount", () => {
    localStorage.setItem(DEMO_WALKTHROUGH_STORAGE_KEY, "1");
    const { result } = renderHook(() => useDemoWalkthrough());
    expect(result.current.showBanner).toBe(false);
    expect(result.current.showPanel).toBe(false);
  });
});
