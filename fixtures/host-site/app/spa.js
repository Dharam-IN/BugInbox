/* A minimal SPA router, deliberately using pushState, replaceState and popstate. */
(function () {
  var titles = {
    '/app/': 'Overview',
    '/app/reports': 'Reports',
    '/app/settings': 'Settings',
    '/admin/billing': 'Admin billing',
  };

  function render() {
    var path = window.location.pathname;
    document.getElementById('route-title').textContent = titles[path] || 'Not found';
    document.getElementById('route-status').textContent = 'route: ' + path;
    // Route changes also refresh the page context the host hands to BugInbox.
    if (window.BugInbox) window.BugInbox.setPageContext('SPA route ' + path);
  }

  document.querySelectorAll('[data-route]').forEach(function (button) {
    button.addEventListener('click', function () {
      history.pushState({}, '', button.dataset.route);
      render();
    });
  });

  window.addEventListener('popstate', render);

  // The widget must also notice replaceState, which routers use for redirects.
  document.getElementById('report-button').addEventListener('click', function () {
    if (window.BugInbox) window.BugInbox.open();
  });
  document.getElementById('show-button').addEventListener('click', function () {
    if (window.BugInbox) window.BugInbox.show();
  });
  document.getElementById('hide-button').addEventListener('click', function () {
    if (window.BugInbox) window.BugInbox.hide();
  });
  document.getElementById('close-button').addEventListener('click', function () {
    if (window.BugInbox) window.BugInbox.close();
  });
  document.getElementById('destroy-button').addEventListener('click', function () {
    if (window.BugInbox) window.BugInbox.destroy();
  });
  document.getElementById('init-button').addEventListener('click', startWidget);

  function startWidget() {
    if (!window.BugInbox) return;
    window.BugInbox.init({
      projectKey: window.BUGINBOX_FIXTURE.key,
      apiBaseUrl: window.BUGINBOX_FIXTURE.api,
      pageContext: 'SPA route ' + window.location.pathname,
    });
  }

  document.getElementById('signin-button').addEventListener('click', function () {
    document.getElementById('auth-status').textContent = 'Signed in';
    startWidget();
  });
  document.getElementById('signout-button').addEventListener('click', function () {
    document.getElementById('auth-status').textContent = 'Signed out';
    if (window.BugInbox) window.BugInbox.destroy();
  });

  // Manual mode: load the bundle without a data attribute, then init ourselves.
  window.BUGINBOX_FIXTURE.load({ manual: true }).then(function (loaded) {
    if (loaded) startWidget();
  });

  render();
  setInterval(function () {
    var state = window.BugInbox ? window.BugInbox.state() : null;
    document.getElementById('widget-state').textContent = state
      ? 'initialised=' + state.initialised + ' eligible=' + state.eligible + ' launcher=' + state.launcherVisible + ' form=' + state.formOpen + ' — ' + state.reason
      : 'BugInbox is not loaded.';
  }, 300);
})();
