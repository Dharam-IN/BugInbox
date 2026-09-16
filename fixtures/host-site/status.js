/* Shared status poller for the fixture pages. */
(function () {
  function render() {
    var node = document.getElementById('widget-state');
    if (!node) return;
    var state = window.BugInbox ? window.BugInbox.state() : null;
    node.textContent = state
      ? 'initialised=' +
        state.initialised +
        ' eligible=' +
        state.eligible +
        ' launcher=' +
        state.launcherVisible +
        ' formOpen=' +
        state.formOpen +
        ' — ' +
        state.reason
      : 'BugInbox is not loaded on this page.';
  }
  setInterval(render, 250);
  render();
})();
