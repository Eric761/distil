import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "@/lib/api-client";
import { server } from "@/test/msw-server";
import { WakeGate } from "../WakeGate";

describe("WakeGate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children immediately when the API responds on the first ping", async () => {
    server.use(http.get("*/api/ping", () => HttpResponse.json({ ok: true })));

    render(
      <WakeGate enabled>
        <div>app content</div>
      </WakeGate>,
    );

    expect(await screen.findByText("app content")).toBeInTheDocument();
    expect(screen.queryByText(/Waking the server/i)).not.toBeInTheDocument();
  });

  it("shows the waking card after a short delay when the API is unreachable", async () => {
    vi.spyOn(apiClient, "pingApi").mockResolvedValue(false);

    render(
      <WakeGate enabled>
        <div>app content</div>
      </WakeGate>,
    );

    expect(screen.queryByText(/Waking the server/i)).not.toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByText(/Waking the server/i)).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
    expect(screen.queryByText("app content")).not.toBeInTheDocument();
  });
});
