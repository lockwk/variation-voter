import { describe, expect, it, afterEach, vi } from "vitest";
import { isLinearConfigured, sendFeedbackToLinear } from "@/lib/linear";

// This suite mocks global fetch end-to-end — it must never hit the real
// Linear API.

function mockFetchOk(handler: (url: string, init?: RequestInit) => unknown) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = handler(url, init);
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  });
}

describe("isLinearConfigured", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is false when LINEAR_API_KEY is unset", () => {
    vi.stubEnv("LINEAR_API_KEY", undefined);
    expect(isLinearConfigured()).toBe(false);
  });

  it("is false when LINEAR_API_KEY is blank", () => {
    vi.stubEnv("LINEAR_API_KEY", "   ");
    expect(isLinearConfigured()).toBe(false);
  });

  it("is true when LINEAR_API_KEY is set", () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_123");
    expect(isLinearConfigured()).toBe(true);
  });
});

describe("sendFeedbackToLinear", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("throws if called while unconfigured", async () => {
    vi.stubEnv("LINEAR_API_KEY", undefined);
    await expect(sendFeedbackToLinear({ message: "hi" })).rejects.toThrow(/LINEAR_API_KEY/);
  });

  it("sends the raw API key (not Bearer-prefixed) and the right issueCreate input", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_secret");
    vi.stubEnv("LINEAR_TEAM_ID", undefined);
    vi.stubEnv("LINEAR_PROJECT_ID", undefined);
    vi.stubEnv("LINEAR_TRIAGE_STATE_ID", undefined);
    vi.stubEnv("LINEAR_FEEDBACK_LABEL_ID", undefined);
    vi.stubEnv("PUBLIC_BASE_URL", "https://vote.example.com");

    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { issueCreate: { success: true, issue: { id: "i1", identifier: "KEV-999" } } } }),
        text: async () => "",
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendFeedbackToLinear({
      message: "Please add dark mode toggle\nmore detail here",
      voterId: "voter-1",
      viewerId: "viewer-1",
      path: "/v/voter-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.linear.app/graphql");

    // Raw key, no "Bearer " prefix — Linear personal API keys are sent as-is.
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("lin_api_secret");

    const body = JSON.parse(capturedInit!.body as string);
    expect(body.query).toMatch(/issueCreate/);
    expect(body.variables.input.teamId).toBe("840376f3-2b14-4ad1-aef1-666b27375274");
    expect(body.variables.input.projectId).toBe("89c3bc70-5434-412d-954a-faf94290b558");
    expect(body.variables.input.stateId).toBe("76599878-ae79-423e-85fb-24dcaf505703");
    expect(body.variables.input.labelIds).toEqual(["c04045b9-231a-4573-94da-55ce88a0ec8b"]);
    expect(body.variables.input.title).toBe("Feedback: Please add dark mode toggle");
    expect(body.variables.input.description).toContain("Please add dark mode toggle\nmore detail here");
    expect(body.variables.input.description).toContain("[voter-1](https://vote.example.com/v/voter-1)");
    expect(body.variables.input.description).toContain("Viewer: viewer-1");
    expect(body.variables.input.description).toContain("Path: /v/voter-1");
  });

  it("honors LINEAR_TEAM_ID/LINEAR_PROJECT_ID/LINEAR_TRIAGE_STATE_ID overrides", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_secret");
    vi.stubEnv("LINEAR_TEAM_ID", "team-custom");
    vi.stubEnv("LINEAR_PROJECT_ID", "project-custom");
    vi.stubEnv("LINEAR_TRIAGE_STATE_ID", "state-custom");
    vi.stubEnv("LINEAR_FEEDBACK_LABEL_ID", "label-custom");

    const fetchMock = mockFetchOk(() => ({ data: { issueCreate: { success: true } } }));
    vi.stubGlobal("fetch", fetchMock);

    await sendFeedbackToLinear({ message: "hello" });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.variables.input.teamId).toBe("team-custom");
    expect(body.variables.input.projectId).toBe("project-custom");
    expect(body.variables.input.stateId).toBe("state-custom");
    expect(body.variables.input.labelIds).toEqual(["label-custom"]);
  });

  it("drops the maintainer's project/state/label defaults when a custom team is set", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_secret");
    vi.stubEnv("LINEAR_TEAM_ID", "team-custom");
    vi.stubEnv("LINEAR_PROJECT_ID", undefined);
    vi.stubEnv("LINEAR_TRIAGE_STATE_ID", undefined);
    vi.stubEnv("LINEAR_FEEDBACK_LABEL_ID", undefined);

    const fetchMock = mockFetchOk(() => ({ data: { issueCreate: { success: true } } }));
    vi.stubGlobal("fetch", fetchMock);

    await sendFeedbackToLinear({ message: "hello" });

    const [, init] = fetchMock.mock.calls[0];
    const input = JSON.parse((init as RequestInit).body as string).variables.input;
    // Only the custom team is sent; the cross-workspace defaults are omitted so
    // Linear applies the team's own defaults rather than rejecting them.
    expect(input.teamId).toBe("team-custom");
    expect(input).not.toHaveProperty("projectId");
    expect(input).not.toHaveProperty("stateId");
    expect(input).not.toHaveProperty("labelIds");
  });

  it("builds the Voter link from the submitting origin, not PUBLIC_BASE_URL", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_secret");
    vi.stubEnv("PUBLIC_BASE_URL", "https://maintainer.example.com");

    const fetchMock = mockFetchOk(() => ({ data: { issueCreate: { success: true } } }));
    vi.stubGlobal("fetch", fetchMock);

    await sendFeedbackToLinear({ message: "hi", voterId: "voter-9", origin: "https://selfhost.example.org" });

    const [, init] = fetchMock.mock.calls[0];
    const description = JSON.parse((init as RequestInit).body as string).variables.input.description;
    expect(description).toContain("[voter-9](https://selfhost.example.org/v/voter-9)");
    expect(description).not.toContain("maintainer.example.com");
  });

  it("throws when the Linear API responds non-OK", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "server error" }) as Response)
    );

    await expect(sendFeedbackToLinear({ message: "hello" })).rejects.toThrow(/500/);
  });

  it("throws when issueCreate.success is false", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_secret");
    const fetchMock = mockFetchOk(() => ({ data: { issueCreate: { success: false } } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendFeedbackToLinear({ message: "hello" })).rejects.toThrow(/success/);
  });

  it("throws when the GraphQL response carries errors", async () => {
    vi.stubEnv("LINEAR_API_KEY", "lin_api_secret");
    const fetchMock = mockFetchOk(() => ({ errors: [{ message: "field X unknown" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendFeedbackToLinear({ message: "hello" })).rejects.toThrow(/field X unknown/);
  });
});
