(function () {
  var RECIPE_TYPE = 'Recipe';

  function nowIso() {
    return new Date().toISOString();
  }

  function getDefaultVersionName() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    var hours = String(now.getHours()).padStart(2, '0');
    var minutes = String(now.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes;
  }

  function ensureValidRecipeName(name) {
    var trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Recipe name is required.');
    }

    return trimmed;
  }

  function ensureValidInstructionText(text) {
    var trimmed = String(text || '').trim();
    if (!trimmed) {
      throw new Error('Instruction text is required.');
    }

    return trimmed;
  }

  function normalizeInstructionIngredientRefs(ingredientRefs) {
    var seen = {};
    return (Array.isArray(ingredientRefs) ? ingredientRefs : []).map(function (itemId) {
      return String(itemId || '').trim();
    }).filter(function (itemId) {
      if (!itemId || seen[itemId]) {
        return false;
      }

      seen[itemId] = true;
      return true;
    });
  }

  function normalizeInstructionTimer(timer) {
    if (!timer || typeof timer !== 'object') {
      return null;
    }

    var rawDuration = timer.durationSeconds;
    if (rawDuration == null || String(rawDuration).trim() === '') {
      return null;
    }

    var durationSeconds = Number(rawDuration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error('Timer duration must be greater than zero.');
    }

    return {
      durationSeconds: Math.floor(durationSeconds),
      label: String(timer.label || '').trim()
    };
  }

  function normalizeStoredInstructionTimer(timer) {
    if (!timer || typeof timer !== 'object') {
      return null;
    }

    var durationSeconds = Number(timer.durationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return null;
    }

    return {
      durationSeconds: Math.floor(durationSeconds),
      label: String(timer.label || '').trim()
    };
  }

  function normalizeInstructionInput(input) {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return {
        text: ensureValidInstructionText(input.text),
        ingredientRefs: normalizeInstructionIngredientRefs(input.ingredientRefs),
        timer: normalizeInstructionTimer(input.timer)
      };
    }

    return {
      text: ensureValidInstructionText(input),
      ingredientRefs: [],
      timer: null
    };
  }

  function normalizeRecipeDescription(description) {
    return window.KaPItemEntryRules.normalizeDescription(description);
  }

  function normalizeOptionalDurationMinutes(value) {
    if (value == null || String(value).trim() === '') {
      return null;
    }

    var parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('Duration values must be zero or greater.');
    }

    return Math.floor(parsed);
  }

  function normalizeStoredDurationMinutes(value) {
    if (value == null || String(value).trim() === '') {
      return null;
    }

    var parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }

    return Math.floor(parsed);
  }

  function normalizeOptionalRecipeInfoText(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizeRecipeInformation(record) {
    var normalized = {
      prepMinutes: null,
      cookMinutes: null,
      additionalMinutes: null,
      servings: '',
      yield: ''
    };

    if (!record || typeof record !== 'object') {
      return normalized;
    }

    normalized.prepMinutes = normalizeStoredDurationMinutes(record.infoPrepMinutes);
    normalized.cookMinutes = normalizeStoredDurationMinutes(record.infoCookMinutes);
    normalized.additionalMinutes = normalizeStoredDurationMinutes(record.infoAdditionalMinutes);
    normalized.servings = normalizeOptionalRecipeInfoText(record.infoServings);
    normalized.yield = normalizeOptionalRecipeInfoText(record.infoYield);
    return normalized;
  }

  function normalizeOptionalUnitOfMeasureId(unitOfMeasureId) {
    var raw = String(unitOfMeasureId == null ? '' : unitOfMeasureId).trim();
    return raw || null;
  }

  function normalizeOptionalRecipeQuantity(quantity) {
    return window.KaPItemEntryRules.normalizeOptionalDecimalQuantity(quantity);
  }

  function normalizeOptionalRecipeQuantityText(quantityText) {
    var raw = String(quantityText == null ? '' : quantityText).trim();
    return raw || null;
  }

  function normalizeTagName(tagName) {
    return String(tagName || '').trim().toLowerCase();
  }

  function normalizeRecipeTags(tags) {
    var seen = {};
    return (Array.isArray(tags) ? tags : [])
      .map(normalizeTagName)
      .filter(function (tag) {
        if (!tag || seen[tag]) {
          return false;
        }

        seen[tag] = true;
        return true;
      })
      .sort(function (a, b) {
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
      });
  }

  function normalizeRecipeRecord(record) {
    if (!record) {
      return null;
    }

    var normalized = Object.assign({}, record);
    normalized.tags = normalizeRecipeTags(record.tags);
    normalized.information = normalizeRecipeInformation(record);
    return normalized;
  }

  function sortByNameAscending(records) {
    return (records || []).slice().sort(function (a, b) {
      return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), undefined, {
        sensitivity: 'base'
      });
    });
  }

  function sortByCreatedDateAscending(records) {
    return (records || []).slice().sort(function (a, b) {
      var dateA = new Date(String(a && a.createdDate) || '0');
      var dateB = new Date(String(b && b.createdDate) || '0');
      return dateA.getTime() - dateB.getTime();
    });
  }

  function sortByStepNumberAscending(records) {
    return (records || []).slice().sort(function (a, b) {
      return Number((a && a.stepNumber) || 0) - Number((b && b.stepNumber) || 0);
    });
  }

  function cloneSnapshotItems(snapshotItems) {
    return (snapshotItems || []).map(function (entry) {
      var quantityValue = entry && entry.quantityValue == null
        ? (entry && entry.quantity == null ? null : Number(entry.quantity))
        : Number(entry.quantityValue);

      return {
        itemId: String((entry && entry.itemId) || ''),
        name: String((entry && entry.name) || ''),
        quantity: quantityValue,
        quantityValue: quantityValue,
        quantityText: normalizeOptionalRecipeQuantityText(entry && entry.quantityText),
        unitOfMeasureId: normalizeOptionalUnitOfMeasureId(entry && entry.unitOfMeasureId),
        description: String((entry && entry.description) || ''),
        categoryId: String((entry && entry.categoryId) || ''),
        categoryName: String((entry && entry.categoryName) || ''),
        isOptional: entry && entry.isOptional === true
      };
    });
  }

  function cloneSnapshotInstructions(snapshotInstructions) {
    return sortByStepNumberAscending((snapshotInstructions || []).map(function (entry) {
      return {
        instructionId: String((entry && entry.instructionId) || ''),
        stepNumber: Number((entry && entry.stepNumber) || 0),
        text: String((entry && entry.text) || '').trim(),
        ingredientRefs: normalizeInstructionIngredientRefs(entry && entry.ingredientRefs),
        timer: normalizeStoredInstructionTimer(entry && entry.timer)
      };
    }));
  }

  function normalizeVersionRecord(record) {
    if (!record) {
      return null;
    }

    return {
      id: record.id,
      recipeId: record.recipeId,
      versionName: String(record.versionName || ''),
      parentVersionId: String(record.parentVersionId || ''),
      createdDate: String(record.createdDate || ''),
      updatedDate: String(record.updatedDate || ''),
      versionNote: String(record.versionNote || ''),
      snapshotItems: cloneSnapshotItems(record.snapshotItems),
      snapshotInstructions: cloneSnapshotInstructions(record.snapshotInstructions)
    };
  }

  async function requireRecipeById(recipeId) {
    var record = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.LIST_RECORDS, recipeId);
    if (!record || record.type !== RECIPE_TYPE) {
      throw new Error('Recipe not found.');
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

  async function getUnitOfMeasureById(unitOfMeasureId) {
    var normalizedId = normalizeOptionalUnitOfMeasureId(unitOfMeasureId);
    if (!normalizedId) {
      return null;
    }

    return window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.UNIT_OF_MEASURES, normalizedId);
  }

  async function ensureValidQuantityForUnit(quantityValue, unitOfMeasureId) {
    var normalizedId = normalizeOptionalUnitOfMeasureId(unitOfMeasureId);
    if (!normalizedId) {
      return null;
    }

    var uom = await getUnitOfMeasureById(normalizedId);
    if (!uom || uom.isActive === false) {
      throw new Error('Unit of measure not found.');
    }

    return normalizedId;
  }

  async function touchRecipe(recipeId) {
    var recipe = await requireRecipeById(recipeId);
    recipe.updatedDate = nowIso();
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, recipe);
    return recipe;
  }

  async function readJoinRecordsByRecipeId(recipeId) {
    return window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS,
      window.KaPStores.INDEX_NAMES.LIST_RECORD_ITEMS_BY_LIST_RECORD_ID,
      recipeId
    );
  }

  async function readInstructionRecordsByRecipeId(recipeId) {
    return window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS,
      window.KaPStores.INDEX_NAMES.RECIPE_INSTRUCTIONS_BY_RECIPE_ID,
      recipeId
    );
  }

  async function readRecipeTagMapByRecipeId(recipeId) {
    return window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.RECIPE_TAG_MAP,
      window.KaPStores.INDEX_NAMES.RECIPE_TAG_MAP_BY_RECIPE_ID,
      recipeId
    );
  }

  async function readTagByName(tagName) {
    var matches = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.TAGS,
      window.KaPStores.INDEX_NAMES.TAGS_BY_NAME,
      normalizeTagName(tagName)
    );

    return (matches || [])[0] || null;
  }

  async function ensureTagRecord(tagName) {
    var normalizedName = normalizeTagName(tagName);
    if (!normalizedName) {
      throw new Error('Tag name is required.');
    }

    var existing = await readTagByName(normalizedName);
    if (existing) {
      return existing;
    }

    var created = {
      id: window.KaPIds.NewId(),
      name: normalizedName,
      createdDate: nowIso()
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.TAGS, created);
    return created;
  }

  async function findJoinRecordById(recipeId, recipeItemId) {
    var joinRecords = await readJoinRecordsByRecipeId(recipeId);
    return joinRecords.find(function (record) {
      return record.id === recipeItemId;
    }) || null;
  }

  async function findInstructionById(recipeId, instructionId) {
    var instructionRecords = await readInstructionRecordsByRecipeId(recipeId);
    return instructionRecords.find(function (instruction) {
      return instruction.id === instructionId;
    }) || null;
  }

  function resequenceInstructions(instructionRecords) {
    return (instructionRecords || []).map(function (instruction, index) {
      return {
        id: instruction.id,
        recipeId: instruction.recipeId,
        stepNumber: index + 1,
        text: ensureValidInstructionText(instruction.text),
        ingredientRefs: normalizeInstructionIngredientRefs(instruction.ingredientRefs),
        timer: normalizeStoredInstructionTimer(instruction.timer),
        createdDate: instruction.createdDate || nowIso(),
        updatedDate: nowIso()
      };
    });
  }

  async function persistInstructionList(instructionRecords) {
    for (var i = 0; i < instructionRecords.length; i++) {
      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS, instructionRecords[i]);
    }
  }

  async function getAllRecipes() {
    var records = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.LIST_RECORDS,
      window.KaPStores.INDEX_NAMES.LIST_RECORDS_BY_TYPE,
      RECIPE_TYPE
    );

    var normalizedRecipes = sortByNameAscending(records.map(normalizeRecipeRecord));
    await Promise.all(normalizedRecipes.map(async function (recipe) {
      recipe.tags = await getRecipeTags(recipe.id);
    }));

    return normalizedRecipes;
  }

  async function getRecipeById(recipeId) {
    var record = await requireRecipeById(recipeId);
    var normalized = normalizeRecipeRecord(record);
    normalized.tags = await getRecipeTags(recipeId);
    return normalized;
  }

  async function getRecipeTags(recipeId) {
    await requireRecipeById(recipeId);
    var tagMaps = await readRecipeTagMapByRecipeId(recipeId);

    if (!tagMaps || tagMaps.length === 0) {
      return [];
    }

    var tags = await Promise.all(tagMaps.map(function (mapRecord) {
      return window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.TAGS, mapRecord.tagId);
    }));

    return normalizeRecipeTags(tags.map(function (tag) {
      return tag && tag.name;
    }));
  }

  async function getAllRecipeTags() {
    var tagRecords = await window.KaPDB.readAll(window.KaPStores.STORE_NAMES.TAGS);
    return normalizeRecipeTags((tagRecords || []).map(function (record) {
      return record && record.name;
    })).sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }

  async function addTagToRecipe(recipeId, tagName) {
    var safeTag = normalizeTagName(tagName);
    if (!safeTag) {
      throw new Error('Tag name is required.');
    }

    await requireRecipeById(recipeId);

    var tag = await ensureTagRecord(safeTag);
    var existingMaps = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.RECIPE_TAG_MAP,
      window.KaPStores.INDEX_NAMES.RECIPE_TAG_MAP_BY_RECIPE_AND_TAG,
      [recipeId, tag.id]
    );

    if ((existingMaps || []).length === 0) {
      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_TAG_MAP, {
        id: window.KaPIds.NewId(),
        recipeId: recipeId,
        tagId: tag.id,
        createdDate: nowIso()
      });
    }

    var recipe = await requireRecipeById(recipeId);
    recipe.updatedDate = nowIso();
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, recipe);
    return getRecipeTags(recipeId);
  }

  async function removeTagFromRecipe(recipeId, tagName) {
    var safeTag = normalizeTagName(tagName);
    if (!safeTag) {
      return [];
    }

    await requireRecipeById(recipeId);
    var tag = await readTagByName(safeTag);
    if (!tag) {
      return getRecipeTags(recipeId);
    }

    var existingMaps = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.RECIPE_TAG_MAP,
      window.KaPStores.INDEX_NAMES.RECIPE_TAG_MAP_BY_RECIPE_AND_TAG,
      [recipeId, tag.id]
    );

    for (var i = 0; i < existingMaps.length; i++) {
      await window.KaPDB.remove(window.KaPStores.STORE_NAMES.RECIPE_TAG_MAP, existingMaps[i].id);
    }

    var recipe = await requireRecipeById(recipeId);
    recipe.updatedDate = nowIso();
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, recipe);
    return getRecipeTags(recipeId);
  }

  async function getRecipeItems(recipeId) {
    await requireRecipeById(recipeId);
    var joinRecords = await readJoinRecordsByRecipeId(recipeId);
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

        return {
          id: joinRecord.id,
          listRecordId: joinRecord.listRecordId,
          itemId: joinRecord.itemId,
          name: joinRecord.name || (item && item.name) || 'Unknown Item',
          quantity: quantityValue,
          quantityValue: quantityValue,
          quantityText: normalizeOptionalRecipeQuantityText(joinRecord.quantityText),
          unitOfMeasureId: normalizeOptionalUnitOfMeasureId(joinRecord.unitOfMeasureId),
          description: joinRecord.description,
          categoryId: (item && item.categoryId) || '',
          categoryName: (item && item.categoryName) || '',
          isOptional: joinRecord.isOptional === true,
          item: item || null
        };
      })
    );

    return sortByNameAscending(detailItems);
  }

  async function getRecipeInstructions(recipeId) {
    await requireRecipeById(recipeId);
    var instructionRecords = await readInstructionRecordsByRecipeId(recipeId);
    return sortByStepNumberAscending(instructionRecords).map(function (instruction) {
      return {
        id: instruction.id,
        recipeId: instruction.recipeId,
        stepNumber: Number(instruction.stepNumber || 0),
        text: String(instruction.text || ''),
        ingredientRefs: normalizeInstructionIngredientRefs(instruction.ingredientRefs),
        timer: normalizeStoredInstructionTimer(instruction.timer),
        createdDate: String(instruction.createdDate || ''),
        updatedDate: String(instruction.updatedDate || '')
      };
    });
  }

  async function getRecipeVersions(recipeId) {
    await ensureRecipeHasVersion(recipeId);

    var versions = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.RECIPE_VERSIONS,
      window.KaPStores.INDEX_NAMES.RECIPE_VERSIONS_BY_RECIPE_ID,
      recipeId
    );

    return sortByCreatedDateAscending(versions).map(normalizeVersionRecord);
  }

  async function getLatestRecipeVersion(recipeId) {
    var versions = await getRecipeVersions(recipeId);
    return versions.length > 0 ? versions[versions.length - 1] : null;
  }

  async function getRecipeVersionById(recipeId, versionId) {
    await ensureRecipeHasVersion(recipeId);
    var version = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, versionId);
    if (!version || version.recipeId !== recipeId) {
      return null;
    }
    return normalizeVersionRecord(version);
  }

  async function syncLatestVersionSnapshot(recipeId) {
    await ensureRecipeHasVersion(recipeId);
    var latestVersion = await getLatestRecipeVersion(recipeId);
    if (!latestVersion) {
      return null;
    }

    var detailItems = await getRecipeItems(recipeId);
    var instructionRecords = await getRecipeInstructions(recipeId);

    latestVersion.snapshotItems = detailItems.map(function (detailItem) {
      var quantityValue = detailItem.quantityValue == null
        ? (detailItem.quantity == null ? null : Number(detailItem.quantity))
        : Number(detailItem.quantityValue);

      return {
        itemId: detailItem.itemId || '',
        name: detailItem.name || '',
        quantity: quantityValue,
        quantityValue: quantityValue,
        quantityText: normalizeOptionalRecipeQuantityText(detailItem.quantityText),
        unitOfMeasureId: normalizeOptionalUnitOfMeasureId(detailItem.unitOfMeasureId),
        description: detailItem.description || '',
        categoryId: detailItem.categoryId || '',
        categoryName: detailItem.categoryName || '',
        isOptional: detailItem.isOptional === true
      };
    });

    latestVersion.snapshotInstructions = instructionRecords.map(function (instruction) {
      return {
        instructionId: instruction.id,
        stepNumber: Number(instruction.stepNumber || 0),
        text: instruction.text || '',
        ingredientRefs: normalizeInstructionIngredientRefs(instruction.ingredientRefs),
        timer: normalizeStoredInstructionTimer(instruction.timer)
      };
    });

    latestVersion.updatedDate = nowIso();
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, latestVersion);
    await touchRecipe(recipeId);
    return normalizeVersionRecord(latestVersion);
  }

  async function createInitialRecipeVersion(recipeRecord) {
    var versionRecord = {
      id: window.KaPIds.NewId(),
      recipeId: recipeRecord.id,
      versionName: getDefaultVersionName(),
      parentVersionId: '',
      createdDate: recipeRecord.createdDate,
      updatedDate: recipeRecord.updatedDate,
      versionNote: '',
      snapshotItems: [],
      snapshotInstructions: []
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, versionRecord);
    return versionRecord;
  }

  async function ensureRecipeHasVersion(recipeId) {
    var recipeRecord = await requireRecipeById(recipeId);
    var versions = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.RECIPE_VERSIONS,
      window.KaPStores.INDEX_NAMES.RECIPE_VERSIONS_BY_RECIPE_ID,
      recipeId
    );

    if ((versions || []).length > 0) {
      return;
    }

    await createInitialRecipeVersion(recipeRecord);
    await syncLatestVersionSnapshot(recipeId);
  }

  async function createRecipe(name) {
    var safeName = ensureValidRecipeName(name);
    var timestamp = nowIso();

    var record = {
      id: window.KaPIds.NewId(),
      name: safeName,
      description: '',
      tags: [],
      infoPrepMinutes: null,
      infoCookMinutes: null,
      infoAdditionalMinutes: null,
      infoServings: '',
      infoYield: '',
      type: RECIPE_TYPE,
      createdDate: timestamp,
      updatedDate: timestamp
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, record);
    await createInitialRecipeVersion(record);
    return record;
  }

  async function renameRecipe(id, nextName) {
    var safeName = ensureValidRecipeName(nextName);
    var record = await requireRecipeById(id);

    record.name = safeName;
    record.updatedDate = nowIso();

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, record);
    return record;
  }

  async function updateRecipeDescription(id, nextDescription) {
    var record = await requireRecipeById(id);
    record.description = normalizeRecipeDescription(nextDescription);
    record.updatedDate = nowIso();

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, record);
    return record;
  }

  async function updateRecipeInformation(id, nextInformation) {
    var record = await requireRecipeById(id);
    var source = (nextInformation && typeof nextInformation === 'object') ? nextInformation : {};

    if (Object.prototype.hasOwnProperty.call(source, 'prepMinutes')) {
      record.infoPrepMinutes = normalizeOptionalDurationMinutes(source.prepMinutes);
    }

    if (Object.prototype.hasOwnProperty.call(source, 'cookMinutes')) {
      record.infoCookMinutes = normalizeOptionalDurationMinutes(source.cookMinutes);
    }

    if (Object.prototype.hasOwnProperty.call(source, 'additionalMinutes')) {
      record.infoAdditionalMinutes = normalizeOptionalDurationMinutes(source.additionalMinutes);
    }

    if (Object.prototype.hasOwnProperty.call(source, 'servings')) {
      record.infoServings = normalizeOptionalRecipeInfoText(source.servings);
    }

    if (Object.prototype.hasOwnProperty.call(source, 'yield')) {
      record.infoYield = normalizeOptionalRecipeInfoText(source.yield);
    }

    record.updatedDate = nowIso();
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, record);
    return normalizeRecipeRecord(record);
  }

  async function deleteRecipe(id) {
    await requireRecipeById(id);

    var versions = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.RECIPE_VERSIONS,
      window.KaPStores.INDEX_NAMES.RECIPE_VERSIONS_BY_RECIPE_ID,
      id
    );
    var joinRecords = await readJoinRecordsByRecipeId(id);
    var instructionRecords = await readInstructionRecordsByRecipeId(id);
    var recipeTagMaps = await readRecipeTagMapByRecipeId(id);

    await Promise.all(joinRecords.map(function (joinRecord) {
      return window.KaPDB.remove(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, joinRecord.id);
    }));

    await Promise.all(instructionRecords.map(function (instruction) {
      return window.KaPDB.remove(window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS, instruction.id);
    }));

    await Promise.all(recipeTagMaps.map(function (mapRecord) {
      return window.KaPDB.remove(window.KaPStores.STORE_NAMES.RECIPE_TAG_MAP, mapRecord.id);
    }));

    await Promise.all(versions.map(function (version) {
      return window.KaPDB.remove(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, version.id);
    }));

    await window.KaPDB.remove(window.KaPStores.STORE_NAMES.LIST_RECORDS, id);
  }

  async function getRecipeItemCount(recipeId) {
    await requireRecipeById(recipeId);
    var joinRecords = await readJoinRecordsByRecipeId(recipeId);
    return joinRecords.length;
  }

  async function getRecipeInstructionCount(recipeId) {
    await requireRecipeById(recipeId);
    var instructionRecords = await readInstructionRecordsByRecipeId(recipeId);
    return instructionRecords.length;
  }

  async function addItemToRecipe(recipeId, itemId, name, quantity, quantityText, description, unitOfMeasureId, isOptional) {
    await requireRecipeById(recipeId);
    var safeName = window.KaPItemEntryRules.ensureValidItemEntryName(name);
    var joinRecords = await readJoinRecordsByRecipeId(recipeId);
    var existingByName = window.KaPItemEntryRules.findJoinRecordByName(joinRecords, safeName);

    if (existingByName) {
      var currentQuantity = existingByName.quantityValue == null ? existingByName.quantity : existingByName.quantityValue;
      var incremented = window.KaPItemEntryRules.incrementQuantity(currentQuantity);
      existingByName.quantity = incremented;
      existingByName.quantityValue = incremented;
      existingByName.quantityText = String(incremented);
      existingByName.isOptional = existingByName.isOptional === true || isOptional === true;
      if (unitOfMeasureId !== undefined) {
        existingByName.unitOfMeasureId = await ensureValidQuantityForUnit(
          existingByName.quantityValue,
          unitOfMeasureId
        );
      }
      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existingByName);
      await syncLatestVersionSnapshot(recipeId);
      return existingByName;
    }

    await requireItemById(itemId);
    var normalizedQuantity = normalizeOptionalRecipeQuantity(quantity);
    var normalizedQuantityText = normalizeOptionalRecipeQuantityText(quantityText);
    var normalizedUnitOfMeasureId = await ensureValidQuantityForUnit(normalizedQuantity, unitOfMeasureId);
    var joinRecord = {
      id: window.KaPIds.NewId(),
      listRecordId: recipeId,
      itemId: itemId,
      name: safeName,
      quantity: normalizedQuantity,
      quantityValue: normalizedQuantity,
      quantityText: normalizedQuantityText,
      unitOfMeasureId: normalizedUnitOfMeasureId,
      description: window.KaPItemEntryRules.normalizeDescription(description),
      isOptional: isOptional === true
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, joinRecord);
    await syncLatestVersionSnapshot(recipeId);
    return joinRecord;
  }

  async function updateRecipeItem(recipeId, recipeItemId, name, quantity, quantityText, description, unitOfMeasureId, isOptional) {
    await requireRecipeById(recipeId);
    var existing = await findJoinRecordById(recipeId, recipeItemId);
    if (!existing) {
      throw new Error('Recipe item not found.');
    }

    existing.name = window.KaPItemEntryRules.ensureValidItemEntryName(name);
    var normalizedQuantity = normalizeOptionalRecipeQuantity(quantity);
    var normalizedQuantityText = normalizeOptionalRecipeQuantityText(quantityText);
    existing.quantity = normalizedQuantity;
    existing.quantityValue = normalizedQuantity;
    existing.quantityText = normalizedQuantityText;
    if (unitOfMeasureId !== undefined) {
      existing.unitOfMeasureId = await ensureValidQuantityForUnit(normalizedQuantity, unitOfMeasureId);
    } else {
      await ensureValidQuantityForUnit(normalizedQuantity, existing.unitOfMeasureId);
    }
    existing.description = window.KaPItemEntryRules.normalizeDescription(description);
    existing.isOptional = isOptional === true;

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existing);
    await syncLatestVersionSnapshot(recipeId);
    return existing;
  }

  async function removeItemFromRecipe(recipeId, recipeItemId) {
    await requireRecipeById(recipeId);
    var existing = await findJoinRecordById(recipeId, recipeItemId);
    if (!existing) {
      return;
    }

    await window.KaPDB.remove(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existing.id);
    await syncLatestVersionSnapshot(recipeId);
  }

  async function incrementRecipeItemQuantity(recipeId, recipeItemId) {
    await requireRecipeById(recipeId);
    var existing = await findJoinRecordById(recipeId, recipeItemId);
    if (!existing) {
      throw new Error('Recipe item not found.');
    }

    var current = existing.quantityValue == null ? (existing.quantity == null ? 1 : existing.quantity) : existing.quantityValue;
    var updatedQuantity = current + 1;
    existing.quantity = updatedQuantity;
    existing.quantityValue = updatedQuantity;
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existing);
    await syncLatestVersionSnapshot(recipeId);
    return existing;
  }

  async function decrementRecipeItemQuantity(recipeId, recipeItemId) {
    await requireRecipeById(recipeId);
    var existing = await findJoinRecordById(recipeId, recipeItemId);
    if (!existing) {
      throw new Error('Recipe item not found.');
    }

    var current = existing.quantityValue == null ? (existing.quantity == null ? 1 : existing.quantity) : existing.quantityValue;
    var updatedQuantity = Math.max(1, current - 1);
    existing.quantity = updatedQuantity;
    existing.quantityValue = updatedQuantity;
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existing);
    await syncLatestVersionSnapshot(recipeId);
    return existing;
  }

  async function addInstructionToRecipe(recipeId, instructionInput) {
    await requireRecipeById(recipeId);
    var normalizedInput = normalizeInstructionInput(instructionInput);
    var instructions = await getRecipeInstructions(recipeId);
    var nextStepNumber = instructions.length + 1;

    var instruction = {
      id: window.KaPIds.NewId(),
      recipeId: recipeId,
      stepNumber: nextStepNumber,
      text: normalizedInput.text,
      ingredientRefs: normalizedInput.ingredientRefs,
      timer: normalizedInput.timer,
      createdDate: nowIso(),
      updatedDate: nowIso()
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS, instruction);
    await syncLatestVersionSnapshot(recipeId);
    return instruction;
  }

  async function updateRecipeInstruction(recipeId, instructionId, instructionInput) {
    await requireRecipeById(recipeId);
    var existing = await findInstructionById(recipeId, instructionId);
    if (!existing) {
      throw new Error('Instruction not found.');
    }

    var normalizedInput = normalizeInstructionInput(instructionInput);
    existing.text = normalizedInput.text;
    existing.ingredientRefs = normalizedInput.ingredientRefs;
    existing.timer = normalizedInput.timer;
    existing.updatedDate = nowIso();
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS, existing);
    await syncLatestVersionSnapshot(recipeId);
    return existing;
  }

  async function removeRecipeInstruction(recipeId, instructionId) {
    await requireRecipeById(recipeId);
    var existing = await findInstructionById(recipeId, instructionId);
    if (!existing) {
      return;
    }

    await window.KaPDB.remove(window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS, instructionId);
    var remaining = await readInstructionRecordsByRecipeId(recipeId);
    var resequenced = resequenceInstructions(sortByStepNumberAscending(remaining));
    await persistInstructionList(resequenced);
    await syncLatestVersionSnapshot(recipeId);
  }

  async function moveRecipeInstruction(recipeId, instructionId, direction) {
    await requireRecipeById(recipeId);
    var instructions = await getRecipeInstructions(recipeId);
    var currentIndex = instructions.findIndex(function (instruction) {
      return instruction.id === instructionId;
    });

    if (currentIndex < 0) {
      throw new Error('Instruction not found.');
    }

    var delta = direction === 'up' ? -1 : 1;
    var targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= instructions.length) {
      return instructions;
    }

    var moved = instructions[currentIndex];
    instructions[currentIndex] = instructions[targetIndex];
    instructions[targetIndex] = moved;

    var resequenced = resequenceInstructions(instructions);
    await persistInstructionList(resequenced);
    await syncLatestVersionSnapshot(recipeId);
    return sortByStepNumberAscending(resequenced);
  }

  async function replaceRecipeItemsFromSnapshot(recipeId, snapshotItems) {
    var currentJoinRecords = await readJoinRecordsByRecipeId(recipeId);
    await Promise.all(currentJoinRecords.map(function (joinRecord) {
      return window.KaPDB.remove(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, joinRecord.id);
    }));

    var clonedItems = cloneSnapshotItems(snapshotItems);
    for (var i = 0; i < clonedItems.length; i++) {
      var snapshotItem = clonedItems[i];
      var itemId = snapshotItem.itemId;
      var existingItem = itemId
        ? await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.ITEMS, itemId)
        : null;

      if (!existingItem) {
        var createdItem = await window.KaPItemsService.createItem(
          snapshotItem.name,
          snapshotItem.description,
          snapshotItem.categoryId,
          snapshotItem.categoryName
        );
        itemId = createdItem.id;
      }

      var quantityValue = snapshotItem.quantityValue == null ? snapshotItem.quantity : snapshotItem.quantityValue;
      var normalizedQuantityValue = quantityValue == null ? null : Number(quantityValue);

      var joinRecord = {
        id: window.KaPIds.NewId(),
        listRecordId: recipeId,
        itemId: itemId,
        name: snapshotItem.name,
        quantity: normalizedQuantityValue,
        quantityValue: normalizedQuantityValue,
        quantityText: normalizeOptionalRecipeQuantityText(snapshotItem.quantityText),
        unitOfMeasureId: normalizeOptionalUnitOfMeasureId(snapshotItem.unitOfMeasureId),
        description: snapshotItem.description
      };

      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, joinRecord);
    }
  }

  async function replaceRecipeInstructionsFromSnapshot(recipeId, snapshotInstructions) {
    var existingInstructions = await readInstructionRecordsByRecipeId(recipeId);
    await Promise.all(existingInstructions.map(function (instruction) {
      return window.KaPDB.remove(window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS, instruction.id);
    }));

    var clonedInstructions = cloneSnapshotInstructions(snapshotInstructions);
    for (var i = 0; i < clonedInstructions.length; i++) {
      var snapshotInstruction = clonedInstructions[i];
      var instructionRecord = {
        id: snapshotInstruction.instructionId || window.KaPIds.NewId(),
        recipeId: recipeId,
        stepNumber: Number(snapshotInstruction.stepNumber || i + 1),
        text: ensureValidInstructionText(snapshotInstruction.text),
        ingredientRefs: normalizeInstructionIngredientRefs(snapshotInstruction.ingredientRefs),
        timer: normalizeStoredInstructionTimer(snapshotInstruction.timer),
        createdDate: nowIso(),
        updatedDate: nowIso()
      };

      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS, instructionRecord);
    }

    var persistedInstructions = await readInstructionRecordsByRecipeId(recipeId);
    var resequenced = resequenceInstructions(sortByStepNumberAscending(persistedInstructions));
    await persistInstructionList(resequenced);
  }

  async function createNewVersion(recipeId, versionName, versionNote, sourceVersionId) {
    await ensureRecipeHasVersion(recipeId);
    var sourceVersion = sourceVersionId
      ? await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, sourceVersionId)
      : await getLatestRecipeVersion(recipeId);

    if (!sourceVersion || sourceVersion.recipeId !== recipeId) {
      throw new Error('Recipe version not found.');
    }

    var nextVersion = {
      id: window.KaPIds.NewId(),
      recipeId: recipeId,
      versionName: String(versionName || getDefaultVersionName()).trim(),
      parentVersionId: '',
      createdDate: nowIso(),
      updatedDate: nowIso(),
      versionNote: String(versionNote || '').trim(),
      snapshotItems: cloneSnapshotItems(sourceVersion.snapshotItems),
      snapshotInstructions: cloneSnapshotInstructions(sourceVersion.snapshotInstructions)
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, nextVersion);
    await replaceRecipeItemsFromSnapshot(recipeId, nextVersion.snapshotItems);
    await replaceRecipeInstructionsFromSnapshot(recipeId, nextVersion.snapshotInstructions);
    await syncLatestVersionSnapshot(recipeId);
    return getRecipeVersionById(recipeId, nextVersion.id);
  }

  function buildDetailItemsFromSnapshot(recipeId, snapshotItems) {
    return sortByNameAscending(cloneSnapshotItems(snapshotItems).map(function (snapshotItem, index) {
      var quantityValue = snapshotItem.quantityValue == null
        ? (snapshotItem.quantity == null ? null : Number(snapshotItem.quantity))
        : Number(snapshotItem.quantityValue);

      return {
        id: String(snapshotItem.itemId || '') + '::' + String(index),
        listRecordId: recipeId,
        itemId: snapshotItem.itemId || '',
        name: snapshotItem.name || 'Unknown Item',
        quantity: quantityValue,
        quantityValue: quantityValue,
        quantityText: normalizeOptionalRecipeQuantityText(snapshotItem.quantityText),
        unitOfMeasureId: normalizeOptionalUnitOfMeasureId(snapshotItem.unitOfMeasureId),
        description: snapshotItem.description || '',
        categoryId: snapshotItem.categoryId || '',
        categoryName: snapshotItem.categoryName || '',
        isOptional: snapshotItem.isOptional === true,
        item: null
      };
    }));
  }

  function buildInstructionItemsFromSnapshot(snapshotInstructions) {
    return cloneSnapshotInstructions(snapshotInstructions).map(function (snapshotInstruction, index) {
      return {
        id: snapshotInstruction.instructionId || ('snapshot-step-' + String(index)),
        recipeId: '',
        stepNumber: Number(snapshotInstruction.stepNumber || index + 1),
        text: snapshotInstruction.text || '',
        ingredientRefs: normalizeInstructionIngredientRefs(snapshotInstruction.ingredientRefs),
        timer: normalizeStoredInstructionTimer(snapshotInstruction.timer),
        createdDate: '',
        updatedDate: ''
      };
    });
  }

  async function updateVersionSnapshot(recipeId, versionId, snapshotItems, snapshotInstructions) {
    await ensureRecipeHasVersion(recipeId);
    var version = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, versionId);
    if (!version || version.recipeId !== recipeId) {
      throw new Error('Recipe version not found.');
    }

    version.snapshotItems = cloneSnapshotItems(snapshotItems);
    version.snapshotInstructions = cloneSnapshotInstructions(snapshotInstructions);
    version.updatedDate = nowIso();
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, version);
    return normalizeVersionRecord(version);
  }

  async function getVersionItems(recipeId, versionId) {
    var version = await getRecipeVersionById(recipeId, versionId);
    if (!version) {
      throw new Error('Recipe version not found.');
    }

    return buildDetailItemsFromSnapshot(recipeId, version.snapshotItems);
  }

  async function getVersionInstructions(recipeId, versionId) {
    var version = await getRecipeVersionById(recipeId, versionId);
    if (!version) {
      throw new Error('Recipe version not found.');
    }

    return buildInstructionItemsFromSnapshot(version.snapshotInstructions);
  }

  async function addItemToVersion(recipeId, versionId, itemId, name, quantity, quantityText, description, unitOfMeasureId, isOptional) {
    var version = await getRecipeVersionById(recipeId, versionId);
    if (!version) {
      throw new Error('Recipe version not found.');
    }

    var safeName = window.KaPItemEntryRules.ensureValidItemEntryName(name);
    var normalizedQuantity = normalizeOptionalRecipeQuantity(quantity);
    var normalizedQuantityText = normalizeOptionalRecipeQuantityText(quantityText);
    var normalizedDescription = window.KaPItemEntryRules.normalizeDescription(description);
    var snapshotItems = cloneSnapshotItems(version.snapshotItems);
    var existing = snapshotItems.find(function (entry) {
      return String(entry.name || '').toLowerCase() === safeName.toLowerCase();
    });

    if (existing) {
      var currentQuantity = existing.quantityValue == null ? existing.quantity : existing.quantityValue;
      var incremented = window.KaPItemEntryRules.incrementQuantity(currentQuantity);
      existing.quantity = incremented;
      existing.quantityValue = incremented;
      existing.quantityText = String(incremented);
      existing.isOptional = existing.isOptional === true || isOptional === true;
      if (unitOfMeasureId !== undefined) {
        existing.unitOfMeasureId = await ensureValidQuantityForUnit(existing.quantityValue, unitOfMeasureId);
      }
    } else {
      await requireItemById(itemId);
      var sourceItem = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.ITEMS, itemId);
      var normalizedUnitOfMeasureId = await ensureValidQuantityForUnit(normalizedQuantity, unitOfMeasureId);
      snapshotItems.push({
        itemId: itemId,
        name: safeName,
        quantity: normalizedQuantity,
        quantityValue: normalizedQuantity,
        quantityText: normalizedQuantityText,
        unitOfMeasureId: normalizedUnitOfMeasureId,
        description: normalizedDescription,
        isOptional: isOptional === true,
        categoryId: (sourceItem && sourceItem.categoryId) || '',
        categoryName: (sourceItem && sourceItem.categoryName) || ''
      });
    }

    await updateVersionSnapshot(recipeId, versionId, snapshotItems, version.snapshotInstructions);
    return getVersionItems(recipeId, versionId);
  }

  async function updateVersionItem(recipeId, versionId, versionItemId, name, quantity, quantityText, description, unitOfMeasureId, isOptional) {
    var version = await getRecipeVersionById(recipeId, versionId);
    if (!version) {
      throw new Error('Recipe version not found.');
    }

    var snapshotItems = cloneSnapshotItems(version.snapshotItems);
    var itemIndex = snapshotItems.findIndex(function (snapshotItem, index) {
      return (String(snapshotItem.itemId || '') + '::' + String(index)) === versionItemId;
    });
    if (itemIndex < 0) {
      throw new Error('Recipe item not found.');
    }

    var normalizedQuantity = normalizeOptionalRecipeQuantity(quantity);
    var normalizedQuantityText = normalizeOptionalRecipeQuantityText(quantityText);
    snapshotItems[itemIndex].name = window.KaPItemEntryRules.ensureValidItemEntryName(name);
    snapshotItems[itemIndex].quantity = normalizedQuantity;
    snapshotItems[itemIndex].quantityValue = normalizedQuantity;
    snapshotItems[itemIndex].quantityText = normalizedQuantityText;
    if (unitOfMeasureId !== undefined) {
      snapshotItems[itemIndex].unitOfMeasureId = await ensureValidQuantityForUnit(normalizedQuantity, unitOfMeasureId);
    } else {
      await ensureValidQuantityForUnit(normalizedQuantity, snapshotItems[itemIndex].unitOfMeasureId);
    }
    snapshotItems[itemIndex].description = window.KaPItemEntryRules.normalizeDescription(description);
    snapshotItems[itemIndex].isOptional = isOptional === true;

    await updateVersionSnapshot(recipeId, versionId, snapshotItems, version.snapshotInstructions);
    return getVersionItems(recipeId, versionId);
  }

  async function removeItemFromVersion(recipeId, versionId, versionItemId) {
    var version = await getRecipeVersionById(recipeId, versionId);
    if (!version) {
      throw new Error('Recipe version not found.');
    }

    var snapshotItems = cloneSnapshotItems(version.snapshotItems).filter(function (snapshotItem, index) {
      return (String(snapshotItem.itemId || '') + '::' + String(index)) !== versionItemId;
    });

    await updateVersionSnapshot(recipeId, versionId, snapshotItems, version.snapshotInstructions);
  }

  async function incrementVersionItemQuantity(recipeId, versionId, versionItemId) {
    var version = await getRecipeVersionById(recipeId, versionId);
    if (!version) {
      throw new Error('Recipe version not found.');
    }

    var snapshotItems = cloneSnapshotItems(version.snapshotItems);
    var itemIndex = snapshotItems.findIndex(function (snapshotItem, index) {
      return (String(snapshotItem.itemId || '') + '::' + String(index)) === versionItemId;
    });
    if (itemIndex < 0) {
      throw new Error('Recipe item not found.');
    }

    var current = snapshotItems[itemIndex].quantityValue == null
      ? (snapshotItems[itemIndex].quantity == null ? 1 : snapshotItems[itemIndex].quantity)
      : snapshotItems[itemIndex].quantityValue;
    var updatedQuantity = current + 1;
    snapshotItems[itemIndex].quantity = updatedQuantity;
    snapshotItems[itemIndex].quantityValue = updatedQuantity;
    await updateVersionSnapshot(recipeId, versionId, snapshotItems, version.snapshotInstructions);
    return getVersionItems(recipeId, versionId);
  }

  async function decrementVersionItemQuantity(recipeId, versionId, versionItemId) {
    var version = await getRecipeVersionById(recipeId, versionId);
    if (!version) {
      throw new Error('Recipe version not found.');
    }

    var snapshotItems = cloneSnapshotItems(version.snapshotItems);
    var itemIndex = snapshotItems.findIndex(function (snapshotItem, index) {
      return (String(snapshotItem.itemId || '') + '::' + String(index)) === versionItemId;
    });
    if (itemIndex < 0) {
      throw new Error('Recipe item not found.');
    }

    var current = snapshotItems[itemIndex].quantityValue == null
      ? (snapshotItems[itemIndex].quantity == null ? 1 : snapshotItems[itemIndex].quantity)
      : snapshotItems[itemIndex].quantityValue;
    var updatedQuantity = Math.max(1, current - 1);
    snapshotItems[itemIndex].quantity = updatedQuantity;
    snapshotItems[itemIndex].quantityValue = updatedQuantity;
    await updateVersionSnapshot(recipeId, versionId, snapshotItems, version.snapshotInstructions);
    return getVersionItems(recipeId, versionId);
  }

  async function addInstructionToVersion(recipeId, versionId, instructionInput) {
    var version = await getRecipeVersionById(recipeId, versionId);
    if (!version) {
      throw new Error('Recipe version not found.');
    }

    var normalizedInput = normalizeInstructionInput(instructionInput);
    var snapshotInstructions = cloneSnapshotInstructions(version.snapshotInstructions);
    snapshotInstructions.push({
      instructionId: window.KaPIds.NewId(),
      stepNumber: snapshotInstructions.length + 1,
      text: normalizedInput.text,
      ingredientRefs: normalizedInput.ingredientRefs,
      timer: normalizedInput.timer
    });

    await updateVersionSnapshot(recipeId, versionId, version.snapshotItems, snapshotInstructions);
    return getVersionInstructions(recipeId, versionId);
  }

  async function updateVersionInstruction(recipeId, versionId, instructionId, instructionInput) {
    var version = await getRecipeVersionById(recipeId, versionId);
    if (!version) {
      throw new Error('Recipe version not found.');
    }

    var normalizedInput = normalizeInstructionInput(instructionInput);
    var snapshotInstructions = cloneSnapshotInstructions(version.snapshotInstructions);
    var existing = snapshotInstructions.find(function (instruction) {
      return instruction.instructionId === instructionId;
    });
    if (!existing) {
      throw new Error('Instruction not found.');
    }

    existing.text = normalizedInput.text;
    existing.ingredientRefs = normalizedInput.ingredientRefs;
    existing.timer = normalizedInput.timer;
    await updateVersionSnapshot(recipeId, versionId, version.snapshotItems, snapshotInstructions);
    return getVersionInstructions(recipeId, versionId);
  }

  async function removeVersionInstruction(recipeId, versionId, instructionId) {
    var version = await getRecipeVersionById(recipeId, versionId);
    if (!version) {
      throw new Error('Recipe version not found.');
    }

    var snapshotInstructions = cloneSnapshotInstructions(version.snapshotInstructions)
      .filter(function (instruction) {
        return instruction.instructionId !== instructionId;
      })
      .map(function (instruction, index) {
        instruction.stepNumber = index + 1;
        return instruction;
      });

    await updateVersionSnapshot(recipeId, versionId, version.snapshotItems, snapshotInstructions);
  }

  async function moveVersionInstruction(recipeId, versionId, instructionId, direction) {
    var version = await getRecipeVersionById(recipeId, versionId);
    if (!version) {
      throw new Error('Recipe version not found.');
    }

    var snapshotInstructions = cloneSnapshotInstructions(version.snapshotInstructions);
    var currentIndex = snapshotInstructions.findIndex(function (instruction) {
      return instruction.instructionId === instructionId;
    });
    if (currentIndex < 0) {
      throw new Error('Instruction not found.');
    }

    var delta = direction === 'up' ? -1 : 1;
    var targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= snapshotInstructions.length) {
      return getVersionInstructions(recipeId, versionId);
    }

    var moved = snapshotInstructions[currentIndex];
    snapshotInstructions[currentIndex] = snapshotInstructions[targetIndex];
    snapshotInstructions[targetIndex] = moved;
    snapshotInstructions = snapshotInstructions.map(function (instruction, index) {
      instruction.stepNumber = index + 1;
      return instruction;
    });

    await updateVersionSnapshot(recipeId, versionId, version.snapshotItems, snapshotInstructions);
    return getVersionInstructions(recipeId, versionId);
  }

  async function updateVersionNote(recipeId, versionId, noteText) {
    await ensureRecipeHasVersion(recipeId);
    var version = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, versionId);
    if (!version || version.recipeId !== recipeId) {
      throw new Error('Recipe version not found.');
    }

    version.versionNote = String(noteText || '').trim();
    version.updatedDate = nowIso();
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, version);
    return normalizeVersionRecord(version);
  }

  async function updateVersionName(recipeId, versionId, nameText) {
    await ensureRecipeHasVersion(recipeId);
    var version = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, versionId);
    if (!version || version.recipeId !== recipeId) {
      throw new Error('Recipe version not found.');
    }

    var trimmedName = String(nameText || '').trim();
    if (!trimmedName) {
      throw new Error('Version name is required.');
    }

    version.versionName = trimmedName;
    version.updatedDate = nowIso();
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, version);
    return normalizeVersionRecord(version);
  }

  async function deleteRecipeVersion(recipeId, versionId) {
    await ensureRecipeHasVersion(recipeId);
    var version = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, versionId);
    if (!version || version.recipeId !== recipeId) {
      throw new Error('Recipe version not found.');
    }

    var versions = await getRecipeVersions(recipeId);
    if (versions.length <= 1) {
      throw new Error('At least one version must remain.');
    }

    var latestVersion = versions[versions.length - 1];
    if (latestVersion && latestVersion.id === version.id) {
      throw new Error('Current version cannot be deleted.');
    }

    await window.KaPDB.remove(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, version.id);
    return true;
  }

  async function cloneRecipe(recipeId, sourceVersionId, cloneName) {
    var sourceRecipe = await requireRecipeById(recipeId);
    var sourceVersion = sourceVersionId
      ? await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, sourceVersionId)
      : await getLatestRecipeVersion(recipeId);

    if (!sourceVersion || sourceVersion.recipeId !== sourceRecipe.id) {
      throw new Error('Recipe version not found.');
    }

    var clonedRecipe = await createRecipe(cloneName || (sourceRecipe.name + ' - copy'));
    await updateRecipeInformation(clonedRecipe.id, normalizeRecipeInformation(sourceRecipe));

    var sourceTags = await getRecipeTags(sourceRecipe.id);
    for (var i = 0; i < sourceTags.length; i++) {
      await addTagToRecipe(clonedRecipe.id, sourceTags[i]);
    }

    await replaceRecipeItemsFromSnapshot(clonedRecipe.id, sourceVersion.snapshotItems);
    await replaceRecipeInstructionsFromSnapshot(clonedRecipe.id, sourceVersion.snapshotInstructions);

    var clonedVersion = await syncLatestVersionSnapshot(clonedRecipe.id);
    if (clonedVersion) {
      clonedVersion.versionNote = 'Clone of ' + sourceRecipe.name + ' on ' + new Date().toLocaleString() + '.';
      clonedVersion.updatedDate = nowIso();
      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, clonedVersion);
    }

    return clonedRecipe;
  }

  function sortUnitOfMeasures(records) {
    return (records || []).slice().sort(function (a, b) {
      var groupCompare = String(a && a.group || '').localeCompare(String(b && b.group || ''), undefined, { sensitivity: 'base' });
      if (groupCompare !== 0) {
        return groupCompare;
      }

      var sortA = Number(a && a.sortOrder || 0);
      var sortB = Number(b && b.sortOrder || 0);
      if (sortA !== sortB) {
        return sortA - sortB;
      }

      return String(a && a.name || '').localeCompare(String(b && b.name || ''), undefined, { sensitivity: 'base' });
    });
  }

  async function getAllUnitOfMeasures(options) {
    var includeInactive = !!(options && options.includeInactive);
    var records = await window.KaPDB.readAll(window.KaPStores.STORE_NAMES.UNIT_OF_MEASURES);
    var filtered = includeInactive
      ? (records || [])
      : (records || []).filter(function (r) { return r && r.isActive !== false; });

    return sortUnitOfMeasures(filtered);
  }

  async function createUnitOfMeasure(name, abbreviation, group, quantityBehavior, quantityStep) {
    var safeName = String(name || '').trim();
    if (!safeName) {
      throw new Error('Unit name is required.');
    }

    var existing = await getAllUnitOfMeasures({ includeInactive: true });
    var duplicate = existing.find(function (record) {
      return String(record && record.name || '').toLowerCase() === safeName.toLowerCase();
    });

    if (duplicate) {
      throw new Error('A unit with that name already exists.');
    }

    var safeAbbreviation = String(abbreviation || '').trim();
    var safeGroup = String(group || 'Other').trim() || 'Other';
    var safeBehavior = String(quantityBehavior || 'decimal').trim().toLowerCase();
    if (safeBehavior !== 'whole_or_half' && safeBehavior !== 'decimal' && safeBehavior !== 'user_defined') {
      safeBehavior = 'decimal';
    }

    var safeStep = quantityStep == null || String(quantityStep).trim() === ''
      ? null
      : Number(quantityStep);

    if (safeStep != null && (Number.isNaN(safeStep) || !Number.isFinite(safeStep) || safeStep <= 0)) {
      throw new Error('Quantity step must be a positive number.');
    }

    var timestamp = nowIso();
    var unit = {
      id: window.KaPIds.NewId(),
      key: null,
      name: safeName,
      abbreviation: safeAbbreviation,
      group: safeGroup,
      quantityBehavior: safeBehavior,
      quantityStep: safeStep,
      isSeeded: false,
      isActive: true,
      sortOrder: 1000,
      createdDate: timestamp,
      updatedDate: timestamp
    };

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.UNIT_OF_MEASURES, unit);
    return unit;
  }

  async function updateUnitOfMeasure(unitId, updates) {
    var unit = await getUnitOfMeasureById(unitId);
    if (!unit) {
      throw new Error('Unit of measure not found.');
    }

    var nextName = updates && updates.name !== undefined ? String(updates.name || '').trim() : String(unit.name || '').trim();
    if (!nextName) {
      throw new Error('Unit name is required.');
    }

    if (nextName.toLowerCase() !== String(unit.name || '').toLowerCase()) {
      var existing = await getAllUnitOfMeasures({ includeInactive: true });
      var duplicate = existing.find(function (record) {
        return record && record.id !== unit.id && String(record.name || '').toLowerCase() === nextName.toLowerCase();
      });
      if (duplicate) {
        throw new Error('A unit with that name already exists.');
      }
    }

    var nextBehavior = updates && updates.quantityBehavior !== undefined
      ? String(updates.quantityBehavior || '').trim().toLowerCase()
      : String(unit.quantityBehavior || 'decimal').trim().toLowerCase();
    if (nextBehavior !== 'whole_or_half' && nextBehavior !== 'decimal' && nextBehavior !== 'user_defined') {
      throw new Error('Invalid quantity behavior.');
    }

    var nextStep = updates && updates.quantityStep !== undefined
      ? (updates.quantityStep == null || String(updates.quantityStep).trim() === '' ? null : Number(updates.quantityStep))
      : unit.quantityStep;

    if (nextStep != null && (Number.isNaN(nextStep) || !Number.isFinite(nextStep) || nextStep <= 0)) {
      throw new Error('Quantity step must be a positive number.');
    }

    unit.name = nextName;
    unit.abbreviation = updates && updates.abbreviation !== undefined ? String(updates.abbreviation || '').trim() : String(unit.abbreviation || '');
    unit.group = updates && updates.group !== undefined ? (String(updates.group || '').trim() || 'Other') : String(unit.group || 'Other');
    unit.quantityBehavior = nextBehavior;
    unit.quantityStep = nextStep;
    unit.isActive = updates && updates.isActive !== undefined ? !!updates.isActive : unit.isActive !== false;
    unit.updatedDate = nowIso();

    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.UNIT_OF_MEASURES, unit);
    return unit;
  }

  async function deleteUnitOfMeasure(unitId) {
    var unit = await getUnitOfMeasureById(unitId);
    if (!unit) {
      throw new Error('Unit of measure not found.');
    }
    await window.KaPDB.remove(window.KaPStores.STORE_NAMES.UNIT_OF_MEASURES, unit.id);
  }

  async function renameGroup(oldGroupName, newGroupName) {
    var safeOld = String(oldGroupName || '').trim();
    var safeNew = String(newGroupName || '').trim() || 'Other';
    if (!safeOld || safeOld === safeNew) {
      return;
    }

    var units = await getAllUnitOfMeasures({ includeInactive: true });
    var toUpdate = units.filter(function (u) {
      return String(u && u.group || '').trim() === safeOld;
    });

    var timestamp = nowIso();
    for (var i = 0; i < toUpdate.length; i++) {
      var unit = toUpdate[i];
      unit.group = safeNew;
      unit.updatedDate = timestamp;
      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.UNIT_OF_MEASURES, unit);
    }
  }

  window.KaPRecipesService = {
    getAllRecipes: getAllRecipes,
    getRecipeById: getRecipeById,
    getRecipeTags: getRecipeTags,
    getAllRecipeTags: getAllRecipeTags,
    getAllUnitOfMeasures: getAllUnitOfMeasures,
    createUnitOfMeasure: createUnitOfMeasure,
    updateUnitOfMeasure: updateUnitOfMeasure,
    deleteUnitOfMeasure: deleteUnitOfMeasure,
    renameGroup: renameGroup,
    addTagToRecipe: addTagToRecipe,
    removeTagFromRecipe: removeTagFromRecipe,
    createRecipe: createRecipe,
    renameRecipe: renameRecipe,
    updateRecipeDescription: updateRecipeDescription,
    updateRecipeInformation: updateRecipeInformation,
    deleteRecipe: deleteRecipe,
    getRecipeItemCount: getRecipeItemCount,
    getRecipeInstructionCount: getRecipeInstructionCount,
    getRecipeItems: getRecipeItems,
    getRecipeInstructions: getRecipeInstructions,
    addItemToRecipe: addItemToRecipe,
    updateRecipeItem: updateRecipeItem,
    removeItemFromRecipe: removeItemFromRecipe,
    incrementRecipeItemQuantity: incrementRecipeItemQuantity,
    decrementRecipeItemQuantity: decrementRecipeItemQuantity,
    addInstructionToRecipe: addInstructionToRecipe,
    updateRecipeInstruction: updateRecipeInstruction,
    removeRecipeInstruction: removeRecipeInstruction,
    moveRecipeInstruction: moveRecipeInstruction,
    getRecipeVersions: getRecipeVersions,
    getLatestRecipeVersion: getLatestRecipeVersion,
    getRecipeVersionById: getRecipeVersionById,
    getVersionItems: getVersionItems,
    getVersionInstructions: getVersionInstructions,
    createNewVersion: createNewVersion,
    addItemToVersion: addItemToVersion,
    updateVersionItem: updateVersionItem,
    removeItemFromVersion: removeItemFromVersion,
    incrementVersionItemQuantity: incrementVersionItemQuantity,
    decrementVersionItemQuantity: decrementVersionItemQuantity,
    addInstructionToVersion: addInstructionToVersion,
    updateVersionInstruction: updateVersionInstruction,
    removeVersionInstruction: removeVersionInstruction,
    moveVersionInstruction: moveVersionInstruction,
    updateVersionNote: updateVersionNote,
    updateVersionName: updateVersionName,
    deleteRecipeVersion: deleteRecipeVersion,
    cloneRecipe: cloneRecipe
  };
})();