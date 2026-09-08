import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { makeField } from "@/test/fixtures";
import { projectField, useReviewDraft } from "../useReviewDraft";

describe("useReviewDraft reducer", () => {
  it("starts clean and exposes unsaved state once an edit is made", () => {
    const { result } = renderHook(() => useReviewDraft());
    expect(result.current.dirty).toBe(false);

    act(() => result.current.correct("f1", "Acme Corp"));
    expect(result.current.dirty).toBe(true);
    expect(result.current.toChanges()).toEqual([
      { fieldId: "f1", action: "correct", value: "Acme Corp" },
    ]);
  });

  it("reverting a single field removes only that entry", () => {
    const { result } = renderHook(() => useReviewDraft());
    act(() => result.current.confirm("f1"));
    act(() => result.current.correct("f2", "x"));
    act(() => result.current.revert("f1"));

    expect(result.current.draft.f1).toBeUndefined();
    expect(result.current.draft.f2).toEqual({ action: "correct", value: "x" });
    expect(result.current.dirty).toBe(true);
  });

  it("resolve_conflict records both the candidate id and its value", () => {
    const { result } = renderHook(() => useReviewDraft());
    act(() => result.current.resolveConflict("total", "invoiceTotal", "5400.00"));
    expect(result.current.toChanges()).toEqual([
      { fieldId: "total", action: "resolve_conflict", value: "5400.00", candidateId: "invoiceTotal" },
    ]);
  });

  it("reset clears all pending edits", () => {
    const { result } = renderHook(() => useReviewDraft());
    act(() => result.current.confirm("a"));
    act(() => result.current.reset());
    expect(result.current.dirty).toBe(false);
    expect(result.current.toChanges()).toEqual([]);
  });
});

describe("projectField", () => {
  it("uses the server effective value when there is no local edit", () => {
    const field = makeField({ effectiveValue: "Acme", needsAttention: true, reviewState: "needs_review" });
    const p = projectField(field, undefined);
    expect(p.displayValue).toBe("Acme");
    expect(p.resolvedLocally).toBe(false);
    expect(p.isCorrected).toBe(false);
  });

  it("marks a field resolved locally after confirming", () => {
    const field = makeField({ needsAttention: true });
    const p = projectField(field, { action: "confirm" });
    expect(p.reviewLabel).toBe("confirmed");
    expect(p.resolvedLocally).toBe(true);
  });

  it("shows the corrected value and flags it as corrected while keeping the original on the field", () => {
    const field = makeField({ extractedValue: "Acme Inc", effectiveValue: "Acme Inc" });
    const p = projectField(field, { action: "correct", value: "Acme Corp" });
    expect(p.displayValue).toBe("Acme Corp");
    expect(p.isCorrected).toBe(true);
    // The original extracted value is never mutated by projection.
    expect(field.extractedValue).toBe("Acme Inc");
  });

  it("blanks the value when marked not applicable", () => {
    const field = makeField({ required: false, effectiveValue: "something" });
    const p = projectField(field, { action: "not_applicable" });
    expect(p.displayValue).toBe("");
    expect(p.reviewLabel).toBe("not_applicable");
    expect(p.resolvedLocally).toBe(true);
  });
});
