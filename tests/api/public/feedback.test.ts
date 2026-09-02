import { describe, expect, it, vi, afterEach } from "vitest";
import { OPTIONS as optionsFeedback, POST as postFeedback } from "@/app/api/feedback/route";

// This route's own logic (validation -> configured check -> call Linear ->
// map the outcome to a status code) is what's under test here — the actual
// Linear call is covered in isolation by tests/lib/linear.test.ts, so it's
// mocked out here rather than re-verified.
vi.mock("@/lib/linear", () => ({
  isLinearConfigured: vi.fn(),
  sendFeedbackToLinear: vi.fn(),
}));

import { isLinearConfigured, sendFeedbackToLinear } from "@/lib/linear";

function feedbackRequest(body: unknown, viewerId?: string) {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(viewerId ? { cookie: `vv_viewer=${viewerId}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/feedback", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns 400 for an invalid body", async () => {
    vi.mocked(isLinearConfigured).mockReturnValue(true);

    const response = await postFeedback(feedbackRequest({ message: "" }));

    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(sendFeedbackToLinear).not.toHaveBeenCalled();
  });

  it("returns 400 when message is missing entirely", async () => {
    vi.mocked(isLinearConfigured).mockReturnValue(true);

    const response = await postFeedback(feedbackRequest({}));

    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns 503 when Linear isn't configured, without calling sendFeedbackToLinear", async () => {
    vi.mocked(isLinearConfigured).mockReturnValue(false);

    const response = await postFeedback(feedbackRequest({ message: "Add dark mode" }));

    expect(response.status).toBe(503);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(body.error).toMatch(/not configured/i);
    expect(sendFeedbackToLinear).not.toHaveBeenCalled();
  });

  it("creates the issue and returns 201 on success, forwarding voterId/viewerId/path", async () => {
    vi.mocked(isLinearConfigured).mockReturnValue(true);
    vi.mocked(sendFeedbackToLinear).mockResolvedValue(undefined);

    const response = await postFeedback(
      feedbackRequest(
        { message: "Add dark mode", voterId: "voter-1", path: "/v/voter-1", origin: "https://selfhost.example.org" },
        "viewer-1"
      )
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(body).toEqual({ ok: true });
    expect(sendFeedbackToLinear).toHaveBeenCalledWith({
      message: "Add dark mode",
      voterId: "voter-1",
      viewerId: "viewer-1",
      path: "/v/voter-1",
      origin: "https://selfhost.example.org",
    });
  });

  it("returns 502 when the Linear call fails, without leaking the error detail to the client", async () => {
    vi.mocked(isLinearConfigured).mockReturnValue(true);
    vi.mocked(sendFeedbackToLinear).mockRejectedValue(new Error("Linear API responded 500: boom"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await postFeedback(feedbackRequest({ message: "Add dark mode" }));

    expect(response.status).toBe(502);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(body.error).toBe("Could not send feedback");
    expect(body.error).not.toMatch(/boom/);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

describe("OPTIONS /api/feedback", () => {
  it("returns a 204 preflight response with CORS headers", async () => {
    const response = await optionsFeedback();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("content-type");
  });
});
