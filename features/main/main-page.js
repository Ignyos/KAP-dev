(function () {
  var sectionDefinitions = [
    {
      id: 'lists',
      label: 'Grocery Lists',
      getAllFn: function () { return window.KaPListsService.getAllLists(); },
      renderDetailFn: function (container, record, hooks) { return window.KaPListsPage.renderDetailInto(container, record, hooks); },
      createFn: function () { return window.KaPListsPage.createList(); }
    },
    {
      id: 'templates',
      label: 'Pantry & Fridge',
      getAllFn: function () { return window.KaPTemplatesService.getAllTemplates(); },
      renderDetailFn: function (container, record, hooks) { return window.KaPTemplatesPage.renderDetailInto(container, record, hooks); },
      createFn: function () { return window.KaPTemplatesPage.createTemplate(); }
    },
    {
      id: 'recipes',
      label: 'Recipes',
      getAllFn: function () { return window.KaPRecipesService.getAllRecipes(); },
      renderDetailFn: function (container, record, hooks) { return window.KaPRecipesPage.renderDetailInto(container, record, hooks); },
      createFn: async function () {
        var name = await window.KaPUI.ShowPrompt({
          title: 'New Recipe',
          placeholder: 'Recipe name',
          confirmLabel: 'Create'
        });

        if (name === null) {
          return null;
        }

        return window.KaPRecipesService.createRecipe(name);
      }
    }
  ];

  var state = {
    expandedSectionIds: getSavedExpandedSections(),
    settingsReturnPath: '/'
  };

  var currentRoute = null;
  var requestedDetailRecord = null;
  var pantryInfoText = 'Pantry & Fridge lists keep track of what you usually keep on hand. Use them as checklists to generate shopping lists.';
  var deferredInstallPrompt = null;
  var isInstalled = false;
  var installMenuButtonRef = null;

  function normalizeTagList(tags) {
    return (Array.isArray(tags) ? tags : []).map(function (tag) {
      return String(tag || '').trim().toLowerCase();
    }).filter(function (tag) {
      return !!tag;
    });
  }

  function recipeMatchesQuery(record, query) {
    var normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    var recipeName = String((record && record.name) || '').toLowerCase();
    if (recipeName.indexOf(normalizedQuery) >= 0) {
      return true;
    }

    return normalizeTagList(record && record.tags).some(function (tag) {
      return tag.indexOf(normalizedQuery) >= 0;
    });
  }

  function getSavedExpandedSections() {
    var saved = window.KaPSettings.get(window.KaPSettings.KEYS.EXPANDED_ACCORDION_SECTIONS);
    return saved || [];
  }

  function saveExpandedSections(sectionIds) {
    window.KaPSettings.set(window.KaPSettings.KEYS.EXPANDED_ACCORDION_SECTIONS, sectionIds);
  }

  function getSavedMainPageScrollTop() {
    var value = window.KaPSettings.get(window.KaPSettings.KEYS.MAIN_PAGE_SCROLL_TOP);
    if (typeof value !== 'number' || !isFinite(value) || value < 0) {
      return 0;
    }

    return value;
  }

  function saveMainPageScrollTop(value) {
    var safeValue = typeof value === 'number' && isFinite(value) && value > 0 ? Math.round(value) : 0;
    window.KaPSettings.set(window.KaPSettings.KEYS.MAIN_PAGE_SCROLL_TOP, safeValue);
  }

  function restoreMainPageScrollTop() {
    var saved = getSavedMainPageScrollTop();
    window.requestAnimationFrame(function () {
      window.scrollTo(0, saved);
    });
  }

  function findSection(id) {
    return sectionDefinitions.find(function (section) {
      return section.id === id;
    });
  }

  function getPathForRoute(route) {
    if (!route) {
      return '/';
    }

    if (route.view === 'list' && route.id) {
      return '/list/' + route.id;
    }

    if (route.view === 'template' && route.id) {
      return '/template/' + route.id;
    }

    if (route.view === 'recipe' && route.id) {
      return '/recipe/' + route.id;
    }

    return '/';
  }

  function onRouteChange(route) {
    var previousRoute = currentRoute;

    if (previousRoute && previousRoute.view === 'home' && route.view !== 'home') {
      saveMainPageScrollTop(window.scrollY || 0);
    }

    currentRoute = route;

    if (route.view !== 'settings' && route.view !== 'uom') {
      state.settingsReturnPath = getPathForRoute(route);
    }
    
    if (route.view === 'home') {
      renderHome().catch(function (error) {
        console.error('Error rendering home:', error);
      }).then(function () {
        restoreMainPageScrollTop();
      });
    } else if (route.view === 'settings') {
      renderSettingsPage().catch(function (error) {
        console.error('Error rendering settings:', error);
      });
    } else if (route.view === 'uom') {
      renderUomPage().catch(function (error) {
        console.error('Error rendering uom:', error);
      });
    } else if (route.view === 'list' && route.id) {
      renderListDetail(route.id).catch(function (error) {
        console.error('Error rendering list detail:', error);
      });
    } else if (route.view === 'template' && route.id) {
      renderTemplateDetail(route.id).catch(function (error) {
        console.error('Error rendering template detail:', error);
      });
    } else if (route.view === 'recipe' && route.id) {
      renderRecipeDetail(route.id).catch(function (error) {
        console.error('Error rendering recipe detail:', error);
      });
    }
  }

  async function renderHome() {
    var contentContainer = document.getElementById('main-content');
    if (!contentContainer) {
      console.error('Content container not found');
      return;
    }
    
    // Get counts for all sections
    var counts = {};
    for (var i = 0; i < sectionDefinitions.length; i++) {
      var section = sectionDefinitions[i];
      try {
        var records = await section.getAllFn();
        counts[section.id] = records.length;
      } catch (error) {
        console.error('Error fetching ' + section.id + ':', error);
        counts[section.id] = 0;
      }
    }

    // Render accordion home view
    contentContainer.innerHTML = '';
    var homeContainer = document.createElement('div');
    homeContainer.className = 'accordion-container';

    for (var j = 0; j < sectionDefinitions.length; j++) {
      var currentSection = sectionDefinitions[j];
      var isExpanded = state.expandedSectionIds.indexOf(currentSection.id) >= 0;
      
      var accordionSection = createAccordionSection(
        currentSection,
        counts[currentSection.id],
        isExpanded
      );
      homeContainer.appendChild(accordionSection);
    }

    contentContainer.appendChild(homeContainer);
  }

  function createAccordionSection(section, count, isExpanded) {
    var container = document.createElement('div');
    container.className = 'accordion-section';
    container.dataset.sectionId = section.id;

    var header = document.createElement('div');
    header.className = 'accordion-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    header.setAttribute('aria-controls', 'accordion-content-' + section.id);

    header.addEventListener('click', function () {
      handleSectionToggle(section.id);
    });

    header.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSectionToggle(section.id);
      }
    });

    var headerLabel = document.createElement('span');
    headerLabel.className = 'accordion-label';

    var headerLabelText = document.createElement('span');
    headerLabelText.textContent = section.label;

    var infoButton = document.createElement('button');
    infoButton.type = 'button';
    infoButton.className = 'accordion-info-icon';
    infoButton.textContent = '?';
    infoButton.setAttribute('aria-label', 'About Pantry & Fridge');
    infoButton.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    infoButton.addEventListener('keydown', function (e) {
      e.stopPropagation();
    });

    var infoTooltip = document.createElement('span');
    infoTooltip.className = 'accordion-info-tooltip';
    infoTooltip.textContent = pantryInfoText;

    var infoWrap = document.createElement('span');
    infoWrap.className = 'accordion-info-wrap';
    infoWrap.appendChild(infoButton);
    infoWrap.appendChild(infoTooltip);

    var countBadge = document.createElement('span');
    countBadge.className = 'accordion-count-badge';
    countBadge.textContent = String(count);

    headerLabel.appendChild(headerLabelText);
    if (section.id === 'templates') {
      headerLabel.appendChild(infoWrap);
    }
    if (section.id === 'recipes') {
      headerLabel.appendChild(countBadge);
    }

    var headerActions = document.createElement('div');
    headerActions.className = 'accordion-actions';

    var newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.className = 'accordion-new-button';
    newButton.textContent = '+ New';
    headerActions.appendChild(newButton);

    if (section.id === 'recipes') {
      var importButton = document.createElement('button');
      importButton.type = 'button';
      importButton.className = 'accordion-new-button';
      importButton.textContent = 'Import';
      importButton.addEventListener('click', function (e) {
        e.stopPropagation();
        handleRecipeImportSection();
      });
      headerActions.appendChild(importButton);
    }
    newButton.addEventListener('click', function (e) {
      e.stopPropagation();
      handleNewSection(section.id);
    });

    header.appendChild(headerLabel);
    header.appendChild(headerActions);

    var content = document.createElement('div');
    content.id = 'accordion-content-' + section.id;
    content.className = 'accordion-content';
    content.setAttribute('role', 'region');
    content.setAttribute('aria-labelledby', 'accordion-header-' + section.id);

    if (isExpanded) {
      content.classList.add('expanded');
      renderSectionContent(content, section);
    }

    container.appendChild(header);
    container.appendChild(content);

    return container;
  }

  async function renderSectionContent(contentElement, section) {
    try {
      var records = await section.getAllFn();
      var listItemCountsById = {};

      if (section.isComingSoon) {
        contentElement.innerHTML = '<div class="empty-state-message">Recipes are coming soon.</div>';
        return;
      }
      
      if (records.length === 0) {
        if (section.id === 'templates') {
          contentElement.innerHTML = '<div class="empty-state-message">' + pantryInfoText + '</div>';
        } else {
          contentElement.innerHTML = '<div class="empty-state-message">No ' + section.label.toLowerCase() + ' yet.</div>';
        }
        return;
      }

      if (section.id === 'lists') {
        var countPairs = await Promise.all(records.map(async function (record) {
          try {
            var itemCount = await window.KaPListsService.getListItemCount(record.id);
            return { id: record.id, count: itemCount };
          } catch (error) {
            return { id: record.id, count: 0 };
          }
        }));

        countPairs.forEach(function (pair) {
          listItemCountsById[pair.id] = pair.count;
        });
      }

      contentElement.innerHTML = '';

      if (section.id === 'recipes') {
        var filterWrap = document.createElement('div');
        filterWrap.className = 'recipe-filter-wrap';

        var filterInput = document.createElement('input');
        filterInput.type = 'search';
        filterInput.className = 'recipe-filter-input';
        filterInput.placeholder = 'Search recipes by tag or name';
        filterInput.setAttribute('aria-label', 'Search recipes by tag or name');
        filterWrap.appendChild(filterInput);

        var filteredCount = document.createElement('span');
        filteredCount.className = 'recipe-filter-count';
        filterWrap.appendChild(filteredCount);

        var recordList = document.createElement('div');
        recordList.className = 'record-list';

        function renderRecipeRows() {
          var query = String(filterInput.value || '').trim();
          var filtered = records.filter(function (record) {
            return recipeMatchesQuery(record, query);
          });

          recordList.replaceChildren();
          filtered.forEach(function (record) {
            recordList.appendChild(createRecordRow(record, section, listItemCountsById[record.id]));
          });

          filteredCount.textContent = String(filtered.length) + ' / ' + String(records.length);

          if (filtered.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'empty-state-message';
            empty.textContent = 'No recipes match this search.';
            recordList.appendChild(empty);
          }
        }

        filterInput.addEventListener('input', renderRecipeRows);
        renderRecipeRows();

        contentElement.appendChild(filterWrap);
        contentElement.appendChild(recordList);
        return;
      }

      var recordList = document.createElement('div');
      recordList.className = 'record-list';

      records.forEach(function (record) {
        var row = createRecordRow(record, section, listItemCountsById[record.id]);
        recordList.appendChild(row);
      });

      contentElement.appendChild(recordList);
    } catch (error) {
      console.error('Error rendering section content:', error);
      contentElement.innerHTML = '<div class="empty-state-message">Error loading ' + section.label.toLowerCase() + '.</div>';
    }
  }

  function createRecordRow(record, section, listItemCount) {
    var row = document.createElement('div');
    row.className = 'accordion-record-row';

    var nameSpan = document.createElement('span');
    nameSpan.className = 'record-name';
    nameSpan.textContent = record.name;

    row.appendChild(nameSpan);

    if (section.id === 'recipes') {
      var tags = normalizeTagList(record.tags);
      if (tags.length > 0) {
        var tagsWrap = document.createElement('div');
        tagsWrap.className = 'recipe-row-tags';

        tags.forEach(function (tag) {
          var tagPill = document.createElement('span');
          tagPill.className = 'recipe-row-tag-pill';
          tagPill.textContent = tag;
          tagsWrap.appendChild(tagPill);
        });

        row.appendChild(tagsWrap);
      }
    }

    if (section.id === 'lists') {
      var countPill = document.createElement('span');
      countPill.className = 'list-item-count-pill';
      countPill.textContent = String(listItemCount || 0);
      countPill.setAttribute('aria-label', String(listItemCount || 0) + ' items');
      row.appendChild(countPill);
    }

    row.addEventListener('click', function () {
      handleRecordOpen(record, section);
    });

    return row;
  }

  function handleSectionToggle(sectionId) {
    var index = state.expandedSectionIds.indexOf(sectionId);
    if (index >= 0) {
      state.expandedSectionIds.splice(index, 1);
    } else {
      state.expandedSectionIds.push(sectionId);
    }
    saveExpandedSections(state.expandedSectionIds);
    renderHome();
  }

  async function handleNewSection(sectionId) {
    var section = findSection(sectionId);
    if (section) {
      try {
        var createdRecord = await section.createFn();
        if (sectionId === 'recipes' && createdRecord && createdRecord.id) {
          window.KaPRouter.navigate('/recipe/' + createdRecord.id);
          return;
        }

        renderHome();
      } catch (error) {
        console.error('Error creating new item:', error);
      }
    }
  }

  async function handleRecipeImportSection() {
    if (!window.KaPRecipesPage || typeof window.KaPRecipesPage.importRecipeFromKap !== 'function') {
      return;
    }

    try {
      var result = await window.KaPRecipesPage.importRecipeFromKap();
      if (result && result.recipeId) {
        await renderHome();
      }
    } catch (error) {
      await window.KaPUI.ShowAlert({
        title: 'Import Failed',
        message: error && error.message ? error.message : 'Unable to import recipe .kap file.'
      });
    }
  }

  function handleRecordOpen(record, section) {
    if (section.id === 'lists') {
      window.KaPRouter.navigate('/list/' + record.id);
    } else if (section.id === 'templates') {
      window.KaPRouter.navigate('/template/' + record.id);
    } else if (section.id === 'recipes') {
      window.KaPRouter.navigate('/recipe/' + record.id);
    }
  }

  async function renderListDetail(listId) {
    try {
      var record = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.LIST_RECORDS, listId);
      if (!record || record.type !== 'List') {
        throw new Error('List not found');
      }
      renderDetailPage(record, 'lists');
    } catch (error) {
      console.error('Error loading list:', error);
      window.KaPRouter.navigate('/');
    }
  }

  async function renderTemplateDetail(templateId) {
    try {
      var record = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.LIST_RECORDS, templateId);
      if (!record || record.type !== 'Template') {
        throw new Error('Template not found');
      }
      renderDetailPage(record, 'templates');
    } catch (error) {
      console.error('Error loading template:', error);
      window.KaPRouter.navigate('/');
    }
  }

  async function renderRecipeDetail(recipeId) {
    try {
      var record = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.LIST_RECORDS, recipeId);
      if (!record || record.type !== 'Recipe') {
        throw new Error('Recipe not found');
      }
      renderDetailPage(record, 'recipes');
    } catch (error) {
      console.error('Error loading recipe:', error);
      window.KaPRouter.navigate('/');
    }
  }

  async function renderDetailPage(record, sectionId) {
    var section = findSection(sectionId);
    var contentContainer = document.getElementById('main-content');

    var detailHooks = {
      onBack: function () {
        window.KaPRouter.navigate('/');
      },
      onAfterChange: function (updatedRecord) {
        renderDetailPage(updatedRecord, sectionId);
      },
      onDeleted: function () {
        window.KaPRouter.navigate('/');
      }
    };

    if (section) {
      await section.renderDetailFn(contentContainer, record, detailHooks);
    }
  }

  async function renderSettingsPage() {
    var contentContainer = document.getElementById('main-content');
    if (!contentContainer) {
      return;
    }

    await window.KaPSettingsPage.renderInto(contentContainer, {
      onBack: function () {
        window.KaPRouter.navigate(state.settingsReturnPath || '/');
      }
    });
  }

  async function renderUomPage() {
    var contentContainer = document.getElementById('main-content');
    if (!contentContainer) {
      return;
    }

    await window.KaPUomPage.renderInto(contentContainer, {
      onBack: function () {
        window.KaPRouter.navigate(state.settingsReturnPath || '/');
      }
    });
  }

  function openSettings() {
    if (currentRoute && currentRoute.view !== 'settings') {
      state.settingsReturnPath = getPathForRoute(currentRoute);
    }

    window.KaPRouter.navigate('/settings');
  }

  function openUom() {
    if (currentRoute && currentRoute.view !== 'uom' && currentRoute.view !== 'settings') {
      state.settingsReturnPath = getPathForRoute(currentRoute);
    }

    window.KaPRouter.navigate('/uom');
  }

  function isRunningStandalone() {
    var isIosStandalone = window.navigator && window.navigator.standalone === true;
    var isDisplayModeStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    return isIosStandalone || isDisplayModeStandalone;
  }

  function getInstallFallbackMessage() {
    var userAgent = String((window.navigator && window.navigator.userAgent) || '').toLowerCase();
    var isIos = /iphone|ipad|ipod/.test(userAgent);
    var isAndroid = /android/.test(userAgent);
    var isSecureForPwa = window.isSecureContext || window.location.protocol === 'http:' && window.location.hostname === 'localhost';
    var securityNote = isSecureForPwa
      ? ''
      : ' Install requires HTTPS (or localhost) rather than opening files directly.';

    if (isIos) {
      return 'To install this app on iPhone or iPad, open Safari Share and choose "Add to Home Screen".' + securityNote;
    }

    if (isAndroid) {
      return 'To install this app, open your browser menu and choose "Install app" or "Add to Home screen".' + securityNote;
    }

    return 'To install this app, open your browser menu and choose "Install app" or "Create shortcut".' + securityNote;
  }

  function getCurrentReleaseVersion() {
    var stylesheet = document.querySelector('link[rel="stylesheet"][href]');
    if (!stylesheet) {
      return 'Unknown';
    }

    var hrefValue = String(stylesheet.getAttribute('href') || '');
    if (!hrefValue) {
      return 'Unknown';
    }

    try {
      var parsedUrl = new URL(hrefValue, window.location.href);
      return formatReleaseVersion(parsedUrl.searchParams.get('v') || 'Unknown');
    } catch (error) {
      var regexMatch = hrefValue.match(/[?&]v=([^&]+)/);
      return formatReleaseVersion(regexMatch && regexMatch[1] ? regexMatch[1] : 'Unknown');
    }
  }

  function formatReleaseVersion(rawVersion) {
    var value = String(rawVersion || '').trim();
    var match = value.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/);
    if (!match) {
      return value || 'Unknown';
    }

    return match[1] + '-' + match[2] + '-' + match[3] + ' ' + match[4] + ':' + match[5];
  }

  function getBuildEnvironmentLabel() {
    var host = String(window.location && window.location.hostname || '').toLowerCase();
    if (host === 'kap-dev.ignyos.com') {
      return 'dev';
    }
    if (host === 'kap.ignyos.com') {
      return 'prod';
    }
    return host || 'local';
  }

  async function handleAboutMenuClick() {
    var version = getCurrentReleaseVersion();
    var buildLabel = getBuildEnvironmentLabel();
    await window.KaPUI.ShowAboutModal({
      title: 'About Kitchen & Pantry',
      companyName: 'Ignyos',
      companyUrl: 'https://ignyos.com',
      releaseNotesUrl: 'https://github.com/Ignyos/KAP/releases',
      releaseVersion: version + ' (' + buildLabel + ')'
    });
  }

  function updateInstallMenuButton() {
    if (!installMenuButtonRef) {
      return;
    }

    if (isInstalled) {
      installMenuButtonRef.textContent = 'App Installed';
      installMenuButtonRef.disabled = true;
      installMenuButtonRef.setAttribute('aria-disabled', 'true');
      installMenuButtonRef.title = 'This app is already installed on this device.';
      return;
    }

    installMenuButtonRef.textContent = deferredInstallPrompt ? 'Install App' : 'Install App (Help)';
    installMenuButtonRef.disabled = false;
    installMenuButtonRef.setAttribute('aria-disabled', 'false');
    installMenuButtonRef.title = deferredInstallPrompt
      ? 'Install this app on your device.'
      : 'Shows install instructions for your browser.';
  }

  async function handleInstallMenuClick() {
    if (isInstalled) {
      await window.KaPUI.ShowAlert({
        title: 'Install App',
        message: 'Kitchen & Pantry is already installed on this device.'
      });
      return;
    }

    if (deferredInstallPrompt) {
      var installPrompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      updateInstallMenuButton();

      try {
        installPrompt.prompt();
        if (installPrompt.userChoice) {
          await installPrompt.userChoice;
        }
      } catch (error) {
        await window.KaPUI.ShowAlert({
          title: 'Install App',
          message: 'Unable to show the install prompt right now. ' + getInstallFallbackMessage()
        });
      }

      return;
    }

    await window.KaPUI.ShowAlert({
      title: 'Install App',
      message: getInstallFallbackMessage()
    });
  }

  function attachInstallPromptHandlers() {
    isInstalled = isRunningStandalone();
    updateInstallMenuButton();

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateInstallMenuButton();
    });

    window.addEventListener('appinstalled', function () {
      isInstalled = true;
      deferredInstallPrompt = null;
      updateInstallMenuButton();
    });
  }

  function attachEventListeners() {
    var menuContainer = document.querySelector('.header-menu');
    var menuButton = document.getElementById('menu-button');
    var menuList = document.getElementById('header-menu-list');
    var menuInstallButton = document.getElementById('menu-install-button');
    var menuAboutButton = document.getElementById('menu-about-button');
    var menuSettingsButton = document.getElementById('menu-settings-button');
    var menuUomButton = document.getElementById('menu-uom-button');

    installMenuButtonRef = menuInstallButton;
    updateInstallMenuButton();

    function closeMenu() {
      if (!menuList || !menuButton) {
        return;
      }

      menuList.hidden = true;
      menuButton.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
      if (!menuList || !menuButton) {
        return;
      }

      menuList.hidden = false;
      menuButton.setAttribute('aria-expanded', 'true');
    }

    if (menuButton && menuList) {
      menuButton.addEventListener('click', function (e) {
        e.stopPropagation();
        if (menuList.hidden) {
          openMenu();
        } else {
          closeMenu();
        }
      });

      menuButton.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          openMenu();
          if (menuInstallButton) {
            menuInstallButton.focus();
          } else if (menuAboutButton) {
            menuAboutButton.focus();
          } else if (menuSettingsButton) {
            menuSettingsButton.focus();
          }
        }
      });
    }

    if (menuInstallButton) {
      menuInstallButton.addEventListener('click', async function (e) {
        e.stopPropagation();
        closeMenu();
        await handleInstallMenuClick();
      });
    }

    if (menuAboutButton) {
      menuAboutButton.addEventListener('click', async function (e) {
        e.stopPropagation();
        closeMenu();
        await handleAboutMenuClick();
      });
    }

    if (menuSettingsButton) {
      menuSettingsButton.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMenu();
        openSettings();
      });
    }

    if (menuUomButton) {
      menuUomButton.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMenu();
        openUom();
      });
    }

    document.addEventListener('click', function (e) {
      if (menuContainer && !menuContainer.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeMenu();
      }
    });
  }

  async function initialize() {
    attachInstallPromptHandlers();
    attachEventListeners();
    var mainContainer = document.getElementById('main-content');
    if (mainContainer) {
      mainContainer.classList.add('active');
    }
    
    // Hide the old tab navigation
    var tabNav = document.querySelector('.tab-nav');
    if (tabNav) {
      tabNav.style.display = 'none';
    }

    // Listen for route changes
    window.KaPRouter.onRouteChange(onRouteChange);
    
    // Initialize router which will trigger initial route
    window.KaPRouter.init();
  }

  window.KaPMainPage = {
    initialize: initialize
  };
})();
