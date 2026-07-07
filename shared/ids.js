(function () {
  function fallbackId() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function NewId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }

    return fallbackId();
  }

  window.KaPIds = {
    NewId: NewId
  };
})();
