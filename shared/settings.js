(function () {
  var STORAGE_PREFIX = 'kap.settings.';

  var KEYS = {
    ACTIVE_TAB: 'activeTab',
    ACTIVE_DETAIL_IDS_BY_TAB: 'activeDetailIdsByTab',
    EXPANDED_ACCORDION_SECTION: 'expandedAccordionSection',
    EXPANDED_ACCORDION_SECTIONS: 'expandedAccordionSections',
    MAIN_PAGE_SCROLL_TOP: 'mainPageScrollTop',
    CATEGORY_VIEW_BY_RECORD: 'categoryViewByRecord',
    TEXT_SIZE: 'textSize',
    THEME: 'theme',
    UOM_GROUP_ORDER: 'uomGroupOrder',
    SYNC_CONFLICT_MODE: 'syncConflictMode',
    SYNC_ACCOUNT_LINK: 'syncAccountLink',
    SYNC_STATUS: 'syncStatus',
    SYNC_REMOTE_MODE: 'syncRemoteMode'
  };

  var defaults = {
    activeTab: 'lists',
    activeDetailIdsByTab: {
      lists: null,
      templates: null,
      recipes: null
    },
    expandedAccordionSection: null,
    expandedAccordionSections: [],
    mainPageScrollTop: 0,
    categoryViewByRecord: {
      lists: {},
      templates: {}
    },
    textSize: 'small',
    theme: 'dark',
    uomGroupOrder: [],
    syncConflictMode: 'askUser',
    syncAccountLink: null,
    syncRemoteMode: null,
    syncStatus: {
      pendingLocalChanges: false,
      lastSyncAt: null,
      lastStatus: 'idle',
      lastMessage: 'Not synced yet.'
    }
  };

  function getKey(name) {
    return STORAGE_PREFIX + name;
  }

  function get(name) {
    var key = getKey(name);
    var stored = localStorage.getItem(key);
    if (stored === null) {
      return defaults[name];
    }

    try {
      return JSON.parse(stored);
    } catch (error) {
      return defaults[name];
    }
  }

  function set(name, value) {
    var key = getKey(name);
    localStorage.setItem(key, JSON.stringify(value));
  }

  var TEXT_SIZE_PX = { small: '16px', medium: '18px', large: '20px' };
  var THEME_NAMES = { dark: true, spring: true, summer: true, autumn: true, winter: true };

  function applyTextSize(size) {
    document.documentElement.style.fontSize = TEXT_SIZE_PX[size] || TEXT_SIZE_PX.medium;
  }

  function applyTheme(theme) {
    var normalizedTheme = THEME_NAMES[theme] ? theme : 'dark';
    document.documentElement.setAttribute('data-theme', normalizedTheme);
  }

  window.KaPSettings = {
    KEYS: KEYS,
    get: get,
    set: set,
    applyTextSize: applyTextSize,
    applyTheme: applyTheme
  };
})();
