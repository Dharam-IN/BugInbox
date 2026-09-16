(function () {
  var clicks = 0;
  document.getElementById('host-counter').addEventListener('click', function () {
    clicks += 1;
    this.textContent = 'Host clicks: ' + clicks;
    document.getElementById('host-status').textContent = 'Host page ready — clicks: ' + clicks;
  });

  // Deliberately pointed at a port nothing is listening on.
  var script = document.createElement('script');
  script.src = 'http://127.0.0.1:59999/widget/v1/buginbox.js';
  script.defer = true;
  script.dataset.buginboxKey = 'bi_pub_00000000000000000000000000000000';
  script.onerror = function () {
    document.getElementById('host-status').textContent =
      'Host page ready — BugInbox failed to load, page unaffected';
  };
  document.head.appendChild(script);
})();
