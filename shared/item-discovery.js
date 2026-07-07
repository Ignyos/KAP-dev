(function () {
  function validateOptionalInteger(rawQuantity) {
    var trimmed = String(rawQuantity == null ? '' : rawQuantity).trim();
    if (!trimmed) {
      return { ok: true, value: null };
    }

    if (!/^-?\d+$/.test(trimmed)) {
      return { ok: false, message: 'Quantity must be an integer.' };
    }

    return { ok: true, value: Number(trimmed) };
  }

  function validateOptionalDecimal(rawQuantity) {
    var trimmed = String(rawQuantity == null ? '' : rawQuantity).trim();
    if (!trimmed) {
      return { ok: true, value: null };
    }

    if (!/^-?(?:\d+|\d*\.\d+|\d+\/\d+|\d+\s+\d+\/\d+)$/.test(trimmed)) {
      return { ok: false, message: 'Quantity must be a decimal number or fraction.' };
    }

    if (/^-?\d+\s+\d+\/\d+$/.test(trimmed)) {
      var wholeAndFraction = trimmed.split(/\s+/);
      var wholePart = Number(wholeAndFraction[0]);
      var fractionParts = wholeAndFraction[1].split('/');
      var mixedNumerator = Number(fractionParts[0]);
      var mixedDenominator = Number(fractionParts[1]);

      if (!Number.isFinite(wholePart) || !Number.isFinite(mixedNumerator) || !Number.isFinite(mixedDenominator) || mixedDenominator === 0) {
        return { ok: false, message: 'Quantity must be a decimal number or fraction.' };
      }

      var sign = wholePart < 0 ? -1 : 1;
      return { ok: true, value: wholePart + sign * (mixedNumerator / mixedDenominator) };
    }

    if (trimmed.indexOf('/') >= 0) {
      var parts = trimmed.split('/');
      var numerator = Number(parts[0]);
      var denominator = Number(parts[1]);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return { ok: false, message: 'Quantity must be a decimal number or fraction.' };
      }

      return { ok: true, value: numerator / denominator };
    }

    var parsed = Number(trimmed);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      return { ok: false, message: 'Quantity must be a decimal number or fraction.' };
    }

    return { ok: true, value: parsed };
  }

  async function resolveExactItem(name) {
    var suggestions = await window.KaPItemsService.searchItems(name);
    return suggestions.find(function (item) {
      return String(item.name).toLowerCase() === String(name).toLowerCase();
    }) || null;
  }

  function buildAddItemModalOptions(config) {
    var detailItems = config.detailItems || [];
    var currentContextItemIds = detailItems.map(function (detailItem) {
      return detailItem.itemId;
    });
    var validateQuantity = typeof config.validateQuantity === 'function'
      ? config.validateQuantity
      : validateOptionalInteger;

    return {
      title: config.title,
      confirmLabel: 'Add Item',
      itemNamePlaceholder: 'Search or type item name',
      quantityPlaceholder: config.quantityPlaceholder || 'e.g. 2',
      quantityHelpText: config.quantityHelpText || '',
      initialQuantity: config.initialQuantity != null ? config.initialQuantity : 1,
      descriptionPlaceholder: 'Item notes',
      currentContextItemIds: currentContextItemIds,
      currentContextLabel: config.currentContextLabel,
      showOptionalField: config.showOptionalField === true,
      initialIsOptional: config.initialIsOptional === true,
      optionalLabel: config.optionalLabel,
      getAllItems: function () {
        return window.KaPItemsService.getAllItems();
      },
      searchItems: function (query) {
        return window.KaPItemsService.searchItems(query);
      },
      resolveExactItem: resolveExactItem,
      createItem: function (name) {
        return window.KaPItemsService.createItem(name, '');
      },
      deleteItem: function (item) {
        return window.KaPItemsService.deleteItem(item.id);
      },
      getAllCategories: function () {
        return window.KaPCategoriesService.getAllCategories();
      },
      searchCategories: function (query) {
        return window.KaPCategoriesService.searchCategories(query);
      },
      resolveExactCategory: function (name) {
        return window.KaPCategoriesService.resolveExactCategory(name);
      },
      createCategory: function (name) {
        return window.KaPCategoriesService.createCategory(name);
      },
      deleteCategory: function (category) {
        return window.KaPCategoriesService.deleteCategory(category.id);
      },
      validateQuantity: validateQuantity
    };
  }

  window.KaPItemDiscovery = {
    validateOptionalInteger: validateOptionalInteger,
    validateOptionalDecimal: validateOptionalDecimal,
    resolveExactItem: resolveExactItem,
    buildAddItemModalOptions: buildAddItemModalOptions
  };
})();
