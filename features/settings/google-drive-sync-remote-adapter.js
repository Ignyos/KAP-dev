(function () {
  var STORAGE_PREFIX = 'kap.sync.remote.v2.';

  function normalizeSegment(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  }

  function buildContextKey(context) {
    var appId = normalizeSegment(context && context.appId || 'kap');
    var environment = normalizeSegment(context && context.environment || 'prod');
    var account = normalizeSegment(context && context.accountEmail || 'anonymous');
    return appId + '.' + environment + '.' + account;
  }

  function buildManifestKey(context) {
    return STORAGE_PREFIX + buildContextKey(context) + '.manifest';
  }

  function buildStoreKey(context, storeName) {
    return STORAGE_PREFIX + buildContextKey(context) + '.store.' + normalizeSegment(storeName || 'unknown');
  }

  function tryParse(jsonText) {
    if (!jsonText) {
      return null;
    }

    try {
      return JSON.parse(jsonText);
    } catch (_error) {
      return null;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function newRevision() {
    if (window.KaPIds && typeof window.KaPIds.NewId === 'function') {
      return window.KaPIds.NewId();
    }

    return String(Date.now());
  }

  function readEnvelope(storageKey) {
    return tryParse(localStorage.getItem(storageKey));
  }

  function writeEnvelope(storageKey, payload) {
    var revision = newRevision();
    var updatedAt = new Date().toISOString();
    localStorage.setItem(storageKey, JSON.stringify({
      revision: revision,
      updatedAt: updatedAt,
      payload: clone(payload)
    }));

    return {
      revision: revision,
      updatedAt: updatedAt
    };
  }

  function readCurrentRevision(storageKey) {
    var current = readEnvelope(storageKey);
    return current && current.revision ? String(current.revision) : null;
  }

  function checkRevision(storageKey, expectedRevision) {
    var currentRevision = readCurrentRevision(storageKey);
    var normalizedExpected = expectedRevision == null ? null : String(expectedRevision);
    if (normalizedExpected !== currentRevision) {
      return {
        ok: false,
        conflict: true,
        revision: currentRevision,
        message: 'Remote revision changed before write completed.'
      };
    }

    return null;
  }

  async function readManifest(context) {
    var storageKey = buildManifestKey(context);
    var envelope = readEnvelope(storageKey);
    if (!envelope || typeof envelope !== 'object') {
      return {
        found: false,
        revision: null,
        manifest: null,
        updatedAt: null
      };
    }

    return {
      found: true,
      revision: envelope.revision || null,
      manifest: envelope.payload ? clone(envelope.payload) : null,
      updatedAt: envelope.updatedAt || null
    };
  }

  async function writeManifest(context, manifest, options) {
    var storageKey = buildManifestKey(context);
    var writeOptions = options && typeof options === 'object' ? options : {};
    var revisionConflict = checkRevision(storageKey, writeOptions.expectedRevision);
    if (revisionConflict) {
      return revisionConflict;
    }

    var result = writeEnvelope(storageKey, manifest || {});
    return {
      ok: true,
      conflict: false,
      revision: result.revision,
      updatedAt: result.updatedAt
    };
  }

  async function readStore(context, storeName) {
    var storageKey = buildStoreKey(context, storeName);
    var envelope = readEnvelope(storageKey);
    if (!envelope || typeof envelope !== 'object') {
      return {
        found: false,
        revision: null,
        records: null,
        updatedAt: null
      };
    }

    var payload = envelope.payload;
    var records = Array.isArray(payload)
      ? payload
      : (payload && Array.isArray(payload.records) ? payload.records : []);

    return {
      found: true,
      revision: envelope.revision || null,
      records: clone(records),
      updatedAt: envelope.updatedAt || null
    };
  }

  async function writeStore(context, storeName, records, options) {
    var storageKey = buildStoreKey(context, storeName);
    var writeOptions = options && typeof options === 'object' ? options : {};
    var revisionConflict = checkRevision(storageKey, writeOptions.expectedRevision);
    if (revisionConflict) {
      return revisionConflict;
    }

    var payload = {
      store: String(storeName || ''),
      updatedAt: new Date().toISOString(),
      records: Array.isArray(records) ? clone(records) : []
    };

    var result = writeEnvelope(storageKey, payload);
    return {
      ok: true,
      conflict: false,
      revision: result.revision,
      updatedAt: result.updatedAt
    };
  }

  function getMode() {
    return 'mock-localstorage';
  }

  async function readPayload(context) {
    var manifestResult = await readManifest(context);
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
      stores[storeName] = Array.isArray(storeResult && storeResult.records) ? storeResult.records : [];
    }

    return {
      found: true,
      revision: manifestResult.revision || null,
      updatedAt: manifestResult.updatedAt || null,
      payload: {
        schemaVersion: manifest.schemaVersion || 1,
        appId: manifest.appId || 'kap',
        environment: manifest.environment || 'prod',
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

    var manifestResult = await readManifest(context);
    var manifestRevision = manifestResult && manifestResult.revision != null ? String(manifestResult.revision) : null;
    if (expectedRevision !== manifestRevision) {
      return {
        ok: false,
        conflict: true,
        revision: manifestRevision,
        message: 'Remote revision changed before write completed.'
      };
    }

    var nextManifest = manifestResult && manifestResult.manifest && typeof manifestResult.manifest === 'object'
      ? clone(manifestResult.manifest)
      : {
        schemaVersion: 1,
        appId: 'kap',
        environment: 'prod',
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
      var storeWriteResult = await writeStore(context, storeName, stores[storeName] || [], {
        expectedRevision: currentMeta.cloudRevision == null ? null : String(currentMeta.cloudRevision)
      });
      if (!storeWriteResult || storeWriteResult.ok !== true) {
        return storeWriteResult;
      }

      nextManifest.storesMeta[storeName] = Object.assign({}, storesMeta[storeName] || {}, {
        cloudRevision: storeWriteResult.revision || null,
        cloudUpdatedAt: storeWriteResult.updatedAt || null
      });
    }

    nextManifest.generatedAt = payload && payload.generatedAt ? payload.generatedAt : new Date().toISOString();
    nextManifest.checkpoint = payload && payload.checkpoint && typeof payload.checkpoint === 'object'
      ? clone(payload.checkpoint)
      : {};
    nextManifest.tombstones = Array.isArray(payload && payload.tombstones)
      ? clone(payload.tombstones)
      : [];

    var manifestWriteResult = await writeManifest(context, nextManifest, {
      expectedRevision: expectedRevision
    });

    if (!manifestWriteResult || manifestWriteResult.ok !== true) {
      return manifestWriteResult;
    }

    return {
      ok: true,
      conflict: false,
      revision: manifestWriteResult.revision || null,
      updatedAt: manifestWriteResult.updatedAt || new Date().toISOString()
    };
  }

  window.KaPGoogleDriveSyncRemoteAdapter = {
    getMode: getMode,
    readManifest: readManifest,
    writeManifest: writeManifest,
    readStore: readStore,
    writeStore: writeStore,
    readPayload: readPayload,
    writePayload: writePayload
  };
})();
