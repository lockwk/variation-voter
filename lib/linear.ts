// Thin Linear GraphQL client for KEV-207 "Capture feedback": posts a
// free-text feedback message from a voter as a Triage issue in Linear, so
// Kevin sees product feedback without leaving Linear.
//
// DORMANT by default: sendFeedbackToLinear() only runs when LINEAR_API_KEY is
// set. Callers (app/api/feedback/route.ts) must check isLinearConfigured()
// first and return a clean "not configured" response when it's false — this
// module never throws for a missing key, since a self-hoster who hasn't set
// one up shouldn't see the app crash over an optional feature.
//
// Team/project/Triage-state ids default to Kevin's own workspace so this
// works out of the box for the maintained instance; self-hosters can point
// feedback at their own Linear team via the LINEAR_* env vars below.
//
// Possible follow-up (out of scope here): also write each feedback submission
// to a DB table as a backup sink, independent of whether the Linear call
// succeeds — Kevin may want this later so feedback survives a Linear outage
// or a misconfigured key.

const LINEAR_API_URL = "https://api.linear.app/graphql";

const DEFAULT_TEAM_ID = "840376f3-2b14-4ad1-aef1-666b27375274";
const DEFAULT_PROJECT_ID = "89c3bc70-5434-412d-954a-faf94290b558";
const DEFAULT_TRIAGE_STATE_ID = "76599878-ae79-423e-85fb-24dcaf505703";
// KEV-207: the "Feedback" label, applied to every feedback issue so triage is
// filterable. Override via LINEAR_FEEDBACK_LABEL_ID for a different workspace.
const DEFAULT_FEEDBACK_LABEL_ID = "c04045b9-231a-4573-94da-55ce88a0ec8b";

const ISSUE_CREATE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
      }
    }
  }
`;

export interface FeedbackInput {
  /** The feedback message itself, verbatim. */
  message: string;
  /** The voter this feedback was submitted from, if any. */
  voterId?: string;
  /** The anonymous viewer id (vv_viewer cookie) that submitted it, if known. */
  viewerId?: string | null;
  /** The page path the feedback was submitted from, if provided by the client. */
  path?: string;
  /**
   * The origin of the install the feedback came from (e.g.
   * "https://example.com"). Because this endpoint is a cross-origin intake for
   * every install, voterId is only meaningful relative to this origin — not the
   * maintainer's PUBLIC_BASE_URL. Used to build a correct Voter deep-link.
   */
  origin?: string;
}

/** True when LINEAR_API_KEY is set — the single switch this feature is gated on. */
export function isLinearConfigured(): boolean {
  return !!process.env.LINEAR_API_KEY?.trim();
}

/** Short summary used as the issue title — the first line, capped to ~60 chars. */
function summarize(message: string): string {
  const firstLine = message.split("\n", 1)[0]?.trim() ?? "";
  const source = firstLine || message.trim();
  if (!source) return "Feedback: (empty message)";
  return source.length > 60 ? `Feedback: ${source.slice(0, 60)}…` : `Feedback: ${source}`;
}

function buildDescription({ message, voterId, viewerId, path, origin }: FeedbackInput): string {
  // Prefer the submitting install's own origin so the link points at the
  // deployment that actually hosts this voter; fall back to PUBLIC_BASE_URL
  // (correct only for same-origin feedback) and finally to an unlinked id.
  const baseUrl = origin?.trim() || process.env.PUBLIC_BASE_URL?.trim();
  const voterLine = voterId
    ? baseUrl
      ? `- Voter: [${voterId}](${baseUrl}/v/${voterId})`
      : `- Voter: ${voterId}`
    : null;

  const metadata = [
    voterLine,
    `- Viewer: ${viewerId ?? "unknown"}`,
    path ? `- Path: ${path}` : null,
    `- Submitted: ${new Date().toISOString()}`,
  ].filter((line): line is string => line !== null);

  return [message.trim(), "", "---", ...metadata].join("\n");
}

/**
 * Creates a Triage issue in Linear for a piece of submitted feedback. Callers
 * must check isLinearConfigured() first — this throws if LINEAR_API_KEY is
 * missing, rather than silently no-op'ing, so a caller can't accidentally
 * "succeed" without actually configuring it.
 */
export async function sendFeedbackToLinear(input: FeedbackInput): Promise<void> {
  const apiKey = process.env.LINEAR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("lib/linear: LINEAR_API_KEY is not set. Callers must check isLinearConfigured() first.");
  }

  const teamId = process.env.LINEAR_TEAM_ID?.trim() || DEFAULT_TEAM_ID;
  // The default project/state/label ids live in the maintainer's workspace, so
  // they only make sense when we're posting to the default team. A self-hoster
  // who points LINEAR_TEAM_ID at their own team gets those cross-workspace
  // defaults dropped (Linear would reject them) and can opt back in per-field
  // via the LINEAR_* env vars. Undefined fields are omitted from the mutation
  // input, letting Linear apply the team's own defaults.
  const usingDefaultTeam = teamId === DEFAULT_TEAM_ID;
  const projectId = process.env.LINEAR_PROJECT_ID?.trim() || (usingDefaultTeam ? DEFAULT_PROJECT_ID : undefined);
  const stateId = process.env.LINEAR_TRIAGE_STATE_ID?.trim() || (usingDefaultTeam ? DEFAULT_TRIAGE_STATE_ID : undefined);
  const labelId = process.env.LINEAR_FEEDBACK_LABEL_ID?.trim() || (usingDefaultTeam ? DEFAULT_FEEDBACK_LABEL_ID : undefined);

  let response: Response;
  try {
    response = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        // Linear personal API keys are sent as the raw key value, NOT
        // prefixed with "Bearer" (unlike most bearer-token APIs).
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: ISSUE_CREATE_MUTATION,
        variables: {
          input: {
            teamId,
            ...(projectId ? { projectId } : {}),
            ...(stateId ? { stateId } : {}),
            ...(labelId ? { labelIds: [labelId] } : {}),
            title: summarize(input.message),
            description: buildDescription(input),
          },
        },
      }),
    });
  } catch (error) {
    throw new Error(`lib/linear: network error calling Linear API: ${(error as Error).message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`lib/linear: Linear API responded ${response.status}: ${body}`);
  }

  const json = (await response.json()) as {
    data?: { issueCreate?: { success: boolean; issue?: { id: string; identifier: string } } };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(`lib/linear: Linear API returned errors: ${json.errors.map((e) => e.message).join("; ")}`);
  }

  if (!json.data?.issueCreate?.success) {
    throw new Error("lib/linear: issueCreate did not report success");
  }
}
