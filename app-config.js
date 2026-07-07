(function () {
  var DEFAULT_SETTINGS = {
    googleDriveSync: {
      projectName: 'Ignyos KAP Sync POC',
      clientId: '',
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'openid',
        'email',
        'profile'
      ],
      environment: 'dev'
    }
  };

  var state = {
    loaded: false,
    loadingPromise: null,
    settings: clone(DEFAULT_SETTINGS),
    loadError: null
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function merge(base, incoming) {
    if (!incoming || typeof incoming !== 'object') {
      return clone(base);
    }

    var output = clone(base);
    Object.keys(incoming).forEach(function (key) {
      var incomingValue = incoming[key];
      if (incomingValue && typeof incomingValue === 'object' && !Array.isArray(incomingValue) && output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])) {
        output[key] = merge(output[key], incomingValue);
      } else {
        output[key] = incomingValue;
      }
    });

    return output;
  }

  async function load() {
    if (state.loaded) {
      return state.settings;
    }

    if (state.loadingPromise) {
      return state.loadingPromise;
    }

    state.loadingPromise = (async function () {
      try {
        if (window.location && window.location.protocol === 'file:') {
          throw new Error('appsettings.json cannot be loaded from file://. Run the app through http(s).');
        }

        var response = await fetch('./appsettings.json', { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error('Unable to load appsettings.json.');
        }

        var payload = await response.json();
        state.settings = merge(DEFAULT_SETTINGS, payload);
        state.loadError = null;
      } catch (error) {
        state.settings = clone(DEFAULT_SETTINGS);
        state.loadError = error && error.message ? String(error.message) : 'Unknown appsettings load error.';
      } finally {
        state.loaded = true;
      }

      window.KaPAppSettings = state.settings;
      window.KaPAppSettingsLoadError = state.loadError;
      return state.settings;
    })();

    return state.loadingPromise;
  }

  function getSettings() {
    return state.settings;
  }

  function getLoadError() {
    return state.loadError;
  }

  window.KaPAppSettings = state.settings;
  window.KaPAppSettingsLoadError = state.loadError;
  window.KaPAppConfig = {
    load: load,
    getSettings: getSettings,
    getLoadError: getLoadError
  };
})();
