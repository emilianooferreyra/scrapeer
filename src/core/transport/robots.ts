/**
 * robots.txt parsing and matching (RFC 9309), enough for ADR-024:
 * groups by product token, Allow/Disallow, `*` and `$`, longest match wins.
 */

export type RobotsRule = { readonly allow: boolean; readonly pattern: string };

/** The rules that apply to one product token, already selected from the file. */
export type RobotsRules = readonly RobotsRule[];

type Group = { agents: string[]; rules: RobotsRule[] };

function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      if (current === null || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    if (current === null) continue;
    if ((key === "allow" || key === "disallow") && value !== "") {
      current.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  return groups;
}

/** Selects the rules for `token`: groups naming it, or else the `*` groups. */
export function parseRobots(text: string, token: string): RobotsRules {
  const groups = parseGroups(text);
  const wanted = token.toLowerCase();
  const named = groups.filter((group) => group.agents.includes(wanted));
  const chosen = named.length > 0 ? named : groups.filter((group) => group.agents.includes("*"));
  return chosen.flatMap((group) => group.rules);
}

function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

/** `path` includes the query string. Longest matching pattern wins; Allow wins a tie. */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  if (path === "/robots.txt") return true;
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternMatches(rule.pattern, path)) continue;
    if (
      best === null ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best === null || best.allow;
}
