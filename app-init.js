var AppInit = {
  isDevHost: function () {
    var hostname = String(window.location && window.location.hostname || '').toLowerCase();
    hostname = hostname.replace(/\.$/, '');
    if (hostname.indexOf('www.') === 0) {
      hostname = hostname.slice(4);
    }
    return hostname === 'kap-dev.ignyos.com';
  },
  applyDevHostGuards: function () {
    if (!AppInit.isDevHost()) {
      return;
    }

    document.body.classList.add('is-dev-host');

    var banner = document.createElement('div');
    banner.className = 'dev-host-banner';
    banner.textContent = 'Developer Preview: kap-dev.ignyos.com';
    document.body.insertBefore(banner, document.body.firstChild);

    var robotsMeta = document.createElement('meta');
    robotsMeta.name = 'robots';
    robotsMeta.content = 'noindex, nofollow, noarchive';
    document.head.appendChild(robotsMeta);
  },
  initialize: async function () {
    AppInit.applyDevHostGuards();
    if (window.KaPAppConfig && typeof window.KaPAppConfig.load === 'function') {
      await window.KaPAppConfig.load();
    }
    window.KaPSettings.applyTheme(window.KaPSettings.get(window.KaPSettings.KEYS.THEME));
    window.KaPSettings.applyTextSize(window.KaPSettings.get(window.KaPSettings.KEYS.TEXT_SIZE));
    await window.KaPDB.open();
    if (window.KaPGoogleDriveSyncService && typeof window.KaPGoogleDriveSyncService.initializeAutoSync === 'function') {
      window.KaPGoogleDriveSyncService.initializeAutoSync();
    }
    await window.KaPMainPage.initialize();
  }
};
