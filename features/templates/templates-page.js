(function () {
  var pendingTargetAddCountsByKey = {};
  var processingTargetAddByKey = {};

  async function showError(message) {
    await window.KaPUI.ShowAlert({ title: 'Error', message: message });
  }

  async function createTemplate() {
    var name = await window.KaPUI.ShowPrompt({
      title: 'New Pantry Entry',
      placeholder: 'e.g. Pantry staples, or Fridge essentials',
      confirmLabel: 'Create'
    });
    if (name === null) {
      return;
    }

    try {
      await window.KaPTemplatesService.createTemplate(name);
    } catch (error) {
      await showError(error.message || 'Unable to create pantry entry.');
    }
  }

  async function editTemplateConfig(record, focusTargetListOnOpen) {
    var result = await window.KaPUI.ShowTemplateConfigModal({
      title: 'Edit Pantry Entry',
      confirmLabel: 'Save',
      initialName: record.name,
      initialTargetListId: record.targetListId,
      initialTargetListName: record.targetListName,
      focusTargetListOnOpen: focusTargetListOnOpen === true,
      getAllLists: function () {
        return window.KaPListsService.getAllLists();
      },
      searchLists: async function (query) {
        var allLists = await window.KaPListsService.getAllLists();
        return allLists;
      },
      resolveExactList: async function (name) {
        var allLists = await window.KaPListsService.getAllLists();
        var normalized = String(name || '').trim().toLowerCase();
        return allLists.find(function (listRecord) {
          return String(listRecord.name || '').trim().toLowerCase() === normalized;
        }) || null;
      }
    });

    if (result === null) {
      return null;
    }

    try {
      return await window.KaPTemplatesService.updateTemplateConfig(
        record.id,
        result.name,
        result.targetListId,
        result.targetListName
      );
    } catch (error) {
      await showError(error.message || 'Unable to update pantry entry.');
      return null;
    }
  }

  async function deleteTemplate(record) {
    var confirmed = await window.KaPUI.ShowConfirm({
      title: 'Delete Pantry Entry',
      message: 'Delete "' + record.name + '"?',
      confirmLabel: 'Delete',
      isDanger: true
    });
    if (!confirmed) {
      return false;
    }

    try {
      await window.KaPTemplatesService.deleteTemplate(record.id);
      return true;
    } catch (error) {
      await showError(error.message || 'Unable to delete pantry entry.');
      return false;
    }
  }

  async function addTemplateItemWithDiscoveryModal(templateRecord, detailItems) {
    var result = await window.KaPUI.ShowDiscoveryItemModal(window.KaPItemDiscovery.buildAddItemModalOptions({
      title: 'Add Item to Pantry Entry',
      currentContextLabel: 'template',
      detailItems: detailItems
    }));

    if (result === null) {
      return;
    }

    try {
      await window.KaPTemplatesService.addItemToTemplate(
        templateRecord.id,
        result.item.id,
        result.name,
        result.quantity,
        result.description
      );

      await window.KaPItemsService.setItemCategory(
        result.item.id,
        result.categoryId || '',
        result.categoryName || '',
        result.name
      );
    } catch (error) {
      await showError(error.message || 'Unable to add item.');
    }
  }

  async function editTemplateItemWithPrompt(templateRecord, detailItem) {
    var result = await window.KaPUI.ShowDiscoveryItemModal({
      title: 'Edit Item',
      confirmLabel: 'Save',
      itemNamePlaceholder: 'Item name',
      categoryPlaceholder: 'Search or type category',
      descriptionPlaceholder: 'Item notes',
      initialName: detailItem.name,
      initialCategoryId: detailItem.categoryId,
      initialCategoryName: detailItem.categoryName,
      initialDescription: detailItem.description,
      showQuantityField: false,
      showCategoryField: true,
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
      enableSuggestions: false
    });

    if (result === null) {
      return;
    }

    try {
      await window.KaPTemplatesService.updateTemplateItem(
        templateRecord.id,
        detailItem.id,
        result.name,
        detailItem.quantity,
        result.description
      );

      if (detailItem.itemId) {
        await window.KaPItemsService.setItemCategory(
          detailItem.itemId,
          result.categoryId || '',
          result.categoryName || '',
          result.name
        );
      }
    } catch (error) {
      await showError(error.message || 'Unable to update item.');
    }
  }

  function sortByNameAscending(records) {
    return (records || []).slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base'
      });
    });
  }

  function getCategoryViewState(recordType, recordId) {
    var saved = window.KaPSettings.get(window.KaPSettings.KEYS.CATEGORY_VIEW_BY_RECORD) || {};
    var scope = saved[recordType] || {};
    return scope[recordId] === true;
  }

  function setCategoryViewState(recordType, recordId, isVisible) {
    var saved = window.KaPSettings.get(window.KaPSettings.KEYS.CATEGORY_VIEW_BY_RECORD) || {};
    if (!saved[recordType]) {
      saved[recordType] = {};
    }

    saved[recordType][recordId] = isVisible === true;
    window.KaPSettings.set(window.KaPSettings.KEYS.CATEGORY_VIEW_BY_RECORD, saved);
  }

  function getCategoryLabel(detailItem) {
    var name = String((detailItem && detailItem.categoryName) || '').trim();
    return name || 'Uncategorized';
  }

  function sortCategoryLabelsAscending(labels) {
    return (labels || []).slice().sort(function (a, b) {
      return String(a || '').localeCompare(String(b || ''), undefined, {
        sensitivity: 'base'
      });
    });
  }

  function getTargetAddKey(templateRecord, detailItem) {
    return String((templateRecord && templateRecord.id) || '') + '::' + String((detailItem && detailItem.id) || '');
  }

  async function getLatestTemplateDetailItem(templateId, detailItemId) {
    var detailItems = await window.KaPTemplatesService.getTemplateItems(templateId);
    return detailItems.find(function (item) {
      return item.id === detailItemId;
    }) || null;
  }

  async function processPendingTargetAdds(targetKey, templateRecord, detailItem, container, hooks) {
    if (processingTargetAddByKey[targetKey]) {
      return;
    }

    processingTargetAddByKey[targetKey] = true;

    try {
      while ((pendingTargetAddCountsByKey[targetKey] || 0) > 0) {
        pendingTargetAddCountsByKey[targetKey] = pendingTargetAddCountsByKey[targetKey] - 1;
        var latestDetailItem = await getLatestTemplateDetailItem(templateRecord.id, detailItem.id);
        var didApply = await addTemplateItemToTargetListImpl(templateRecord, latestDetailItem || detailItem, container, hooks);
        if (didApply === false) {
          // If target list selection is canceled, clear queued clicks for this item.
          pendingTargetAddCountsByKey[targetKey] = 0;
          break;
        }
      }
    } finally {
      processingTargetAddByKey[targetKey] = false;

      // Handle clicks that arrive during the final transition out of processing.
      if ((pendingTargetAddCountsByKey[targetKey] || 0) > 0) {
        processPendingTargetAdds(targetKey, templateRecord, detailItem, container, hooks);
      }
    }
  }

  async function addTemplateItemToTargetList(templateRecord, detailItem, container, hooks) {
    var targetKey = getTargetAddKey(templateRecord, detailItem);
    pendingTargetAddCountsByKey[targetKey] = (pendingTargetAddCountsByKey[targetKey] || 0) + 1;
    await processPendingTargetAdds(targetKey, templateRecord, detailItem, container, hooks);
  }

  async function addTemplateItemToTargetListImpl(templateRecord, detailItem, container, hooks) {
    var latestTemplateRecord = await window.KaPDB.readByKey(
      window.KaPStores.STORE_NAMES.LIST_RECORDS,
      templateRecord.id
    );

    var activeTemplateRecord = latestTemplateRecord && latestTemplateRecord.type === 'Template'
      ? latestTemplateRecord
      : templateRecord;

    if (!activeTemplateRecord.targetListId) {
      var targetListChoice = await window.KaPUI.ShowTemplateTargetListModal({
        title: 'Choose Target List',
        confirmLabel: 'Set And Add Item',
        message: 'This template does not have a target list yet. Choose what Grocery List this pantry entry should add items to when you click on them.',
        getAllLists: function () {
          return window.KaPListsService.getAllLists();
        },
        searchLists: async function (query) {
          var allLists = await window.KaPListsService.getAllLists();
          var normalized = String(query || '').trim().toLowerCase();
          if (!normalized) {
            return allLists;
          }

          return allLists.filter(function (listRecord) {
            return String(listRecord.name || '').toLowerCase().indexOf(normalized) >= 0;
          });
        },
        resolveExactList: async function (name) {
          var allLists = await window.KaPListsService.getAllLists();
          var normalized = String(name || '').trim().toLowerCase();
          return allLists.find(function (listRecord) {
            return String(listRecord.name || '').trim().toLowerCase() === normalized;
          }) || null;
        }
      });

      if (!targetListChoice) {
        return false;
      }

      var updatedTemplate = await window.KaPTemplatesService.updateTemplateConfig(
        activeTemplateRecord.id,
        activeTemplateRecord.name,
        targetListChoice.targetListId,
        targetListChoice.targetListName
      );

      if (!updatedTemplate || !updatedTemplate.targetListId) {
        return false;
      }

      activeTemplateRecord = updatedTemplate;
    }

    try {
      var itemId = detailItem.itemId;
      if (!itemId) {
        var recoveredItem = await window.KaPItemsService.createItem(
          detailItem.name,
          detailItem.description,
          detailItem.categoryId,
          detailItem.categoryName
        );
        itemId = recoveredItem.id;
      }

      var quantityToAdd = detailItem.quantityValue != null ? detailItem.quantityValue : detailItem.quantity;
      if (quantityToAdd == null || String(quantityToAdd).trim() === '') {
        quantityToAdd = 1;
      }

      await window.KaPListsService.addItemToList(
        activeTemplateRecord.targetListId,
        itemId,
        detailItem.name,
        quantityToAdd,
        detailItem.description
      );

      await renderDetailInto(container, activeTemplateRecord, hooks);
      return true;
    } catch (error) {
      await showError(error.message || 'Unable to add item to target list.');
      return false;
    }
  }

  function buildTemplateDetailItemRow(templateRecord, detailItem, container, hooks) {
    var row = window.KaPUI.NewDetailItemRow(detailItem, {
      onIncrement: async function () {
        var updated = await window.KaPTemplatesService.incrementTemplateItemQuantity(templateRecord.id, detailItem.id);
        detailItem.quantity = updated.quantity;
        return updated.quantity;
      },
      onDecrement: async function () {
        var updated = await window.KaPTemplatesService.decrementTemplateItemQuantity(templateRecord.id, detailItem.id);
        detailItem.quantity = updated.quantity;
        return updated.quantity;
      },
      onEdit: async function () {
        await editTemplateItemWithPrompt(templateRecord, detailItem);
        await renderDetailInto(container, templateRecord, hooks);
      },
      onRemove: async function () {
        await removeTemplateItemWithConfirm(templateRecord, detailItem);
        await renderDetailInto(container, templateRecord, hooks);
      }
    });

    row.classList.add('detail-item-row--toggleable');
    row.classList.add('template-detail-item-row');
    row.addEventListener('click', function () {
      addTemplateItemToTargetList(templateRecord, detailItem, container, hooks);
    });

    var qtyNode = row.querySelector('.detail-item-qty-pill');
    var contentNode = row.querySelector('.detail-item-content');
    var actionsNode = row.querySelector('.detail-item-actions');

    if (contentNode && actionsNode) {
      var mainColumn = document.createElement('div');
      mainColumn.className = 'template-detail-item-main';

      if (qtyNode) {
        mainColumn.appendChild(qtyNode);
      }

      mainColumn.appendChild(contentNode);
      row.insertBefore(mainColumn, actionsNode);
    }

    var usageEntries = detailItem.listUsages || [];
    if (usageEntries.length > 0) {
      row.classList.add('template-detail-item-row--with-usage');
      var mainColumnNode = row.querySelector('.template-detail-item-main');
      if (mainColumnNode) {
        var usageWrap = document.createElement('div');
        usageWrap.className = 'template-item-usage-pills';

        usageEntries.forEach(function (usageEntry) {
          var usagePill = document.createElement('span');
          usagePill.className = 'template-item-usage-pill';
          usagePill.textContent = String(usageEntry.quantity) + ' on ' + String(usageEntry.listName || 'Unknown') + ' list';
          usageWrap.appendChild(usagePill);
        });

        mainColumnNode.appendChild(usageWrap);
      }
    }

    return row;
  }

  function renderCategorizedItems(container, templateRecord, hooks, detailItems) {
    var detailList = container.querySelector('[data-detail-item-list]');
    if (!detailList) {
      return;
    }

    detailList.replaceChildren();

    var groupedByCategory = {};
    detailItems.forEach(function (detailItem) {
      var categoryLabel = getCategoryLabel(detailItem);
      if (!groupedByCategory[categoryLabel]) {
        groupedByCategory[categoryLabel] = [];
      }
      groupedByCategory[categoryLabel].push(detailItem);
    });

    sortCategoryLabelsAscending(Object.keys(groupedByCategory)).forEach(function (categoryLabel) {
      var groupSection = document.createElement('section');
      groupSection.className = 'category-group';

      var groupHeader = document.createElement('div');
      groupHeader.className = 'category-group-header';

      var groupTitle = document.createElement('h3');
      groupTitle.className = 'category-group-title';
      groupTitle.textContent = categoryLabel;
      groupHeader.appendChild(groupTitle);
      groupSection.appendChild(groupHeader);

      var groupList = document.createElement('div');
      groupList.className = 'detail-item-list category-group-item-list';

      sortByNameAscending(groupedByCategory[categoryLabel]).forEach(function (detailItem) {
        groupList.appendChild(buildTemplateDetailItemRow(templateRecord, detailItem, container, hooks));
      });

      groupSection.appendChild(groupList);
      detailList.appendChild(groupSection);
    });
  }

  async function removeTemplateItemWithConfirm(templateRecord, detailItem) {
    var itemName = detailItem.name || 'this item';
    var confirmed = await window.KaPUI.ShowConfirm({
      title: 'Remove Item',
      message: 'Remove "' + itemName + '" from this pantry entry?',
      confirmLabel: 'Remove',
      isDanger: true
    });

    if (!confirmed) {
      return;
    }

    try {
      await window.KaPTemplatesService.removeItemFromTemplate(templateRecord.id, detailItem.id);
    } catch (error) {
      await showError(error.message || 'Unable to remove item.');
    }
  }

  async function renderInto(container, hooks) {
    var records = await window.KaPTemplatesService.getAllTemplates();

    window.KaPUI.ReplaceMainContent(container, {
      emptyStateText: 'No pantry entries yet.',
      records: records,
      rowBuilder: function (record) {
        return window.KaPUI.NewListRecordRow(record, function () {
          hooks.onOpen(record);
        });
      }
    });
  }

  async function renderDetailInto(container, record, hooks) {
    var detailItems = await window.KaPTemplatesService.getTemplateItems(record.id);
    var showCategories = getCategoryViewState('templates', record.id);
    var sortedItems = sortByNameAscending(detailItems);

    window.KaPUI.ReplaceDetailContent(container, {
      title: record.name,
      emptyStateText: 'No items yet.',
      onBack: hooks.onBack,
      onAddItem: async function () {
        await addTemplateItemWithDiscoveryModal(record, detailItems);
        await renderDetailInto(container, record, hooks);
      },
      detailItems: sortedItems,
      itemRowBuilder: function (detailItem) {
        return buildTemplateDetailItemRow(record, detailItem, container, hooks);
      },
      actions: [
        {
          label: showCategories ? 'Hide Categories' : 'Show Categories',
          onClick: async function () {
            setCategoryViewState('templates', record.id, !showCategories);
            await renderDetailInto(container, record, hooks);
          }
        },
        {
          label: 'Set Target List',
          onClick: async function () {
            var updatedFromTarget = await editTemplateConfig(record, true);
            if (updatedFromTarget) {
              await renderDetailInto(container, updatedFromTarget, hooks);
            }
          }
        },
        {
          label: 'Edit',
          onClick: async function () {
            var updated = await editTemplateConfig(record, false);
            if (updated) {
              hooks.onAfterChange(updated);
            }
          }
        },
        {
          label: 'Delete',
          isDanger: true,
          onClick: async function () {
            var deleted = await deleteTemplate(record);
            if (deleted) {
              hooks.onDeleted();
            }
          }
        }
      ]
    });

    if (showCategories && sortedItems.length > 0) {
      renderCategorizedItems(container, record, hooks, sortedItems);
    }
  }

  window.KaPTemplatesPage = {
    createTemplate: createTemplate,
    renderInto: renderInto,
    renderDetailInto: renderDetailInto
  };
})();
