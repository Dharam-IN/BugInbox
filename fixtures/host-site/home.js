(function () {
  var clicks = 0;
  document.getElementById('host-counter').addEventListener('click', function () {
    clicks += 1;
    this.textContent = 'Host clicks: ' + clicks;
  });
  document.getElementById('host-alert').addEventListener('click', function () {
    document.getElementById('host-message').textContent = 'Host message: the page still works';
  });

  // The standard snippet: the bundle starts itself from its data attribute.
  window.BUGINBOX_FIXTURE.load();
})();
