(function () {
  var EXPORT_SCHEMA_VERSION = 2;
  var TOMBSTONE_STORE_NAME = 'syncTombstones';
  var TOMBSTONE_RETENTION_DAYS = 365;
  var DAY_IN_MS = 24 * 60 * 60 * 1000;

  var EXPORT_STORE_ORDER = [
    'items',
    'categories',
    'listRecords',
    'listRecordItems',
    'recipeVersions',
    'recipeInstructions',
    'tags',
    'recipeTagMap',
    'unitOfMeasures',
    TOMBSTONE_STORE_NAME
  ];

  var MERGE_DATA_STORE_ORDER = EXPORT_STORE_ORDER.filter(function (storeName) {
    return storeName !== TOMBSTONE_STORE_NAME;
  });

  function makeTimestamp() {
    return new Date().toISOString();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cloneForJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function exportData() {
    await window.KaPDB.open();
    await pruneExpiredTombstones();

    var stores = {};
    for (var i = 0; i < EXPORT_STORE_ORDER.length; i++) {
      var storeName = EXPORT_STORE_ORDER[i];
      stores[storeName] = await window.KaPDB.readAll(storeName);
    }

    return {
      exportSchemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAtUtc: makeTimestamp(),
      app: {
        name: 'Kitchen and Pantry',
        databaseName: 'ignyos.kap',
        databaseVersion: Number(window.KaPDB.DB_VERSION || 0)
      },
      stores: stores
    };
  }

  function normalizeStoreMap(rawStores) {
    var source = rawStores && typeof rawStores === 'object' ? rawStores : {};
    var normalized = {};

    for (var i = 0; i < EXPORT_STORE_ORDER.length; i++) {
      var storeName = EXPORT_STORE_ORDER[i];
      normalized[storeName] = asArray(source[storeName]);
    }

    return normalized;
  }

  function validatePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid import file.');
    }

    var schemaVersion = Number(payload.exportSchemaVersion || 0);
    if (schemaVersion <= 0 || schemaVersion > EXPORT_SCHEMA_VERSION) {
      throw new Error('Unsupported export schema version: ' + String(payload.exportSchemaVersion || 'unknown') + '.');
    }

    if (!payload.stores || typeof payload.stores !== 'object') {
      throw new Error('Import file is missing stores.');
    }
  }

  function normalizeImportMode(mode) {
    var normalized = String(mode || 'replace').trim().toLowerCase();
    return normalized === 'merge' ? 'merge' : 'replace';
  }

  function getTimestampValue(record) {
    var raw = record && record.updatedDate ? String(record.updatedDate) : '';
    if (!raw) {
      return null;
    }

    var parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getTombstoneTimestampValue(record) {
    var deletedRaw = record && record.deletedDate ? String(record.deletedDate) : '';
    if (deletedRaw) {
      var deletedParsed = Date.parse(deletedRaw);
      if (Number.isFinite(deletedParsed)) {
        return deletedParsed;
      }
    }

    return getTimestampValue(record);
  }

  function getRetentionCutoffMs() {
    return Date.now() - (TOMBSTONE_RETENTION_DAYS * DAY_IN_MS);
  }

  async function pruneExpiredTombstones() {
    var summary = {
      purged: 0,
      skippedInvalid: 0
    };

    var cutoffMs = getRetentionCutoffMs();
    var tombstones = await window.KaPDB.readAll(TOMBSTONE_STORE_NAME);

    for (var i = 0; i < tombstones.length; i++) {
      var tombstone = tombstones[i] || {};
      var tombstoneId = getRecordId(tombstone);
      var tombstoneTs = getTombstoneTimestampValue(tombstone);

      if (!tombstoneId || tombstoneTs === null) {
        summary.skippedInvalid += 1;
        continue;
      }

      if (tombstoneTs < cutoffMs) {
        await window.KaPDB.removeHard(TOMBSTONE_STORE_NAME, tombstoneId);
        summary.purged += 1;
      }
    }

    return summary;
  }

  function getRecordId(record) {
    if (!record || typeof record !== 'object') {
      return null;
    }

    var id = record.id;
    if (id === null || id === undefined || id === '') {
      return null;
    }

    return String(id);
  }

  function normalizeUnitMatchKey(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getUnitMatchKey(record) {
    return normalizeUnitMatchKey(record && record.key);
  }

  function getUnitMatchName(record) {
    return normalizeUnitMatchKey(record && record.name);
  }

  function cloneRecord(record) {
    return Object.assign({}, record || {});
  }

  function isIncomingRecordNewer(incoming, existing) {
    var incomingTs = getTimestampValue(incoming);
    var existingTs = getTimestampValue(existing);

    if (incomingTs === null && existingTs !== null) {
      return false;
    }

    if (incomingTs !== null && existingTs !== null && incomingTs < existingTs) {
      return false;
    }

    return true;
  }

  function resolveRemappedId(idMap, id) {
    var current = String(id || '');
    if (!current) {
      return current;
    }

    var guard = 0;
    while (idMap[current] && idMap[current] !== current && guard < 20) {
      current = idMap[current];
      guard += 1;
    }

    return current;
  }

  function remapUnitIdsInStores(stores, idMap) {
    if (!idMap || Object.keys(idMap).length === 0) {
      return;
    }

    var joinRecords = asArray(stores.listRecordItems);
    for (var i = 0; i < joinRecords.length; i++) {
      var joinRecord = joinRecords[i];
      var unitId = String(joinRecord && joinRecord.unitOfMeasureId || '');
      if (!unitId) {
        continue;
      }

      var remappedJoinId = resolveRemappedId(idMap, unitId);
      if (remappedJoinId && remappedJoinId !== unitId) {
        joinRecord.unitOfMeasureId = remappedJoinId;
      }
    }

    var recipeVersions = asArray(stores.recipeVersions);
    for (var j = 0; j < recipeVersions.length; j++) {
      var version = recipeVersions[j] || {};
      var snapshotItems = asArray(version.snapshotItems);
      for (var k = 0; k < snapshotItems.length; k++) {
        var snapshotItem = snapshotItems[k] || {};
        var snapshotUnitId = String(snapshotItem.unitOfMeasureId || '');
        if (!snapshotUnitId) {
          continue;
        }

        var remappedSnapshotId = resolveRemappedId(idMap, snapshotUnitId);
        if (remappedSnapshotId && remappedSnapshotId !== snapshotUnitId) {
          snapshotItem.unitOfMeasureId = remappedSnapshotId;
        }
      }
    }
  }

  function dedupeIncomingUnitsById(incomingUnits) {
    var deduped = [];
    var byId = {};

    for (var i = 0; i < incomingUnits.length; i++) {
      var record = incomingUnits[i];
      var id = getRecordId(record);
      if (!id) {
        deduped.push(record);
        continue;
      }

      var existing = byId[id];
      if (!existing || isIncomingRecordNewer(record, existing)) {
        byId[id] = record;
      }
    }

    var seenIds = {};
    for (var j = 0; j < incomingUnits.length; j++) {
      var source = incomingUnits[j];
      var sourceId = getRecordId(source);
      if (!sourceId) {
        continue;
      }
      if (seenIds[sourceId]) {
        continue;
      }

      seenIds[sourceId] = true;
      deduped.push(byId[sourceId]);
    }

    return deduped;
  }

  async function reconcileIncomingUnitOfMeasures(stores, importMode) {
    var incomingUnits = asArray(stores.unitOfMeasures);
    if (incomingUnits.length === 0) {
      return;
    }

    var remappedIds = {};
    var normalizedIncoming = [];
    var localByKey = {};
    var localByName = {};

    if (importMode === 'merge') {
      var localUnits = await window.KaPDB.readAll(window.KaPStores.STORE_NAMES.UNIT_OF_MEASURES);
      for (var i = 0; i < localUnits.length; i++) {
        var localUnit = localUnits[i];
        var localKey = getUnitMatchKey(localUnit);
        var localName = getUnitMatchName(localUnit);

        if (localKey && !localByKey[localKey]) {
          localByKey[localKey] = localUnit;
        }
        if (localName && !localByName[localName]) {
          localByName[localName] = localUnit;
        }
      }
    }

    for (var j = 0; j < incomingUnits.length; j++) {
      var incoming = incomingUnits[j] || {};
      var incomingId = getRecordId(incoming);
      if (!incomingId) {
        normalizedIncoming.push(incoming);
        continue;
      }

      var candidate = cloneRecord(incoming);
      if (importMode === 'merge') {
        var incomingKey = getUnitMatchKey(incoming);
        var incomingName = getUnitMatchName(incoming);
        var matchedLocal = null;

        if (incomingKey && localByKey[incomingKey]) {
          matchedLocal = localByKey[incomingKey];
        } else if (incomingName && localByName[incomingName]) {
          matchedLocal = localByName[incomingName];
        }

        if (matchedLocal && matchedLocal.id && String(matchedLocal.id) !== incomingId) {
          remappedIds[incomingId] = String(matchedLocal.id);
          candidate.id = String(matchedLocal.id);
        }
      }

      normalizedIncoming.push(candidate);
    }

    stores.unitOfMeasures = dedupeIncomingUnitsById(normalizedIncoming);
    remapUnitIdsInStores(stores, remappedIds);
  }

  async function mergeStore(storeName, incomingRecords) {
    var summary = {
      inserted: 0,
      updated: 0,
      skippedOlder: 0,
      skippedInvalid: 0
    };

    var localRecords = await window.KaPDB.readAll(storeName);
    var localById = {};

    for (var i = 0; i < localRecords.length; i++) {
      var localRecord = localRecords[i];
      var localId = getRecordId(localRecord);
      if (localId) {
        localById[localId] = localRecord;
      }
    }

    for (var j = 0; j < incomingRecords.length; j++) {
      var incomingRecord = incomingRecords[j];
      var incomingId = getRecordId(incomingRecord);
      if (!incomingId) {
        summary.skippedInvalid += 1;
        continue;
      }

      var existingRecord = localById[incomingId];
      if (!existingRecord) {
        await window.KaPDB.upsert(storeName, incomingRecord);
        localById[incomingId] = incomingRecord;
        summary.inserted += 1;
        continue;
      }

      var incomingTs = getTimestampValue(incomingRecord);
      var existingTs = getTimestampValue(existingRecord);

      if (incomingTs === null && existingTs !== null) {
        summary.skippedOlder += 1;
        continue;
      }

      if (incomingTs !== null && existingTs !== null && incomingTs < existingTs) {
        summary.skippedOlder += 1;
        continue;
      }

      await window.KaPDB.upsert(storeName, incomingRecord);
      localById[incomingId] = incomingRecord;
      summary.updated += 1;
    }

    return summary;
  }

  async function applyMergedTombstones() {
    var summary = {
      deleted: 0,
      skippedOlder: 0,
      skippedInvalid: 0
    };

    var tombstones = await window.KaPDB.readAll(TOMBSTONE_STORE_NAME);
    for (var i = 0; i < tombstones.length; i++) {
      var tombstone = tombstones[i] || {};
      var storeName = String(tombstone.storeName || '');
      var recordId = String(tombstone.recordId || '');

      if (!storeName || !recordId || MERGE_DATA_STORE_ORDER.indexOf(storeName) === -1) {
        summary.skippedInvalid += 1;
        continue;
      }

      var localRecord = await window.KaPDB.readByKey(storeName, recordId);
      if (!localRecord) {
        continue;
      }

      var tombstoneTs = getTombstoneTimestampValue(tombstone);
      var localTs = getTimestampValue(localRecord);

      if (tombstoneTs === null) {
        summary.skippedInvalid += 1;
        continue;
      }

      if (localTs !== null && localTs > tombstoneTs) {
        summary.skippedOlder += 1;
        continue;
      }

      await window.KaPDB.removeHard(storeName, recordId);
      summary.deleted += 1;
    }

    return summary;
  }

  async function importData(payload, mode) {
    await window.KaPDB.open();
    validatePayload(payload);

    var stores = normalizeStoreMap(payload.stores);
    var importMode = normalizeImportMode(mode);
    var storeSummaries = {};

    await reconcileIncomingUnitOfMeasures(stores, importMode);

    if (importMode === 'replace') {
      await window.KaPDB.replaceStores(stores);

      for (var i = 0; i < EXPORT_STORE_ORDER.length; i++) {
        var replaceStoreName = EXPORT_STORE_ORDER[i];
        storeSummaries[replaceStoreName] = {
          inserted: stores[replaceStoreName].length,
          updated: 0,
          skippedOlder: 0,
          skippedInvalid: 0
        };
      }
    } else {
      for (var j = 0; j < MERGE_DATA_STORE_ORDER.length; j++) {
        var mergeStoreName = MERGE_DATA_STORE_ORDER[j];
        storeSummaries[mergeStoreName] = await mergeStore(mergeStoreName, stores[mergeStoreName]);
      }

      storeSummaries[TOMBSTONE_STORE_NAME] = await mergeStore(TOMBSTONE_STORE_NAME, stores[TOMBSTONE_STORE_NAME]);
    }

    var tombstoneRetention = await pruneExpiredTombstones();
    var tombstoneApplication = await applyMergedTombstones();

    return {
      mode: importMode,
      importedAtUtc: makeTimestamp(),
      importedStoreCounts: Object.keys(stores).reduce(function (acc, storeName) {
        acc[storeName] = stores[storeName].length;
        return acc;
      }, {}),
      storeSummaries: storeSummaries,
      tombstoneApplication: tombstoneApplication,
      tombstoneRetention: tombstoneRetention
    };
  }

  function buildExportFilename() {
    var stamp = makeTimestamp().replace(/[:]/g, '-').replace(/\..+$/, '').replace('T', '_');
    return 'kap-export-v' + String(EXPORT_SCHEMA_VERSION) + '-' + stamp + '.json';
  }

  async function downloadExportFile() {
    var payload = await exportData();
    var json = JSON.stringify(cloneForJson(payload), null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);

    try {
      var link = document.createElement('a');
      link.href = url;
      link.download = buildExportFilename();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(url);
    }

    return payload;
  }

  async function parseJsonFile(file) {
    if (!file) {
      throw new Error('No file selected.');
    }

    var text = await file.text();
    var payload = JSON.parse(text);
    return payload;
  }

  function openFilePicker() {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.style.display = 'none';

      function cleanup() {
        input.removeEventListener('change', onChange);
        if (input.parentNode) {
          document.body.removeChild(input);
        }
      }

      function onChange() {
        var file = input.files && input.files[0] ? input.files[0] : null;
        cleanup();
        resolve(file);
      }

      input.addEventListener('change', onChange);
      document.body.appendChild(input);
      input.click();
    });
  }

  window.KaPImportExportService = {
    EXPORT_SCHEMA_VERSION: EXPORT_SCHEMA_VERSION,
    EXPORT_STORE_ORDER: EXPORT_STORE_ORDER.slice(),
    TOMBSTONE_RETENTION_DAYS: TOMBSTONE_RETENTION_DAYS,
    exportData: exportData,
    importData: importData,
    downloadExportFile: downloadExportFile,
    openFilePicker: openFilePicker,
    parseJsonFile: parseJsonFile
  };
})();
