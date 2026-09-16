/**
 * Page-eligibility matching shared by the widget bundle and the dashboard's
 * rule tester, so both always agree.
 *
 * Rule grammar (deliberately tiny - no regular expressions):
 *   "/checkout"    exact match on the normalised path
 *   "/checkout/*"  the /checkout section: /checkout itself and anything below it
 *   "/*"           every path
 *
 * Normalisation, applied to both the page path and the rule pattern:
 *   - only the URL path is considered; query strings and fragments are ignored
 *   - a trailing slash is removed, except for the root path "/"
 *   - matching is case sensitive, because URL paths are case sensitive
 *   - percent-encoding is compared as written; "/a b" and "/a%20b" are different
 *
 * Hash routers: the fragment is never inspected, so "#/checkout" is just "/".
 * Hash-router apps should use manual trigger mode plus the host API instead.
 */

export type RuleKind = 'include' | 'exclude';

export interface PathRule {
  kind: RuleKind;
  pattern: string;
}

export const MAX_RULE_LENGTH = 200;

export interface RuleValidation {
  valid: boolean;
  reason?: string;
}

/** Validate a single rule pattern. Invalid rules are rejected on save and ignored at runtime. */
export function validateRulePattern(pattern: string): RuleValidation {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    return { valid: false, reason: 'Rule must not be empty.' };
  }
  if (pattern.length > MAX_RULE_LENGTH) {
    return { valid: false, reason: `Rule must be at most ${MAX_RULE_LENGTH} characters.` };
  }
  if (pattern !== pattern.trim()) {
    return { valid: false, reason: 'Rule must not start or end with whitespace.' };
  }
  if (/\s/.test(pattern)) {
    return { valid: false, reason: 'Rule must not contain whitespace.' };
  }
  if (!pattern.startsWith('/')) {
    return { valid: false, reason: 'Rule must start with "/".' };
  }
  if (pattern.includes('?') || pattern.includes('#')) {
    return { valid: false, reason: 'Rule must not contain "?" or "#"; query strings and fragments are ignored.' };
  }
  const stars = pattern.split('*').length - 1;
  if (stars > 1) {
    return { valid: false, reason: 'Rule may contain at most one "*".' };
  }
  if (stars === 1 && !pattern.endsWith('/*')) {
    return { valid: false, reason: 'A "*" is only allowed as a trailing "/*".' };
  }
  return { valid: true };
}

/** Normalise a path: drop a trailing slash unless the path is the root. */
export function normalisePath(path: string): string {
  let p = typeof path === 'string' && path.length > 0 ? path : '/';
  if (!p.startsWith('/')) p = `/${p}`;
  const q = p.search(/[?#]/);
  if (q >= 0) p = p.slice(0, q);
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/** Extract the normalised path from a full URL or a bare path. */
export function pathFromUrl(url: string): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null;
  const raw = url.trim();
  if (raw.startsWith('/')) return normalisePath(raw);
  try {
    return normalisePath(new URL(raw).pathname);
  } catch {
    return null;
  }
}

/** Does a normalised path match a single (already validated) pattern? */
export function matchesPattern(path: string, pattern: string): boolean {
  if (!validateRulePattern(pattern).valid) return false;
  const p = normalisePath(path);
  if (pattern.endsWith('/*')) {
    // "/checkout/*" covers the section root "/checkout" and everything under it.
    // "/*" degenerates to a base of "" and therefore matches every path.
    const base = normalisePath(pattern.slice(0, -2) || '/');
    if (base === '/') return true;
    return p === base || p.startsWith(`${base}/`);
  }
  return p === normalisePath(pattern);
}

export type DeviceKind = 'desktop' | 'mobile';

export interface EligibilityInput {
  projectStatus: 'active' | 'paused';
  mobileEnabled: boolean;
  device: DeviceKind;
  path: string;
  rules: PathRule[];
}

export type EligibilityCode =
  | 'eligible'
  | 'project_paused'
  | 'mobile_disabled'
  | 'excluded'
  | 'not_included'
  | 'invalid_path';

export interface EligibilityResult {
  eligible: boolean;
  code: EligibilityCode;
  reason: string;
  /** The rule that decided the outcome, when one did. */
  matchedRule?: PathRule;
  ignoredRules: PathRule[];
}

/**
 * Eligibility = project active AND device allowed AND an include condition is
 * satisfied AND no exclusion matched. An empty include list means all paths,
 * and any matching exclusion wins over any include.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const ignoredRules = input.rules.filter((r) => !validateRulePattern(r.pattern).valid);
  const usable = input.rules.filter((r) => validateRulePattern(r.pattern).valid);

  if (input.projectStatus !== 'active') {
    return { eligible: false, code: 'project_paused', reason: 'The project is paused.', ignoredRules };
  }
  if (input.device === 'mobile' && !input.mobileEnabled) {
    return { eligible: false, code: 'mobile_disabled', reason: 'Mobile visibility is turned off.', ignoredRules };
  }

  const path = pathFromUrl(input.path);
  if (path === null) {
    return { eligible: false, code: 'invalid_path', reason: 'The page URL could not be parsed.', ignoredRules };
  }

  const excluded = usable.find((r) => r.kind === 'exclude' && matchesPattern(path, r.pattern));
  if (excluded) {
    return {
      eligible: false,
      code: 'excluded',
      reason: `Excluded by rule "${excluded.pattern}".`,
      matchedRule: excluded,
      ignoredRules,
    };
  }

  const includes = usable.filter((r) => r.kind === 'include');
  if (includes.length === 0) {
    return { eligible: true, code: 'eligible', reason: 'No include rules, so every path is included.', ignoredRules };
  }
  const included = includes.find((r) => matchesPattern(path, r.pattern));
  if (!included) {
    return {
      eligible: false,
      code: 'not_included',
      reason: 'No include rule matched this path.',
      ignoredRules,
    };
  }
  return {
    eligible: true,
    code: 'eligible',
    reason: `Included by rule "${included.pattern}".`,
    matchedRule: included,
    ignoredRules,
  };
}
