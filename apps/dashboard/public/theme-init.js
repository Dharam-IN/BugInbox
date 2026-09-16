/*
 * Applies the saved colour theme before the first paint.
 *
 * Loaded synchronously from <head> rather than written inline, because the
 * dashboard is served under a strict `script-src 'self'` policy with no
 * 'unsafe-inline'. Kept deliberately tiny and dependency-free.
 *
 * The stylesheet works correctly without this file: it falls back to the
 * operating system preference. This only removes the flash of the wrong theme.
 */
(function () {
  var root = document.documentElement;
  var preference = 'system';

  try {
    var saved = window.localStorage.getItem('buginbox.theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved;
  } catch {
    /* storage blocked or unavailable: fall back to the system preference */
  }

  var dark = preference === 'dark';
  if (preference === 'system') {
    try {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      dark = false;
    }
  }

  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.style.colorScheme = dark ? 'dark' : 'light';
})();
