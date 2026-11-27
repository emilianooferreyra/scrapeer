/** Query parameters that carry credentials and must never be logged or persisted. Lowercase. */
export const CREDENTIAL_PARAMS: readonly string[] = [
  "key",
  "client_id",
  "client_secret",
  "api_key",
  "apikey",
  "access_token",
  "token",
];

const CREDENTIAL_NAMES: ReadonlySet<string> = new Set(CREDENTIAL_PARAMS);

/** Parameter names are compared case-insensitively: `API_KEY` is as secret as `api_key`. */
function isCredentialParam(name: string): boolean {
  return CREDENTIAL_NAMES.has(name.toLowerCase());
}

/** True when the URL carries userinfo or a credential parameter. */
export function hasCredentials(url: string): boolean {
  const parsed = new URL(url);
  if (parsed.username !== "" || parsed.password !== "") return true;
  return [...parsed.searchParams.keys()].some(isCredentialParam);
}

/** The URL without userinfo or credential parameters, safe for logs, errors and provenance. */
export function redactUrl(url: URL): string {
  const copy = new URL(url);
  copy.username = "";
  copy.password = "";
  for (const name of new Set(copy.searchParams.keys())) {
    if (isCredentialParam(name)) copy.searchParams.delete(name);
  }
  return copy.href;
}
