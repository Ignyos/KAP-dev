(function () {
  var routeChangeListeners = [];
  var HASH_PREFIX = 'kap';

  function normalizeRoutePath(path) {
    return path && path.startsWith('/') ? path : '/' + (path || '');
  }

  function getHashRoutePath() {
    var rawHash = String(window.location.hash || '').replace(/^#/, '');

    // Preferred format: #kap/list/:id, #kap/template/:id, #kap/recipe/:id, #kap/
    if (rawHash.indexOf(HASH_PREFIX + '/') === 0) {
      return '/' + rawHash.slice(HASH_PREFIX.length + 1);
    }

    // Backward compatibility for older hashes like #/list/:id
    if (rawHash.startsWith('/')) {
      return rawHash;
    }

    return '/';
  }

  function parseRoute() {
    var hash = getHashRoutePath();
    var match;

    // Match routes: /, /list/:id, /template/:id, /recipe/:id
    if (hash === '/' || hash === '') {
      return { view: 'home', id: null };
    }

    // /list/:id
    match = hash.match(/^\/list\/(.+)$/);
    if (match) {
      return { view: 'list', id: match[1] };
    }

    // /template/:id
    match = hash.match(/^\/template\/(.+)$/);
    if (match) {
      return { view: 'template', id: match[1] };
    }

    // /recipe/:id
    match = hash.match(/^\/recipe\/(.+)$/);
    if (match) {
      return { view: 'recipe', id: match[1] };
    }

    // /settings
    if (hash === '/settings') {
      return { view: 'settings', id: null };
    }

    // /uom
    if (hash === '/uom') {
      return { view: 'uom', id: null };
    }

    // Default to home for unknown routes
    return { view: 'home', id: null };
  }

  function navigate(path) {
    var normalizedPath = normalizeRoutePath(path);
    window.location.hash = HASH_PREFIX + normalizedPath;
  }

  function onRouteChange(callback) {
    if (typeof callback === 'function') {
      routeChangeListeners.push(callback);
    }
  }

  function removeRouteChangeListener(callback) {
    var index = routeChangeListeners.indexOf(callback);
    if (index > -1) {
      routeChangeListeners.splice(index, 1);
    }
  }

  function emitRouteChange() {
    var route = parseRoute();
    routeChangeListeners.forEach(function (callback) {
      try {
        callback(route);
      } catch (error) {
        console.error('Error in route change listener:', error);
      }
    });
  }

  function init() {
    // Listen to hash changes
    window.addEventListener('hashchange', emitRouteChange);
    // Emit initial route
    emitRouteChange();
  }

  window.KaPRouter = {
    navigate: navigate,
    getCurrentRoute: parseRoute,
    onRouteChange: onRouteChange,
    removeRouteChangeListener: removeRouteChangeListener,
    init: init
  };
})();
