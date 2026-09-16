import { describe, expect, it } from 'vitest';
import {
  evaluateEligibility,
  matchesPattern,
  normalisePath,
  pathFromUrl,
  validateRulePattern,
  type PathRule,
} from '@buginbox/shared';

describe('path normalisation', () => {
  it('drops a trailing slash except at the root', () => {
    expect(normalisePath('/checkout/')).toBe('/checkout');
    expect(normalisePath('/checkout')).toBe('/checkout');
    expect(normalisePath('/')).toBe('/');
    expect(normalisePath('')).toBe('/');
  });

  it('ignores query strings and fragments', () => {
    expect(normalisePath('/pricing?token=secret')).toBe('/pricing');
    expect(normalisePath('/pricing#/checkout')).toBe('/pricing');
    expect(pathFromUrl('https://site.test/pricing?a=1#b')).toBe('/pricing');
  });

  it('rejects unparseable URLs', () => {
    expect(pathFromUrl('not a url')).toBeNull();
    expect(pathFromUrl('')).toBeNull();
  });
});

describe('rule matching', () => {
  it('treats an exact rule as exactly that page', () => {
    expect(matchesPattern('/checkout', '/checkout')).toBe(true);
    expect(matchesPattern('/checkout/', '/checkout')).toBe(true);
    expect(matchesPattern('/checkout/payment', '/checkout')).toBe(false);
  });

  it('treats /checkout/* as the section, including its root', () => {
    expect(matchesPattern('/checkout', '/checkout/*')).toBe(true);
    expect(matchesPattern('/checkout/', '/checkout/*')).toBe(true);
    expect(matchesPattern('/checkout/payment', '/checkout/*')).toBe(true);
    expect(matchesPattern('/checkout/payment/confirm', '/checkout/*')).toBe(true);
  });

  it('respects segment boundaries', () => {
    expect(matchesPattern('/checkoutfoo', '/checkout/*')).toBe(false);
    expect(matchesPattern('/checkout-2', '/checkout/*')).toBe(false);
  });

  it('matches everything with /*', () => {
    expect(matchesPattern('/', '/*')).toBe(true);
    expect(matchesPattern('/anything/at/all', '/*')).toBe(true);
  });

  it('is case sensitive, because URL paths are', () => {
    expect(matchesPattern('/Checkout', '/checkout')).toBe(false);
  });

  it('never looks at the fragment, so hash routes cannot be matched', () => {
    expect(matchesPattern('/#/checkout', '/checkout')).toBe(false);
    expect(matchesPattern('/#/checkout', '/')).toBe(true);
  });
});

describe('rule validation', () => {
  it('accepts the documented grammar', () => {
    for (const pattern of ['/', '/checkout', '/checkout/*', '/*', '/a/b/c']) {
      expect(validateRulePattern(pattern).valid, pattern).toBe(true);
    }
  });

  it('rejects everything else with a reason', () => {
    const bad = ['', 'checkout', '/check*out', '/a/*/b', '/a?b=1', '/a#b', ' /a', '/a '.repeat(2), '/'.padEnd(250, 'x')];
    for (const pattern of bad) {
      const result = validateRulePattern(pattern);
      expect(result.valid, pattern).toBe(false);
      expect(result.reason, pattern).toBeTruthy();
    }
  });
});

describe('eligibility', () => {
  const base = { projectStatus: 'active' as const, mobileEnabled: true, device: 'desktop' as const };

  it('includes every path when there are no include rules', () => {
    const result = evaluateEligibility({ ...base, path: '/anything', rules: [] });
    expect(result.eligible).toBe(true);
    expect(result.code).toBe('eligible');
  });

  it('lets any matching exclusion win over an include', () => {
    const rules: PathRule[] = [
      { kind: 'include', pattern: '/*' },
      { kind: 'exclude', pattern: '/checkout/*' },
    ];
    expect(evaluateEligibility({ ...base, path: '/checkout/payment', rules }).code).toBe('excluded');
    expect(evaluateEligibility({ ...base, path: '/pricing', rules }).eligible).toBe(true);
  });

  it('requires an include match when include rules exist', () => {
    const rules: PathRule[] = [{ kind: 'include', pattern: '/docs/*' }];
    expect(evaluateEligibility({ ...base, path: '/docs/getting-started', rules }).eligible).toBe(true);
    expect(evaluateEligibility({ ...base, path: '/pricing', rules }).code).toBe('not_included');
  });

  it('reports a paused project before anything else', () => {
    const result = evaluateEligibility({ ...base, projectStatus: 'paused', path: '/', rules: [] });
    expect(result.eligible).toBe(false);
    expect(result.code).toBe('project_paused');
  });

  it('honours the mobile switch', () => {
    const result = evaluateEligibility({ ...base, mobileEnabled: false, device: 'mobile', path: '/', rules: [] });
    expect(result.code).toBe('mobile_disabled');
  });

  it('ignores invalid rules and reports them', () => {
    const rules: PathRule[] = [
      { kind: 'exclude', pattern: 'not-a-rule' },
      { kind: 'exclude', pattern: '/admin/*' },
    ];
    const result = evaluateEligibility({ ...base, path: '/pricing', rules });
    expect(result.eligible).toBe(true);
    expect(result.ignoredRules).toHaveLength(1);
    expect(result.ignoredRules[0]?.pattern).toBe('not-a-rule');
  });
});
