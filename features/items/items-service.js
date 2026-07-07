(function () {
  function ensureValidItemName(name) {
    var trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Item name is required.');
    }

    return trimmed;
  }

  function normalizeDescription(description) {
    return (description || '').trim();
  }

  function normalizeCategoryId(value) {
    return String(value || '').trim();
  }

  function normalizeCategoryName(value) {
    return String(value || '').trim();
  }

  function sortByNameAscending(items) {
    return items.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
  }

  async function getAllItems() {
    var items = await window.KaPDB.readAll(window.KaPStores.STORE_NAMES.ITEMS);
    return sortByNameAscending(items);
  }

  async function getItemById(id) {
    return window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.ITEMS, id);
  }

  async function searchItems(query) {
    var normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    var items = await getAllItems();
    return items.filter(function (item) {
      return String(item.name).toLowerCase().indexOf(normalizedQuery) >= 0;
    });
  }

  async function createItem(name, description, categoryId, categoryName) {
    var safeName = ensureValidItemName(name);
    var safeDescription = normalizeDescription(description);
    var existingItems = await getAllItems();
    var existing = existingItems.find(function (item) {
      return String(item.name).toLowerCase() === safeName.toLowerCase();
    });

    if (existing) {
      return existing;
    }

    var item = {
      id: window.KaPIds.NewId(),
      name: safeName,
      description: safeDescription,
      categoryId: normalizeCategoryId(categoryId),
      categoryName: normalizeCategoryName(categoryName)
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.ITEMS, item);
    return item;
  }

  async function updateItem(id, nextName, nextDescription, categoryId, categoryName) {
    var item = await getItemById(id);
    if (!item) {
      throw new Error('Item not found.');
    }

    item.name = ensureValidItemName(nextName);
    item.description = normalizeDescription(nextDescription);

    if (arguments.length >= 4) {
      item.categoryId = normalizeCategoryId(categoryId);
      item.categoryName = normalizeCategoryName(categoryName);
    }

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.ITEMS, item);
    return item;
  }

  async function deleteItem(id) {
    var item = await getItemById(id);
    if (!item) {
      return false;
    }

    await window.KaPDB.remove(window.KaPStores.STORE_NAMES.ITEMS, id);
    return true;
  }

  async function setItemCategory(id, categoryId, categoryName, fallbackItemName) {
    var safeCategoryId = normalizeCategoryId(categoryId);
    var safeCategoryName = normalizeCategoryName(categoryName);
    var item = await getItemById(id);
    if (!item) {
      var safeName = ensureValidItemName(fallbackItemName || '');
      item = {
        id: id,
        name: safeName,
        description: '',
        categoryId: safeCategoryId,
        categoryName: safeCategoryName
      };

      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.ITEMS, item);
      return item;
    }

    item.categoryId = safeCategoryId;
    item.categoryName = safeCategoryName;

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.ITEMS, item);
    return item;
  }

  window.KaPItemsService = {
    getAllItems: getAllItems,
    getItemById: getItemById,
    searchItems: searchItems,
    createItem: createItem,
    updateItem: updateItem,
    deleteItem: deleteItem,
    setItemCategory: setItemCategory
  };
})();