(function () {
  var STORE_NAMES = {
    LIST_RECORDS: 'listRecords',
    ITEMS: 'items',
    LIST_RECORD_ITEMS: 'listRecordItems',
    CATEGORIES: 'categories',
    RECIPE_VERSIONS: 'recipeVersions',
    RECIPE_INSTRUCTIONS: 'recipeInstructions',
    TAGS: 'tags',
    RECIPE_TAG_MAP: 'recipeTagMap',
    UNIT_OF_MEASURES: 'unitOfMeasures',
    SYNC_TOMBSTONES: 'syncTombstones',
    SYNC_STORE_MANIFEST: 'syncStoreManifest'
  };

  var INDEX_NAMES = {
    LIST_RECORDS_BY_TYPE: 'by_type',
    LIST_RECORDS_BY_UPDATED_DATE: 'by_updated_date',
    ITEMS_BY_NAME: 'by_name',
    LIST_RECORD_ITEMS_BY_LIST_RECORD_ID: 'by_list_record_id',
    LIST_RECORD_ITEMS_BY_ITEM_ID: 'by_item_id',
    CATEGORIES_BY_NAME: 'by_name',
    RECIPE_VERSIONS_BY_RECIPE_ID: 'by_recipe_id',
    RECIPE_VERSIONS_BY_RECIPE_AND_VERSION: 'by_recipe_and_version',
    RECIPE_INSTRUCTIONS_BY_RECIPE_ID: 'by_recipe_id',
    RECIPE_INSTRUCTIONS_BY_RECIPE_AND_STEP: 'by_recipe_and_step',
    TAGS_BY_NAME: 'by_name',
    RECIPE_TAG_MAP_BY_RECIPE_ID: 'by_recipe_id',
    RECIPE_TAG_MAP_BY_TAG_ID: 'by_tag_id',
    RECIPE_TAG_MAP_BY_RECIPE_AND_TAG: 'by_recipe_and_tag',
    UNIT_OF_MEASURES_BY_NAME: 'by_name',
    UNIT_OF_MEASURES_BY_GROUP: 'by_group',
    UNIT_OF_MEASURES_BY_ACTIVE: 'by_active',
    SYNC_TOMBSTONES_BY_STORE: 'by_store_name',
    SYNC_TOMBSTONES_BY_RECORD_KEY: 'by_store_and_record'
  };

  function ensureStore(db, transaction, storeName, options) {
    if (db.objectStoreNames.contains(storeName)) {
      return transaction.objectStore(storeName);
    }

    return db.createObjectStore(storeName, options);
  }

  function ensureIndex(store, indexName, keyPath, options) {
    if (!store.indexNames.contains(indexName)) {
      store.createIndex(indexName, keyPath, options || { unique: false });
    }
  }

  function normalizeTagName(tagName) {
    return String(tagName || '').trim().toLowerCase();
  }

  function getUnitOfMeasureSeedData() {
    return [
      { key: 'imperial.tsp', name: 'Teaspoon', abbreviation: 'tsp', group: 'Imperial', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 10 },
      { key: 'imperial.tbsp', name: 'Tablespoon', abbreviation: 'tbsp', group: 'Imperial', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 20 },
      { key: 'imperial.floz', name: 'Fluid Ounce', abbreviation: 'fl oz', group: 'Imperial', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 30 },
      { key: 'imperial.cup', name: 'Cup', abbreviation: 'cup', group: 'Imperial', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 40 },
      { key: 'imperial.pint', name: 'Pint', abbreviation: 'pt', group: 'Imperial', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 50 },
      { key: 'imperial.quart', name: 'Quart', abbreviation: 'qt', group: 'Imperial', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 60 },
      { key: 'imperial.gallon', name: 'Gallon', abbreviation: 'gal', group: 'Imperial', quantityBehavior: 'whole_or_half', quantityStep: 0.5, sortOrder: 70 },
      { key: 'imperial.oz', name: 'Ounce', abbreviation: 'oz', group: 'Imperial', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 80 },
      { key: 'imperial.lb', name: 'Pound', abbreviation: 'lb', group: 'Imperial', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 90 },
      { key: 'metric.ml', name: 'Milliliter', abbreviation: 'ml', group: 'Metric', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 100 },
      { key: 'metric.l', name: 'Liter', abbreviation: 'l', group: 'Metric', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 110 },
      { key: 'metric.mg', name: 'Milligram', abbreviation: 'mg', group: 'Metric', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 120 },
      { key: 'metric.g', name: 'Gram', abbreviation: 'g', group: 'Metric', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 130 },
      { key: 'metric.kg', name: 'Kilogram', abbreviation: 'kg', group: 'Metric', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 140 },
      { key: 'unit.each', name: 'Each', abbreviation: 'each', group: 'Unit', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 150 },
      { key: 'unit.piece', name: 'Piece', abbreviation: 'piece', group: 'Unit', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 160 },
      { key: 'unit.clove', name: 'Clove', abbreviation: 'clove', group: 'Unit', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 170 },
      { key: 'unit.bunch', name: 'Bunch', abbreviation: 'bunch', group: 'Unit', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 180 },
      { key: 'unit.can', name: 'Can', abbreviation: 'can', group: 'Unit', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 190 },
      { key: 'unit.jar', name: 'Jar', abbreviation: 'jar', group: 'Unit', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 200 },
      { key: 'unit.packet', name: 'Packet', abbreviation: 'packet', group: 'Unit', quantityBehavior: 'user_defined', quantityStep: null, sortOrder: 210 },
      { key: 'unit.bag', name: 'Bag', abbreviation: 'bag', group: 'Unit', quantityBehavior: 'user_defined', quantityStep: null, sortOrder: 220 },
      { key: 'unit.box', name: 'Box', abbreviation: 'box', group: 'Unit', quantityBehavior: 'user_defined', quantityStep: null, sortOrder: 230 },
      { key: 'size.small', name: 'Small', abbreviation: 'sm', group: 'Size', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 240 },
      { key: 'size.medium', name: 'Medium', abbreviation: 'med', group: 'Size', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 250 },
      { key: 'size.large', name: 'Large', abbreviation: 'lg', group: 'Size', quantityBehavior: 'decimal', quantityStep: null, sortOrder: 260 }
    ];
  }

  function upgrade(db, oldVersion, transaction) {
    var listRecordsStore = ensureStore(db, transaction, STORE_NAMES.LIST_RECORDS, { keyPath: 'id' });
    ensureIndex(listRecordsStore, INDEX_NAMES.LIST_RECORDS_BY_TYPE, 'type', { unique: false });
    ensureIndex(listRecordsStore, INDEX_NAMES.LIST_RECORDS_BY_UPDATED_DATE, 'updatedDate', { unique: false });

    var itemsStore = ensureStore(db, transaction, STORE_NAMES.ITEMS, { keyPath: 'id' });
    ensureIndex(itemsStore, INDEX_NAMES.ITEMS_BY_NAME, 'name', { unique: false });

    var joinStore = ensureStore(db, transaction, STORE_NAMES.LIST_RECORD_ITEMS, { keyPath: 'id' });
    ensureIndex(joinStore, INDEX_NAMES.LIST_RECORD_ITEMS_BY_LIST_RECORD_ID, 'listRecordId', { unique: false });
    ensureIndex(joinStore, INDEX_NAMES.LIST_RECORD_ITEMS_BY_ITEM_ID, 'itemId', { unique: false });

    var categoriesStore = ensureStore(db, transaction, STORE_NAMES.CATEGORIES, { keyPath: 'id' });
    ensureIndex(categoriesStore, INDEX_NAMES.CATEGORIES_BY_NAME, 'name', { unique: false });

    var recipeVersionsStore = ensureStore(db, transaction, STORE_NAMES.RECIPE_VERSIONS, { keyPath: 'id' });
    ensureIndex(recipeVersionsStore, INDEX_NAMES.RECIPE_VERSIONS_BY_RECIPE_ID, 'recipeId', { unique: false });
    ensureIndex(recipeVersionsStore, INDEX_NAMES.RECIPE_VERSIONS_BY_RECIPE_AND_VERSION, ['recipeId', 'versionNumber'], { unique: true });

    var recipeInstructionsStore = ensureStore(db, transaction, STORE_NAMES.RECIPE_INSTRUCTIONS, { keyPath: 'id' });
    ensureIndex(recipeInstructionsStore, INDEX_NAMES.RECIPE_INSTRUCTIONS_BY_RECIPE_ID, 'recipeId', { unique: false });
    ensureIndex(recipeInstructionsStore, INDEX_NAMES.RECIPE_INSTRUCTIONS_BY_RECIPE_AND_STEP, ['recipeId', 'stepNumber'], { unique: false });

    var tagsStore = ensureStore(db, transaction, STORE_NAMES.TAGS, { keyPath: 'id' });
    ensureIndex(tagsStore, INDEX_NAMES.TAGS_BY_NAME, 'name', { unique: true });

    var recipeTagMapStore = ensureStore(db, transaction, STORE_NAMES.RECIPE_TAG_MAP, { keyPath: 'id' });
    ensureIndex(recipeTagMapStore, INDEX_NAMES.RECIPE_TAG_MAP_BY_RECIPE_ID, 'recipeId', { unique: false });
    ensureIndex(recipeTagMapStore, INDEX_NAMES.RECIPE_TAG_MAP_BY_TAG_ID, 'tagId', { unique: false });
    ensureIndex(recipeTagMapStore, INDEX_NAMES.RECIPE_TAG_MAP_BY_RECIPE_AND_TAG, ['recipeId', 'tagId'], { unique: true });

    var unitOfMeasuresStore = ensureStore(db, transaction, STORE_NAMES.UNIT_OF_MEASURES, { keyPath: 'id' });
    ensureIndex(unitOfMeasuresStore, INDEX_NAMES.UNIT_OF_MEASURES_BY_NAME, 'name', { unique: false });
    ensureIndex(unitOfMeasuresStore, INDEX_NAMES.UNIT_OF_MEASURES_BY_GROUP, 'group', { unique: false });
    ensureIndex(unitOfMeasuresStore, INDEX_NAMES.UNIT_OF_MEASURES_BY_ACTIVE, 'isActive', { unique: false });

    var syncTombstonesStore = ensureStore(db, transaction, STORE_NAMES.SYNC_TOMBSTONES, { keyPath: 'id' });
    ensureIndex(syncTombstonesStore, INDEX_NAMES.SYNC_TOMBSTONES_BY_STORE, 'storeName', { unique: false });
    ensureIndex(syncTombstonesStore, INDEX_NAMES.SYNC_TOMBSTONES_BY_RECORD_KEY, ['storeName', 'recordId'], { unique: true });

    if (oldVersion < 10 && db.objectStoreNames.contains(STORE_NAMES.SYNC_STORE_MANIFEST)) {
      db.deleteObjectStore(STORE_NAMES.SYNC_STORE_MANIFEST);
    }

    ensureStore(db, transaction, STORE_NAMES.SYNC_STORE_MANIFEST, { keyPath: 'id' });

    if (oldVersion < 6) {
      var existingTagsByName = {};

      tagsStore.getAll().onsuccess = function (event) {
        var existingTagRecords = event.target.result || [];
        for (var i = 0; i < existingTagRecords.length; i++) {
          existingTagsByName[existingTagRecords[i].name] = existingTagRecords[i].id;
        }

        listRecordsStore.getAll().onsuccess = function (listRecordsEvent) {
          var listRecords = listRecordsEvent.target.result || [];
          var seenRecipeTagKeys = {};

          for (var j = 0; j < listRecords.length; j++) {
            var recipe = listRecords[j];
            if (!recipe || recipe.type !== 'Recipe' || !Array.isArray(recipe.tags) || recipe.tags.length === 0) {
              continue;
            }

            for (var k = 0; k < recipe.tags.length; k++) {
              var normalizedTag = normalizeTagName(recipe.tags[k]);
              if (!normalizedTag) {
                continue;
              }

              var tagId = existingTagsByName[normalizedTag];
              if (!tagId) {
                tagId = window.KaPIds.NewId();
                existingTagsByName[normalizedTag] = tagId;
                tagsStore.put({ id: tagId, name: normalizedTag, createdDate: new Date().toISOString() });
              }

              var recipeTagKey = String(recipe.id) + '::' + String(tagId);
              if (seenRecipeTagKeys[recipeTagKey]) {
                continue;
              }

              seenRecipeTagKeys[recipeTagKey] = true;

              recipeTagMapStore.put({
                id: window.KaPIds.NewId(),
                recipeId: recipe.id,
                tagId: tagId,
                createdDate: new Date().toISOString()
              });
            }
          }
        };
      };
    }

    if (oldVersion < 7) {
      unitOfMeasuresStore.getAll().onsuccess = function (event) {
        var existing = event.target.result || [];
        var existingByKey = {};
        var seedUnits = getUnitOfMeasureSeedData();
        var timestamp = new Date().toISOString();

        for (var i = 0; i < existing.length; i++) {
          var existingKey = String(existing[i] && existing[i].key || '');
          if (existingKey) {
            existingByKey[existingKey] = true;
          }
        }

        for (var j = 0; j < seedUnits.length; j++) {
          var seed = seedUnits[j];
          if (existingByKey[seed.key]) {
            continue;
          }

          unitOfMeasuresStore.put({
            id: window.KaPIds.NewId(),
            key: seed.key,
            name: seed.name,
            abbreviation: seed.abbreviation,
            group: seed.group,
            quantityBehavior: seed.quantityBehavior,
            quantityStep: seed.quantityStep,
            isSeeded: true,
            isActive: true,
            sortOrder: seed.sortOrder,
            createdDate: timestamp,
            updatedDate: timestamp
          });
        }
      };
    }
  }

  window.KaPStores = {
    STORE_NAMES: STORE_NAMES,
    INDEX_NAMES: INDEX_NAMES,
    upgrade: upgrade
  };
})();
