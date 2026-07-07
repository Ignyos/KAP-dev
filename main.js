function ensureManifestLink() {
  var isHttpLike = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  if (!isHttpLike) {
    return;
  }

  if (document.querySelector('link[rel="manifest"]')) {
    return;
  }

  var link = document.createElement('link');
  link.rel = 'manifest';
  link.href = './manifest.webmanifest';
  document.head.appendChild(link);
}

document.addEventListener('DOMContentLoaded', async function () {
  ensureManifestLink();
  try {
    await AppInit.initialize();
  } catch (error) {
    var message = error && error.message ? String(error.message) : 'Unknown startup error.';
    var isDbVersionError = error && error.name === 'VersionError';
    var details = isDbVersionError
      ? 'Startup blocked by cached script/DB version mismatch. Refresh the page (Ctrl+F5). If needed, clear site data and reopen.'
      : 'Startup failed. Open browser console for details.';

    console.error('App startup failed:', error);
    var root = document.getElementById('main-content');
    if (root) {
      root.innerHTML = '';
      var card = document.createElement('div');
      card.className = 'empty-state-card';
      var text = document.createElement('p');
      text.className = 'empty-state-text';
      text.textContent = details + ' (' + message + ')';
      card.appendChild(text);
      root.appendChild(card);
    }
    return;
  }

  var supportsServiceWorker = 'serviceWorker' in navigator;
  var isSupportedProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  if (supportsServiceWorker && isSupportedProtocol && window.isSecureContext) {
    navigator.serviceWorker.register('./service-worker.js').catch(function (error) {
      console.error('Service worker registration failed:', error);
    });
  }
});
