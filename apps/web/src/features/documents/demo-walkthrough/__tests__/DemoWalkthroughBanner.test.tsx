import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { DemoWalkthroughBanner } from "../DemoWalkthroughBanner";

describe("DemoWalkthroughBanner", () => {
  it("renders a compact prompt with start and dismiss actions", () => {
    renderWithProviders(
      <DemoWalkthroughBanner onStart={vi.fn()} onDismiss={vi.fn()} />,
      { route: "/documents", path: "*" },
    );

    expect(screen.getByRole("heading", { name: /see review → approve → query in action/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start walkthrough/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /not now/i })).toBeInTheDocument();
  });

  it("calls onStart when the guide is opened", async () => {
    const onStart = vi.fn();
    renderWithProviders(
      <DemoWalkthroughBanner onStart={onStart} onDismiss={vi.fn()} />,
      { route: "/documents", path: "*" },
    );

    await userEvent.click(screen.getByRole("button", { name: /start walkthrough/i }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when dismissed", async () => {
    const onDismiss = vi.fn();
    renderWithProviders(
      <DemoWalkthroughBanner onStart={vi.fn()} onDismiss={onDismiss} />,
      { route: "/documents", path: "*" },
    );

    await userEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
