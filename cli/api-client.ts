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

export function listVotersRequest() {
  return adminFetch("/api/admin/voters", { method: "GET" });
}

export function closeVoterRequest(voterId: string) {
  return adminFetch(`/api/admin/voters/${voterId}/close`, { method: "POST" });
}

export function deleteVoterRequest(voterId: string) {
  return adminFetch(`/api/admin/voters/${voterId}`, { method: "DELETE" });
}
