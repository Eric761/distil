import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEMO_WALKTHROUGH_STORAGE_KEY, useDemoWalkthrough } from "../useDemoWalkthrough";

describe("useDemoWalkthrough", () => {
  afterEach(() => {
    localStorage.removeItem(DEMO_WALKTHROUGH_STORAGE_KEY);
  });

  it("opens by default until dismissed", () => {
    const { result } = renderHook(() => useDemoWalkthrough());
    expect(result.current.isOpen).toBe(true);
  });

  it("stays closed after dismiss until reopened", () => {
    const { result } = renderHook(() => useDemoWalkthrough());

    act(() => result.current.dismiss());
    expect(result.current.isOpen).toBe(false);
    expect(localStorage.getItem(DEMO_WALKTHROUGH_STORAGE_KEY)).toBe("1");

    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
  });

  it("respects a previous dismiss on mount", () => {
    localStorage.setItem(DEMO_WALKTHROUGH_STORAGE_KEY, "1");
    const { result } = renderHook(() => useDemoWalkthrough());
    expect(result.current.isOpen).toBe(false);
  });
});
