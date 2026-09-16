/*
 * Fixture bootstrap.
 *
 * The demo project key is not baked into these files. Open any fixture page
 * once with ?key=bi_pub_... and it is remembered for this origin, which keeps
 * generated files out of the repository.
 */
(function () {
  var STORAGE_KEY = 'buginbox-fixture-key';
  var API_KEY = 'buginbox-fixture-api';

  function readParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(name);
    } catch {
      return null;
    }
  }

  function remember(key, value) {
    try {
      if (value) window.localStorage.setItem(key, value);
    } catch {
      /* private mode: fall back to this page load only */
    }
  }

  function recall(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  var key = readParam('key') || recall(STORAGE_KEY) || '';
  var api = readParam('api') || recall(API_KEY) || 'http://localhost:58080';
  remember(STORAGE_KEY, key);
  remember(API_KEY, api);

  function warn() {
    var banner = document.createElement('p');
    banner.className = 'banner';
    banner.textContent =
      'This fixture has no BugInbox project key yet. Reload with ?key=bi_pub_... (the demo key is printed by npm run seed).';
    var main = document.querySelector('main');
    if (main) main.insertBefore(banner, main.firstChild);
  }

  window.BUGINBOX_FIXTURE = {
    key: key,
    api: api,

    /**
     * Load the widget bundle.
     * `manual: true` omits the data attribute, so the page controls init()
     * itself - this is the "existing custom button" integration.
     */
    load: function (options) {
      options = options || {};
      if (!key) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', warn, { once: true });
        } else {
          warn();
        }
        return Promise.resolve(false);
      }
      return new Promise(function (resolve) {
        var script = document.createElement('script');
        script.src = api + '/widget/v1/buginbox.js';
        script.defer = true;
        if (!options.manual) {
          script.dataset.buginboxKey = key;
          if (options.pageContext) script.dataset.buginboxPageContext = options.pageContext;
        }
        script.onload = function () {
          resolve(true);
        };
        script.onerror = function () {
          // BugInbox being unreachable must leave the host page working.
          resolve(false);
        };
        document.head.appendChild(script);
      });
    },
  };
})();
