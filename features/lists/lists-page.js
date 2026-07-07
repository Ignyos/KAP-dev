(function () {
  async function showError(message) {
    await window.KaPUI.ShowAlert({ title: 'Error', message: message });
  }

  async function createList() {
    var name = await window.KaPUI.ShowPrompt({
      title: 'New Grocery List',
      placeholder: 'Grocery list name',
      confirmLabel: 'Create'
    });
    if (name === null) {
      return;
    }

    try {
      await window.KaPListsService.createList(name);
    } catch (error) {
      await showError(error.message || 'Unable to create grocery list.');
    }
  }

  async function renameList(record) {
    var nextName = await window.KaPUI.ShowPrompt({
      title: 'Edit Grocery List',
      placeholder: 'Grocery list name',
      value: record.name,
      confirmLabel: 'Save'
    });
    if (nextName === null) {
      return null;
    }

    try {
      return await window.KaPListsService.renameList(record.id, nextName);
    } catch (error) {
      await showError(error.message || 'Unable to update grocery list.');
      return null;
    }
  }

  async function deleteList(record) {
    var confirmed = await window.KaPUI.ShowConfirm({
      title: 'Delete Grocery List',
      message: 'Delete "' + record.name + '"?',
      confirmLabel: 'Delete',
      isDanger: true
    });
    if (!confirmed) {
      return false;
    }

    try {
      await window.KaPListsService.deleteList(record.id);
      return true;
    } catch (error) {
      await showError(error.message || 'Unable to delete grocery list.');
      return false;
    }
  }

  async function addListItemWithDiscoveryModal(listRecord, detailItems) {
    var result = await window.KaPUI.ShowDiscoveryItemModal(window.KaPItemDiscovery.buildAddItemModalOptions({
      title: 'Add Item to Grocery List',
      currentContextLabel: 'list',
      detailItems: detailItems
    }));

    if (result === null) {
      return;
    }

    try {
      await window.KaPListsService.addItemToList(
        listRecord.id,
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

  async function editListItemWithPrompt(listRecord, detailItem) {
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
      await window.KaPListsService.updateListItem(
        listRecord.id,
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

  async function removeListItemWithConfirm(listRecord, detailItem) {
    var itemName = detailItem.name || 'this item';
    var confirmed = await window.KaPUI.ShowConfirm({
      title: 'Remove Item',
      message: 'Remove "' + itemName + '" from this grocery list?',
      confirmLabel: 'Remove',
      isDanger: true
    });

    if (!confirmed) {
      return;
    }

    try {
      await window.KaPListsService.removeItemFromList(listRecord.id, detailItem.id);
    } catch (error) {
      await showError(error.message || 'Unable to remove item.');
    }
  }

  function sortByNameAscending(records) {
    return (records || []).slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base'
      });
    });
  }

  function sortCrossedOffItems(records) {
    return (records || []).slice().sort(function (a, b) {
      var leftTime = Date.parse(a.crossedOffAt || '');
      var rightTime = Date.parse(b.crossedOffAt || '');
      var leftValid = !Number.isNaN(leftTime);
      var rightValid = !Number.isNaN(rightTime);

      if (leftValid && rightValid && leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      if (leftValid && !rightValid) {
        return 1;
      }

      if (!leftValid && rightValid) {
        return -1;
      }

      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base'
      });
    });
  }

  function getCategoryViewState(recordType, recordId) {
    var saved = window.KaPSettings.get(window.KaPSettings.KEYS.CATEGORY_VIEW_BY_RECORD) || {};
    var scope = saved[recordType] || {};
    return scope[recordId] !== false;
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

  function buildListDetailItemRow(listRecord, detailItem, container, hooks) {
    return window.KaPUI.NewDetailItemRow(detailItem, {
      onToggleCrossOff: async function (nextCrossedOffState) {
        await window.KaPListsService.setListItemCrossedOff(listRecord.id, detailItem.id, nextCrossedOffState);
        await renderDetailInto(container, listRecord, hooks);
      },
      onIncrement: async function () {
        var updated = await window.KaPListsService.incrementListItemQuantity(listRecord.id, detailItem.id);
        detailItem.quantity = updated.quantity;
        return updated.quantity;
      },
      onDecrement: async function () {
        var updated = await window.KaPListsService.decrementListItemQuantity(listRecord.id, detailItem.id);
        detailItem.quantity = updated.quantity;
        return updated.quantity;
      },
      onEdit: async function () {
        await editListItemWithPrompt(listRecord, detailItem);
        await renderDetailInto(container, listRecord, hooks);
      },
      onRemove: async function () {
        await removeListItemWithConfirm(listRecord, detailItem);
        await renderDetailInto(container, listRecord, hooks);
      }
    });
  }

  function renderCategorizedActiveItems(container, listRecord, hooks, activeItems) {
    var detailList = container.querySelector('[data-detail-item-list]');
    if (!detailList) {
      return;
    }

    detailList.replaceChildren();

    var groupedByCategory = {};
    activeItems.forEach(function (detailItem) {
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
        groupList.appendChild(buildListDetailItemRow(listRecord, detailItem, container, hooks));
      });

      groupSection.appendChild(groupList);
      detailList.appendChild(groupSection);
    });
  }

  async function appendCrossedOffSection(container, listRecord, crossedOffItems, hooks) {
    if (!crossedOffItems || crossedOffItems.length === 0) {
      return;
    }

    var detailShell = container.querySelector('.detail-shell');
    if (!detailShell) {
      return;
    }

    var section = document.createElement('section');
    section.className = 'crossed-off-section';

    var header = document.createElement('div');
    header.className = 'crossed-off-header';

    var title = document.createElement('h3');
    title.className = 'crossed-off-title';
    title.textContent = 'Crossed Off Items';
    header.appendChild(title);

    function deleteAllCrossedOff() {
      return Promise.resolve().then(async function () {
        var confirmed = await window.KaPUI.ShowConfirm({
          title: 'Clear Crossed-Off Items',
          message: 'Delete all crossed-off items from this grocery list?',
          confirmLabel: 'Clear',
          isDanger: true
        });

        if (!confirmed) {
          return;
        }

        await window.KaPListsService.deleteCrossedOffItems(listRecord.id);
        await renderDetailInto(container, listRecord, hooks);
      }).catch(async function (error) {
        await showError(error.message || 'Unable to delete crossed-off items.');
      });
    }

    var deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'crossed-off-action-button crossed-off-action-delete';
    deleteButton.textContent = 'Clear Crossed-Off';
    deleteButton.addEventListener('click', function (event) {
      event.stopPropagation();
      deleteAllCrossedOff();
    });
    header.appendChild(deleteButton);

    section.appendChild(header);

    var crossedList = document.createElement('div');
    crossedList.className = 'detail-item-list crossed-off-item-list';

    crossedOffItems.forEach(function (detailItem) {
      crossedList.appendChild(buildListDetailItemRow(listRecord, detailItem, container, hooks));
    });

    section.appendChild(crossedList);

    detailShell.appendChild(section);
  }

  async function renderInto(container, hooks) {
    var records = await window.KaPListsService.getAllLists();

    window.KaPUI.ReplaceMainContent(container, {
      emptyStateText: 'No grocery lists yet.',
      records: records,
      rowBuilder: function (record) {
        return window.KaPUI.NewListRecordRow(record, function () {
          hooks.onOpen(record);
        });
      }
    });
  }

  async function renderDetailInto(container, record, hooks) {
    var detailItems = await window.KaPListsService.getListItems(record.id);
    var isRecipeDerivedList = record.sourceKind === 'recipe';
    var currentBatchSize = record.batchSize == null ? 1 : Number(record.batchSize);
    var showCategories = getCategoryViewState('lists', record.id);
    var activeItems = sortByNameAscending(detailItems.filter(function (detailItem) {
      return detailItem.isCrossedOff !== true;
    }));
    var crossedOffItems = sortCrossedOffItems(detailItems.filter(function (detailItem) {
      return detailItem.isCrossedOff === true;
    }));

    window.KaPUI.ReplaceDetailContent(container, {
      title: record.name,
      emptyStateText: 'No active items yet.',
      onBack: hooks.onBack,
      onAddItem: async function () {
        await addListItemWithDiscoveryModal(record, detailItems);
        await renderDetailInto(container, record, hooks);
      },
      detailItems: activeItems,
      itemRowBuilder: function (detailItem) {
        return buildListDetailItemRow(record, detailItem, container, hooks);
      },
      actions: [
        {
          label: showCategories ? 'Hide Categories' : 'Show Categories',
          onClick: async function () {
            setCategoryViewState('lists', record.id, !showCategories);
            await renderDetailInto(container, record, hooks);
          }
        },
        {
          label: 'Edit',
          onClick: async function () {
            var updated = await renameList(record);
            if (updated) {
              hooks.onAfterChange(updated);
            }
          }
        },
        {
          label: 'Delete',
          isDanger: true,
          onClick: async function () {
            var deleted = await deleteList(record);
            if (deleted) {
              hooks.onDeleted();
            }
          }
        }
      ].filter(function (action) { return !!action; })
    });

    if (showCategories && activeItems.length > 0) {
      renderCategorizedActiveItems(container, record, hooks, activeItems);
    }

    await appendCrossedOffSection(container, record, crossedOffItems, hooks);
  }

  window.KaPListsPage = {
    createList: createList,
    renderInto: renderInto,
    renderDetailInto: renderDetailInto
  };
})();
