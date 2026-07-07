(function () {
  var THEME_OPTIONS = [
    { value: 'dark', label: 'Dark' },
    { value: 'spring', label: 'Spring' },
    { value: 'summer', label: 'Summer' },
    { value: 'autumn', label: 'Autumn' },
    { value: 'winter', label: 'Winter' }
  ];

  var TEXT_SIZE_OPTIONS = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' }
  ];

  var CONFLICT_MODE_OPTIONS = [
    { value: 'askUser', label: 'Ask User' },
    { value: 'preferLocal', label: 'Prefer Local' },
    { value: 'preferCloud', label: 'Prefer Cloud' }
  ];

  var REMOTE_MODE_OPTIONS = [
    { value: 'mock', label: 'Mock' },
    { value: 'googleDrive', label: 'Google Drive' }
  ];

  var syncUiRefs = {
    accountStatus: null,
    syncStatus: null,
    pendingDetails: null,
    lastSync: null,
    diagnostics: null,
    syncButton: null
  };

  function formatSyncTimestamp(value) {
    if (!value) {
      return 'Never';
    }

    var parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return 'Unknown';
    }

    return parsed.toLocaleString();
  }

  function getSyncPendingDetail(status, accountLinked) {
    if (!status || status.pendingLocalChanges !== true) {
      return 'No local changes pending sync.';
    }

    if (!accountLinked) {
      return 'Blocked: account not linked.';
    }

    if (status.lastStatus === 'offline') {
      return 'Blocked: offline.';
    }

    if (status.lastStatus === 'syncing') {
      return 'Sync run is active.';
    }

    return 'Pending local changes are ready to sync.';
  }

  function formatSyncDiagnostics(diag, status) {
    var diagnostics = diag || {};
    var retryCount = Number(diagnostics.lastRetryCount || 0);
    var recovered = diagnostics.lastRecoveredFromConflict === true ? 'yes' : 'no';
    var failure = diagnostics.lastFailureReason ? String(diagnostics.lastFailureReason) : 'none';
    if (failure === 'none'
      && status
      && (status.lastStatus === 'error' || status.lastStatus === 'conflict')
      && status.lastMessage) {
      failure = String(status.lastMessage);
    }
    return 'Diagnostics: retries=' + String(retryCount)
      + ' | recovered=' + recovered
      + ' | lastFailure=' + failure;
  }

  function refreshSyncUiState(overrideMessage) {
    var service = window.KaPGoogleDriveSyncService;
    if (!service) {
      return;
    }

    var account = service.getAccountLink ? service.getAccountLink() : null;
    var status = service.getStatus ? service.getStatus() : null;
    var syncing = service.isSyncInProgress ? service.isSyncInProgress() : false;

    if (syncUiRefs.accountStatus) {
      syncUiRefs.accountStatus.textContent = account
        ? 'Linked account: ' + account.email
        : 'No linked account.';
    }

    if (syncUiRefs.syncStatus) {
      syncUiRefs.syncStatus.textContent = overrideMessage
        || (status && status.lastMessage ? status.lastMessage : 'Sync is not configured yet.');
    }

    if (syncUiRefs.pendingDetails) {
      syncUiRefs.pendingDetails.textContent = getSyncPendingDetail(status, !!account);
    }

    if (syncUiRefs.lastSync) {
      var resultLabel = status && status.lastStatus ? String(status.lastStatus) : 'idle';
      syncUiRefs.lastSync.textContent = 'Last sync: ' + formatSyncTimestamp(status && status.lastSyncAt)
        + ' | Result: ' + resultLabel;
    }

    if (syncUiRefs.diagnostics) {
      var diagnostics = service.getSyncDiagnostics ? service.getSyncDiagnostics() : null;
      syncUiRefs.diagnostics.textContent = formatSyncDiagnostics(diagnostics, status);
    }

    if (syncUiRefs.syncButton) {
      syncUiRefs.syncButton.disabled = !account || syncing;
      syncUiRefs.syncButton.textContent = syncing ? 'Syncing...' : 'Sync Now';
    }
  }

  async function renderInto(container, hooks) {
    var section = document.createElement('section');
    section.className = 'settings-shell';

    var header = document.createElement('div');
    header.className = 'detail-header settings-header';

    if (hooks && typeof hooks.onBack === 'function') {
      var backButton = document.createElement('button');
      backButton.type = 'button';
      backButton.className = 'detail-back-button';
      backButton.textContent = '\u2190 Back';
      backButton.addEventListener('click', hooks.onBack);
      header.appendChild(backButton);
    }

    var heading = document.createElement('h2');
    heading.className = 'detail-title';
    heading.textContent = 'Settings';
    header.appendChild(heading);

    var rightSpacer = document.createElement('div');
    rightSpacer.className = 'detail-actions settings-header-spacer';
    rightSpacer.setAttribute('aria-hidden', 'true');
    header.appendChild(rightSpacer);

    section.appendChild(header);

    var syncDebug = null;
    if (window.KaPGoogleDriveSyncService && typeof window.KaPGoogleDriveSyncService.getSyncDebugSnapshot === 'function') {
      try {
        syncDebug = await window.KaPGoogleDriveSyncService.getSyncDebugSnapshot();
      } catch (_syncDebugError) {
        syncDebug = null;
      }
    }

    var body = document.createElement('div');
    body.className = 'settings-body';
    body.appendChild(buildGoogleDriveSyncRow(syncDebug));
    body.appendChild(buildThemeRow());
    body.appendChild(buildTextSizeRow());
    body.appendChild(buildImportExportRow());

    section.appendChild(body);

    container.replaceChildren(section);
    refreshSyncUiState();
  }

  function buildTextSizeRow() {
    var row = document.createElement('div');
    row.className = 'settings-row';

    var label = document.createElement('span');
    label.className = 'settings-row-label';
    label.textContent = 'Text Size';
    row.appendChild(label);

    var control = document.createElement('div');
    control.className = 'settings-segment-control';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', 'Text Size');

    var currentSize = window.KaPSettings.get(window.KaPSettings.KEYS.TEXT_SIZE);

    TEXT_SIZE_OPTIONS.forEach(function (option) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-segment-button';
      if (option.value === currentSize) {
        button.classList.add('settings-segment-button--active');
      }
      button.textContent = option.label;
      button.dataset.size = option.value;

      button.addEventListener('click', function () {
        control.querySelectorAll('.settings-segment-button').forEach(function (b) {
          b.classList.toggle('settings-segment-button--active', b.dataset.size === option.value);
        });
        window.KaPSettings.set(window.KaPSettings.KEYS.TEXT_SIZE, option.value);
        window.KaPSettings.applyTextSize(option.value);
      });

      control.appendChild(button);
    });

    row.appendChild(control);
    return row;
  }

  function buildThemeRow() {
    var row = document.createElement('div');
    row.className = 'settings-row';

    var label = document.createElement('span');
    label.className = 'settings-row-label';
    label.textContent = 'Theme';
    row.appendChild(label);

    var control = document.createElement('div');
    control.className = 'settings-segment-control';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', 'Theme');

    var currentTheme = window.KaPSettings.get(window.KaPSettings.KEYS.THEME);

    THEME_OPTIONS.forEach(function (option) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-segment-button';
      if (option.value === currentTheme) {
        button.classList.add('settings-segment-button--active');
      }
      button.textContent = option.label;
      button.dataset.theme = option.value;

      button.addEventListener('click', function () {
        control.querySelectorAll('.settings-segment-button').forEach(function (b) {
          b.classList.toggle('settings-segment-button--active', b.dataset.theme === option.value);
        });
        window.KaPSettings.set(window.KaPSettings.KEYS.THEME, option.value);
        window.KaPSettings.applyTheme(option.value);
      });

      control.appendChild(button);
    });

    row.appendChild(control);
    return row;
  }

  function buildImportExportRow() {
    var row = document.createElement('div');
    row.className = 'settings-row';

    var label = document.createElement('span');
    label.className = 'settings-row-label';
    label.textContent = 'Data';
    row.appendChild(label);

    var actions = document.createElement('div');
    actions.className = 'settings-inline-actions';

    var exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.className = 'settings-action-button';
    exportButton.textContent = 'Export';
    exportButton.addEventListener('click', function () {
      handleExportClick(exportButton);
    });

    var importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.className = 'settings-action-button settings-action-button--danger';
    importButton.textContent = 'Import';
    importButton.addEventListener('click', function () {
      handleImportClick(importButton);
    });

    actions.appendChild(exportButton);
    actions.appendChild(importButton);
    row.appendChild(actions);

    return row;
  }

  function buildGoogleDriveSyncRow(syncDebug) {
    var row = document.createElement('div');
    row.className = 'settings-row settings-row--stacked';

    var headingWrap = document.createElement('div');
    headingWrap.className = 'settings-row-heading';

    var label = document.createElement('span');
    label.className = 'settings-row-label';
    label.textContent = 'Google Drive Sync (POC)';
    headingWrap.appendChild(label);

    var service = window.KaPGoogleDriveSyncService;
    var account = service ? service.getAccountLink() : null;
    var status = service ? service.getStatus() : null;

    var accountStatus = document.createElement('p');
    accountStatus.className = 'settings-row-note';
    accountStatus.textContent = account
      ? 'Linked account: ' + account.email
      : 'No linked account.';
    headingWrap.appendChild(accountStatus);
    syncUiRefs.accountStatus = accountStatus;

    var syncStatus = document.createElement('p');
    syncStatus.className = 'settings-row-note settings-row-note--muted';
    syncStatus.textContent = status && status.lastMessage
      ? status.lastMessage
      : 'Sync is not configured yet.';
    headingWrap.appendChild(syncStatus);
    syncUiRefs.syncStatus = syncStatus;

    var pendingDetails = document.createElement('p');
    pendingDetails.className = 'settings-row-note settings-row-note--muted';
    pendingDetails.textContent = getSyncPendingDetail(status, !!account);
    headingWrap.appendChild(pendingDetails);
    syncUiRefs.pendingDetails = pendingDetails;

    var lastSync = document.createElement('p');
    lastSync.className = 'settings-row-note settings-row-note--muted';
    lastSync.textContent = 'Last sync: ' + formatSyncTimestamp(status && status.lastSyncAt)
      + ' | Result: ' + String(status && status.lastStatus ? status.lastStatus : 'idle');
    headingWrap.appendChild(lastSync);
    syncUiRefs.lastSync = lastSync;

    var diagnostics = document.createElement('p');
    diagnostics.className = 'settings-row-note settings-row-note--muted';
    diagnostics.textContent = formatSyncDiagnostics(service && service.getSyncDiagnostics ? service.getSyncDiagnostics() : null);
    headingWrap.appendChild(diagnostics);
    syncUiRefs.diagnostics = diagnostics;

    var debugSummary = document.createElement('p');
    debugSummary.className = 'settings-row-note settings-row-note--muted';
    if (syncDebug && syncDebug.payloadSummary) {
      debugSummary.textContent = 'Manifest stores: '
        + String(syncDebug.manifest ? syncDebug.manifest.length : 0)
        + ' | Dirty: ' + String(syncDebug.dirtyCount || 0)
        + ' | Selected mode: ' + String(syncDebug.selectedRemoteMode || 'mock')
        + ' | Adapter: ' + String(syncDebug.adapterMode || 'n/a')
        + ' | Remote rev: ' + String(syncDebug.remoteRevision || 'none')
        + ' | Payload stores: ' + String(syncDebug.payloadSummary.storeCount || 0)
        + ' | Tombstones: ' + String(syncDebug.payloadSummary.tombstoneCount || 0);
    } else {
      debugSummary.textContent = 'Manifest and payload summary will appear after sync metadata is available.';
    }
    headingWrap.appendChild(debugSummary);

    row.appendChild(headingWrap);

    var actions = document.createElement('div');
    actions.className = 'settings-inline-actions';

    var linkButton = document.createElement('button');
    linkButton.type = 'button';
    linkButton.className = 'settings-action-button';
    linkButton.textContent = account ? 'Relink' : 'Link Account';
    linkButton.addEventListener('click', function () {
      handleLinkAccountClick();
    });

    var syncButton = document.createElement('button');
    syncButton.type = 'button';
    syncButton.className = 'settings-action-button';
    syncButton.textContent = 'Sync Now';
    syncButton.disabled = !account || (service && service.isSyncInProgress && service.isSyncInProgress());
    syncButton.addEventListener('click', function () {
      handleSyncNowClick();
    });
    syncUiRefs.syncButton = syncButton;

    var signOutButton = document.createElement('button');
    signOutButton.type = 'button';
    signOutButton.className = 'settings-action-button settings-action-button--danger';
    signOutButton.textContent = 'Sign Out';
    signOutButton.disabled = !account;
    signOutButton.addEventListener('click', function () {
      handleSyncSignOutClick();
    });

    actions.appendChild(linkButton);
    actions.appendChild(syncButton);
    actions.appendChild(signOutButton);
    row.appendChild(actions);

    var debugActions = document.createElement('div');
    debugActions.className = 'settings-inline-actions';

    var manifestButton = document.createElement('button');
    manifestButton.type = 'button';
    manifestButton.className = 'settings-action-button settings-action-button--subtle';
    manifestButton.textContent = 'View Manifest';
    manifestButton.addEventListener('click', function () {
      handleViewManifestClick();
    });

    var payloadButton = document.createElement('button');
    payloadButton.type = 'button';
    payloadButton.className = 'settings-action-button settings-action-button--subtle';
    payloadButton.textContent = 'Preview Payload';
    payloadButton.addEventListener('click', function () {
      handlePreviewPayloadClick();
    });

    debugActions.appendChild(manifestButton);
    debugActions.appendChild(payloadButton);
    row.appendChild(debugActions);

    var remoteModeWrap = document.createElement('div');
    remoteModeWrap.className = 'settings-sub-row';

    var remoteModeLabel = document.createElement('span');
    remoteModeLabel.className = 'settings-row-label';
    remoteModeLabel.textContent = 'Remote Mode';
    remoteModeWrap.appendChild(remoteModeLabel);

    var remoteModeControl = document.createElement('div');
    remoteModeControl.className = 'settings-segment-control';
    remoteModeControl.setAttribute('role', 'group');
    remoteModeControl.setAttribute('aria-label', 'Sync Remote Mode');

    var selectedRemoteMode = (service && typeof service.getRemoteMode === 'function')
      ? service.getRemoteMode()
      : 'mock';

    REMOTE_MODE_OPTIONS.forEach(function (option) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-segment-button';
      if (option.value === selectedRemoteMode) {
        button.classList.add('settings-segment-button--active');
      }
      button.dataset.remoteMode = option.value;
      button.textContent = option.label;
      button.addEventListener('click', async function () {
        if (!window.KaPGoogleDriveSyncService || typeof window.KaPGoogleDriveSyncService.setRemoteMode !== 'function') {
          return;
        }

        try {
          window.KaPGoogleDriveSyncService.setRemoteMode(option.value);
          remoteModeControl.querySelectorAll('.settings-segment-button').forEach(function (b) {
            b.classList.toggle('settings-segment-button--active', b.dataset.remoteMode === option.value);
          });
          await window.KaPUI.ShowAlert({
            title: 'Remote Mode Updated',
            message: 'Sync remote mode set to ' + option.label + '.'
          });
          window.location.reload();
        } catch (error) {
          await window.KaPUI.ShowAlert({
            title: 'Unable to Change Remote Mode',
            message: error && error.message ? error.message : 'Unable to update sync remote mode.'
          });
        }
      });

      remoteModeControl.appendChild(button);
    });

    remoteModeWrap.appendChild(remoteModeControl);
    row.appendChild(remoteModeWrap);

    var conflictWrap = document.createElement('div');
    conflictWrap.className = 'settings-sub-row';

    var conflictLabel = document.createElement('span');
    conflictLabel.className = 'settings-row-label';
    conflictLabel.textContent = 'Conflict Mode';
    conflictWrap.appendChild(conflictLabel);

    var conflictControl = document.createElement('div');
    conflictControl.className = 'settings-segment-control';
    conflictControl.setAttribute('role', 'group');
    conflictControl.setAttribute('aria-label', 'Sync Conflict Mode');

    var currentMode = service ? service.getConflictMode() : 'askUser';
    CONFLICT_MODE_OPTIONS.forEach(function (option) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-segment-button';
      if (option.value === currentMode) {
        button.classList.add('settings-segment-button--active');
      }
      button.dataset.conflictMode = option.value;
      button.textContent = option.label;
      button.addEventListener('click', async function () {
        if (!window.KaPGoogleDriveSyncService) {
          return;
        }

        try {
          window.KaPGoogleDriveSyncService.setConflictMode(option.value);
          conflictControl.querySelectorAll('.settings-segment-button').forEach(function (b) {
            b.classList.toggle('settings-segment-button--active', b.dataset.conflictMode === option.value);
          });
        } catch (error) {
          await window.KaPUI.ShowAlert({
            title: 'Unable to Save Conflict Mode',
            message: error && error.message ? error.message : 'Unable to save sync conflict mode.'
          });
        }
      });

      conflictControl.appendChild(button);
    });

    conflictWrap.appendChild(conflictControl);
    row.appendChild(conflictWrap);

    return row;
  }

  async function handleLinkAccountClick() {
    if (!window.KaPGoogleDriveSyncService) {
      await window.KaPUI.ShowAlert({
        title: 'Sync Service Not Available',
        message: 'Google Drive sync service is not loaded.'
      });
      return;
    }

    try {
      var remoteMode = typeof window.KaPGoogleDriveSyncService.getRemoteMode === 'function'
        ? window.KaPGoogleDriveSyncService.getRemoteMode()
        : 'mock';
      var linked;

      if (remoteMode === 'googleDrive') {
        linked = await window.KaPGoogleDriveSyncService.linkAccount();
      } else {
        var email = await window.KaPUI.ShowPrompt({
          title: 'Link Google Account (POC)',
          confirmLabel: 'Link',
          placeholder: 'name@example.com',
          value: ''
        });

        if (email == null) {
          return;
        }

        linked = await window.KaPGoogleDriveSyncService.linkAccount(email);
      }

      await window.KaPUI.ShowAlert({
        title: 'Account Linked',
        message: 'Linked to ' + linked.email + '. Local data remains on this device.'
      });
      window.location.reload();
    } catch (error) {
      await window.KaPUI.ShowAlert({
        title: 'Link Failed',
        message: error && error.message ? error.message : 'Unable to link account.'
      });
    }
  }

  async function handleSyncNowClick() {
    if (!window.KaPGoogleDriveSyncService) {
      await window.KaPUI.ShowAlert({
        title: 'Sync Service Not Available',
        message: 'Google Drive sync service is not loaded.'
      });
      return;
    }

    refreshSyncUiState('Sync starting...');

    try {
      var syncPromise = window.KaPGoogleDriveSyncService.syncNow({
        trigger: 'manual',
        reason: 'sync-now-button',
        silent: false
      });
      refreshSyncUiState('Sync in progress...');
      var result = await syncPromise;
      refreshSyncUiState();

      if (window.KaPUI && typeof window.KaPUI.ShowTimedNotice === 'function') {
        window.KaPUI.ShowTimedNotice({
          title: result && result.ok ? 'Sync complete' : 'Sync not completed',
          message: result && result.message ? result.message : 'Unable to run sync right now.',
          durationMs: 2400,
          isError: !(result && result.ok)
        });
      }
    } catch (error) {
      refreshSyncUiState('Sync failed. Try again.');
      await window.KaPUI.ShowAlert({
        title: 'Sync Failed',
        message: error && error.message ? error.message : 'Unable to run sync right now.'
      });
    }
  }

  async function handleSyncSignOutClick() {
    if (!window.KaPGoogleDriveSyncService) {
      await window.KaPUI.ShowAlert({
        title: 'Sync Service Not Available',
        message: 'Google Drive sync service is not loaded.'
      });
      return;
    }

    var confirmed = await window.KaPUI.ShowConfirm({
      title: 'Sign Out of Google Sync?',
      message: 'This disconnects cloud sync for this device but keeps your local data.',
      confirmLabel: 'Sign Out',
      isDanger: true
    });

    if (!confirmed) {
      return;
    }

    window.KaPGoogleDriveSyncService.signOut();
    await window.KaPUI.ShowAlert({
      title: 'Signed Out',
      message: 'Cloud link removed. Local IndexedDB data is unchanged.'
    });
    window.location.reload();
  }

  async function handleViewManifestClick() {
    if (!window.KaPGoogleDriveSyncService || typeof window.KaPGoogleDriveSyncService.getManifestRecords !== 'function') {
      await window.KaPUI.ShowAlert({
        title: 'Manifest Not Available',
        message: 'Sync manifest service is not loaded.'
      });
      return;
    }

    try {
      var records = await window.KaPGoogleDriveSyncService.getManifestRecords();
      if (!records.length) {
        await window.KaPUI.ShowAlert({
          title: 'Sync Manifest',
          message: 'No manifest records yet. Make local edits to seed store tracking.'
        });
        return;
      }

      var lines = records.map(function (entry) {
        var store = String(entry && entry.store || 'unknown');
        var status = String(entry && entry.lastSyncStatus || 'idle');
        var dirty = entry && entry.dirty === true ? 'dirty' : 'clean';
        var lastUpdate = entry && entry.localLastUpdate ? String(entry.localLastUpdate) : 'n/a';
        return store + ': ' + status + ', ' + dirty + ', localLastUpdate=' + lastUpdate;
      });

      await window.KaPUI.ShowAlert({
        title: 'Sync Manifest',
        message: lines.join('\n')
      });
    } catch (error) {
      await window.KaPUI.ShowAlert({
        title: 'Manifest Read Failed',
        message: error && error.message ? error.message : 'Unable to load manifest records.'
      });
    }
  }

  async function handlePreviewPayloadClick() {
    if (!window.KaPGoogleDriveSyncService || typeof window.KaPGoogleDriveSyncService.buildLocalPayloadScaffold !== 'function') {
      await window.KaPUI.ShowAlert({
        title: 'Payload Preview Not Available',
        message: 'Payload scaffold builder is not loaded.'
      });
      return;
    }

    try {
      var payload = await window.KaPGoogleDriveSyncService.buildLocalPayloadScaffold({ includeRecords: false });
      var storeNames = Object.keys(payload && payload.storesMeta || {});
      var firstStores = storeNames.slice(0, 5).join(', ');
      var message = 'schemaVersion=' + String(payload.schemaVersion)
        + '\nappId=' + String(payload.appId)
        + '\nenvironment=' + String(payload.environment)
        + '\ngeneratedAt=' + String(payload.generatedAt)
        + '\nstoreCount=' + String(storeNames.length)
        + '\ntombstoneCount=' + String(Array.isArray(payload.tombstones) ? payload.tombstones.length : 0)
        + '\nexampleStores=' + (firstStores || 'none');

      await window.KaPUI.ShowAlert({
        title: 'Payload Preview',
        message: message
      });
    } catch (error) {
      await window.KaPUI.ShowAlert({
        title: 'Payload Preview Failed',
        message: error && error.message ? error.message : 'Unable to build payload scaffold.'
      });
    }
  }

  async function handleExportClick(button) {
    if (!window.KaPImportExportService) {
      await window.KaPUI.ShowAlert({
        title: 'Export Not Available',
        message: 'Import/export service is not loaded.'
      });
      return;
    }

    button.disabled = true;
    try {
      await window.KaPImportExportService.downloadExportFile();
      await window.KaPUI.ShowAlert({
        title: 'Export Complete',
        message: 'Your data was exported successfully.'
      });
    } catch (error) {
      await window.KaPUI.ShowAlert({
        title: 'Export Failed',
        message: error && error.message ? error.message : 'Unable to export data.'
      });
    } finally {
      button.disabled = false;
    }
  }

  async function handleImportClick(button) {
    if (!window.KaPImportExportService) {
      await window.KaPUI.ShowAlert({
        title: 'Import Not Available',
        message: 'Import/export service is not loaded.'
      });
      return;
    }

    var mode = await chooseImportMode();
    if (!mode) {
      return;
    }

    button.disabled = true;
    try {
      var file = await window.KaPImportExportService.openFilePicker();
      if (!file) {
        return;
      }

      var payload = await window.KaPImportExportService.parseJsonFile(file);
      var result = await window.KaPImportExportService.importData(payload, mode);

      await window.KaPUI.ShowAlert({
        title: 'Import Complete',
        message: buildImportSummaryMessage(result)
      });

      window.location.reload();
    } catch (error) {
      await window.KaPUI.ShowAlert({
        title: 'Import Failed',
        message: error && error.message ? error.message : 'Unable to import data.'
      });
    } finally {
      button.disabled = false;
    }
  }

  async function chooseImportMode() {
    var mode = await window.KaPUI.ShowImportModeModal();
    if (!mode) {
      return null;
    }

    if (mode === 'merge') {
      return 'merge';
    }

    var useReplace = await window.KaPUI.ShowConfirm({
      title: 'Replace Existing Data?',
      message: 'Replace deletes all current local data and restores only the imported file.',
      confirmLabel: 'Replace',
      isDanger: true
    });

    return useReplace ? 'replace' : null;
  }

  function buildImportSummaryMessage(result) {
    var modeLabel = String(result && result.mode || 'replace').toUpperCase();
    var stores = result && result.storeSummaries ? result.storeSummaries : {};
    var storeNames = Object.keys(stores);
    var inserted = 0;
    var updated = 0;
    var skippedOlder = 0;
    var skippedInvalid = 0;
    var tombstoneDeleted = Number(result && result.tombstoneApplication && result.tombstoneApplication.deleted || 0);
    var tombstonePurged = Number(result && result.tombstoneRetention && result.tombstoneRetention.purged || 0);

    for (var i = 0; i < storeNames.length; i++) {
      var summary = stores[storeNames[i]] || {};
      inserted += Number(summary.inserted || 0);
      updated += Number(summary.updated || 0);
      skippedOlder += Number(summary.skippedOlder || 0);
      skippedInvalid += Number(summary.skippedInvalid || 0);
    }

    return modeLabel + ' import complete. '
      + 'Inserted: ' + inserted + '. '
      + 'Updated: ' + updated + '. '
      + 'Deleted by tombstones: ' + tombstoneDeleted + '. '
        + 'Purged tombstones (365d): ' + tombstonePurged + '. '
      + 'Skipped older: ' + skippedOlder + '. '
      + 'Skipped invalid: ' + skippedInvalid + '. '
      + 'The app will now reload.';
  }

  window.KaPSettingsPage = {
    renderInto: renderInto
  };
})();

