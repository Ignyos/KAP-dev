(function () {
  var ACCOUNT_KEY = window.KaPSettings.KEYS.SYNC_ACCOUNT_LINK;
  var STATUS_KEY = window.KaPSettings.KEYS.SYNC_STATUS;
  var CONFLICT_MODE_KEY = window.KaPSettings.KEYS.SYNC_CONFLICT_MODE;
  var AUTO_SYNC_DEBOUNCE_MS = 20000;
  var FOCUS_SYNC_COOLDOWN_MS = 60000;
  var SYNC_RUN_TIMEOUT_MS = 45000;
  var STORE_WRITE_CONFLICT_RETRY_LIMIT = 1;
  var SYNC_RECOVERY_RETRY_LIMIT = 2;
  var SYNC_RECOVERY_BACKOFF_MS = 250;
  var GOOGLE_IDENTITY_SDK_WAIT_MS = 5000;
  var GOOGLE_IDENTITY_SDK_POLL_MS = 100;

  var state = {
    autoSyncInitialized: false,
    autoSyncTimer: null,
    syncInFlight: null,
    queuedSyncRunOptions: null,
    lastSyncAttemptAtMs: 0,
    syncDiagnostics: {
      lastRetryCount: 0,
      lastFailureReason: null,
      lastAttemptAt: null,
      lastRecoveredFromConflict: false
    },
    googleAuth: {
      accessToken: null,
      expiresAtMs: 0,
      scope: '',
      tokenType: ''
    }
  };

  var CONFLICT_MODES = {
    ASK_USER: 'askUser',
    PREFER_LOCAL: 'preferLocal',
    PREFER_CLOUD: 'preferCloud'
  };

  var REMOTE_MODES = {
    MOCK: 'mock',
    GOOGLE_DRIVE: 'googleDrive'
  };
  var SYNC_MANIFEST_RECORD_ID = 'sync-manifest';
  var IMMEDIATE_AUTO_SYNC_REASONS = {
    'account-linked': true,
    startup: true,
    'remote-mode-change': true,
    online: true,
    reconnect: true
  };

  function getStoreName(key, fallback) {
    if (!window.KaPStores || !window.KaPStores.STORE_NAMES) {
      return fallback;
    }

    return window.KaPStores.STORE_NAMES[key] || fallback;
  }

  function getSyncTombstoneStoreName() {
    return getStoreName('SYNC_TOMBSTONES', 'syncTombstones');
  }

  function getSyncManifestStoreName() {
    return getStoreName('SYNC_STORE_MANIFEST', 'syncStoreManifest');
  }

  function getCoreStoreNames() {
    var storeNamesMap = window.KaPStores && window.KaPStores.STORE_NAMES ? window.KaPStores.STORE_NAMES : {};
    var allNames = Object.keys(storeNamesMap).map(function (key) {
      return storeNamesMap[key];
    });
    var excluded = {};
    excluded[getSyncTombstoneStoreName()] = true;
    excluded[getSyncManifestStoreName()] = true;

    return allNames.filter(function (storeName) {
      return !excluded[storeName];
    });
  }

  function getRemoteAdapter() {
    var remoteMode = getRemoteMode();
    var selectedAdapter = null;
    if (remoteMode === REMOTE_MODES.GOOGLE_DRIVE) {
      selectedAdapter = window.KaPGoogleDriveSyncGoogleAdapter || null;
    } else {
      selectedAdapter = window.KaPGoogleDriveSyncRemoteAdapter || null;
    }

    if (!selectedAdapter) {
      return null;
    }

    var hasPerStoreApi =
      typeof selectedAdapter.readManifest === 'function'
      && typeof selectedAdapter.writeManifest === 'function'
      && typeof selectedAdapter.readStore === 'function'
      && typeof selectedAdapter.writeStore === 'function';
    var hasLegacyPayloadApi =
      typeof selectedAdapter.readPayload === 'function'
      && typeof selectedAdapter.writePayload === 'function';

    if (!hasPerStoreApi && !hasLegacyPayloadApi) {
      return null;
    }

    return selectedAdapter;
  }

  function getGoogleConfig() {
    var fromAppSettings = window.KaPAppSettings && window.KaPAppSettings.googleDriveSync
      ? window.KaPAppSettings.googleDriveSync
      : {};
    var fromRuntime = window.KaPGoogleDriveSyncGoogleConfig || {};

    return Object.assign({}, fromAppSettings, fromRuntime);
  }

  function getGoogleClientId() {
    var config = getGoogleConfig();
    var candidate = config.clientId || '';
    return String(candidate).trim();
  }

  function getGoogleScopes() {
    var config = getGoogleConfig();
    var configured = Array.isArray(config.scopes) ? config.scopes : null;
    var defaults = [
      'https://www.googleapis.com/auth/drive.file',
      'openid',
      'email',
      'profile'
    ];
    var scopes = configured && configured.length ? configured : defaults;
    return scopes.join(' ');
  }

  function hasGoogleIdentitySdk() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      return true;
    }

    return false;
  }

  function getGoogleIdentitySdkScript() {
    if (!document || typeof document.querySelector !== 'function') {
      return null;
    }

    return document.querySelector('script[src*="accounts.google.com/gsi/client"]');
  }

  async function ensureGoogleIdentitySdk() {
    if (hasGoogleIdentitySdk()) {
      return;
    }

    var sdkScript = getGoogleIdentitySdkScript();
    if (!sdkScript) {
      throw new Error('Google Identity SDK script tag is missing. Add https://accounts.google.com/gsi/client to the page.');
    }

    await new Promise(function (resolve, reject) {
      var settled = false;
      var pollId = null;
      var timeoutId = null;

      function cleanup() {
        if (pollId) {
          clearInterval(pollId);
          pollId = null;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        sdkScript.removeEventListener('error', onScriptError);
      }

      function resolveOnce() {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      }

      function rejectOnce(error) {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      }

      function onScriptError() {
        rejectOnce(new Error('Google Identity SDK failed to load. Check network access and blockers for https://accounts.google.com/gsi/client.'));
      }

      if (hasGoogleIdentitySdk()) {
        resolveOnce();
        return;
      }

      sdkScript.addEventListener('error', onScriptError);

      pollId = setInterval(function () {
        if (hasGoogleIdentitySdk()) {
          resolveOnce();
        }
      }, GOOGLE_IDENTITY_SDK_POLL_MS);

      timeoutId = setTimeout(function () {
        rejectOnce(new Error('Google Identity SDK did not initialize in time. Check network access and blockers for https://accounts.google.com/gsi/client.'));
      }, GOOGLE_IDENTITY_SDK_WAIT_MS);
    });

    if (!hasGoogleIdentitySdk()) {
      throw new Error('Google Identity SDK is not available. Check network access and blockers for https://accounts.google.com/gsi/client.');
    }
  }

  function setGoogleAuthToken(tokenResponse) {
    var expiresIn = Number(tokenResponse && tokenResponse.expires_in || 0);
    var now = Date.now();
    state.googleAuth = {
      accessToken: String(tokenResponse && tokenResponse.access_token || ''),
      expiresAtMs: expiresIn > 0 ? now + (expiresIn * 1000) : 0,
      scope: String(tokenResponse && tokenResponse.scope || ''),
      tokenType: String(tokenResponse && tokenResponse.token_type || '')
    };
  }

  function clearGoogleAuthToken() {
    state.googleAuth = {
      accessToken: null,
      expiresAtMs: 0,
      scope: '',
      tokenType: ''
    };
  }

  function hasValidGoogleAccessToken() {
    if (!state.googleAuth.accessToken) {
      return false;
    }

    if (!state.googleAuth.expiresAtMs) {
      return true;
    }

    return Date.now() < (state.googleAuth.expiresAtMs - 30000);
  }

  async function requestGoogleAccessToken(promptMode) {
    await ensureGoogleIdentitySdk();

    var clientId = getGoogleClientId();
    if (!clientId) {
      var settingsLoadError = window.KaPAppSettingsLoadError ? String(window.KaPAppSettingsLoadError) : '';
      if (settingsLoadError) {
        throw new Error('Google OAuth clientId is not configured. appsettings load failed: ' + settingsLoadError);
      }

      throw new Error('Google OAuth clientId is not configured. Set docs/appsettings.json googleDriveSync.clientId.');
    }

    var scope = getGoogleScopes();

    return new Promise(function (resolve, reject) {
      var tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: scope,
        callback: function (response) {
          if (response && response.error) {
            reject(new Error(String(response.error_description || response.error || 'Google authentication failed.')));
            return;
          }

          if (!response || !response.access_token) {
            reject(new Error('Google authentication did not return an access token.'));
            return;
          }

          resolve(response);
        }
      });

      tokenClient.requestAccessToken({
        prompt: promptMode || 'consent'
      });
    });
  }

  async function ensureGoogleAccessToken() {
    if (hasValidGoogleAccessToken()) {
      return state.googleAuth.accessToken;
    }

    var tokenResponse = await requestGoogleAccessToken('consent');
    setGoogleAuthToken(tokenResponse);
    return state.googleAuth.accessToken;
  }

  async function fetchGoogleUserProfile(accessToken) {
    var response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + accessToken
      }
    });

    if (!response.ok) {
      throw new Error('Unable to fetch Google user profile.');
    }

    return response.json();
  }

  async function linkGoogleAccount() {
    var accessToken = await ensureGoogleAccessToken();
    var profile = await fetchGoogleUserProfile(accessToken);
    var email = String(profile && profile.email || '').trim();
    if (!email) {
      throw new Error('Google profile did not include an email address.');
    }

    var linkedAccount = {
      provider: 'google',
      email: email,
      subject: profile && profile.sub ? String(profile.sub) : null,
      name: profile && profile.name ? String(profile.name) : null,
      picture: profile && profile.picture ? String(profile.picture) : null,
      linkedAt: new Date().toISOString()
    };

    window.KaPSettings.set(ACCOUNT_KEY, linkedAccount);
    setStatus({
      lastStatus: 'linked',
      lastMessage: 'Google account linked. Automatic sync is enabled while online.'
    });

    initializeAutoSync();
    await scheduleAutoSync('account-linked');
    return linkedAccount;
  }

  function getRemoteMode() {
    var storedMode = window.KaPSettings.get(window.KaPSettings.KEYS.SYNC_REMOTE_MODE);
    var mode = storedMode == null ? '' : String(storedMode);
    if (mode === REMOTE_MODES.MOCK || mode === REMOTE_MODES.GOOGLE_DRIVE) {
      return mode;
    }

    var config = getGoogleConfig();
    var configuredDefault = config && config.defaultRemoteMode
      ? String(config.defaultRemoteMode)
      : '';
    if (configuredDefault === REMOTE_MODES.MOCK || configuredDefault === REMOTE_MODES.GOOGLE_DRIVE) {
      return configuredDefault;
    }

    return getGoogleClientId() ? REMOTE_MODES.GOOGLE_DRIVE : REMOTE_MODES.MOCK;
  }

  function setRemoteMode(mode) {
    var nextMode = String(mode || '');
    if (nextMode !== REMOTE_MODES.MOCK && nextMode !== REMOTE_MODES.GOOGLE_DRIVE) {
      throw new Error('Invalid remote sync mode.');
    }

    window.KaPSettings.set(window.KaPSettings.KEYS.SYNC_REMOTE_MODE, nextMode);
    scheduleAutoSync('remote-mode-change');
    return nextMode;
  }

  function getRuntimeEnvironment() {
    return (window.location && window.location.hostname === 'kap-dev.ignyos.com') ? 'dev' : 'prod';
  }

  function buildRemoteContext(account) {
    var accessToken = hasValidGoogleAccessToken() ? state.googleAuth.accessToken : null;
    return {
      appId: 'kap',
      environment: getRuntimeEnvironment(),
      accountEmail: account && account.email ? String(account.email) : '',
      accessToken: accessToken
    };
  }

  function safeIso(value) {
    if (!value) {
      return null;
    }

    var normalized = new Date(value);
    if (Number.isNaN(normalized.getTime())) {
      return null;
    }

    return normalized.toISOString();
  }

  function findLatestUpdate(records) {
    var maxIso = null;
    for (var i = 0; i < records.length; i++) {
      var record = records[i] || {};
      var candidate = safeIso(record.updatedDate || record.updatedAt || null);
      if (!candidate) {
        continue;
      }
      if (!maxIso || candidate > maxIso) {
        maxIso = candidate;
      }
    }

    return maxIso;
  }

  function canonicalize(value) {
    if (Array.isArray(value)) {
      return value.map(canonicalize);
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    var result = {};
    Object.keys(value).sort().forEach(function (key) {
      result[key] = canonicalize(value[key]);
    });
    return result;
  }

  function stableStringify(value) {
    return JSON.stringify(canonicalize(value));
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function simpleHash(input) {
    var hash = 2166136261;
    for (var i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  async function getManifestRecords() {
    if (!window.KaPDB || typeof window.KaPDB.readAll !== 'function') {
      return [];
    }

    var manifestStoreName = getSyncManifestStoreName();
    if (typeof window.KaPDB.readByKey !== 'function') {
      return [];
    }

    var record = await window.KaPDB.readByKey(manifestStoreName, SYNC_MANIFEST_RECORD_ID);
    var syncMap = record && record.sync && typeof record.sync === 'object' ? record.sync : {};
    return Object.keys(syncMap).sort().map(function (storeName) {
      var entry = syncMap[storeName] || {};
      return {
        store: storeName,
        localLastUpdate: entry.localLastUpdate || null,
        cloudLastSeenUpdate: entry.cloudLastSeenUpdate || null,
        lastSyncedAt: entry.lastSyncedAt || null,
        cloudRevision: entry.cloudRevision || null,
        dirty: entry.dirty === true,
        lastSyncStatus: entry.lastSyncStatus || 'idle',
        lastError: entry.lastError || null
      };
    });
  }

  async function updateManifestMap(mutator) {
    if (!window.KaPDB || typeof window.KaPDB.readByKey !== 'function' || typeof window.KaPDB.upsert !== 'function') {
      return;
    }

    var manifestStoreName = getSyncManifestStoreName();
    var currentRecord = await window.KaPDB.readByKey(manifestStoreName, SYNC_MANIFEST_RECORD_ID);
    var currentMap = currentRecord && currentRecord.sync && typeof currentRecord.sync === 'object'
      ? currentRecord.sync
      : {};
    var nextMap = mutator(Object.assign({}, currentMap)) || {};

    await window.KaPDB.upsert(manifestStoreName, {
      id: SYNC_MANIFEST_RECORD_ID,
      sync: nextMap
    });
  }

  async function buildLocalPayloadScaffold(options) {
    var includeRecords = !(options && options.includeRecords === false);
    var nowIso = new Date().toISOString();
    var coreStoreNames = getCoreStoreNames();
    var tombstones = await window.KaPDB.readAll(getSyncTombstoneStoreName());
    var tombstonesByStore = {};
    (tombstones || []).forEach(function (entry) {
      var storeName = String(entry && entry.storeName || '');
      if (!storeName) {
        return;
      }
      tombstonesByStore[storeName] = (tombstonesByStore[storeName] || 0) + 1;
    });

    var storesMeta = {};
    var stores = {};

    for (var i = 0; i < coreStoreNames.length; i++) {
      var storeName = coreStoreNames[i];
      var records = await window.KaPDB.readAll(storeName);
      var sortedRecords = (records || []).slice().sort(function (a, b) {
        return String(a && a.id || '').localeCompare(String(b && b.id || ''));
      });
      var latestUpdate = findLatestUpdate(sortedRecords);
      var contentHash = simpleHash(stableStringify(sortedRecords));

      storesMeta[storeName] = {
        lastUpdate: latestUpdate,
        recordCount: sortedRecords.length,
        tombstoneCount: Number(tombstonesByStore[storeName] || 0),
        contentHash: contentHash
      };

      if (includeRecords) {
        stores[storeName] = sortedRecords;
      }
    }

    return {
      schemaVersion: 1,
      appId: 'kap',
      environment: getRuntimeEnvironment(),
      generatedAt: nowIso,
      checkpoint: {
        cloudRevision: null,
        syncRunId: window.KaPIds && typeof window.KaPIds.NewId === 'function' ? window.KaPIds.NewId() : String(Date.now()),
        syncedAt: null
      },
      storesMeta: storesMeta,
      stores: includeRecords ? stores : {},
      tombstones: (tombstones || []).slice()
    };
  }

  function toManifestMap(records) {
    var map = {};
    (records || []).forEach(function (entry) {
      if (!entry || !entry.store) {
        return;
      }

      map[String(entry.store)] = entry;
    });
    return map;
  }

  function compareIso(a, b) {
    if (!a && !b) {
      return 0;
    }
    if (a && !b) {
      return 1;
    }
    if (!a && b) {
      return -1;
    }
    if (a === b) {
      return 0;
    }
    return a > b ? 1 : -1;
  }

  function decideStoreDirection(localManifestEntry, localSummaryEntry, remoteEntry) {
    var localTs = localManifestEntry.localLastUpdate || localSummaryEntry.lastUpdate || null;
    var remoteTs = remoteEntry.lastUpdate || null;
    var timestampComparison = compareIso(localTs, remoteTs);
    if (timestampComparison !== 0) {
      return timestampComparison;
    }

    var localCount = Number(localSummaryEntry.recordCount || 0);
    var remoteCount = Number(remoteEntry.recordCount || 0);
    var localHash = localSummaryEntry.contentHash || null;
    var remoteHash = remoteEntry.contentHash || null;
    var localDirty = localManifestEntry && localManifestEntry.dirty === true;
    var remoteExists = remoteEntry && Object.keys(remoteEntry).length > 0;

    if (!remoteExists) {
      if (localDirty || localCount > 0) {
        return 1;
      }

      return 0;
    }

    if (localHash && remoteHash && localHash !== remoteHash) {
      if (localDirty) {
        return 1;
      }
      if (localCount === 0 && remoteCount > 0) {
        return -1;
      }
      if (localCount > 0 && remoteCount === 0) {
        return 1;
      }

      return -1;
    }

    if (localCount !== remoteCount) {
      if (localDirty) {
        return 1;
      }
      if (localCount === 0 && remoteCount > 0) {
        return -1;
      }
      if (localCount > 0 && remoteCount === 0) {
        return 1;
      }

      return -1;
    }

    return 0;
  }

  function buildEmptyPayloadSkeleton() {
    return {
      schemaVersion: 1,
      appId: 'kap',
      environment: getRuntimeEnvironment(),
      generatedAt: new Date().toISOString(),
      checkpoint: {
        cloudRevision: null,
        syncRunId: window.KaPIds && typeof window.KaPIds.NewId === 'function' ? window.KaPIds.NewId() : String(Date.now()),
        syncedAt: null
      },
      storesMeta: {},
      stores: {},
      tombstones: []
    };
  }

  async function applyPulledStores(pulledStoreRecordsMap) {
    var storeNames = Object.keys(pulledStoreRecordsMap || {});
    if (!storeNames.length) {
      return;
    }

    await window.KaPDB.replaceStores(pulledStoreRecordsMap, { skipSyncTracking: true });
  }

  async function buildSyncPlan(remotePayload, localPayloadSummary, localManifestMap) {
    var plan = {
      pushStores: [],
      pullStores: [],
      noopStores: []
    };
    var remoteStoresMeta = remotePayload && remotePayload.storesMeta && typeof remotePayload.storesMeta === 'object'
      ? remotePayload.storesMeta
      : {};
    var storeNames = getCoreStoreNames();

    for (var i = 0; i < storeNames.length; i++) {
      var storeName = storeNames[i];
      var localManifestEntry = localManifestMap[storeName] || {};
      var localSummaryEntry = localPayloadSummary.storesMeta && localPayloadSummary.storesMeta[storeName]
        ? localPayloadSummary.storesMeta[storeName]
        : {};
      var remoteEntry = remoteStoresMeta[storeName] || {};

      var freshness = decideStoreDirection(localManifestEntry, localSummaryEntry, remoteEntry);

      if (freshness > 0) {
        plan.pushStores.push(storeName);
      } else if (freshness < 0) {
        plan.pullStores.push(storeName);
      } else {
        plan.noopStores.push(storeName);
      }
    }

    return plan;
  }

  function buildEmptyRemoteManifest() {
    return {
      schemaVersion: 1,
      appId: 'kap',
      environment: getRuntimeEnvironment(),
      generatedAt: new Date().toISOString(),
      checkpoint: {
        cloudRevision: null,
        syncRunId: window.KaPIds && typeof window.KaPIds.NewId === 'function' ? window.KaPIds.NewId() : String(Date.now()),
        syncedAt: null
      },
      storesMeta: {},
      tombstones: []
    };
  }

  function buildStoreSummaryFromRecords(records, fallbackSummary) {
    var sortedRecords = (records || []).slice().sort(function (a, b) {
      return String(a && a.id || '').localeCompare(String(b && b.id || ''));
    });
    var latestUpdate = findLatestUpdate(sortedRecords);

    return {
      lastUpdate: latestUpdate || (fallbackSummary && fallbackSummary.lastUpdate ? fallbackSummary.lastUpdate : null),
      recordCount: sortedRecords.length,
      tombstoneCount: fallbackSummary && fallbackSummary.tombstoneCount != null ? Number(fallbackSummary.tombstoneCount) : 0,
      contentHash: simpleHash(stableStringify(sortedRecords))
    };
  }

  async function readRemoteManifest(remoteAdapter, context) {
    if (typeof remoteAdapter.readManifest === 'function') {
      return remoteAdapter.readManifest(context);
    }

    if (typeof remoteAdapter.readPayload !== 'function') {
      return {
        found: false,
        revision: null,
        manifest: null,
        updatedAt: null,
        unavailable: true,
        message: 'Selected remote adapter does not support reading remote manifest.'
      };
    }

    var legacy = await remoteAdapter.readPayload(context);
    if (!legacy || legacy.unavailable === true) {
      return {
        found: false,
        revision: legacy && legacy.revision ? legacy.revision : null,
        manifest: null,
        updatedAt: legacy && legacy.updatedAt ? legacy.updatedAt : null,
        unavailable: legacy && legacy.unavailable === true,
        message: legacy && legacy.message ? legacy.message : null,
        legacyPayload: legacy && legacy.payload ? legacy.payload : null
      };
    }

    var payload = legacy && legacy.payload ? legacy.payload : null;
    var manifest = payload
      ? {
        schemaVersion: payload.schemaVersion || 1,
        appId: payload.appId || 'kap',
        environment: payload.environment || getRuntimeEnvironment(),
        generatedAt: payload.generatedAt || null,
        checkpoint: payload.checkpoint || null,
        storesMeta: payload.storesMeta && typeof payload.storesMeta === 'object' ? payload.storesMeta : {},
        tombstones: Array.isArray(payload.tombstones) ? payload.tombstones : []
      }
      : null;

    return {
      found: legacy.found === true,
      revision: legacy.revision || null,
      manifest: manifest,
      updatedAt: legacy.updatedAt || null,
      legacyPayload: payload
    };
  }

  async function writeRemoteManifest(remoteAdapter, context, manifest, options) {
    if (typeof remoteAdapter.writeManifest === 'function') {
      return remoteAdapter.writeManifest(context, manifest, options || {});
    }

    if (typeof remoteAdapter.writePayload !== 'function') {
      return {
        ok: false,
        conflict: false,
        unavailable: true,
        revision: null,
        message: 'Selected remote adapter does not support writing remote manifest.'
      };
    }

    var payload = {
      schemaVersion: manifest && manifest.schemaVersion ? manifest.schemaVersion : 1,
      appId: manifest && manifest.appId ? manifest.appId : 'kap',
      environment: manifest && manifest.environment ? manifest.environment : getRuntimeEnvironment(),
      generatedAt: manifest && manifest.generatedAt ? manifest.generatedAt : new Date().toISOString(),
      checkpoint: manifest && manifest.checkpoint ? deepClone(manifest.checkpoint) : null,
      storesMeta: manifest && manifest.storesMeta ? deepClone(manifest.storesMeta) : {},
      stores: {},
      tombstones: manifest && Array.isArray(manifest.tombstones) ? deepClone(manifest.tombstones) : []
    };

    return remoteAdapter.writePayload(context, payload, options || {});
  }

  async function readRemoteStore(remoteAdapter, context, storeName, legacyPayload) {
    if (typeof remoteAdapter.readStore === 'function') {
      return remoteAdapter.readStore(context, storeName);
    }

    var fromPayload = legacyPayload && legacyPayload.stores && Array.isArray(legacyPayload.stores[storeName])
      ? deepClone(legacyPayload.stores[storeName])
      : null;

    return {
      found: fromPayload != null,
      revision: null,
      records: fromPayload,
      updatedAt: null
    };
  }

  async function writeRemoteStore(remoteAdapter, context, storeName, records, options, manifestMeta) {
    if (typeof remoteAdapter.writeStore === 'function') {
      return remoteAdapter.writeStore(context, storeName, records, options || {});
    }

    if (typeof remoteAdapter.writePayload !== 'function') {
      return {
        ok: false,
        conflict: false,
        unavailable: true,
        revision: null,
        message: 'Selected remote adapter does not support writing remote store records.'
      };
    }

    var syntheticPayload = {
      schemaVersion: 1,
      appId: 'kap',
      environment: getRuntimeEnvironment(),
      generatedAt: new Date().toISOString(),
      checkpoint: null,
      storesMeta: {},
      stores: {},
      tombstones: []
    };
    syntheticPayload.stores[storeName] = deepClone(records || []);
    syntheticPayload.storesMeta[storeName] = manifestMeta && manifestMeta[storeName]
      ? deepClone(manifestMeta[storeName])
      : {
        lastUpdate: findLatestUpdate(records || []),
        recordCount: Array.isArray(records) ? records.length : 0,
        tombstoneCount: 0,
        contentHash: simpleHash(stableStringify(records || []))
      };

    return remoteAdapter.writePayload(context, syntheticPayload, options || {});
  }

  async function writeStoreWithConflictRetry(remoteAdapter, context, storeName, records, expectedRevision, manifestMeta) {
    var attempt = 0;
    var nextExpectedRevision = expectedRevision == null ? null : String(expectedRevision);

    while (attempt <= STORE_WRITE_CONFLICT_RETRY_LIMIT) {
      var result = await writeRemoteStore(
        remoteAdapter,
        context,
        storeName,
        records,
        { expectedRevision: nextExpectedRevision },
        manifestMeta
      );

      if (!result || result.ok === true || result.conflict !== true) {
        return result;
      }

      if (attempt >= STORE_WRITE_CONFLICT_RETRY_LIMIT) {
        return result;
      }

      nextExpectedRevision = result.revision == null ? null : String(result.revision);
      attempt += 1;
    }

    return {
      ok: false,
      conflict: true,
      revision: null,
      message: 'Remote revision changed before write completed.'
    };
  }

  async function markManifestAfterPlannedSync(plan, syncedAtIso, remoteStoresMeta, localPayloadSummary) {
    var effectiveRemoteStoresMeta = remoteStoresMeta && typeof remoteStoresMeta === 'object'
      ? remoteStoresMeta
      : {};

    await updateManifestMap(function (syncMap) {
      var pushSet = {};
      var pullSet = {};
      (plan.pushStores || []).forEach(function (storeName) { pushSet[storeName] = true; });
      (plan.pullStores || []).forEach(function (storeName) { pullSet[storeName] = true; });

      var allStoresMap = {};
      Object.keys(syncMap || {}).forEach(function (storeName) { allStoresMap[storeName] = true; });
      Object.keys(effectiveRemoteStoresMeta).forEach(function (storeName) { allStoresMap[storeName] = true; });
      getCoreStoreNames().forEach(function (storeName) { allStoresMap[storeName] = true; });
      var allStores = Object.keys(allStoresMap);
      allStores.forEach(function (storeName) {
        var existing = syncMap[storeName] || {};
        var localSummary = localPayloadSummary.storesMeta && localPayloadSummary.storesMeta[storeName]
          ? localPayloadSummary.storesMeta[storeName]
          : {};
        var remoteSummary = effectiveRemoteStoresMeta[storeName] || {};
        var isTouched = pushSet[storeName] || pullSet[storeName];

        if (!isTouched) {
          return;
        }

        var lastUpdate = pushSet[storeName]
          ? (localSummary.lastUpdate || existing.localLastUpdate || null)
          : (remoteSummary.lastUpdate || existing.localLastUpdate || null);

        syncMap[storeName] = {
          localLastUpdate: lastUpdate,
          cloudLastSeenUpdate: remoteSummary.lastUpdate || lastUpdate,
          lastSyncedAt: syncedAtIso,
          cloudRevision: remoteSummary.cloudRevision || existing.cloudRevision || null,
          dirty: false,
          lastSyncStatus: 'completed',
          lastError: null
        };
      });

      return syncMap;
    });
  }

  async function markManifestAfterSync(cloudRevision, syncedAtIso) {
    await updateManifestMap(function (syncMap) {
      Object.keys(syncMap).forEach(function (storeName) {
        var existing = syncMap[storeName] || {};
        syncMap[storeName] = {
          localLastUpdate: existing.localLastUpdate || null,
          cloudLastSeenUpdate: existing.localLastUpdate || existing.cloudLastSeenUpdate || null,
          lastSyncedAt: syncedAtIso,
          cloudRevision: cloudRevision || null,
          dirty: false,
          lastSyncStatus: 'completed',
          lastError: null
        };
      });
      return syncMap;
    });
  }

  async function markManifestConflict(message) {
    await updateManifestMap(function (syncMap) {
      Object.keys(syncMap).forEach(function (storeName) {
        var existing = syncMap[storeName] || {};
        syncMap[storeName] = {
          localLastUpdate: existing.localLastUpdate || null,
          cloudLastSeenUpdate: existing.cloudLastSeenUpdate || null,
          lastSyncedAt: existing.lastSyncedAt || null,
          cloudRevision: existing.cloudRevision || null,
          dirty: true,
          lastSyncStatus: 'conflict',
          lastError: message || 'Remote write conflict'
        };
      });
      return syncMap;
    });
  }

  async function markManifestError(message) {
    await updateManifestMap(function (syncMap) {
      Object.keys(syncMap).forEach(function (storeName) {
        var existing = syncMap[storeName] || {};
        syncMap[storeName] = {
          localLastUpdate: existing.localLastUpdate || null,
          cloudLastSeenUpdate: existing.cloudLastSeenUpdate || null,
          lastSyncedAt: existing.lastSyncedAt || null,
          cloudRevision: existing.cloudRevision || null,
          dirty: existing.dirty === true,
          lastSyncStatus: 'error',
          lastError: message || 'Sync error'
        };
      });
      return syncMap;
    });
  }

  async function getSyncDebugSnapshot() {
    var manifest = await getManifestRecords();
    var payload = await buildLocalPayloadScaffold({ includeRecords: false });
    var account = getAccountLink();
    var remoteAdapter = getRemoteAdapter();
    var remoteState = null;
    if (account && remoteAdapter) {
      var context = buildRemoteContext(account);
      if (typeof remoteAdapter.readManifest === 'function') {
        remoteState = await remoteAdapter.readManifest(context);
      } else {
        remoteState = await remoteAdapter.readPayload(context);
      }
    }
    var dirtyCount = manifest.filter(function (entry) { return entry && entry.dirty === true; }).length;

    return {
      manifest: manifest,
      dirtyCount: dirtyCount,
      diagnostics: getSyncDiagnostics(),
      selectedRemoteMode: getRemoteMode(),
      adapterMode: remoteAdapter && typeof remoteAdapter.getMode === 'function' ? remoteAdapter.getMode() : 'not-configured',
      remoteRevision: remoteState && remoteState.revision ? remoteState.revision : null,
      payloadSummary: {
        schemaVersion: payload.schemaVersion,
        appId: payload.appId,
        environment: payload.environment,
        generatedAt: payload.generatedAt,
        storeCount: Object.keys(payload.storesMeta || {}).length,
        tombstoneCount: Array.isArray(payload.tombstones) ? payload.tombstones.length : 0
      }
    };
  }

  function getAccountLink() {
    var account = window.KaPSettings.get(ACCOUNT_KEY);
    if (!account || typeof account !== 'object') {
      return null;
    }

    var email = String(account.email || '').trim();
    if (!email) {
      return null;
    }

    return {
      provider: 'google',
      email: email,
      linkedAt: account.linkedAt || null
    };
  }

  function getStatus() {
    var status = window.KaPSettings.get(STATUS_KEY);
    if (!status || typeof status !== 'object') {
      return {
        pendingLocalChanges: false,
        lastSyncAt: null,
        lastStatus: 'idle',
        lastMessage: 'Not synced yet.'
      };
    }

    return {
      pendingLocalChanges: status.pendingLocalChanges === true,
      lastSyncAt: status.lastSyncAt || null,
      lastStatus: status.lastStatus || 'idle',
      lastMessage: status.lastMessage || 'Not synced yet.'
    };
  }

  function setStatus(patch) {
    var current = getStatus();
    var next = {
      pendingLocalChanges: patch && patch.pendingLocalChanges != null ? patch.pendingLocalChanges : current.pendingLocalChanges,
      lastSyncAt: patch && patch.lastSyncAt != null ? patch.lastSyncAt : current.lastSyncAt,
      lastStatus: patch && patch.lastStatus ? patch.lastStatus : current.lastStatus,
      lastMessage: patch && patch.lastMessage ? patch.lastMessage : current.lastMessage
    };

    window.KaPSettings.set(STATUS_KEY, next);
    return next;
  }

  function hasPendingLocalChanges() {
    return getStatus().pendingLocalChanges === true;
  }

  function shouldAttemptAutoSync(reason) {
    var triggerReason = String(reason || 'scheduled');
    if (triggerReason === 'account-linked' || triggerReason === 'remote-mode-change') {
      return true;
    }

    return hasPendingLocalChanges();
  }

  function shouldRunFocusAutoSync() {
    if (!hasPendingLocalChanges()) {
      return false;
    }

    var elapsed = Date.now() - Number(state.lastSyncAttemptAtMs || 0);
    return elapsed >= FOCUS_SYNC_COOLDOWN_MS;
  }

  function queueSyncRun(runOptions) {
    if (!runOptions || typeof runOptions !== 'object') {
      return;
    }

    if (!state.queuedSyncRunOptions) {
      state.queuedSyncRunOptions = Object.assign({}, runOptions);
      return;
    }

    state.queuedSyncRunOptions = Object.assign({}, state.queuedSyncRunOptions, {
      trigger: runOptions.trigger || state.queuedSyncRunOptions.trigger,
      reason: runOptions.reason || state.queuedSyncRunOptions.reason,
      silent: state.queuedSyncRunOptions.silent && runOptions.silent !== false
    });
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Number(ms) || 0);
    });
  }

  function getSyncDiagnostics() {
    var current = state.syncDiagnostics || {};
    return {
      lastRetryCount: Number(current.lastRetryCount || 0),
      lastFailureReason: current.lastFailureReason ? String(current.lastFailureReason) : null,
      lastAttemptAt: current.lastAttemptAt ? String(current.lastAttemptAt) : null,
      lastRecoveredFromConflict: current.lastRecoveredFromConflict === true
    };
  }

  function setSyncDiagnostics(patch) {
    var current = getSyncDiagnostics();
    state.syncDiagnostics = {
      lastRetryCount: patch && patch.lastRetryCount != null ? Number(patch.lastRetryCount || 0) : current.lastRetryCount,
      lastFailureReason: patch && patch.lastFailureReason !== undefined ? patch.lastFailureReason : current.lastFailureReason,
      lastAttemptAt: patch && patch.lastAttemptAt !== undefined ? patch.lastAttemptAt : current.lastAttemptAt,
      lastRecoveredFromConflict: patch && patch.lastRecoveredFromConflict != null
        ? patch.lastRecoveredFromConflict === true
        : current.lastRecoveredFromConflict
    };

    return getSyncDiagnostics();
  }

  function getConflictMode() {
    var mode = String(window.KaPSettings.get(CONFLICT_MODE_KEY) || CONFLICT_MODES.ASK_USER);
    if (mode !== CONFLICT_MODES.ASK_USER && mode !== CONFLICT_MODES.PREFER_LOCAL && mode !== CONFLICT_MODES.PREFER_CLOUD) {
      return CONFLICT_MODES.ASK_USER;
    }
    return mode;
  }

  function setConflictMode(mode) {
    var nextMode = String(mode || '');
    if (nextMode !== CONFLICT_MODES.ASK_USER && nextMode !== CONFLICT_MODES.PREFER_LOCAL && nextMode !== CONFLICT_MODES.PREFER_CLOUD) {
      throw new Error('Invalid conflict mode.');
    }

    window.KaPSettings.set(CONFLICT_MODE_KEY, nextMode);
    return nextMode;
  }

  async function linkAccount(email) {
    if (getRemoteMode() === REMOTE_MODES.GOOGLE_DRIVE) {
      return linkGoogleAccount();
    }

    var normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) {
      throw new Error('Email is required.');
    }

    var linkedAccount = {
      provider: 'google',
      email: normalizedEmail,
      linkedAt: new Date().toISOString()
    };

    window.KaPSettings.set(ACCOUNT_KEY, linkedAccount);
    setStatus({
      lastStatus: 'linked',
      lastMessage: 'Google account linked. Automatic sync is enabled while online.'
    });

    initializeAutoSync();
    await scheduleAutoSync('account-linked');

    return linkedAccount;
  }

  function signOut() {
    clearScheduledAutoSync();
    var hasGoogleToken = !!state.googleAuth.accessToken;
    if (hasGoogleToken && window.google && window.google.accounts && window.google.accounts.oauth2 && typeof window.google.accounts.oauth2.revoke === 'function') {
      try {
        window.google.accounts.oauth2.revoke(state.googleAuth.accessToken, function () {});
      } catch (_revokeError) {
        // Ignore revoke failures during sign-out.
      }
    }
    clearGoogleAuthToken();
    window.KaPSettings.set(ACCOUNT_KEY, null);
    setStatus({
      pendingLocalChanges: false,
      lastStatus: 'signedOut',
      lastMessage: 'Cloud link disconnected. Local data remains on this device.'
    });
  }

  function hasLinkedAccount() {
    return !!getAccountLink();
  }

  function clearScheduledAutoSync() {
    if (state.autoSyncTimer) {
      clearTimeout(state.autoSyncTimer);
      state.autoSyncTimer = null;
    }
  }

  function shouldRunImmediateAutoSync(reason) {
    return !!IMMEDIATE_AUTO_SYNC_REASONS[String(reason || 'scheduled')];
  }

  function scheduleAutoSync(reason) {
    if (!hasLinkedAccount()) {
      return Promise.resolve(false);
    }

    var triggerReason = String(reason || 'scheduled');
    if (triggerReason === 'focus' && !shouldRunFocusAutoSync()) {
      return Promise.resolve(false);
    }

    if (!shouldAttemptAutoSync(triggerReason)) {
      return Promise.resolve(false);
    }

    var immediate = shouldRunImmediateAutoSync(triggerReason);
    if (immediate) {
      clearScheduledAutoSync();
      return syncNow({
        trigger: 'auto',
        reason: triggerReason,
        silent: true
      });
    }

    clearScheduledAutoSync();
    state.autoSyncTimer = setTimeout(function () {
      state.autoSyncTimer = null;
      syncNow({
        trigger: 'auto',
        reason: triggerReason,
        silent: true
      });
    }, AUTO_SYNC_DEBOUNCE_MS);

    return Promise.resolve(true);
  }

  function initializeAutoSync() {
    if (state.autoSyncInitialized) {
      return;
    }

    state.autoSyncInitialized = true;

    window.addEventListener('online', function () {
      scheduleAutoSync('reconnect');
    });

    window.addEventListener('focus', function () {
      scheduleAutoSync('focus');
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        scheduleAutoSync('focus');
      }
    });

    scheduleAutoSync('startup');
  }

  function markPendingLocalChanges() {
    setStatus({
      pendingLocalChanges: true,
      lastStatus: 'pending',
      lastMessage: 'Local changes are pending sync.'
    });

    scheduleAutoSync('local-change');
  }

  async function executeSyncRun(runOptions) {
    state.lastSyncAttemptAtMs = Date.now();

    var account = getAccountLink();
    if (!account) {
      setStatus({
        pendingLocalChanges: hasPendingLocalChanges(),
        lastStatus: 'blocked',
        lastMessage: 'Sign in to sync.'
      });
      return {
        ok: false,
        message: 'Sign in to sync.'
      };
    }

    var remoteAdapter = getRemoteAdapter();
    if (!remoteAdapter) {
      var missingAdapterMessage = 'Sync adapter is not configured for mode: ' + getRemoteMode() + '.';
      setStatus({
        pendingLocalChanges: hasPendingLocalChanges(),
        lastStatus: 'error',
        lastMessage: 'Sync failed. Try again.'
      });
      await markManifestError(missingAdapterMessage);
      return {
        ok: false,
        message: missingAdapterMessage
      };
    }

    if (navigator && navigator.onLine === false) {
      setStatus({
        pendingLocalChanges: hasPendingLocalChanges(),
        lastStatus: 'offline',
        lastMessage: 'Offline. Changes will sync when reconnected.'
      });
      return {
        ok: false,
        message: 'Offline. Changes will sync when reconnected.'
      };
    }

    if (getRemoteMode() === REMOTE_MODES.GOOGLE_DRIVE && !hasValidGoogleAccessToken()) {
      try {
        await ensureGoogleAccessToken();
      } catch (tokenError) {
        var tokenErrorMessage = tokenError && tokenError.message ? tokenError.message : 'Sign in to sync.';
        await markManifestError(tokenErrorMessage);
        setStatus({
          pendingLocalChanges: true,
          lastStatus: 'error',
          lastMessage: 'Sign in to sync.'
        });
        return {
          ok: false,
          message: tokenErrorMessage
        };
      }
    }

    setStatus({
      lastStatus: 'syncing',
      lastMessage: 'Sync in progress...'
    });

    var context = buildRemoteContext(account);
    var remoteManifestState = await readRemoteManifest(remoteAdapter, context);
      if (remoteManifestState && remoteManifestState.unavailable === true) {
        var unavailableMessage = remoteManifestState.message || 'Selected remote adapter is unavailable.';
        await markManifestError(unavailableMessage);
        setStatus({
          pendingLocalChanges: true,
          lastStatus: 'error',
          lastMessage: 'Sync failed. Try again.'
        });
        return {
          ok: false,
          message: unavailableMessage
        };
      }
      var remoteManifest = remoteManifestState && remoteManifestState.manifest && typeof remoteManifestState.manifest === 'object'
        ? remoteManifestState.manifest
        : null;
      var remoteStoresMeta = remoteManifest && remoteManifest.storesMeta && typeof remoteManifest.storesMeta === 'object'
        ? remoteManifest.storesMeta
        : {};
      var localPayloadSummary = await buildLocalPayloadScaffold({ includeRecords: false });
      var localManifestRecords = await getManifestRecords();
      var localManifestMap = toManifestMap(localManifestRecords);
      var plan = await buildSyncPlan({ storesMeta: remoteStoresMeta }, localPayloadSummary, localManifestMap);

      var pulledStoreRecordsMap = {};
      var pulledStoresMeta = {};
      if (plan.pullStores.length > 0) {
        for (var i = 0; i < plan.pullStores.length; i++) {
          var pullStoreName = plan.pullStores[i];
          var remoteStoreResult = await readRemoteStore(remoteAdapter, context, pullStoreName, remoteManifestState ? remoteManifestState.legacyPayload : null);
          if (remoteStoreResult && remoteStoreResult.unavailable === true) {
            var unavailableReadMessage = remoteStoreResult.message || 'Selected remote adapter is unavailable.';
            await markManifestError(unavailableReadMessage);
            setStatus({
              pendingLocalChanges: true,
              lastStatus: 'error',
              lastMessage: 'Sync failed. Try again.'
            });
            return {
              ok: false,
              message: unavailableReadMessage
            };
          }

          var remoteStoreRecords = Array.isArray(remoteStoreResult && remoteStoreResult.records)
            ? deepClone(remoteStoreResult.records)
            : [];
          pulledStoreRecordsMap[pullStoreName] = remoteStoreRecords;

          var pullFallbackSummary = remoteStoresMeta[pullStoreName] || null;
          var pulledSummary = buildStoreSummaryFromRecords(remoteStoreRecords, pullFallbackSummary);
          pulledSummary.cloudRevision = remoteStoreResult && remoteStoreResult.revision
            ? String(remoteStoreResult.revision)
            : (pullFallbackSummary && pullFallbackSummary.cloudRevision ? pullFallbackSummary.cloudRevision : null);
          pulledSummary.cloudUpdatedAt = remoteStoreResult && remoteStoreResult.updatedAt
            ? String(remoteStoreResult.updatedAt)
            : (pullFallbackSummary && pullFallbackSummary.cloudUpdatedAt ? pullFallbackSummary.cloudUpdatedAt : null);
          pulledStoresMeta[pullStoreName] = pulledSummary;
        }
      }

      if (Object.keys(pulledStoreRecordsMap).length > 0) {
        await applyPulledStores(pulledStoreRecordsMap);
      }

      var pushedStoresMeta = {};
      var hasStoreWrites = false;
      for (var j = 0; j < plan.pushStores.length; j++) {
        var pushStoreName = plan.pushStores[j];
        var localStoreRecords = await window.KaPDB.readAll(pushStoreName);
        var sortedLocalRecords = (localStoreRecords || []).slice().sort(function (a, b) {
          return String(a && a.id || '').localeCompare(String(b && b.id || ''));
        });
        var localStoreSummary = localPayloadSummary.storesMeta && localPayloadSummary.storesMeta[pushStoreName]
          ? localPayloadSummary.storesMeta[pushStoreName]
          : buildStoreSummaryFromRecords(sortedLocalRecords, null);
        var expectedStoreRevision = remoteStoresMeta[pushStoreName] && remoteStoresMeta[pushStoreName].cloudRevision
          ? String(remoteStoresMeta[pushStoreName].cloudRevision)
          : null;

        var storeWriteResult = await writeStoreWithConflictRetry(
          remoteAdapter,
          context,
          pushStoreName,
          sortedLocalRecords,
          expectedStoreRevision,
          remoteStoresMeta
        );

        if (!storeWriteResult || storeWriteResult.ok !== true) {
          if (storeWriteResult && storeWriteResult.unavailable === true) {
            var unavailableWriteMessage = storeWriteResult.message || 'Selected remote adapter is unavailable.';
            await markManifestError(unavailableWriteMessage);
            setStatus({
              pendingLocalChanges: true,
              lastStatus: 'error',
              lastMessage: 'Sync failed. Try again.'
            });

            return {
              ok: false,
              message: unavailableWriteMessage
            };
          }

          var conflictMessage = storeWriteResult && storeWriteResult.message
            ? storeWriteResult.message
            : 'Unable to sync because remote data changed. Try again.';

          await markManifestConflict(conflictMessage);
          setStatus({
            pendingLocalChanges: true,
            lastStatus: 'conflict',
            lastMessage: conflictMessage
          });

          return {
            ok: false,
            recoverableConflict: true,
            message: conflictMessage
          };
        }

        hasStoreWrites = true;
        pushedStoresMeta[pushStoreName] = Object.assign({}, localStoreSummary, {
          cloudRevision: storeWriteResult.revision || expectedStoreRevision || null,
          cloudUpdatedAt: storeWriteResult.updatedAt || null
        });
      }

      var nextRemoteStoresMeta = Object.assign({}, remoteStoresMeta);
      Object.keys(pulledStoresMeta).forEach(function (storeName) {
        nextRemoteStoresMeta[storeName] = Object.assign({}, nextRemoteStoresMeta[storeName] || {}, pulledStoresMeta[storeName]);
      });
      Object.keys(pushedStoresMeta).forEach(function (storeName) {
        nextRemoteStoresMeta[storeName] = Object.assign({}, nextRemoteStoresMeta[storeName] || {}, pushedStoresMeta[storeName]);
      });

      var manifestWriteResult = null;
      var shouldWriteManifest = hasStoreWrites || !remoteManifestState || remoteManifestState.found !== true;
      if (shouldWriteManifest) {
        var outgoingManifest = remoteManifest ? deepClone(remoteManifest) : buildEmptyRemoteManifest();
        outgoingManifest.generatedAt = new Date().toISOString();
        outgoingManifest.checkpoint = outgoingManifest.checkpoint && typeof outgoingManifest.checkpoint === 'object'
          ? outgoingManifest.checkpoint
          : {};
        outgoingManifest.checkpoint.cloudRevision = remoteManifestState && remoteManifestState.revision
          ? remoteManifestState.revision
          : null;
        outgoingManifest.checkpoint.syncRunId = window.KaPIds && typeof window.KaPIds.NewId === 'function'
          ? window.KaPIds.NewId()
          : String(Date.now());
        outgoingManifest.checkpoint.syncedAt = new Date().toISOString();
        outgoingManifest.storesMeta = nextRemoteStoresMeta;

        manifestWriteResult = await writeRemoteManifest(remoteAdapter, context, outgoingManifest, {
          expectedRevision: remoteManifestState && remoteManifestState.revision ? remoteManifestState.revision : null
        });

        if (!manifestWriteResult || manifestWriteResult.ok !== true) {
          if (manifestWriteResult && manifestWriteResult.unavailable === true) {
            var unavailableManifestMessage = manifestWriteResult.message || 'Selected remote adapter is unavailable.';
            await markManifestError(unavailableManifestMessage);
            setStatus({
              pendingLocalChanges: true,
              lastStatus: 'error',
              lastMessage: 'Sync failed. Try again.'
            });

            return {
              ok: false,
              message: unavailableManifestMessage
            };
          }

          var manifestConflictMessage = manifestWriteResult && manifestWriteResult.message
            ? manifestWriteResult.message
            : 'Unable to sync because remote manifest changed. Try again.';

          await markManifestConflict(manifestConflictMessage);
          setStatus({
            pendingLocalChanges: true,
            lastStatus: 'conflict',
            lastMessage: manifestConflictMessage
          });

          return {
            ok: false,
            recoverableConflict: true,
            message: manifestConflictMessage
          };
        }
      }

    var syncedAtIso = manifestWriteResult && manifestWriteResult.updatedAt
      ? String(manifestWriteResult.updatedAt)
      : new Date().toISOString();
    await markManifestAfterPlannedSync(plan, syncedAtIso, nextRemoteStoresMeta, localPayloadSummary);

    setStatus({
      pendingLocalChanges: false,
      lastSyncAt: syncedAtIso,
      lastStatus: 'completed',
      lastMessage: 'Sync complete'
    });

    return {
      ok: true,
      message: 'Sync complete'
    };
  }

  async function executeSyncRunWithTimeout(runOptions) {
    var attempt = 0;
    setSyncDiagnostics({
      lastAttemptAt: new Date().toISOString(),
      lastRetryCount: 0,
      lastRecoveredFromConflict: false
    });

    while (attempt <= SYNC_RECOVERY_RETRY_LIMIT) {
      var timeoutId = null;
      var timeoutPromise = new Promise(function (resolve) {
        timeoutId = setTimeout(function () {
          resolve({
            ok: false,
            timedOut: true,
            message: 'Sync timed out. Try again.'
          });
        }, SYNC_RUN_TIMEOUT_MS);
      });

      try {
        var result = await Promise.race([
          executeSyncRun(runOptions),
          timeoutPromise
        ]);

        if (result && result.timedOut === true) {
          await markManifestError(result.message);
          setStatus({
            pendingLocalChanges: true,
            lastStatus: 'error',
            lastMessage: 'Sync failed. Try again.'
          });
          setSyncDiagnostics({
            lastRetryCount: attempt,
            lastFailureReason: result.message,
            lastRecoveredFromConflict: false
          });
          return result;
        }

        if (result && result.recoverableConflict === true && attempt < SYNC_RECOVERY_RETRY_LIMIT) {
          setSyncDiagnostics({
            lastRetryCount: attempt + 1,
            lastFailureReason: result.message || 'Remote revision changed before write completed.',
            lastRecoveredFromConflict: false
          });
          attempt += 1;
          await sleep(SYNC_RECOVERY_BACKOFF_MS);
          continue;
        }

        if (result && result.ok === true) {
          setSyncDiagnostics({
            lastRetryCount: attempt,
            lastFailureReason: null,
            lastRecoveredFromConflict: attempt > 0
          });
        } else {
          setSyncDiagnostics({
            lastRetryCount: attempt,
            lastFailureReason: result && result.message ? String(result.message) : 'Sync failed. Try again.',
            lastRecoveredFromConflict: false
          });
        }

        return result;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    return {
      ok: false,
      message: 'Sync failed. Try again.'
    };
  }

  async function syncNow(options) {
    var runOptions = options && typeof options === 'object' ? options : {};
    if (state.syncInFlight) {
      queueSyncRun(runOptions);
      return state.syncInFlight;
    }

    state.syncInFlight = (async function () {
      var latestResult = await executeSyncRunWithTimeout(runOptions);
      while (state.queuedSyncRunOptions) {
        var nextRun = state.queuedSyncRunOptions;
        state.queuedSyncRunOptions = null;
        latestResult = await executeSyncRunWithTimeout(nextRun);
      }

      return latestResult;
    })();

    try {
      return await state.syncInFlight;
    } finally {
      state.syncInFlight = null;
    }
  }

  function isSyncInProgress() {
    return !!state.syncInFlight;
  }

  window.KaPGoogleDriveSyncService = {
    CONFLICT_MODES: CONFLICT_MODES,
    getAccountLink: getAccountLink,
    getStatus: getStatus,
    getConflictMode: getConflictMode,
    setConflictMode: setConflictMode,
    REMOTE_MODES: REMOTE_MODES,
    getRemoteMode: getRemoteMode,
    setRemoteMode: setRemoteMode,
    linkAccount: linkAccount,
    signOut: signOut,
    initializeAutoSync: initializeAutoSync,
    scheduleAutoSync: scheduleAutoSync,
    markPendingLocalChanges: markPendingLocalChanges,
    getManifestRecords: getManifestRecords,
    buildLocalPayloadScaffold: buildLocalPayloadScaffold,
    getSyncDebugSnapshot: getSyncDebugSnapshot,
    getSyncDiagnostics: getSyncDiagnostics,
    syncNow: syncNow,
    isSyncInProgress: isSyncInProgress
  };
})();
