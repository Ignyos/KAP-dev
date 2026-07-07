(function () {
  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeCategoryName(name) {
    return String(name || '').trim();
  }

  function ensureValidCategoryName(name) {
    var trimmed = normalizeCategoryName(name);
    if (!trimmed) {
      throw new Error('Category name is required.');
    }

    return trimmed;
  }

  function sortByNameAscending(records) {
    return (records || []).slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base'
      });
    });
  }

  async function getAllCategories() {
    var categories = await window.KaPDB.readAll(window.KaPStores.STORE_NAMES.CATEGORIES);
    return sortByNameAscending(categories);
  }

  async function searchCategories(query) {
    var normalizedQuery = normalizeCategoryName(query).toLowerCase();
    var categories = await getAllCategories();

    if (!normalizedQuery) {
      return categories;
    }

    return categories.filter(function (category) {
      return String(category.name || '').toLowerCase().indexOf(normalizedQuery) >= 0;
    });
  }

  async function resolveExactCategory(name) {
    var normalizedTarget = normalizeCategoryName(name).toLowerCase();
    if (!normalizedTarget) {
      return null;
    }

    var categories = await getAllCategories();
    return categories.find(function (category) {
      return String(category.name || '').toLowerCase() === normalizedTarget;
    }) || null;
  }

  async function createCategory(name) {
    var safeName = ensureValidCategoryName(name);
    var existing = await resolveExactCategory(safeName);
    if (existing) {
      return existing;
    }

    var timestamp = nowIso();
    var category = {
      id: window.KaPIds.NewId(),
      name: safeName,
      createdDate: timestamp,
      updatedDate: timestamp
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.CATEGORIES, category);
    return category;
  }

  async function deleteCategory(categoryId) {
    var category = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.CATEGORIES, categoryId);
    if (!category) {
      return false;
    }

    await window.KaPDB.remove(window.KaPStores.STORE_NAMES.CATEGORIES, categoryId);

    var items = await window.KaPDB.readAll(window.KaPStores.STORE_NAMES.ITEMS);
    var affectedItems = items.filter(function (item) {
      return item && item.categoryId === categoryId;
    });

    await Promise.all(affectedItems.map(function (item) {
      item.categoryId = '';
      item.categoryName = '';
      return window.KaPDB.upsert(window.KaPStores.STORE_NAMES.ITEMS, item);
    }));

    return true;
  }

  window.KaPCategoriesService = {
    getAllCategories: getAllCategories,
    searchCategories: searchCategories,
    resolveExactCategory: resolveExactCategory,
    createCategory: createCategory,
    deleteCategory: deleteCategory
  };
})();
