/** Query parameters that carry credentials and must never be logged or persisted. */
export const CREDENTIAL_PARAMS: readonly string[] = [
  "key",
  "client_id",
  "client_secret",
  "api_key",
  "apikey",
  "access_token",
  "token",
];

export function hasCredentials(url: string): boolean {
  const params = new URL(url).searchParams;
  return CREDENTIAL_PARAMS.some((name) => params.has(name));
}

/** The URL without credential parameters, safe for logs, errors and provenance. */
export function redactUrl(url: URL): string {
  const copy = new URL(url);
  for (const name of CREDENTIAL_PARAMS) copy.searchParams.delete(name);
  return copy.href;
}
