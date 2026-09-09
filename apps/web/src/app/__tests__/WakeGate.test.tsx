import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/msw-server";
import { WakeGate } from "../WakeGate";

describe("WakeGate", () => {
  it("renders children once the API responds 200 on the first ping", async () => {
    server.use(http.get("*/api/ping", () => HttpResponse.json({ ok: true })));

    render(
      <WakeGate enabled>
        <div>app content</div>
      </WakeGate>,
    );

    expect(await screen.findByText("app content")).toBeInTheDocument();
  });

  it("shows a branded waking message while the API is unreachable, then enters", async () => {
    let warm = false;
    server.use(
      http.get("*/api/ping", () => {
        if (!warm) return HttpResponse.error();
        return HttpResponse.json({ ok: true });
      }),
    );

    render(
      <WakeGate enabled>
        <div>app content</div>
      </WakeGate>,
    );

    // First ping fails -> the "waking the server" copy is shown, not the app.
    expect(await screen.findByText(/Waking the server/i)).toBeInTheDocument();
    expect(screen.queryByText("app content")).not.toBeInTheDocument();

    // Backend comes up; the gate polls and lets us in.
    warm = true;
    await waitFor(() => expect(screen.getByText("app content")).toBeInTheDocument(), {
      timeout: 5000,
    });
  });
});
