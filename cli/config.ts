export function getCliConfig() {
  const baseUrl = process.env.VARIATION_VOTER_URL;
  const adminToken = process.env.VARIATION_VOTER_ADMIN_TOKEN;
  if (!baseUrl) throw new Error("Missing VARIATION_VOTER_URL env var");
  if (!adminToken) throw new Error("Missing VARIATION_VOTER_ADMIN_TOKEN env var");
  return { baseUrl: baseUrl.replace(/\/$/, ""), adminToken };
}
