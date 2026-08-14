import { getCliConfig } from "./config";

async function adminFetch(path: string, init: RequestInit = {}) {
  const { baseUrl, adminToken } = getCliConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}): ${body}`);
  }
  return response.json();
}

export function createVoterRequest(input: { title: string; description?: string; expiresInDays?: number }) {
  return adminFetch("/api/admin/voters", { method: "POST", body: JSON.stringify(input) });
}

export function addVariationRequest(
  voterId: string,
  input: { title: string; description?: string; kind: "url" | "image" | "embed"; src: string }
) {
  return adminFetch(`/api/admin/voters/${voterId}/variations`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Uploads a zipped app bundle as a new "app" variation. Sent as
 * `multipart/form-data` (not JSON like the other request helpers above), so
 * it can't go through `adminFetch` — that always forces a JSON content type,
 * which would clobber the multipart boundary. It still reuses the same
 * baseUrl + admin bearer-token mechanism from `getCliConfig`.
 */
export async function addAppRequest(
  voterId: string,
  input: { title: string; description?: string; zipBytes: Uint8Array }
) {
  const { baseUrl, adminToken } = getCliConfig();
  const form = new FormData();
  form.set("title", input.title);
  if (input.description) form.set("description", input.description);
  form.set("bundle", new Blob([input.zipBytes as BlobPart], { type: "application/zip" }), "bundle.zip");

  const response = await fetch(`${baseUrl}/api/admin/voters/${voterId}/apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: form,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}): ${body}`);
  }
  return response.json();
}

export function listVotersRequest() {
  return adminFetch("/api/admin/voters", { method: "GET" });
}

export function closeVoterRequest(voterId: string) {
  return adminFetch(`/api/admin/voters/${voterId}/close`, { method: "POST" });
}

export function deleteVoterRequest(voterId: string) {
  return adminFetch(`/api/admin/voters/${voterId}`, { method: "DELETE" });
}
