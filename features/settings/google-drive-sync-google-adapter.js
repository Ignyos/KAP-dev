(function () {
  var DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
  var DRIVE_UPLOAD_API_BASE = 'https://www.googleapis.com/upload/drive/v3';
  var DEFAULT_ROOT_FOLDER_NAME = 'IgnyosApps';

  function getConfig() {
    var fromAppSettings = window.KaPAppSettings && window.KaPAppSettings.googleDriveSync
      ? window.KaPAppSettings.googleDriveSync
      : {};
    var fromRuntime = window.KaPGoogleDriveSyncGoogleConfig || {};
    return Object.assign({}, fromAppSettings, fromRuntime);
  }

  function normalizeSegment(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_');
  }

  function escapeDriveQueryValue(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getAccessToken(context) {
    return context && context.accessToken ? String(context.accessToken).trim() : '';
  }

  function buildSyncKey(context) {
    var appId = normalizeSegment(context && context.appId || 'kap');
    var environment = normalizeSegment(context && context.environment || 'prod');
    var account = normalizeSegment(context && context.accountEmail || 'anonymous');
    return appId + '__' + environment + '__' + account;
  }

  function getRootFolderName() {
    var config = getConfig();
    var candidate = String(config.rootFolderName || DEFAULT_ROOT_FOLDER_NAME).trim();
    return candidate || DEFAULT_ROOT_FOLDER_NAME;
  }

  function getAppFolderName(context) {
    var appId = normalizeSegment(context && context.appId || 'kap');
    var environment = normalizeSegment(context && context.environment || 'prod');
    if (environment === 'prod') {
      return appId;
    }

    return appId + '-' + environment;
  }

  function buildFileName(kind, context, storeName) {
    var syncKey = buildSyncKey(context);
    if (kind === 'manifest') {
      return 'manifest__' + syncKey + '.json';
    }

    var safeStore = normalizeSegment(storeName || 'unknown');
    return 'store__' + safeStore + '__' + syncKey + '.json';
  }

  function buildAppProperties(kind, context, storeName) {
    var appProperties = {
      kapSyncKey: buildSyncKey(context),
      kapAppId: normalizeSegment(context && context.appId || 'kap'),
      kapEnvironment: normalizeSegment(context && context.environment || 'prod'),
      kapFileKind: kind === 'manifest' ? 'manifest' : 'store'
    };

    if (kind === 'store') {
      appProperties.kapStoreName = normalizeSegment(storeName || 'unknown');
    }

    return appProperties;
  }

  async function parseJsonResponse(response) {
    var text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (_parseError) {
      return null;
    }
  }

  function createUnavailableReadResult(message) {
    return {
      found: false,
      revision: null,
      payload: null,
      updatedAt: null,
      unavailable: true,
      message: message
    };
  }

  function createUnavailableWriteResult(message) {
    return {
      ok: false,
      conflict: false,
      unavailable: true,
      revision: null,
      message: message
    };
  }

  async function driveRequest(path, options, accessToken) {
    var requestOptions = options && typeof options === 'object' ? options : {};
    var headers = Object.assign({}, requestOptions.headers || {}, {
      Authorization: 'Bearer ' + accessToken
    });

    return fetch(path, Object.assign({}, requestOptions, {
      headers: headers
    }));
  }

  async function findFolderByName(name, parentId, accessToken) {
    var queryParts = [
      "trashed = false",
      "mimeType = 'application/vnd.google-apps.folder'",
      "name = '" + escapeDriveQueryValue(name) + "'",
      "'" + escapeDriveQueryValue(parentId || 'root') + "' in parents",
      "'me' in owners"
    ];
    var query = queryParts.join(' and ');
    var url = DRIVE_API_BASE + '/files'
      + '?q=' + encodeURIComponent(query)
      + '&spaces=drive'
      + '&corpora=user'
      + '&includeItemsFromAllDrives=false'
      + '&supportsAllDrives=false'
      + '&pageSize=1'
      + '&orderBy=modifiedTime desc'
      + '&fields=' + encodeURIComponent('files(id,name,modifiedTime)');

    var response = await driveRequest(url, {
      method: 'GET'
    }, accessToken);

    if (!response.ok) {
      var errorPayload = await parseJsonResponse(response);
      var reason = errorPayload && errorPayload.error && errorPayload.error.message
        ? String(errorPayload.error.message)
        : 'Unable to query Google Drive folders.';
      throw new Error(reason);
    }

    var body = await parseJsonResponse(response);
    var files = body && Array.isArray(body.files) ? body.files : [];
    return files.length ? files[0] : null;
  }

  async function createFolder(name, parentId, accessToken) {
    var metadata = {
      name: String(name || '').trim(),
      mimeType: 'application/vnd.google-apps.folder',
      parents: [String(parentId || 'root')]
    };

    var url = DRIVE_API_BASE + '/files'
      + '?fields=' + encodeURIComponent('id,name,modifiedTime')
      + '&supportsAllDrives=false';

    var response = await driveRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify(metadata)
    }, accessToken);

    if (!response.ok) {
      var errorPayload = await parseJsonResponse(response);
      var reason = errorPayload && errorPayload.error && errorPayload.error.message
        ? String(errorPayload.error.message)
        : 'Unable to create Google Drive folder.';
      throw new Error(reason);
    }

    return parseJsonResponse(response);
  }

  async function ensureFolder(name, parentId, accessToken) {
    var existing = await findFolderByName(name, parentId, accessToken);
    if (existing && existing.id) {
      return existing.id;
    }

    var created = await createFolder(name, parentId, accessToken);
    if (!created || !created.id) {
      throw new Error('Unable to create required Google Drive folder.');
    }

    return String(created.id);
  }

  async function ensureAppNamespaceFolder(context, accessToken) {
    var rootFolderId = await ensureFolder(getRootFolderName(), 'root', accessToken);
    var appFolderId = await ensureFolder(getAppFolderName(context), rootFolderId, accessToken);
    return appFolderId;
  }

  async function findScopedFile(kind, context, storeName, accessToken, parentFolderId) {
    var appProperties = buildAppProperties(kind, context, storeName);
    var queryParts = [
      "trashed = false",
      "name = '" + escapeDriveQueryValue(buildFileName(kind, context, storeName)) + "'",
      "'" + escapeDriveQueryValue(parentFolderId || 'root') + "' in parents",
      "'me' in owners",
      "appProperties has { key='kapSyncKey' and value='" + escapeDriveQueryValue(appProperties.kapSyncKey) + "' }",
      "appProperties has { key='kapFileKind' and value='" + escapeDriveQueryValue(appProperties.kapFileKind) + "' }"
    ];

    if (kind === 'store') {
      queryParts.push("appProperties has { key='kapStoreName' and value='" + escapeDriveQueryValue(appProperties.kapStoreName) + "' }");
    }

    var query = queryParts.join(' and ');
    var url = DRIVE_API_BASE + '/files'
      + '?q=' + encodeURIComponent(query)
      + '&spaces=drive'
      + '&corpora=user'
      + '&includeItemsFromAllDrives=false'
      + '&supportsAllDrives=false'
      + '&pageSize=1'
      + '&orderBy=modifiedTime desc'
      + '&fields=' + encodeURIComponent('files(id,name,modifiedTime,version,headRevisionId)');

    var response = await driveRequest(url, {
      method: 'GET'
    }, accessToken);

    if (!response.ok) {
      var errorPayload = await parseJsonResponse(response);
      var reason = errorPayload && errorPayload.error && errorPayload.error.message
        ? String(errorPayload.error.message)
        : 'Unable to query Google Drive files.';
      throw new Error(reason);
    }

    var body = await parseJsonResponse(response);
    var files = body && Array.isArray(body.files) ? body.files : [];
    return files.length ? files[0] : null;
  }

  async function readDriveFileJson(fileId, accessToken) {
    var url = DRIVE_API_BASE + '/files/' + encodeURIComponent(fileId)
      + '?alt=media'
      + '&supportsAllDrives=false';

    var response = await driveRequest(url, {
      method: 'GET'
    }, accessToken);

    if (!response.ok) {
      var errorPayload = await parseJsonResponse(response);
      var reason = errorPayload && errorPayload.error && errorPayload.error.message
        ? String(errorPayload.error.message)
        : 'Unable to read Google Drive file contents.';
      throw new Error(reason);
    }

    var text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (_parseError) {
      throw new Error('Google Drive sync file content is not valid JSON.');
    }
  }

  function buildMultipartBody(metadata, payload, boundary) {
    return [
      '--' + boundary,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      '--' + boundary,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(payload),
      '--' + boundary + '--',
      ''
    ].join('\r\n');
  }

  async function upsertScopedFile(kind, context, storeName, existingFile, payload, accessToken, parentFolderId) {
    var metadata = {
      name: buildFileName(kind, context, storeName),
      mimeType: 'application/json',
      appProperties: buildAppProperties(kind, context, storeName)
    };

    if (!existingFile && parentFolderId) {
      metadata.parents = [String(parentFolderId)];
    }

    var boundary = 'kap_drive_boundary_' + Date.now();
    var body = buildMultipartBody(metadata, payload, boundary);
    var isUpdate = !!(existingFile && existingFile.id);
    var path = isUpdate
      ? DRIVE_UPLOAD_API_BASE + '/files/' + encodeURIComponent(existingFile.id)
      : DRIVE_UPLOAD_API_BASE + '/files';
    var url = path
      + '?uploadType=multipart'
      + '&fields=' + encodeURIComponent('id,modifiedTime,version,headRevisionId')
      + '&supportsAllDrives=false';

    var response = await driveRequest(url, {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'multipart/related; boundary=' + boundary
      },
      body: body
    }, accessToken);

    if (!response.ok) {
      var errorPayload = await parseJsonResponse(response);
      var reason = errorPayload && errorPayload.error && errorPayload.error.message
        ? String(errorPayload.error.message)
        : 'Unable to write Google Drive sync data.';
      throw new Error(reason);
    }

    return parseJsonResponse(response);
  }

  function normalizeFileRevision(file) {
    if (!file) {
      return null;
    }

    return file.version || file.headRevisionId || null;
  }

  async function readManifest(context) {
    var accessToken = getAccessToken(context);
    if (!accessToken) {
      return createUnavailableReadResult('Google authentication is required before syncing.');
    }

    try {
      var parentFolderId = await ensureAppNamespaceFolder(context, accessToken);
      var file = await findScopedFile('manifest', context, null, accessToken, parentFolderId);
      if (!file || !file.id) {
        return {
          found: false,
          revision: null,
          manifest: null,
          updatedAt: null
        };
      }

      var manifest = await readDriveFileJson(file.id, accessToken);
      return {
        found: true,
        revision: normalizeFileRevision(file),
        manifest: manifest ? clone(manifest) : null,
        updatedAt: file.modifiedTime || null
      };
    } catch (error) {
      return {
        found: false,
        revision: null,
        manifest: null,
        updatedAt: null,
        unavailable: true,
        message: error && error.message ? String(error.message) : 'Google Drive sync is temporarily unavailable.'
      };
    }
  }

  async function writeManifest(context, manifest, options) {
    var accessToken = getAccessToken(context);
    if (!accessToken) {
      return createUnavailableWriteResult('Google authentication is required before syncing.');
    }

    var writeOptions = options && typeof options === 'object' ? options : {};
    var expectedRevision = writeOptions.expectedRevision == null
      ? null
      : String(writeOptions.expectedRevision);

    try {
      var parentFolderId = await ensureAppNamespaceFolder(context, accessToken);
      var existingFile = await findScopedFile('manifest', context, null, accessToken, parentFolderId);
      var currentRevision = normalizeFileRevision(existingFile);
      var currentRevisionText = currentRevision == null ? null : String(currentRevision);

      if (expectedRevision !== currentRevisionText) {
        return {
          ok: false,
          conflict: true,
          revision: currentRevision,
          message: 'Remote revision changed before write completed.'
        };
      }

      var writeMeta = await upsertScopedFile('manifest', context, null, existingFile, manifest, accessToken, parentFolderId);
      return {
        ok: true,
        conflict: false,
        revision: normalizeFileRevision(writeMeta),
        updatedAt: writeMeta && writeMeta.modifiedTime ? String(writeMeta.modifiedTime) : new Date().toISOString()
      };
    } catch (error) {
      return createUnavailableWriteResult(error && error.message
        ? String(error.message)
        : 'Google Drive sync is temporarily unavailable.');
    }
  }

  async function readStore(context, storeName) {
    var accessToken = getAccessToken(context);
    if (!accessToken) {
      return {
        found: false,
        revision: null,
        records: null,
        updatedAt: null,
        unavailable: true,
        message: 'Google authentication is required before syncing.'
      };
    }

    try {
      var parentFolderId = await ensureAppNamespaceFolder(context, accessToken);
      var file = await findScopedFile('store', context, storeName, accessToken, parentFolderId);
      if (!file || !file.id) {
        return {
          found: false,
          revision: null,
          records: null,
          updatedAt: null
        };
      }

      var payload = await readDriveFileJson(file.id, accessToken);
      var records = Array.isArray(payload)
        ? payload
        : (payload && Array.isArray(payload.records) ? payload.records : []);

      return {
        found: true,
        revision: normalizeFileRevision(file),
        records: clone(records),
        updatedAt: file.modifiedTime || null
      };
    } catch (error) {
      return {
        found: false,
        revision: null,
        records: null,
        updatedAt: null,
        unavailable: true,
        message: error && error.message ? String(error.message) : 'Google Drive sync is temporarily unavailable.'
      };
    }
  }

  async function writeStore(context, storeName, records, options) {
    var accessToken = getAccessToken(context);
    if (!accessToken) {
      return createUnavailableWriteResult('Google authentication is required before syncing.');
    }

    var writeOptions = options && typeof options === 'object' ? options : {};
    var expectedRevision = writeOptions.expectedRevision == null
      ? null
      : String(writeOptions.expectedRevision);

    try {
      var parentFolderId = await ensureAppNamespaceFolder(context, accessToken);
      var existingFile = await findScopedFile('store', context, storeName, accessToken, parentFolderId);
      var currentRevision = normalizeFileRevision(existingFile);
      var currentRevisionText = currentRevision == null ? null : String(currentRevision);

      if (expectedRevision !== currentRevisionText) {
        return {
          ok: false,
          conflict: true,
          revision: currentRevision,
          message: 'Remote revision changed before write completed.'
        };
      }

      var payload = {
        store: String(storeName || ''),
        updatedAt: new Date().toISOString(),
        records: Array.isArray(records) ? clone(records) : []
      };

      var writeMeta = await upsertScopedFile('store', context, storeName, existingFile, payload, accessToken, parentFolderId);
      return {
        ok: true,
        conflict: false,
        revision: normalizeFileRevision(writeMeta),
        updatedAt: writeMeta && writeMeta.modifiedTime ? String(writeMeta.modifiedTime) : new Date().toISOString()
      };
    } catch (error) {
      return createUnavailableWriteResult(error && error.message
        ? String(error.message)
        : 'Google Drive sync is temporarily unavailable.');
    }
  }

  function getMode() {
    return 'google-drive';
  }

  async function readPayload(context) {
    var manifestResult = await readManifest(context);
    if (manifestResult && manifestResult.unavailable === true) {
      return {
        found: false,
        revision: null,
        payload: null,
        updatedAt: null,
        unavailable: true,
        message: manifestResult.message || 'Google Drive sync is temporarily unavailable.'
      };
    }

    if (!manifestResult || manifestResult.found !== true || !manifestResult.manifest) {
      return {
        found: false,
        revision: null,
        payload: null,
        updatedAt: null
      };
    }

    var manifest = manifestResult.manifest;
    var storesMeta = manifest.storesMeta && typeof manifest.storesMeta === 'object' ? manifest.storesMeta : {};
    var stores = {};
    var storeNames = Object.keys(storesMeta);

    for (var i = 0; i < storeNames.length; i++) {
      var storeName = storeNames[i];
      var storeResult = await readStore(context, storeName);
      if (storeResult && storeResult.unavailable === true) {
        return {
          found: false,
          revision: null,
          payload: null,
          updatedAt: null,
          unavailable: true,
          message: storeResult.message || 'Google Drive sync is temporarily unavailable.'
        };
      }

      stores[storeName] = Array.isArray(storeResult && storeResult.records) ? storeResult.records : [];
    }

    return {
      found: true,
      revision: manifestResult.revision || null,
      updatedAt: manifestResult.updatedAt || null,
      payload: {
        schemaVersion: manifest.schemaVersion || 1,
        appId: manifest.appId || normalizeSegment(context && context.appId || 'kap'),
        environment: manifest.environment || normalizeSegment(context && context.environment || 'prod'),
        generatedAt: manifest.generatedAt || null,
        checkpoint: manifest.checkpoint || null,
        storesMeta: storesMeta,
        stores: stores,
        tombstones: Array.isArray(manifest.tombstones) ? manifest.tombstones : []
      }
    };
  }

  async function writePayload(context, payload, options) {
    var writeOptions = options && typeof options === 'object' ? options : {};
    var expectedRevision = writeOptions.expectedRevision == null ? null : String(writeOptions.expectedRevision);
    var storesMeta = payload && payload.storesMeta && typeof payload.storesMeta === 'object' ? payload.storesMeta : {};
    var stores = payload && payload.stores && typeof payload.stores === 'object' ? payload.stores : {};

    var remoteManifest = await readManifest(context);
    if (remoteManifest && remoteManifest.unavailable === true) {
      return createUnavailableWriteResult(remoteManifest.message || 'Google Drive sync is temporarily unavailable.');
    }

    var manifestRevision = remoteManifest && remoteManifest.revision != null ? String(remoteManifest.revision) : null;
    if (expectedRevision !== manifestRevision) {
      return {
        ok: false,
        conflict: true,
        revision: manifestRevision,
        message: 'Remote revision changed before write completed.'
      };
    }

    var nextManifest = remoteManifest && remoteManifest.manifest && typeof remoteManifest.manifest === 'object'
      ? clone(remoteManifest.manifest)
      : {
        schemaVersion: 1,
        appId: normalizeSegment(context && context.appId || 'kap'),
        environment: normalizeSegment(context && context.environment || 'prod'),
        generatedAt: null,
        checkpoint: {},
        storesMeta: {},
        tombstones: []
      };

    var storeNames = Object.keys(storesMeta);
    for (var i = 0; i < storeNames.length; i++) {
      var storeName = storeNames[i];
      var currentMeta = nextManifest.storesMeta && nextManifest.storesMeta[storeName]
        ? nextManifest.storesMeta[storeName]
        : {};
      var writeStoreResult = await writeStore(context, storeName, stores[storeName] || [], {
        expectedRevision: currentMeta.cloudRevision == null ? null : String(currentMeta.cloudRevision)
      });

      if (!writeStoreResult || writeStoreResult.ok !== true) {
        return writeStoreResult || {
          ok: false,
          conflict: false,
          unavailable: true,
          revision: null,
          message: 'Unable to write store data to Google Drive.'
        };
      }

      var incomingMeta = storesMeta[storeName] || {};
      if (!nextManifest.storesMeta || typeof nextManifest.storesMeta !== 'object') {
        nextManifest.storesMeta = {};
      }

      nextManifest.storesMeta[storeName] = Object.assign({}, incomingMeta, {
        cloudRevision: writeStoreResult.revision || null,
        cloudUpdatedAt: writeStoreResult.updatedAt || null
      });
    }

    nextManifest.generatedAt = payload && payload.generatedAt ? payload.generatedAt : new Date().toISOString();
    nextManifest.checkpoint = payload && payload.checkpoint && typeof payload.checkpoint === 'object'
      ? clone(payload.checkpoint)
      : {};
    nextManifest.tombstones = Array.isArray(payload && payload.tombstones)
      ? clone(payload.tombstones)
      : [];

    var writeManifestResult = await writeManifest(context, nextManifest, {
      expectedRevision: expectedRevision
    });
    if (!writeManifestResult || writeManifestResult.ok !== true) {
      return writeManifestResult || {
        ok: false,
        conflict: false,
        unavailable: true,
        revision: null,
        message: 'Unable to write manifest data to Google Drive.'
      };
    }

    return {
      ok: true,
      conflict: false,
      revision: writeManifestResult.revision || null,
      updatedAt: writeManifestResult.updatedAt || new Date().toISOString()
    };
  }

  window.KaPGoogleDriveSyncGoogleAdapter = {
    getMode: getMode,
    readManifest: readManifest,
    writeManifest: writeManifest,
    readStore: readStore,
    writeStore: writeStore,
    readPayload: readPayload,
    writePayload: writePayload
  };
})();
