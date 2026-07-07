(function () {
  var LIST_TYPE = 'List';
  var RECIPE_SOURCE_KIND = 'recipe';

  function nowIso() {
    return new Date().toISOString();
  }

  function ensureValidListName(name) {
    var trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('List name is required.');
    }

    return trimmed;
  }

  function normalizeIsoTimestamp(value) {
    return value ? String(value) : '';
  }

  function normalizeRecipeSourceId(value) {
    var raw = String(value == null ? '' : value).trim();
    return raw || '';
  }

  function normalizeBatchSize(batchSize) {
    var parsed = Number(batchSize);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('Batch size must be greater than zero.');
    }

    return parsed;
  }

  function isRecipeDerivedList(record) {
    return !!record && record.type === LIST_TYPE && record.sourceKind === RECIPE_SOURCE_KIND;
  }

  function isRecipeDerivedJoinRecord(record) {
    return !!record && record.sourceKind === RECIPE_SOURCE_KIND;
  }

  function formatScaledQuantityText(baseQuantityText, baseQuantityValue, batchSize) {
    if (baseQuantityValue == null) {
      return null;
    }

    var scaled = Number(baseQuantityValue) * Number(batchSize);
    if (!Number.isFinite(scaled)) {
      return null;
    }

    if (batchSize === 1 && baseQuantityText) {
      return String(baseQuantityText).trim() || null;
    }

    var fixed = scaled.toFixed(3);
    return fixed.replace(/\.?0+$/, '');
  }

  function formatNumericQuantityText(quantityValue) {
    if (quantityValue == null) {
      return null;
    }

    var numeric = Number(quantityValue);
    if (!Number.isFinite(numeric)) {
      return null;
    }

    return numeric.toFixed(3).replace(/\.?0+$/, '');
  }

  function getRecipeIngredientSourceKey(ingredient) {
    if (ingredient && ingredient.id) {
      return String(ingredient.id);
    }

    return String((ingredient && ingredient.name) || '').trim().toLowerCase();
  }

  async function requireListById(listId) {
    var record = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.LIST_RECORDS, listId);
    if (!record || record.type !== LIST_TYPE) {
      throw new Error('List not found.');
    }

    return record;
  }

  async function requireItemById(itemId) {
    var item = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.ITEMS, itemId);
    if (!item) {
      throw new Error('Item not found.');
    }

    return item;
  }

  async function readJoinRecordsByListId(listId) {
    return window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS,
      window.KaPStores.INDEX_NAMES.LIST_RECORD_ITEMS_BY_LIST_RECORD_ID,
      listId
    );
  }

  async function findJoinRecordById(listId, listItemId) {
    var joinRecords = await readJoinRecordsByListId(listId);
    return joinRecords.find(function (record) {
      return record.id === listItemId;
    }) || null;
  }

  function sortByNameAscending(records) {
    return records.sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base'
      });
    });
  }

  async function getAllLists() {
    var records = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.LIST_RECORDS,
      window.KaPStores.INDEX_NAMES.LIST_RECORDS_BY_TYPE,
      LIST_TYPE
    );

    return sortByNameAscending(records);
  }

  async function createList(name) {
    var safeName = ensureValidListName(name);
    var timestamp = nowIso();

    var record = {
      id: window.KaPIds.NewId(),
      name: safeName,
      description: '',
      type: LIST_TYPE,
      createdDate: timestamp,
      updatedDate: timestamp
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, record);
    return record;
  }

  async function findActiveRecipeDerivedList(recipeId, recipeVersionId) {
    var safeRecipeId = normalizeRecipeSourceId(recipeId);
    var safeRecipeVersionId = normalizeRecipeSourceId(recipeVersionId);
    if (!safeRecipeId || !safeRecipeVersionId) {
      return null;
    }

    var lists = await getAllLists();
    return lists.find(function (record) {
      return isRecipeDerivedList(record)
        && normalizeRecipeSourceId(record.sourceRecipeId) === safeRecipeId
        && normalizeRecipeSourceId(record.sourceRecipeVersionId) === safeRecipeVersionId;
    }) || null;
  }

  async function createRecipeDerivedList(options) {
    var recipeId = normalizeRecipeSourceId(options && options.recipeId);
    var recipeVersionId = normalizeRecipeSourceId(options && options.recipeVersionId);
    var recipeName = ensureValidListName(options && options.recipeName);
    var batchSize = normalizeBatchSize(options && options.batchSize);

    if (!recipeId || !recipeVersionId) {
      throw new Error('Recipe and version are required.');
    }

    var existing = await findActiveRecipeDerivedList(recipeId, recipeVersionId);
    if (existing) {
      return existing;
    }

    var timestamp = nowIso();
    var record = {
      id: window.KaPIds.NewId(),
      name: recipeName,
      description: '',
      type: LIST_TYPE,
      sourceKind: RECIPE_SOURCE_KIND,
      sourceRecipeId: recipeId,
      sourceRecipeVersionId: recipeVersionId,
      sourceRecipeVersionName: String((options && options.recipeVersionName) || ''),
      batchSize: batchSize,
      createdDate: timestamp,
      updatedDate: timestamp
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, record);
    return record;
  }

  async function setRecipeDerivedBatchSize(listId, batchSize) {
    var record = await requireListById(listId);
    if (!isRecipeDerivedList(record)) {
      throw new Error('Batch size can only be changed for recipe-derived lists.');
    }

    record.batchSize = normalizeBatchSize(batchSize);
    record.updatedDate = nowIso();
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, record);
    return record;
  }

  async function upsertRecipeDerivedItems(listId, ingredients, batchSizeOverride, additiveToExisting) {
    var record = await requireListById(listId);
    if (!isRecipeDerivedList(record)) {
      throw new Error('Recipe-derived items can only be added to recipe-derived lists.');
    }

    var batchSize = normalizeBatchSize(
      batchSizeOverride != null ? batchSizeOverride : (record.batchSize == null ? 1 : record.batchSize)
    );
    var shouldAddToExisting = additiveToExisting === true;
    var selectedIngredients = Array.isArray(ingredients) ? ingredients : [];
    var joinRecords = await readJoinRecordsByListId(listId);
    var existingBySourceKey = {};

    joinRecords.forEach(function (joinRecord) {
      if (!isRecipeDerivedJoinRecord(joinRecord)) {
        return;
      }

      var key = String((joinRecord.sourceRecipeItemKey || '')).trim();
      if (key) {
        existingBySourceKey[key] = joinRecord;
      }
    });

    for (var i = 0; i < selectedIngredients.length; i++) {
      var ingredient = selectedIngredients[i];
      var sourceKey = getRecipeIngredientSourceKey(ingredient);
      var safeName = window.KaPItemEntryRules.ensureValidItemEntryName(ingredient.name);
       if (!sourceKey) {
         continue;
       }

       var baseQuantityValue = ingredient.quantityValue != null ? Number(ingredient.quantityValue) : (ingredient.quantity == null ? null : Number(ingredient.quantity));
       if (baseQuantityValue != null && !Number.isFinite(baseQuantityValue)) {
         baseQuantityValue = null;
       }

       var nextRecord = existingBySourceKey[sourceKey] || {
         id: window.KaPIds.NewId(),
         listRecordId: listId
       };

      nextRecord.itemId = ingredient.itemId || '';
      nextRecord.name = safeName;
       nextRecord.description = window.KaPItemEntryRules.normalizeDescription(ingredient.description);
       nextRecord.sourceKind = RECIPE_SOURCE_KIND;
       nextRecord.sourceRecipeId = record.sourceRecipeId;
       nextRecord.sourceRecipeVersionId = record.sourceRecipeVersionId;
       nextRecord.sourceRecipeItemKey = sourceKey;
       nextRecord.recipeBaseQuantityValue = baseQuantityValue;
       nextRecord.recipeBaseQuantityText = ingredient.quantityText == null ? null : String(ingredient.quantityText).trim() || null;

       var scaledQuantityValue = baseQuantityValue == null ? null : baseQuantityValue * batchSize;
       if (shouldAddToExisting && existingBySourceKey[sourceKey]) {
         var existingQuantityValue = nextRecord.quantityValue != null
           ? Number(nextRecord.quantityValue)
           : (nextRecord.quantity == null ? null : Number(nextRecord.quantity));
         if (existingQuantityValue != null && !Number.isFinite(existingQuantityValue)) {
           existingQuantityValue = null;
         }

         nextRecord.quantityValue = scaledQuantityValue == null
           ? existingQuantityValue
           : ((existingQuantityValue == null ? 0 : existingQuantityValue) + scaledQuantityValue);
         nextRecord.quantity = nextRecord.quantityValue;
         nextRecord.quantityText = formatNumericQuantityText(nextRecord.quantityValue);
       } else {
         nextRecord.quantityValue = scaledQuantityValue;
         nextRecord.quantity = nextRecord.quantityValue;
         nextRecord.quantityText = formatScaledQuantityText(nextRecord.recipeBaseQuantityText, baseQuantityValue, batchSize);
       }
       nextRecord.unitOfMeasureId = ingredient.unitOfMeasureId || null;
       nextRecord.isOptional = ingredient.isOptional === true;

       await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, nextRecord);
     }
   }

  async function recomputeRecipeDerivedItemsForBatch(listId) {
    var record = await requireListById(listId);
    if (!isRecipeDerivedList(record)) {
      throw new Error('Batch size updates only apply to recipe-derived lists.');
    }

    var batchSize = normalizeBatchSize(record.batchSize == null ? 1 : record.batchSize);
    var joinRecords = await readJoinRecordsByListId(listId);

    for (var i = 0; i < joinRecords.length; i++) {
      var joinRecord = joinRecords[i];
      if (!isRecipeDerivedJoinRecord(joinRecord)) {
        continue;
      }

      var baseQuantityValue = joinRecord.recipeBaseQuantityValue == null ? null : Number(joinRecord.recipeBaseQuantityValue);
      if (baseQuantityValue != null && !Number.isFinite(baseQuantityValue)) {
        baseQuantityValue = null;
      }

      joinRecord.quantityValue = baseQuantityValue == null ? null : baseQuantityValue * batchSize;
      joinRecord.quantity = joinRecord.quantityValue;
      joinRecord.quantityText = formatScaledQuantityText(joinRecord.recipeBaseQuantityText, baseQuantityValue, batchSize);
      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, joinRecord);
    }
  }

  async function renameList(id, nextName) {
    var safeName = ensureValidListName(nextName);
    var record = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.LIST_RECORDS, id);

    if (!record || record.type !== LIST_TYPE) {
      throw new Error('List not found.');
    }

    record.name = safeName;
    record.updatedDate = nowIso();

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, record);
    return record;
  }

  async function deleteList(id) {
    await window.KaPDB.remove(window.KaPStores.STORE_NAMES.LIST_RECORDS, id);
  }

  async function getListItems(listId) {
    await requireListById(listId);
    var joinRecords = await readJoinRecordsByListId(listId);
    var uomRecords = await window.KaPDB.readAll(window.KaPStores.STORE_NAMES.UNIT_OF_MEASURES);
    var uomById = {};
    (uomRecords || []).forEach(function (uom) {
      uomById[uom.id] = uom;
    });

    var detailItems = await Promise.all(
      joinRecords.map(async function (joinRecord) {
        var item = joinRecord.itemId
          ? await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.ITEMS, joinRecord.itemId)
          : null;
        if (!joinRecord.name && item && item.name) {
          joinRecord.name = item.name;
          await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, joinRecord);
        }

        var quantityValue = joinRecord.quantityValue == null
          ? (joinRecord.quantity == null ? null : Number(joinRecord.quantity))
          : Number(joinRecord.quantityValue);
        var uom = joinRecord.unitOfMeasureId ? uomById[joinRecord.unitOfMeasureId] : null;

        return {
          id: joinRecord.id,
          listRecordId: joinRecord.listRecordId,
          itemId: joinRecord.itemId,
          name: joinRecord.name || (item && item.name) || 'Unknown Item',
          quantity: joinRecord.quantity,
          quantityValue: Number.isFinite(quantityValue) ? quantityValue : null,
          quantityText: joinRecord.quantityText == null ? null : String(joinRecord.quantityText),
          unitOfMeasureId: joinRecord.unitOfMeasureId || null,
          uomAbbreviation: uom ? (uom.abbreviation || uom.name || null) : null,
          isOptional: joinRecord.isOptional === true,
          description: joinRecord.description,
          categoryId: (item && item.categoryId) || '',
          categoryName: (item && item.categoryName) || '',
          isCrossedOff: joinRecord.isCrossedOff === true,
          crossedOffAt: normalizeIsoTimestamp(joinRecord.crossedOffAt),
          sourceKind: joinRecord.sourceKind || '',
          sourceRecipeItemKey: joinRecord.sourceRecipeItemKey || null,
          item: item || null
        };
      })
    );

    return sortByNameAscending(detailItems);
  }

  async function getListItemCount(listId) {
    await requireListById(listId);
    var joinRecords = await readJoinRecordsByListId(listId);
    return joinRecords.filter(function (joinRecord) {
      return joinRecord.isCrossedOff !== true;
    }).length;
  }

  async function addItemToList(listId, itemId, name, quantity, description) {
    await requireListById(listId);
    var safeName = window.KaPItemEntryRules.ensureValidItemEntryName(name);

    var joinRecords = await readJoinRecordsByListId(listId);
    var existingByName = window.KaPItemEntryRules.findJoinRecordByName(joinRecords.filter(function (record) {
      return !isRecipeDerivedJoinRecord(record);
    }), safeName);

    if (existingByName) {
      existingByName.quantity = window.KaPItemEntryRules.incrementQuantity(existingByName.quantity);
      existingByName.quantityValue = existingByName.quantity;
      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existingByName);
      return existingByName;
    }

    await requireItemById(itemId);
    var normalizedQuantity = window.KaPItemEntryRules.normalizeOptionalIntegerQuantity(quantity);
    var joinRecord = {
      id: window.KaPIds.NewId(),
      listRecordId: listId,
      itemId: itemId,
      name: safeName,
      quantityValue: normalizedQuantity,
      quantity: normalizedQuantity,
      description: window.KaPItemEntryRules.normalizeDescription(description)
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, joinRecord);
    return joinRecord;
  }

  async function updateListItem(listId, listItemId, name, quantity, description) {
    await requireListById(listId);
    var existing = await findJoinRecordById(listId, listItemId);
    if (!existing) {
      throw new Error('List item not found.');
    }

    existing.name = window.KaPItemEntryRules.ensureValidItemEntryName(name);
    existing.quantity = window.KaPItemEntryRules.normalizeOptionalIntegerQuantity(quantity);
    existing.quantityValue = existing.quantity;
    existing.description = window.KaPItemEntryRules.normalizeDescription(description);

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existing);
    return existing;
  }

  async function removeItemFromList(listId, listItemId) {
    await requireListById(listId);
    var existing = await findJoinRecordById(listId, listItemId);
    if (!existing) {
      return;
    }

    await window.KaPDB.remove(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existing.id);
  }

  async function incrementListItemQuantity(listId, listItemId) {
    await requireListById(listId);
    var existing = await findJoinRecordById(listId, listItemId);
    if (!existing) {
      throw new Error('List item not found.');
    }

    var current = existing.quantity == null ? 1 : Number(existing.quantity);
    if (!Number.isFinite(current)) {
      current = 1;
    }

    existing.quantity = Math.round((current + 0.5) * 1000) / 1000;
    existing.quantityValue = existing.quantity;
    existing.quantityText = formatNumericQuantityText(existing.quantity);
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existing);
    return existing;
  }

  async function setListItemCrossedOff(listId, listItemId, isCrossedOff) {
    await requireListById(listId);
    var existing = await findJoinRecordById(listId, listItemId);
    if (!existing) {
      throw new Error('List item not found.');
    }

    existing.isCrossedOff = isCrossedOff === true;
    existing.crossedOffAt = existing.isCrossedOff ? nowIso() : '';
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existing);
    return existing;
  }

  async function deleteCrossedOffItems(listId) {
    await requireListById(listId);
    var joinRecords = await readJoinRecordsByListId(listId);

    var crossedOffItems = joinRecords.filter(function (record) {
      return record && record.isCrossedOff === true;
    });

    await Promise.all(crossedOffItems.map(function (record) {
      return window.KaPDB.remove(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, record.id);
    }));

    return crossedOffItems.length;
  }

  async function decrementListItemQuantity(listId, listItemId) {
    await requireListById(listId);
    var existing = await findJoinRecordById(listId, listItemId);
    if (!existing) {
      throw new Error('List item not found.');
    }

    var current = existing.quantity == null ? 1 : Number(existing.quantity);
    if (!Number.isFinite(current)) {
      current = 1;
    }

    existing.quantity = Math.max(0.5, Math.round((current - 0.5) * 1000) / 1000);
    existing.quantityValue = existing.quantity;
    existing.quantityText = formatNumericQuantityText(existing.quantity);
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existing);
    return existing;
  }

  window.KaPListsService = {
    getAllLists: getAllLists,
    createList: createList,
    renameList: renameList,
    deleteList: deleteList,
    getListItemCount: getListItemCount,
    getListItems: getListItems,
    addItemToList: addItemToList,
    updateListItem: updateListItem,
    removeItemFromList: removeItemFromList,
    incrementListItemQuantity: incrementListItemQuantity,
    decrementListItemQuantity: decrementListItemQuantity,
    setListItemCrossedOff: setListItemCrossedOff,
    deleteCrossedOffItems: deleteCrossedOffItems,
    findActiveRecipeDerivedList: findActiveRecipeDerivedList,
    createRecipeDerivedList: createRecipeDerivedList,
    setRecipeDerivedBatchSize: setRecipeDerivedBatchSize,
    upsertRecipeDerivedItems: upsertRecipeDerivedItems,
    recomputeRecipeDerivedItemsForBatch: recomputeRecipeDerivedItemsForBatch
  };
})();
