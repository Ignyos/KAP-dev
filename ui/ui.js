(function () {
  var activeOverflowMenu = null;
  var activeTimedNotice = null;

  document.addEventListener('click', function (event) {
    if (!activeOverflowMenu) {
      return;
    }

    if (!activeOverflowMenu.wrap.contains(event.target)) {
      activeOverflowMenu.setOpen(false);
      activeOverflowMenu = null;
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !activeOverflowMenu) {
      return;
    }

    activeOverflowMenu.setOpen(false);
    activeOverflowMenu = null;
  });

  function setActiveOverflowMenu(wrap, setOpen, isOpen) {
    if (!isOpen) {
      if (activeOverflowMenu && activeOverflowMenu.wrap === wrap) {
        activeOverflowMenu = null;
      }
      return;
    }

    if (activeOverflowMenu && activeOverflowMenu.wrap !== wrap) {
      activeOverflowMenu.setOpen(false);
    }

    activeOverflowMenu = {
      wrap: wrap,
      setOpen: setOpen
    };
  }

  function newFromTemplate(templateId) {
    var template = document.getElementById(templateId);
    if (!template) {
      throw new Error('Template not found: ' + templateId);
    }

    return template.content.firstElementChild.cloneNode(true);
  }

  function NewMainTab(tab, isSelected, onSelect, onAction) {
    var node = newFromTemplate('main-tab-template');
    var label = node.querySelector('.tab-label');
    var inlineAction = node.querySelector('.tab-inline-action');

    label.textContent = tab.label;
    inlineAction.textContent = tab.actionLabel;
    inlineAction.setAttribute('aria-disabled', isSelected ? 'false' : 'true');
    node.setAttribute('id', 'tab-' + tab.id);
    node.setAttribute('aria-controls', 'panel-' + tab.id);
    node.setAttribute('aria-selected', isSelected ? 'true' : 'false');

    if (isSelected) {
      node.classList.add('is-selected');
    }

    node.addEventListener('click', function (event) {
      if (event.target.closest('.tab-inline-action')) {
        if (isSelected) {
          onAction(tab.id);
        }
        return;
      }

      onSelect(tab.id);
    });

    return node;
  }

  function AddMainTab(container, tab, isSelected, onSelect, onAction) {
    var node = NewMainTab(tab, isSelected, onSelect, onAction);
    container.appendChild(node);
    return node;
  }

  function ReplaceMainTabs(container, tabs, selectedTabId, onSelect, onAction) {
    container.replaceChildren();

    tabs.forEach(function (tab) {
      AddMainTab(container, tab, tab.id === selectedTabId, onSelect, onAction);
    });
  }

  function NewListRecordRow(record, onClick) {
    var node = newFromTemplate('list-record-row-template');
    var nameNode = node.querySelector('.record-name');

    nameNode.textContent = record.name;

    if (typeof onClick === 'function') {
      node.addEventListener('click', onClick);
    }

    return node;
  }

  function ReplaceRecordList(container, records, rowBuilder) {
    container.replaceChildren();

    records.forEach(function (record) {
      container.appendChild(rowBuilder(record));
    });
  }

  function NewMainContentShell(config) {
    var node = newFromTemplate('main-content-shell-template');
    var emptyStateText = node.querySelector('.empty-state-text');
    var emptyStateCard = node.querySelector('.empty-state-card');
    var recordList = node.querySelector('[data-record-list]');
    var records = config.records || [];

    emptyStateText.textContent = config.emptyStateText;

    if (records.length > 0 && typeof config.rowBuilder === 'function') {
      emptyStateCard.hidden = true;
      ReplaceRecordList(recordList, records, config.rowBuilder);
    } else {
      emptyStateCard.hidden = false;
      recordList.replaceChildren();
    }

    return node;
  }

  function AddMainContentShell(container, config) {
    var node = NewMainContentShell(config);
    container.appendChild(node);
    return node;
  }

  function ReplaceMainContent(container, config) {
    container.replaceChildren();
    AddMainContentShell(container, config);
  }

  function getClipBounds(element) {
    var ancestor = element && element.parentElement;

    while (ancestor && ancestor !== document.body) {
      var style = window.getComputedStyle(ancestor);
      var overflowX = style.overflowX || '';
      var overflowY = style.overflowY || '';
      var isClippingAncestor = /(auto|scroll|hidden|clip)/.test(overflowX + overflowY);

      if (isClippingAncestor) {
        return ancestor.getBoundingClientRect();
      }

      ancestor = ancestor.parentElement;
    }

    return {
      top: 0,
      bottom: window.innerHeight
    };
  }

  function shouldOpenOverflowUp(trigger, menu) {
    var triggerRect = trigger.getBoundingClientRect();
    var menuHeight = menu.offsetHeight;
    var gap = 6;
    var clipBounds = getClipBounds(trigger);
    var spaceBelow = clipBounds.bottom - triggerRect.bottom;
    var spaceAbove = triggerRect.top - clipBounds.top;

    return spaceBelow < menuHeight + gap && spaceAbove > spaceBelow;
  }

  function NewDetailShell(config) {
    var node = newFromTemplate('detail-shell-template');
    var titleNode = node.querySelector('.detail-title');
    var backButton = node.querySelector('.detail-back-button');
    var actionsNode = node.querySelector('.detail-actions');
    var detailItemList = node.querySelector('[data-detail-item-list]');
    var emptyStateCard = node.querySelector('.empty-state-card');
    var emptyStateText = node.querySelector('.empty-state-text');
    var detailItems = config.detailItems || [];

    titleNode.textContent = config.title;
    emptyStateText.textContent = config.emptyStateText || '';
    backButton.textContent = config.backLabel || '\u2190 Home';

    backButton.addEventListener('click', config.onBack);

    if (typeof config.onAddItem === 'function') {
      var addItemButton = document.createElement('button');
      addItemButton.type = 'button';
      addItemButton.className = 'accordion-new-button detail-add-button';
      addItemButton.textContent = config.addItemLabel || '+ Add Item';
      addItemButton.addEventListener('click', config.onAddItem);
      actionsNode.appendChild(addItemButton);
    }

    if ((config.actions || []).length > 0) {
      var overflowWrap = document.createElement('div');
      overflowWrap.className = 'detail-overflow-menu';

      var overflowTrigger = document.createElement('button');
      overflowTrigger.type = 'button';
      overflowTrigger.className = 'record-action-button detail-overflow-trigger';

      var overflowDots = document.createElement('span');
      overflowDots.className = 'detail-overflow-dots';
      overflowDots.textContent = '\u2026';
      overflowTrigger.appendChild(overflowDots);

      overflowTrigger.setAttribute('aria-haspopup', 'menu');
      overflowTrigger.setAttribute('aria-expanded', 'false');
      overflowTrigger.setAttribute('aria-label', 'More actions');

      var overflowList = document.createElement('div');
      overflowList.className = 'detail-overflow-list';
      overflowList.setAttribute('role', 'menu');

      function updateOverflowDirection() {
        overflowList.classList.remove('detail-overflow-list--up');

        if (shouldOpenOverflowUp(overflowTrigger, overflowList)) {
          overflowList.classList.add('detail-overflow-list--up');
        }
      }

      function setOverflowOpen(isOpen) {
        overflowList.style.display = isOpen ? 'grid' : 'none';
        overflowTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        setActiveOverflowMenu(overflowWrap, setOverflowOpen, isOpen);

        if (isOpen) {
          updateOverflowDirection();
        }
      }

      setOverflowOpen(false);

      (config.actions || []).forEach(function (action) {
        var menuItem = document.createElement('button');
        menuItem.type = 'button';
        menuItem.className = 'detail-overflow-item' + (action.isDanger ? ' detail-overflow-item--danger' : '');
        menuItem.textContent = action.label;
        menuItem.setAttribute('role', 'menuitem');
        menuItem.addEventListener('click', function () {
          setOverflowOpen(false);
          action.onClick();
        });
        overflowList.appendChild(menuItem);
      });

      overflowTrigger.addEventListener('click', function (event) {
        event.stopPropagation();
        var isOpen = overflowList.style.display !== 'none';
        setOverflowOpen(!isOpen);
      });

      overflowWrap.appendChild(overflowTrigger);
      overflowWrap.appendChild(overflowList);
      actionsNode.appendChild(overflowWrap);
    }

    if (detailItems.length > 0 && typeof config.itemRowBuilder === 'function') {
      emptyStateCard.hidden = true;
      ReplaceDetailItemRows(detailItemList, detailItems, config.itemRowBuilder);
    } else {
      emptyStateCard.hidden = false;
      detailItemList.replaceChildren();
    }

    return node;
  }

  function NewDetailItemRow(detailItem, callbacks) {
    var node = newFromTemplate('detail-item-row-template');
    var nameNode = node.querySelector('.detail-item-name');
    var metaNode = node.querySelector('.detail-item-meta');
    var actionsNode = node.querySelector('.detail-item-actions');
    var qtyPillNode = node.querySelector('.detail-item-qty-pill');
    var itemName = detailItem.name || (detailItem.item && detailItem.item.name) || 'Unknown Item';
    var descriptionText = detailItem.description || '';
    var currentQuantity = detailItem.displayQuantityValue != null
      ? detailItem.displayQuantityValue
      : (detailItem.quantityValue != null ? detailItem.quantityValue : detailItem.quantity);
    var currentQuantityText = detailItem.displayQuantityText != null
      ? String(detailItem.displayQuantityText)
      : (detailItem.quantityText == null ? null : String(detailItem.quantityText));
    var uomAbbreviation = detailItem.displayUomAbbreviation || detailItem.uomAbbreviation || null;
    var hasQtyControls = callbacks && (typeof callbacks.onIncrement === 'function' || typeof callbacks.onDecrement === 'function');
    var hasCrossOffToggle = callbacks && typeof callbacks.onToggleCrossOff === 'function';

    nameNode.textContent = itemName;
    if (detailItem.isOptional === true) {
      var optionalLabel = document.createElement('span');
      optionalLabel.className = 'detail-item-optional-label';
      optionalLabel.textContent = ' (optional)';
      nameNode.appendChild(optionalLabel);
    }

    if (detailItem.isCrossedOff) {
      node.classList.add('detail-item-row--crossed');
    }

    if (hasCrossOffToggle) {
      node.classList.add('detail-item-row--toggleable');
      node.addEventListener('click', function () {
        callbacks.onToggleCrossOff(!detailItem.isCrossedOff);
      });
    }

    function updateQtyPill(qty, abbr, displayQtyText) {
      if (!qtyPillNode) {
        return;
      }

      var numericQty = Number(qty);
      var hasUom = !!(abbr);
      var showPill = (qty != null && !Number.isNaN(numericQty) && numericQty !== 0 && (numericQty !== 1 || hasUom)) || hasUom;

      if (showPill) {
        var pillText = '';
        if (displayQtyText != null && String(displayQtyText).trim()) {
          pillText = String(displayQtyText).trim();
        } else if (qty != null && !Number.isNaN(numericQty) && numericQty !== 0) {
          pillText = String(qty);
        }
        if (abbr) {
          pillText = pillText ? pillText + '\u00a0' + abbr : abbr;
        }
        qtyPillNode.textContent = pillText;
        qtyPillNode.style.display = '';
        qtyPillNode.style.visibility = 'visible';
        qtyPillNode.setAttribute('aria-hidden', 'false');
      } else {
        qtyPillNode.textContent = '';
        qtyPillNode.style.display = '';
        qtyPillNode.style.visibility = 'hidden';
        qtyPillNode.setAttribute('aria-hidden', 'true');
      }
    }

    updateQtyPill(currentQuantity, uomAbbreviation, currentQuantityText);

    if (descriptionText) {
      metaNode.textContent = descriptionText;
    } else {
      metaNode.hidden = true;
    }

    if (actionsNode) {
      var overflowWrap = document.createElement('div');
      overflowWrap.className = 'detail-item-overflow-menu';

      var overflowTrigger = document.createElement('button');
      overflowTrigger.type = 'button';
      overflowTrigger.className = 'record-action-button detail-item-overflow-trigger';
      overflowTrigger.setAttribute('aria-haspopup', 'menu');
      overflowTrigger.setAttribute('aria-expanded', 'false');
      overflowTrigger.setAttribute('aria-label', 'Item actions');

      var overflowDots = document.createElement('span');
      overflowDots.className = 'detail-item-overflow-dots';
      overflowDots.textContent = '\u2026';
      overflowTrigger.appendChild(overflowDots);

      var overflowList = document.createElement('div');
      overflowList.className = 'detail-overflow-list';
      overflowList.setAttribute('role', 'menu');

      function updateOverflowDirection() {
        overflowList.classList.remove('detail-overflow-list--up');

        if (shouldOpenOverflowUp(overflowTrigger, overflowList)) {
          overflowList.classList.add('detail-overflow-list--up');
        }
      }

      function setOverflowOpen(isOpen) {
        overflowList.style.display = isOpen ? 'grid' : 'none';
        overflowTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        setActiveOverflowMenu(overflowWrap, setOverflowOpen, isOpen);

        if (isOpen) {
          updateOverflowDirection();
        }
      }

      setOverflowOpen(false);

      if (hasQtyControls) {
        var qtyRow = document.createElement('div');
        qtyRow.className = 'detail-overflow-qty-row';
        qtyRow.setAttribute('role', 'group');
        qtyRow.setAttribute('aria-label', 'Quantity');

        var qtyDecrBtn = document.createElement('button');
        qtyDecrBtn.type = 'button';
        qtyDecrBtn.className = 'detail-overflow-qty-btn';
        qtyDecrBtn.setAttribute('aria-label', 'Decrease quantity of ' + itemName);
        qtyDecrBtn.textContent = '\u2212';

        var qtyDisplay = document.createElement('span');
        qtyDisplay.className = 'detail-overflow-qty-display';
        qtyDisplay.textContent = currentQuantity == null ? '1' : String(currentQuantity);

        var qtyIncrBtn = document.createElement('button');
        qtyIncrBtn.type = 'button';
        qtyIncrBtn.className = 'detail-overflow-qty-btn';
        qtyIncrBtn.setAttribute('aria-label', 'Increase quantity of ' + itemName);
        qtyIncrBtn.textContent = '+';

        if (typeof callbacks.onDecrement === 'function') {
          qtyDecrBtn.addEventListener('click', async function (event) {
            event.stopPropagation();
            var newQty = await callbacks.onDecrement();
            if (newQty != null) {
              currentQuantity = newQty;
              qtyDisplay.textContent = String(newQty);
              updateQtyPill(newQty);
            }
          });
        }

        if (typeof callbacks.onIncrement === 'function') {
          qtyIncrBtn.addEventListener('click', async function (event) {
            event.stopPropagation();
            var newQty = await callbacks.onIncrement();
            if (newQty != null) {
              currentQuantity = newQty;
              qtyDisplay.textContent = String(newQty);
              updateQtyPill(newQty);
            }
          });
        }

        qtyRow.appendChild(qtyDecrBtn);
        qtyRow.appendChild(qtyDisplay);
        qtyRow.appendChild(qtyIncrBtn);
        overflowList.appendChild(qtyRow);
      }

      if (callbacks && typeof callbacks.onEdit === 'function') {
        var editItem = document.createElement('button');
        editItem.type = 'button';
        editItem.className = 'detail-overflow-item';
        editItem.textContent = 'Edit';
        editItem.setAttribute('role', 'menuitem');
        editItem.addEventListener('click', function (event) {
          event.stopPropagation();
          setOverflowOpen(false);
          callbacks.onEdit();
        });
        overflowList.appendChild(editItem);
      }

      if (callbacks && typeof callbacks.onRemove === 'function') {
        var removeItem = document.createElement('button');
        removeItem.type = 'button';
        removeItem.className = 'detail-overflow-item detail-overflow-item--danger';
        removeItem.textContent = 'Remove';
        removeItem.setAttribute('role', 'menuitem');
        removeItem.addEventListener('click', function (event) {
          event.stopPropagation();
          setOverflowOpen(false);
          callbacks.onRemove();
        });
        overflowList.appendChild(removeItem);
      }

      overflowTrigger.addEventListener('click', function (event) {
        event.stopPropagation();
        var isOpen = overflowList.style.display !== 'none';
        setOverflowOpen(!isOpen);
      });

      overflowWrap.appendChild(overflowTrigger);
      overflowWrap.appendChild(overflowList);
      actionsNode.appendChild(overflowWrap);
      actionsNode.addEventListener('click', function (event) {
        event.stopPropagation();
      });
    }

    return node;
  }

  function ReplaceDetailItemRows(container, detailItems, rowBuilder) {
    container.replaceChildren();

    detailItems.forEach(function (detailItem) {
      container.appendChild(rowBuilder(detailItem));
    });
  }

  function ReplaceDetailContent(container, config) {
    container.replaceChildren();
    container.appendChild(NewDetailShell(config));
  }

  function NewSettingsToggle(config) {
    var node = document.createElement('div');
    node.className = 'settings-toggle-row';

    var textWrap = document.createElement('div');
    textWrap.className = 'settings-toggle-text';

    var label = document.createElement('label');
    label.className = 'settings-toggle-label';
    label.textContent = config.label;
    textWrap.appendChild(label);

    if (config.description) {
      var description = document.createElement('p');
      description.className = 'settings-toggle-description';
      description.textContent = config.description;
      textWrap.appendChild(description);
    }

    node.appendChild(textWrap);

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-toggle-switch' + (config.checked ? ' settings-toggle-switch--on' : ' settings-toggle-switch--off');
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', config.checked ? 'true' : 'false');

    button.addEventListener('click', function () {
      var isNowOn = !button.classList.contains('settings-toggle-switch--on');
      button.classList.toggle('settings-toggle-switch--on');
      button.classList.toggle('settings-toggle-switch--off');
      button.setAttribute('aria-checked', isNowOn ? 'true' : 'false');
      config.onChange(isNowOn);
    });

    node.appendChild(button);
    return node;
  }

  function showModal(setupBody, config) {
    return new Promise(function (resolve) {
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');

      titleNode.textContent = config.title;
      confirmButton.textContent = config.confirmLabel || 'OK';
      card.setAttribute('aria-label', config.title);

      if (config.compact) {
        overlay.classList.add('modal-overlay--compact');
        card.classList.add('modal-card--compact');
      }

      cancelButton.classList.add('modal-button--secondary');

      if (config.isDanger) {
        confirmButton.classList.add('modal-button--danger');
      } else {
        confirmButton.classList.add('modal-button--primary');
      }

      var hidingCancel = config.showCancel === false;
      var hidingConfirm = config.showConfirm === false;

      if (hidingCancel) {
        cancelButton.style.display = 'none';
      }
      if (hidingConfirm) {
        confirmButton.style.display = 'none';
      }
      if (hidingCancel && hidingConfirm) {
        titleNode.style.gridColumn = '1 / -1';
        titleNode.style.textAlign = 'center';
      }

      var getValue = setupBody(bodyNode, confirmButton, cancelButton);

      function close(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.body.removeChild(node);
        resolve(result);
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          close(config.cancelValue);
        }
      }

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          close(config.cancelValue);
        }
      });

      cancelButton.addEventListener('click', function () {
        close(config.cancelValue);
      });

      confirmButton.addEventListener('click', function () {
        close(getValue());
      });

      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(node);
    });
  }

  // Modal for creating a custom unit of measure.
  // Returns a Promise that resolves with the created unit object, or null if cancelled.
  function ShowCreateUnitModal(options) {
    // options: { createUnitOfMeasure: async fn(name, abbr, group, behavior, step) }
    return new Promise(function (resolve) {
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');

      titleNode.textContent = 'Add Unit';
      confirmButton.textContent = 'Add';
      card.setAttribute('aria-label', 'Add Unit');
      cancelButton.classList.add('modal-button--secondary');
      confirmButton.classList.add('modal-button--primary');

      var form = document.createElement('div');
      form.className = 'modal-item-form';

      // Name
      var nameLabel = document.createElement('label');
      nameLabel.className = 'modal-field-label';
      nameLabel.textContent = 'Unit name';
      form.appendChild(nameLabel);
      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'modal-input';
      nameInput.placeholder = 'e.g. Handful';
      form.appendChild(nameInput);

      // Abbreviation
      var abbrLabel = document.createElement('label');
      abbrLabel.className = 'modal-field-label';
      abbrLabel.textContent = 'Abbreviation (optional)';
      form.appendChild(abbrLabel);
      var abbrInput = document.createElement('input');
      abbrInput.type = 'text';
      abbrInput.className = 'modal-input';
      abbrInput.placeholder = 'e.g. hdfl';
      form.appendChild(abbrInput);

      // Group
      var groupLabel = document.createElement('label');
      groupLabel.className = 'modal-field-label';
      groupLabel.textContent = 'Group';
      form.appendChild(groupLabel);
      var groupSelect = document.createElement('select');
      groupSelect.className = 'modal-input';
      var createGroups = (options.groups && options.groups.length > 0)
        ? options.groups
        : ['Imperial', 'Metric', 'Unit', 'Size', 'Other'];
      createGroups.forEach(function (g) {
        var opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        groupSelect.appendChild(opt);
      });
      groupSelect.value = 'Other';
      form.appendChild(groupSelect);

      // Quantity behavior
      var behaviorLabel = document.createElement('label');
      behaviorLabel.className = 'modal-field-label';
      behaviorLabel.textContent = 'Quantity behavior';
      form.appendChild(behaviorLabel);
      var behaviorSelect = document.createElement('select');
      behaviorSelect.className = 'modal-input';
      [
        { value: 'decimal', label: 'Decimal (free entry)' },
        { value: 'whole_or_half', label: 'Whole or half (0.5 step)' },
        { value: 'user_defined', label: 'Custom step' }
      ].forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        behaviorSelect.appendChild(opt);
      });
      behaviorSelect.value = 'decimal';
      form.appendChild(behaviorSelect);

      // Step (shown only for user_defined)
      var stepLabel = document.createElement('label');
      stepLabel.className = 'modal-field-label';
      stepLabel.textContent = 'Step size (optional)';
      stepLabel.hidden = true;
      form.appendChild(stepLabel);
      var stepInput = document.createElement('input');
      stepInput.type = 'text';
      stepInput.className = 'modal-input';
      stepInput.placeholder = 'e.g. 0.25';
      stepInput.hidden = true;
      form.appendChild(stepInput);

      behaviorSelect.addEventListener('change', function () {
        var isCustom = behaviorSelect.value === 'user_defined';
        stepLabel.hidden = !isCustom;
        stepInput.hidden = !isCustom;
      });

      var errorNode = document.createElement('p');
      errorNode.className = 'modal-error';
      form.appendChild(errorNode);

      bodyNode.appendChild(form);

      function closeModal(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.body.removeChild(node);
        resolve(result);
      }

      async function handleSubmit() {
        errorNode.textContent = '';
        var name = String(nameInput.value || '').trim();
        if (!name) {
          errorNode.textContent = 'Unit name is required.';
          nameInput.focus();
          return;
        }
        var abbr = String(abbrInput.value || '').trim() || null;
        var group = groupSelect.value;
        var behavior = behaviorSelect.value;
        var stepRaw = String(stepInput.value || '').trim();
        var step = null;
        if (behavior === 'user_defined' && stepRaw) {
          step = parseFloat(stepRaw);
          if (Number.isNaN(step) || step <= 0) {
            errorNode.textContent = 'Step size must be a positive number.';
            stepInput.focus();
            return;
          }
        }

        try {
          var created = await options.createUnitOfMeasure(name, abbr, group, behavior, step);
          closeModal(created);
        } catch (err) {
          errorNode.textContent = err.message || 'Unable to create unit.';
        }
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') { closeModal(null); }
        if (event.key === 'Enter' && event.target !== behaviorSelect && event.target !== groupSelect) {
          event.preventDefault();
          handleSubmit();
        }
      }

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) { closeModal(null); }
      });
      cancelButton.addEventListener('click', function () { closeModal(null); });
      confirmButton.addEventListener('click', function () { handleSubmit(); });
      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(node);
      nameInput.focus();
    });
  }

  function ShowDiscoveryItemModal(options) {
    return new Promise(function (resolve) {
      var suggestionsEnabled = options.enableSuggestions !== false;
      var showQuantityField = options.showQuantityField !== false;
      var showCategoryField = options.showCategoryField !== false;
      var currentContextItemIds = (options.currentContextItemIds || []).filter(function (itemId) {
        return itemId != null;
      });
      var currentContextLabel = options.currentContextLabel || 'record';
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');
      var selectedItem = null;
      var selectedCategory = null;
      var currentSuggestions = [];
      var currentCategorySuggestions = [];

      titleNode.textContent = options.title || 'Add Item';
      confirmButton.textContent = options.confirmLabel || 'Add';
      card.setAttribute('aria-label', titleNode.textContent);
      cancelButton.classList.add('modal-button--secondary');
      confirmButton.classList.add('modal-button--primary');

      var form = document.createElement('div');
      form.className = 'modal-item-form';

      var nameLabel = document.createElement('label');
      nameLabel.className = 'modal-field-label';
      nameLabel.textContent = options.itemNameLabel || 'Item name';
      form.appendChild(nameLabel);

      var nameInputWrapper = document.createElement('div');
      nameInputWrapper.className = 'modal-input-wrapper';

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'modal-input';
      nameInput.placeholder = options.itemNamePlaceholder || 'Type item name';
      nameInput.value = options.initialName || '';
      nameInputWrapper.appendChild(nameInput);

      var suggestionsList = document.createElement('div');
      suggestionsList.className = 'modal-suggestions';
      suggestionsList.hidden = true;
      if (suggestionsEnabled) {
        nameInputWrapper.appendChild(suggestionsList);
      }

      form.appendChild(nameInputWrapper);

      var quantityInput = null;
      var uomSelect = null;
      var uomUnits = [];
      var selectedUomId = options.initialUnitOfMeasureId || null;
      var optionalInput = null;

      if (showQuantityField) {
        var quantityLabel = document.createElement('label');
        quantityLabel.className = 'modal-field-label';
        quantityLabel.textContent = options.quantityLabel || 'Quantity (optional)';
        form.appendChild(quantityLabel);

        var quantityRow = document.createElement('div');
        quantityRow.className = 'modal-quantity-row';

        quantityInput = document.createElement('input');
        quantityInput.type = 'text';
        quantityInput.className = 'modal-input modal-quantity-input';
        quantityInput.placeholder = options.quantityPlaceholder || 'e.g. 2';
        quantityInput.value = options.initialQuantity == null ? '' : String(options.initialQuantity);
        quantityRow.appendChild(quantityInput);

        uomSelect = document.createElement('select');
        uomSelect.className = 'modal-uom-select';
        uomSelect.setAttribute('aria-label', 'Unit of measure');

        var noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = 'Unit';
        uomSelect.appendChild(noneOption);

        if (options.getUnitOfMeasures) {
          options.getUnitOfMeasures().then(function (units) {
            uomUnits = units || [];
            populateUomSelect();
          }).catch(function () {});
        }

        function populateUomSelect() {
          // Remove everything except the blank first option
          while (uomSelect.options.length > 1) {
            uomSelect.remove(1);
          }

          var currentGroup = null;
          var optgroup = null;

          uomUnits.forEach(function (unit) {
            if (unit.group !== currentGroup) {
              currentGroup = unit.group;
              optgroup = document.createElement('optgroup');
              optgroup.label = currentGroup;
              uomSelect.appendChild(optgroup);
            }

            var opt = document.createElement('option');
            opt.value = unit.id;
            opt.textContent = unit.name + (unit.abbreviation ? ' (' + unit.abbreviation + ')' : '');
            if (unit.id === selectedUomId) {
              opt.selected = true;
            }

            (optgroup || uomSelect).appendChild(opt);
          });

          // Separator + add unit option
          if (options.createUnitOfMeasure) {
            var separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
            uomSelect.appendChild(separator);

            var addOpt = document.createElement('option');
            addOpt.value = '__add_unit__';
            addOpt.textContent = '+ Add Unit…';
            uomSelect.appendChild(addOpt);
          }
        }

        uomSelect.addEventListener('change', function () {
          if (uomSelect.value === '__add_unit__') {
            // Restore previous selection while modal is open
            uomSelect.value = selectedUomId || '';
            ShowCreateUnitModal({
              createUnitOfMeasure: options.createUnitOfMeasure
            }).then(function (created) {
              if (!created) { return; }
              return options.getUnitOfMeasures().then(function (units) {
                uomUnits = units || [];
                selectedUomId = created.id;
                populateUomSelect();
                uomSelect.value = created.id;
              });
            }).catch(function () {});
            return;
          }
          selectedUomId = uomSelect.value || null;
        });

        quantityRow.appendChild(uomSelect);
        form.appendChild(quantityRow);

        if (options.quantityHelpText) {
          var quantityHelp = document.createElement('p');
          quantityHelp.className = 'modal-hint';
          quantityHelp.textContent = String(options.quantityHelpText);
          form.appendChild(quantityHelp);
        }
      }

      if (options.showOptionalField === true) {
        var optionalRow = document.createElement('label');
        optionalRow.className = 'modal-checklist-row modal-optional-row';

        optionalInput = document.createElement('input');
        optionalInput.type = 'checkbox';
        optionalInput.className = 'modal-checklist-checkbox';
        optionalInput.checked = options.initialIsOptional === true;
        optionalRow.appendChild(optionalInput);

        var optionalText = document.createElement('span');
        optionalText.className = 'modal-checklist-name';
        optionalText.textContent = options.optionalLabel || 'Mark ingredient as optional';
        optionalRow.appendChild(optionalText);

        form.appendChild(optionalRow);
      }

      var categoryInput = null;
      var categoryInputWrapper = null;
      var categorySuggestionsList = null;
      if (showCategoryField) {
        var categoryLabel = document.createElement('label');
        categoryLabel.className = 'modal-field-label';
        categoryLabel.textContent = options.categoryLabel || 'Category (optional)';
        form.appendChild(categoryLabel);

        categoryInputWrapper = document.createElement('div');
        categoryInputWrapper.className = 'modal-input-wrapper';

        categoryInput = document.createElement('input');
        categoryInput.type = 'text';
        categoryInput.className = 'modal-input';
        categoryInput.placeholder = options.categoryPlaceholder || 'Search or type category';
        categoryInput.value = options.initialCategoryName || '';
        categoryInputWrapper.appendChild(categoryInput);

        categorySuggestionsList = document.createElement('div');
        categorySuggestionsList.className = 'modal-suggestions';
        categorySuggestionsList.hidden = true;
        categoryInputWrapper.appendChild(categorySuggestionsList);

        form.appendChild(categoryInputWrapper);

        if (options.initialCategoryId || options.initialCategoryName) {
          selectedCategory = {
            id: options.initialCategoryId || '',
            name: options.initialCategoryName || ''
          };
        }
      }

      var descriptionLabel = document.createElement('label');
      descriptionLabel.className = 'modal-field-label';
      descriptionLabel.textContent = options.descriptionLabel || 'Description (optional)';
      form.appendChild(descriptionLabel);

      var descriptionInput = document.createElement('input');
      descriptionInput.type = 'text';
      descriptionInput.className = 'modal-input';
      descriptionInput.placeholder = options.descriptionPlaceholder || 'Notes';
      descriptionInput.value = options.initialDescription || '';
      form.appendChild(descriptionInput);

      var errorNode = document.createElement('p');
      errorNode.className = 'modal-error';
      form.appendChild(errorNode);

      bodyNode.appendChild(form);

      function close(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('click', onDocumentClick);
        document.body.removeChild(node);
        resolve(result);
      }

      function showError(message) {
        errorNode.textContent = message || '';
      }

      function normalizeName(name) {
        return String(name || '').trim().toLowerCase();
      }

      function sortItemsByName(items) {
        return (items || []).slice().sort(function (left, right) {
          return String(left.name || '').localeCompare(String(right.name || ''), undefined, {
            sensitivity: 'base'
          });
        });
      }

      function sortCategoriesByName(categories) {
        return (categories || []).slice().sort(function (left, right) {
          return String(left.name || '').localeCompare(String(right.name || ''), undefined, {
            sensitivity: 'base'
          });
        });
      }

      function isItemInCurrentContext(itemId) {
        return currentContextItemIds.indexOf(itemId) >= 0;
      }

      function getCurrentContextMeta(item) {
        if (!item || !isItemInCurrentContext(item.id)) {
          return '';
        }

        return 'Already on this ' + currentContextLabel;
      }

      async function deleteCatalogItem(item) {
        if (!options.deleteItem || !item) {
          return;
        }

        try {
          await options.deleteItem(item);
          if (selectedItem && selectedItem.id === item.id) {
            selectedItem = null;
          }
          showError('');
          await refreshSuggestions();
          nameInput.focus();
        } catch (error) {
          showError(error.message || 'Unable to delete item from catalog.');
        }
      }

      async function deleteCatalogCategory(category) {
        if (!options.deleteCategory || !category) {
          return;
        }

        try {
          await options.deleteCategory(category);
          if (selectedCategory && selectedCategory.id === category.id) {
            selectedCategory = null;
            if (categoryInput) {
              categoryInput.value = '';
            }
          }
          showError('');
          await refreshCategorySuggestions();
          if (categoryInput) {
            categoryInput.focus();
          }
        } catch (error) {
          showError(error.message || 'Unable to delete category.');
        }
      }

      function renderSuggestions() {
        if (!suggestionsEnabled) {
          return;
        }

        suggestionsList.replaceChildren();

        if (currentSuggestions.length === 0) {
          suggestionsList.hidden = true;
          return;
        }

        suggestionsList.hidden = false;

        currentSuggestions.slice(0, 8).forEach(function (item) {
          var isInCurrentContext = isItemInCurrentContext(item.id);
          var row = document.createElement('div');
          row.className = 'modal-suggestion-row';
          if (isInCurrentContext) {
            row.classList.add('modal-suggestion-row--current-context');
          }

          var selectButton = document.createElement('button');
          selectButton.type = 'button';
          selectButton.className = 'modal-suggestion-main';
          if (isInCurrentContext) {
            selectButton.disabled = true;
            selectButton.setAttribute('aria-disabled', 'true');
          }

          var content = document.createElement('div');
          content.className = 'modal-suggestion-content';

          var nameNode = document.createElement('div');
          nameNode.className = 'modal-suggestion-name';
          nameNode.textContent = item.name;
          content.appendChild(nameNode);

          var metaText = getCurrentContextMeta(item);
          if (metaText) {
            var metaNode = document.createElement('div');
            metaNode.className = 'modal-suggestion-meta';
            metaNode.textContent = metaText;
            content.appendChild(metaNode);
          }

          selectButton.appendChild(content);

          if (selectedItem && selectedItem.id === item.id) {
            selectButton.setAttribute('aria-selected', 'true');
          }

          selectButton.addEventListener('click', function () {
            if (isInCurrentContext) {
              return;
            }

            selectedItem = item;
            nameInput.value = item.name;
            if (categoryInput) {
              selectedCategory = item.categoryId || item.categoryName
                ? {
                  id: item.categoryId || '',
                  name: item.categoryName || ''
                }
                : null;
              categoryInput.value = selectedCategory ? selectedCategory.name : '';
            }
            showError('');
            currentSuggestions = [];
            renderSuggestions();
            if (categoryInput) {
              currentCategorySuggestions = [];
              renderCategorySuggestions();
            }
            if (quantityInput) {
              quantityInput.focus();
            } else if (categoryInput) {
              categoryInput.focus();
            } else {
              descriptionInput.focus();
            }
          });

          row.appendChild(selectButton);

          if (options.deleteItem) {
            var deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'modal-suggestion-delete';
            deleteButton.setAttribute('aria-label', 'Delete ' + item.name + ' from catalog');
            deleteButton.title = 'Delete from catalog';
            deleteButton.textContent = '🗑';
            deleteButton.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              deleteCatalogItem(item);
            });
            row.appendChild(deleteButton);
          }

          suggestionsList.appendChild(row);
        });
      }

      async function refreshSuggestions() {
        if (!suggestionsEnabled) {
          return;
        }

        var query = String(nameInput.value || '').trim();
        if (!query) {
          currentSuggestions = options.getAllItems
            ? await options.getAllItems()
            : [];
          selectedItem = null;
          currentSuggestions = sortItemsByName(currentSuggestions).filter(function (item) {
            return !isItemInCurrentContext(item.id);
          });
          renderSuggestions();
          return;
        }

        currentSuggestions = await options.searchItems(query);
        currentSuggestions = sortItemsByName(currentSuggestions).filter(function (item) {
          return !isItemInCurrentContext(item.id);
        });

        if (selectedItem && normalizeName(selectedItem.name) !== normalizeName(nameInput.value)) {
          selectedItem = null;
        }

        renderSuggestions();
      }

      function renderCategorySuggestions() {
        if (!categoryInput || !categorySuggestionsList) {
          return;
        }

        categorySuggestionsList.replaceChildren();

        if (currentCategorySuggestions.length === 0) {
          categorySuggestionsList.hidden = true;
          return;
        }

        categorySuggestionsList.hidden = false;

        currentCategorySuggestions.slice(0, 8).forEach(function (category) {
          var row = document.createElement('div');
          row.className = 'modal-suggestion-row';

          var selectButton = document.createElement('button');
          selectButton.type = 'button';
          selectButton.className = 'modal-suggestion-main';

          var content = document.createElement('div');
          content.className = 'modal-suggestion-content';

          var nameNode = document.createElement('div');
          nameNode.className = 'modal-suggestion-name';
          nameNode.textContent = category.name;
          content.appendChild(nameNode);

          selectButton.appendChild(content);

          if (selectedCategory && selectedCategory.id === category.id) {
            selectButton.setAttribute('aria-selected', 'true');
          }

          selectButton.addEventListener('click', function () {
            selectedCategory = category;
            categoryInput.value = category.name;
            showError('');
            currentCategorySuggestions = [];
            renderCategorySuggestions();
            descriptionInput.focus();
          });

          row.appendChild(selectButton);

          if (options.deleteCategory) {
            var deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'modal-suggestion-delete';
            deleteButton.setAttribute('aria-label', 'Delete category ' + category.name);
            deleteButton.title = 'Delete category';
            deleteButton.textContent = '🗑';
            deleteButton.addEventListener('click', function (event) {
              event.preventDefault();
              event.stopPropagation();
              deleteCatalogCategory(category);
            });
            row.appendChild(deleteButton);
          }

          categorySuggestionsList.appendChild(row);
        });
      }

      async function refreshCategorySuggestions() {
        if (!categoryInput || !categorySuggestionsList) {
          return;
        }

        var query = String(categoryInput.value || '').trim();
        if (!query) {
          currentCategorySuggestions = options.getAllCategories
            ? await options.getAllCategories()
            : [];
          currentCategorySuggestions = sortCategoriesByName(currentCategorySuggestions);
          renderCategorySuggestions();
          return;
        }

        currentCategorySuggestions = options.searchCategories
          ? await options.searchCategories(query)
          : [];
        currentCategorySuggestions = sortCategoriesByName(currentCategorySuggestions);

        if (selectedCategory && normalizeName(selectedCategory.name) !== normalizeName(categoryInput.value)) {
          selectedCategory = null;
        }

        renderCategorySuggestions();
      }

      function closeCategorySuggestions() {
        if (!categorySuggestionsList) {
          return;
        }

        currentCategorySuggestions = [];
        renderCategorySuggestions();
      }

      async function handleSubmit() {
        try {
          showError('');

          var rawName = String(nameInput.value || '').trim();
          var rawQuantityText = quantityInput ? String(quantityInput.value || '').trim() : '';
          if (!rawName) {
            showError('Item name is required.');
            nameInput.focus();
            return;
          }

          var quantityResult = options.validateQuantity
            ? options.validateQuantity(quantityInput ? quantityInput.value : options.initialQuantity)
            : { ok: true, value: quantityInput ? quantityInput.value : options.initialQuantity };

          var rawCategoryName = categoryInput ? String(categoryInput.value || '').trim() : '';
          var category = null;

          if (rawCategoryName) {
            if (selectedCategory && normalizeName(selectedCategory.name) === normalizeName(rawCategoryName)) {
              category = selectedCategory;
            } else if (options.resolveExactCategory) {
              category = await options.resolveExactCategory(rawCategoryName);
            }

            if (!category && options.createCategory) {
              category = await options.createCategory(rawCategoryName);
            }

            if (!category) {
              category = {
                id: '',
                name: rawCategoryName
              };
            }
          }

          if (!quantityResult.ok) {
            showError(quantityResult.message || 'Quantity is invalid.');
            if (quantityInput) {
              quantityInput.focus();
            }
            return;
          }

          if (!suggestionsEnabled) {
            close({
              name: rawName,
              quantity: quantityResult.value,
              quantityText: rawQuantityText || null,
              unitOfMeasureId: selectedUomId || null,
              description: String(descriptionInput.value || '').trim(),
              isOptional: optionalInput ? optionalInput.checked === true : false,
              categoryId: category ? category.id || '' : '',
              categoryName: category ? category.name || '' : ''
            });
            return;
          }

          var item = selectedItem;
          if (!item || normalizeName(item.name) !== normalizeName(rawName)) {
            var exact = await options.resolveExactItem(rawName);
            if (exact) {
              item = exact;
            } else {
              item = await options.createItem(rawName);
            }
          }

          close({
            item: item,
            name: rawName,
            quantity: quantityResult.value,
            quantityText: rawQuantityText || null,
            unitOfMeasureId: selectedUomId || null,
            description: String(descriptionInput.value || '').trim(),
            isOptional: optionalInput ? optionalInput.checked === true : false,
            categoryId: category ? category.id || '' : '',
            categoryName: category ? category.name || '' : ''
          });
        } catch (error) {
          showError(error.message || 'Unable to submit item.');
        }
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          if (categorySuggestionsList && !categorySuggestionsList.hidden) {
            closeCategorySuggestions();
            return;
          }

          close(null);
        }
      }

      function onDocumentClick(event) {
        if (!categoryInputWrapper || !categorySuggestionsList || categorySuggestionsList.hidden) {
          return;
        }

        if (!categoryInputWrapper.contains(event.target)) {
          closeCategorySuggestions();
        }
      }

      nameInput.addEventListener('input', function () {
        if (!suggestionsEnabled) {
          return;
        }

        refreshSuggestions().catch(function () {
          showError('Unable to load suggestions.');
        });
      });

      nameInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (suggestionsEnabled) {
            currentSuggestions = [];
            renderSuggestions();
          }
          if (quantityInput) {
            quantityInput.focus();
          } else if (categoryInput) {
            categoryInput.focus();
          } else {
            descriptionInput.focus();
          }
        }
      });

      if (categoryInput) {
        categoryInput.addEventListener('focus', function () {
          refreshCategorySuggestions().catch(function () {
            showError('Unable to load categories.');
          });
        });

        categoryInput.addEventListener('input', function () {
          refreshCategorySuggestions().catch(function () {
            showError('Unable to load categories.');
          });
        });

        categoryInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            closeCategorySuggestions();
            handleSubmit();
          }
        });
      }

      if (quantityInput) {
        quantityInput.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            handleSubmit();
          }
        });
      }

      descriptionInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          handleSubmit();
        }
      });

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          close(null);
        }
      });

      cancelButton.addEventListener('click', function () {
        close(null);
      });

      confirmButton.addEventListener('click', function () {
        handleSubmit();
      });

      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('click', onDocumentClick);
      document.body.appendChild(node);

      requestAnimationFrame(function () {
        nameInput.focus();
        if (suggestionsEnabled) {
          refreshSuggestions().catch(function () {
            showError('Unable to load suggestions.');
          });
        }
      });
    });
  }

  function ShowTemplateConfigModal(options) {
    return new Promise(function (resolve) {
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');
      var selectedList = null;
      var currentListSuggestions = [];

      titleNode.textContent = options.title || 'Edit Template';
      confirmButton.textContent = options.confirmLabel || 'Save';
      card.setAttribute('aria-label', titleNode.textContent);
      cancelButton.classList.add('modal-button--secondary');
      confirmButton.classList.add('modal-button--primary');

      var form = document.createElement('div');
      form.className = 'modal-item-form';

      var nameLabel = document.createElement('label');
      nameLabel.className = 'modal-field-label';
      nameLabel.textContent = options.nameLabel || 'Template name';
      form.appendChild(nameLabel);

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'modal-input';
      nameInput.placeholder = options.namePlaceholder || 'Template name';
      nameInput.value = options.initialName || '';
      form.appendChild(nameInput);

      var targetLabel = document.createElement('label');
      targetLabel.className = 'modal-field-label';
      targetLabel.textContent = options.targetListLabel || 'Target List (optional)';
      form.appendChild(targetLabel);

      var targetInputWrapper = document.createElement('div');
      targetInputWrapper.className = 'modal-input-wrapper';

      var targetInput = document.createElement('input');
      targetInput.type = 'text';
      targetInput.className = 'modal-input';
      targetInput.placeholder = options.targetListPlaceholder || 'Search list name';
      targetInput.value = options.initialTargetListName || '';
      targetInputWrapper.appendChild(targetInput);

      var targetSuggestionsList = document.createElement('div');
      targetSuggestionsList.className = 'modal-suggestions';
      targetSuggestionsList.hidden = true;
      targetInputWrapper.appendChild(targetSuggestionsList);

      form.appendChild(targetInputWrapper);

      if (options.initialTargetListId || options.initialTargetListName) {
        selectedList = {
          id: options.initialTargetListId || '',
          name: options.initialTargetListName || ''
        };
      }

      var errorNode = document.createElement('p');
      errorNode.className = 'modal-error';
      form.appendChild(errorNode);

      bodyNode.appendChild(form);

      function close(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('click', onDocumentClick);
        document.body.removeChild(node);
        resolve(result);
      }

      function showError(message) {
        errorNode.textContent = message || '';
      }

      function normalizeName(name) {
        return String(name || '').trim().toLowerCase();
      }

      function sortByName(records) {
        return (records || []).slice().sort(function (left, right) {
          return String(left.name || '').localeCompare(String(right.name || ''), undefined, {
            sensitivity: 'base'
          });
        });
      }

      function renderListSuggestions() {
        targetSuggestionsList.replaceChildren();

        if (currentListSuggestions.length === 0) {
          targetSuggestionsList.hidden = true;
          return;
        }

        targetSuggestionsList.hidden = false;

        currentListSuggestions.slice(0, 8).forEach(function (listRecord) {
          var row = document.createElement('div');
          row.className = 'modal-suggestion-row';

          var selectButton = document.createElement('button');
          selectButton.type = 'button';
          selectButton.className = 'modal-suggestion-main';

          var content = document.createElement('div');
          content.className = 'modal-suggestion-content';

          var nameNode = document.createElement('div');
          nameNode.className = 'modal-suggestion-name';
          nameNode.textContent = listRecord.name;
          content.appendChild(nameNode);

          selectButton.appendChild(content);

          if (selectedList && selectedList.id === listRecord.id) {
            selectButton.setAttribute('aria-selected', 'true');
          }

          selectButton.addEventListener('click', function () {
            selectedList = {
              id: listRecord.id,
              name: listRecord.name
            };
            targetInput.value = listRecord.name;
            showError('');
            currentListSuggestions = [];
            renderListSuggestions();
          });

          row.appendChild(selectButton);
          targetSuggestionsList.appendChild(row);
        });
      }

      async function refreshListSuggestions() {
        var query = String(targetInput.value || '').trim();
        if (!query) {
          currentListSuggestions = options.getAllLists
            ? await options.getAllLists()
            : [];
          currentListSuggestions = sortByName(currentListSuggestions);
          renderListSuggestions();
          return;
        }

        currentListSuggestions = options.searchLists
          ? await options.searchLists(query)
          : [];
        currentListSuggestions = sortByName(currentListSuggestions);

        if (selectedList && normalizeName(selectedList.name) !== normalizeName(targetInput.value)) {
          selectedList = null;
        }

        renderListSuggestions();
      }

      function closeListSuggestions() {
        currentListSuggestions = [];
        renderListSuggestions();
      }

      async function handleSubmit() {
        try {
          showError('');

          var rawName = String(nameInput.value || '').trim();
          if (!rawName) {
            showError('Template name is required.');
            nameInput.focus();
            return;
          }

          var rawTargetListName = String(targetInput.value || '').trim();
          var targetList = null;

          if (rawTargetListName) {
            if (selectedList && normalizeName(selectedList.name) === normalizeName(rawTargetListName)) {
              targetList = selectedList;
            } else if (options.resolveExactList) {
              targetList = await options.resolveExactList(rawTargetListName);
            }

            if (!targetList) {
              showError('Select a target list from suggestions, or clear the field.');
              targetInput.focus();
              return;
            }
          }

          close({
            name: rawName,
            targetListId: targetList ? targetList.id : '',
            targetListName: targetList ? targetList.name : ''
          });
        } catch (error) {
          showError(error.message || 'Unable to save template settings.');
        }
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          if (!targetSuggestionsList.hidden) {
            closeListSuggestions();
            return;
          }

          close(null);
        }
      }

      function onDocumentClick(event) {
        if (!targetSuggestionsList.hidden && !targetInputWrapper.contains(event.target)) {
          closeListSuggestions();
        }
      }

      nameInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          targetInput.focus();
        }
      });

      targetInput.addEventListener('focus', function () {
        refreshListSuggestions().catch(function () {
          showError('Unable to load lists.');
        });
      });

      targetInput.addEventListener('input', function () {
        refreshListSuggestions().catch(function () {
          showError('Unable to load lists.');
        });
      });

      targetInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          closeListSuggestions();
          handleSubmit();
        }
      });

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          close(null);
        }
      });

      cancelButton.addEventListener('click', function () {
        close(null);
      });

      confirmButton.addEventListener('click', function () {
        handleSubmit();
      });

      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('click', onDocumentClick);
      document.body.appendChild(node);

      requestAnimationFrame(function () {
        if (options.focusTargetListOnOpen) {
          targetInput.focus();
        } else {
          nameInput.focus();
          nameInput.select();
        }
      });
    });
  }

  function ShowTemplateTargetListModal(options) {
    return new Promise(function (resolve) {
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');
      var selectedList = null;
      var currentListSuggestions = [];

      titleNode.textContent = options.title || 'Choose Target List';
      confirmButton.textContent = options.confirmLabel || 'Set Target List';
      card.setAttribute('aria-label', titleNode.textContent);
      cancelButton.classList.add('modal-button--secondary');
      confirmButton.classList.add('modal-button--primary');
      confirmButton.hidden = true;

      var form = document.createElement('div');
      form.className = 'modal-item-form';

      var messageNode = document.createElement('p');
      messageNode.className = 'modal-message';
      messageNode.textContent = options.message || 'Select a target list before adding template items.';
      form.appendChild(messageNode);

      var targetLabel = document.createElement('label');
      targetLabel.className = 'modal-field-label';
      targetLabel.textContent = options.targetListLabel || 'Target List';
      form.appendChild(targetLabel);

      var targetInputWrapper = document.createElement('div');
      targetInputWrapper.className = 'modal-input-wrapper';

      var targetInput = document.createElement('input');
      targetInput.type = 'text';
      targetInput.className = 'modal-input';
      targetInput.placeholder = options.targetListPlaceholder || 'Search list name';
      targetInput.value = options.initialTargetListName || '';
      targetInputWrapper.appendChild(targetInput);

      var targetSuggestionsList = document.createElement('div');
      targetSuggestionsList.className = 'modal-suggestions';
      targetSuggestionsList.hidden = true;
      targetInputWrapper.appendChild(targetSuggestionsList);

      form.appendChild(targetInputWrapper);

      if (options.initialTargetListId || options.initialTargetListName) {
        selectedList = {
          id: options.initialTargetListId || '',
          name: options.initialTargetListName || ''
        };
      }

      var errorNode = document.createElement('p');
      errorNode.className = 'modal-error';
      form.appendChild(errorNode);

      bodyNode.appendChild(form);

      function close(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('click', onDocumentClick);
        document.body.removeChild(node);
        resolve(result);
      }

      function showError(message) {
        errorNode.textContent = message || '';
      }

      function normalizeName(name) {
        return String(name || '').trim().toLowerCase();
      }

      function sortByName(records) {
        return (records || []).slice().sort(function (left, right) {
          return String(left.name || '').localeCompare(String(right.name || ''), undefined, {
            sensitivity: 'base'
          });
        });
      }

      function renderListSuggestions() {
        targetSuggestionsList.replaceChildren();

        if (currentListSuggestions.length === 0) {
          targetSuggestionsList.hidden = true;
          return;
        }

        targetSuggestionsList.hidden = false;

        currentListSuggestions.slice(0, 8).forEach(function (listRecord) {
          var row = document.createElement('div');
          row.className = 'modal-suggestion-row';

          var selectButton = document.createElement('button');
          selectButton.type = 'button';
          selectButton.className = 'modal-suggestion-main';

          var content = document.createElement('div');
          content.className = 'modal-suggestion-content';

          var nameNode = document.createElement('div');
          nameNode.className = 'modal-suggestion-name';
          nameNode.textContent = listRecord.name;
          content.appendChild(nameNode);

          selectButton.appendChild(content);

          if (selectedList && selectedList.id === listRecord.id) {
            selectButton.setAttribute('aria-selected', 'true');
          }

          selectButton.addEventListener('click', function () {
            selectedList = {
              id: listRecord.id,
              name: listRecord.name
            };
            targetInput.value = listRecord.name;
            showError('');
            currentListSuggestions = [];
            renderListSuggestions();
            close({
              targetListId: selectedList.id,
              targetListName: selectedList.name
            });
          });

          row.appendChild(selectButton);
          targetSuggestionsList.appendChild(row);
        });
      }

      async function refreshListSuggestions() {
        currentListSuggestions = options.getAllLists
          ? await options.getAllLists()
          : [];
        currentListSuggestions = sortByName(currentListSuggestions);

        renderListSuggestions();
      }

      function closeListSuggestions() {
        currentListSuggestions = [];
        renderListSuggestions();
      }

      async function handleSubmit() {
        try {
          showError('');

          var rawTargetListName = String(targetInput.value || '').trim();
          var targetList = null;

          if (!rawTargetListName) {
            showError('Target list is required.');
            targetInput.focus();
            return;
          }

          if (selectedList && normalizeName(selectedList.name) === normalizeName(rawTargetListName)) {
            targetList = selectedList;
          } else if (options.resolveExactList) {
            targetList = await options.resolveExactList(rawTargetListName);
          }

          if (!targetList) {
            showError('Select a target list from suggestions.');
            targetInput.focus();
            return;
          }

          close({
            targetListId: targetList.id,
            targetListName: targetList.name
          });
        } catch (error) {
          showError(error.message || 'Unable to set target list.');
        }
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          if (!targetSuggestionsList.hidden) {
            closeListSuggestions();
            return;
          }

          close(null);
        }
      }

      function onDocumentClick(event) {
        if (!targetSuggestionsList.hidden && !targetInputWrapper.contains(event.target)) {
          closeListSuggestions();
        }
      }

      targetInput.addEventListener('focus', function () {
        refreshListSuggestions().catch(function () {
          showError('Unable to load lists.');
        });
      });

      targetInput.addEventListener('input', function () {
        refreshListSuggestions().catch(function () {
          showError('Unable to load lists.');
        });
      });

      targetInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          closeListSuggestions();
          handleSubmit();
        }
      });

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          close(null);
        }
      });

      cancelButton.addEventListener('click', function () {
        close(null);
      });

      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('click', onDocumentClick);
      document.body.appendChild(node);

      requestAnimationFrame(function () {
        targetInput.focus();
        refreshListSuggestions().catch(function () {
          showError('Unable to load lists.');
        });
      });
    });
  }

  // Modal for editing a user-defined (non-seeded) unit of measure.
  // Returns a Promise that resolves with the updated unit object, or null if cancelled.
  function ShowEditUnitModal(options) {
    // options: { unit, updateUnitOfMeasure: async fn(id, updates) }
    var unit = options.unit || {};
    return new Promise(function (resolve) {
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');

      titleNode.textContent = 'Edit Unit';
      confirmButton.textContent = 'Save';
      card.setAttribute('aria-label', 'Edit Unit');
      cancelButton.classList.add('modal-button--secondary');
      confirmButton.classList.add('modal-button--primary');

      var form = document.createElement('div');
      form.className = 'modal-item-form';

      // Name
      var nameLabel = document.createElement('label');
      nameLabel.className = 'modal-field-label';
      nameLabel.textContent = 'Unit name';
      form.appendChild(nameLabel);
      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'modal-input';
      nameInput.value = unit.name || '';
      form.appendChild(nameInput);

      // Abbreviation
      var abbrLabel = document.createElement('label');
      abbrLabel.className = 'modal-field-label';
      abbrLabel.textContent = 'Abbreviation (optional)';
      form.appendChild(abbrLabel);
      var abbrInput = document.createElement('input');
      abbrInput.type = 'text';
      abbrInput.className = 'modal-input';
      abbrInput.value = unit.abbreviation || '';
      form.appendChild(abbrInput);

      // Group
      var editGroupLabel = document.createElement('label');
      editGroupLabel.className = 'modal-field-label';
      editGroupLabel.textContent = 'Group';
      form.appendChild(editGroupLabel);
      var editGroupSelect = document.createElement('select');
      editGroupSelect.className = 'modal-input';
      var editGroups = (options.groups && options.groups.length > 0)
        ? options.groups
        : ['Imperial', 'Metric', 'Unit', 'Size', 'Other'];
      var currentGroupInList = editGroups.indexOf(unit.group || '') >= 0;
      if (!currentGroupInList && unit.group) {
        editGroups = [unit.group].concat(editGroups);
      }
      editGroups.forEach(function (g) {
        var opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        editGroupSelect.appendChild(opt);
      });
      editGroupSelect.value = unit.group || editGroups[0] || '';
      form.appendChild(editGroupSelect);
      var behaviorLabel = document.createElement('label');
      behaviorLabel.className = 'modal-field-label';
      behaviorLabel.textContent = 'Quantity behavior';
      form.appendChild(behaviorLabel);
      var behaviorSelect = document.createElement('select');
      behaviorSelect.className = 'modal-input';
      [
        { value: 'decimal', label: 'Decimal (free entry)' },
        { value: 'whole_or_half', label: 'Whole or half (0.5 step)' },
        { value: 'user_defined', label: 'Custom step' }
      ].forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.label;
        behaviorSelect.appendChild(opt);
      });
      behaviorSelect.value = unit.quantityBehavior || 'decimal';
      form.appendChild(behaviorSelect);

      // Step
      var stepLabel = document.createElement('label');
      stepLabel.className = 'modal-field-label';
      stepLabel.textContent = 'Step size (optional)';
      stepLabel.hidden = behaviorSelect.value !== 'user_defined';
      form.appendChild(stepLabel);
      var stepInput = document.createElement('input');
      stepInput.type = 'text';
      stepInput.className = 'modal-input';
      stepInput.value = unit.quantityStep != null ? String(unit.quantityStep) : '';
      stepInput.hidden = behaviorSelect.value !== 'user_defined';
      form.appendChild(stepInput);

      behaviorSelect.addEventListener('change', function () {
        var isCustom = behaviorSelect.value === 'user_defined';
        stepLabel.hidden = !isCustom;
        stepInput.hidden = !isCustom;
      });

      var errorNode = document.createElement('p');
      errorNode.className = 'modal-error';
      form.appendChild(errorNode);

      bodyNode.appendChild(form);

      function closeModal(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.body.removeChild(node);
        resolve(result);
      }

      async function handleSubmit() {
        errorNode.textContent = '';
        var name = String(nameInput.value || '').trim();
        if (!name) {
          errorNode.textContent = 'Unit name is required.';
          nameInput.focus();
          return;
        }
        var abbr = String(abbrInput.value || '').trim() || null;
        var behavior = behaviorSelect.value;
        var stepRaw = String(stepInput.value || '').trim();
        var step = null;
        if (behavior === 'user_defined' && stepRaw) {
          step = parseFloat(stepRaw);
          if (Number.isNaN(step) || step <= 0) {
            errorNode.textContent = 'Step size must be a positive number.';
            stepInput.focus();
            return;
          }
        }

        try {
          var updated = await options.updateUnitOfMeasure(unit.id, {
            name: name,
            abbreviation: abbr,
            group: editGroupSelect.value,
            quantityBehavior: behavior,
            quantityStep: step
          });
          closeModal(updated || { id: unit.id });
        } catch (err) {
          errorNode.textContent = err.message || 'Unable to update unit.';
        }
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') { closeModal(null); }
        if (event.key === 'Enter' && event.target !== behaviorSelect) {
          event.preventDefault();
          handleSubmit();
        }
      }

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) { closeModal(null); }
      });
      cancelButton.addEventListener('click', function () { closeModal(null); });
      confirmButton.addEventListener('click', function () { handleSubmit(); });
      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(node);
      nameInput.focus();
    });
  }

  function ShowPrompt(config) {
    return showModal(function (bodyNode, confirmButton) {
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'modal-input';
      input.placeholder = config.placeholder || '';
      input.value = config.value || '';
      bodyNode.appendChild(input);

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          confirmButton.click();
        }
      });

      requestAnimationFrame(function () {
        input.focus();
        input.select();
      });

      return function () { return input.value; };
    }, {
      title: config.title,
      confirmLabel: config.confirmLabel || 'OK',
      cancelValue: null,
      isDanger: false
    });
  }

  function ShowStepEditorModal(config) {
    return new Promise(function (resolve) {
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');

      var initialStep = config.initialStep && typeof config.initialStep === 'object' ? config.initialStep : {};
      var ingredients = Array.isArray(config.ingredients) ? config.ingredients.slice() : [];
      var initialIngredientRefs = Array.isArray(initialStep.ingredientRefs) ? initialStep.ingredientRefs : [];
      var initialTimer = initialStep.timer && typeof initialStep.timer === 'object' ? initialStep.timer : null;
      var initialDurationSeconds = initialTimer && Number.isFinite(Number(initialTimer.durationSeconds))
        ? Math.max(0, Math.floor(Number(initialTimer.durationSeconds)))
        : 0;

      titleNode.textContent = config.title || 'Step Editor';
      confirmButton.textContent = config.confirmLabel || 'Save';
      card.setAttribute('aria-label', titleNode.textContent);
      cancelButton.classList.add('modal-button--secondary');
      confirmButton.classList.add('modal-button--primary');

      var form = document.createElement('div');
      form.className = 'modal-item-form';

      var textLabel = document.createElement('label');
      textLabel.className = 'modal-field-label';
      textLabel.textContent = 'Step Text';
      form.appendChild(textLabel);

      var textInput = document.createElement('textarea');
      textInput.className = 'modal-input modal-step-textarea';
      textInput.rows = 4;
      textInput.placeholder = config.placeholder || 'Describe this cooking step';
      textInput.value = String(initialStep.text || '');
      form.appendChild(textInput);

      var ingredientsLabel = document.createElement('span');
      ingredientsLabel.className = 'modal-field-label';
      ingredientsLabel.textContent = 'Ingredients Used';
      form.appendChild(ingredientsLabel);

      var ingredientList = document.createElement('div');
      ingredientList.className = 'modal-checklist modal-step-checklist';
      var ingredientCheckboxes = [];

      function isInitiallySelected(itemId) {
        return initialIngredientRefs.indexOf(String(itemId || '')) >= 0;
      }

      if (ingredients.length === 0) {
        var emptyIngredients = document.createElement('p');
        emptyIngredients.className = 'modal-hint';
        emptyIngredients.textContent = 'No recipe ingredients available yet.';
        form.appendChild(emptyIngredients);
      } else {
        ingredients.forEach(function (ingredient) {
          var row = document.createElement('label');
          row.className = 'modal-checklist-row modal-step-checklist-row';

          var checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.className = 'modal-checklist-checkbox';
          checkbox.checked = isInitiallySelected(ingredient.itemId);
          row.appendChild(checkbox);

          var content = document.createElement('div');
          content.className = 'modal-step-checklist-content';

          var nameNode = document.createElement('span');
          nameNode.className = 'modal-checklist-name';
          nameNode.textContent = ingredient.name;
          content.appendChild(nameNode);

          if (ingredient.meta) {
            var metaNode = document.createElement('span');
            metaNode.className = 'modal-step-checklist-meta';
            metaNode.textContent = ingredient.meta;
            content.appendChild(metaNode);
          }

          row.appendChild(content);

          if (ingredient.isUsedElsewhere) {
            var statusNode = document.createElement('span');
            statusNode.className = 'modal-checklist-status';
            statusNode.textContent = 'Already used';
            row.appendChild(statusNode);
          }

          ingredientList.appendChild(row);
          ingredientCheckboxes.push({
            checkbox: checkbox,
            ingredient: ingredient,
            row: row
          });
        });

        form.appendChild(ingredientList);
      }

      var timerRow = document.createElement('label');
      timerRow.className = 'modal-checklist-row modal-step-timer-toggle';

      var timerEnabledInput = document.createElement('input');
      timerEnabledInput.type = 'checkbox';
      timerEnabledInput.className = 'modal-checklist-checkbox';
      timerEnabledInput.checked = !!initialTimer;
      timerRow.appendChild(timerEnabledInput);

      var timerText = document.createElement('span');
      timerText.className = 'modal-checklist-name';
      timerText.textContent = 'Add timer';
      timerRow.appendChild(timerText);
      form.appendChild(timerRow);

      var timerFields = document.createElement('div');
      timerFields.className = 'modal-step-timer-fields';

      var timerDurationLabel = document.createElement('label');
      timerDurationLabel.className = 'modal-field-label';
      timerDurationLabel.textContent = 'Timer Duration';
      timerFields.appendChild(timerDurationLabel);

      var durationGrid = document.createElement('div');
      durationGrid.className = 'modal-step-duration-grid';

      function createDurationInput(labelText, value) {
        var wrap = document.createElement('div');
        wrap.className = 'modal-step-duration-part';

        var inputShell = document.createElement('div');
        inputShell.className = 'recipe-info-duration-shell';

        var input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '1';
        input.className = 'modal-step-duration-input recipe-info-duration-input';
        input.value = value > 0 ? String(value) : '';

        var stepper = document.createElement('div');
        stepper.className = 'recipe-info-stepper';

        var incrementButton = document.createElement('button');
        incrementButton.type = 'button';
        incrementButton.className = 'recipe-info-stepper-button';
        incrementButton.textContent = '+';
        incrementButton.setAttribute('aria-label', 'Increase ' + labelText);

        var decrementButton = document.createElement('button');
        decrementButton.type = 'button';
        decrementButton.className = 'recipe-info-stepper-button';
        decrementButton.textContent = '-';
        decrementButton.setAttribute('aria-label', 'Decrease ' + labelText);

        function adjust(delta) {
          var raw = String(input.value || '').trim();
          var current = raw === '' ? 0 : Number(raw);
          if (!Number.isFinite(current) || current < 0) {
            current = 0;
          }

          var next = Math.max(0, Math.floor(current) + delta);
          input.value = String(next);
        }

        function bindStepper(buttonNode, delta) {
          buttonNode.addEventListener('mousedown', function (event) {
            event.preventDefault();
          });
          buttonNode.addEventListener('click', function (event) {
            event.preventDefault();
            adjust(delta);
          });
        }

        bindStepper(incrementButton, 1);
        bindStepper(decrementButton, -1);

        stepper.appendChild(incrementButton);
        stepper.appendChild(decrementButton);

        inputShell.appendChild(input);
        inputShell.appendChild(stepper);
        wrap.appendChild(inputShell);

        var suffix = document.createElement('span');
        suffix.className = 'modal-step-duration-suffix';
        suffix.textContent = labelText;
        wrap.appendChild(suffix);

        durationGrid.appendChild(wrap);
        return input;
      }

      var hoursInput = createDurationInput('h', Math.floor(initialDurationSeconds / 3600));
      var minutesInput = createDurationInput('m', Math.floor((initialDurationSeconds % 3600) / 60));
      var secondsInput = createDurationInput('s', initialDurationSeconds % 60);
      timerFields.appendChild(durationGrid);

      var timerLabel = document.createElement('label');
      timerLabel.className = 'modal-field-label';
      timerLabel.textContent = 'Timer Label (Optional)';
      timerFields.appendChild(timerLabel);

      var timerLabelInput = document.createElement('input');
      timerLabelInput.type = 'text';
      timerLabelInput.className = 'modal-input';
      timerLabelInput.placeholder = 'e.g. Simmer';
      timerLabelInput.value = initialTimer && initialTimer.label ? String(initialTimer.label) : '';
      timerFields.appendChild(timerLabelInput);
      form.appendChild(timerFields);

      var errorNode = document.createElement('p');
      errorNode.className = 'modal-error';
      form.appendChild(errorNode);

      var overlapWarning = document.createElement('div');
      overlapWarning.className = 'modal-step-warning';
      overlapWarning.hidden = true;

      var overlapMessage = document.createElement('p');
      overlapMessage.className = 'modal-message modal-step-warning-text';
      overlapMessage.textContent = config.overlapWarningMessage || 'Some selected ingredients are already used in other steps.';
      overlapWarning.appendChild(overlapMessage);

      var overlapActions = document.createElement('div');
      overlapActions.className = 'modal-step-warning-actions';

      var continueButton = document.createElement('button');
      continueButton.type = 'button';
      continueButton.className = 'modal-step-warning-button modal-step-warning-button--primary';
      continueButton.textContent = 'Continue and Save';

      var reviewButton = document.createElement('button');
      reviewButton.type = 'button';
      reviewButton.className = 'modal-step-warning-button modal-step-warning-button--secondary';
      reviewButton.textContent = 'Review Selection';

      overlapActions.appendChild(continueButton);
      overlapActions.appendChild(reviewButton);
      overlapWarning.appendChild(overlapActions);
      form.appendChild(overlapWarning);

      bodyNode.appendChild(form);

      function close(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.body.removeChild(node);
        resolve(result);
      }

      function getSelectedIngredientRefs() {
        return ingredientCheckboxes.filter(function (entry) {
          return entry.checkbox.checked;
        }).map(function (entry) {
          return String(entry.ingredient.itemId || '');
        }).filter(function (itemId, index, arr) {
          return itemId && arr.indexOf(itemId) === index;
        });
      }

      function refreshIngredientRows() {
        ingredientCheckboxes.forEach(function (entry) {
          entry.row.classList.toggle('modal-step-checklist-row--used', entry.ingredient.isUsedElsewhere === true);
          entry.row.classList.toggle('modal-step-checklist-row--selected', entry.checkbox.checked === true);
        });
      }

      function setTimerFieldsVisible(isVisible) {
        timerFields.hidden = !isVisible;
      }

      function setOverlapWarningVisible(isVisible) {
        overlapWarning.hidden = !isVisible;
        confirmButton.disabled = !!isVisible;
      }

      function parseDurationInput(inputNode) {
        var raw = String(inputNode.value || '').trim();
        if (!raw) {
          return 0;
        }

        var numeric = Number(raw);
        if (!Number.isFinite(numeric) || numeric < 0 || Math.floor(numeric) !== numeric) {
          return NaN;
        }

        return numeric;
      }

      function buildStepResult() {
        var text = String(textInput.value || '').trim();
        if (!text) {
          throw new Error('Step text is required.');
        }

        var timer = null;
        if (timerEnabledInput.checked) {
          var hours = parseDurationInput(hoursInput);
          var minutes = parseDurationInput(minutesInput);
          var seconds = parseDurationInput(secondsInput);

          if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
            throw new Error('Timer values must be zero or greater whole numbers.');
          }

          var durationSeconds = (hours * 3600) + (minutes * 60) + seconds;
          if (durationSeconds <= 0) {
            throw new Error('Timer duration must be greater than zero.');
          }

          timer = {
            durationSeconds: durationSeconds,
            label: String(timerLabelInput.value || '').trim()
          };
        }

        return {
          text: text,
          ingredientRefs: getSelectedIngredientRefs(),
          timer: timer
        };
      }

      function hasOverlap(selectedIngredientRefs) {
        return ingredientCheckboxes.some(function (entry) {
          return entry.ingredient.isUsedElsewhere === true
            && selectedIngredientRefs.indexOf(String(entry.ingredient.itemId || '')) >= 0;
        });
      }

      function handleSubmit(forceSave) {
        errorNode.textContent = '';

        var result = null;
        try {
          result = buildStepResult();
        } catch (error) {
          setOverlapWarningVisible(false);
          errorNode.textContent = error.message || 'Unable to save step.';
          return;
        }

        if (!forceSave && hasOverlap(result.ingredientRefs)) {
          setOverlapWarningVisible(true);
          reviewButton.focus();
          return;
        }

        close(result);
      }

      ingredientCheckboxes.forEach(function (entry) {
        entry.checkbox.addEventListener('change', function () {
          refreshIngredientRows();
          setOverlapWarningVisible(false);
        });
      });

      timerEnabledInput.addEventListener('change', function () {
        setTimerFieldsVisible(timerEnabledInput.checked);
        setOverlapWarningVisible(false);
      });

      continueButton.addEventListener('click', function () {
        handleSubmit(true);
      });

      reviewButton.addEventListener('click', function () {
        setOverlapWarningVisible(false);
        if (ingredientCheckboxes.length > 0) {
          ingredientCheckboxes[0].checkbox.focus();
        } else {
          textInput.focus();
        }
      });

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          close(null);
          return;
        }

        if (event.key === 'Enter' && event.target !== textInput && event.target !== continueButton && event.target !== reviewButton) {
          event.preventDefault();
          handleSubmit(false);
        }
      }

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          close(null);
        }
      });

      cancelButton.addEventListener('click', function () {
        close(null);
      });

      confirmButton.addEventListener('click', function () {
        handleSubmit(false);
      });

      refreshIngredientRows();
      setTimerFieldsVisible(timerEnabledInput.checked);
      setOverlapWarningVisible(false);
      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(node);

      requestAnimationFrame(function () {
        textInput.focus();
        textInput.setSelectionRange(textInput.value.length, textInput.value.length);
      });
    });
  }

  function normalizeBatchSizeValue(value) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 1;
    }

    var stepped = Math.round(numeric * 2) / 2;
    return Math.max(0.5, stepped);
  }

  function formatBatchSizeFraction(value) {
    var normalized = normalizeBatchSizeValue(value);
    var whole = Math.floor(normalized);
    var hasHalf = Math.abs(normalized - whole - 0.5) < 0.001;

    if (hasHalf) {
      if (whole <= 0) {
        return '1/2';
      }

      return String(whole) + ' 1/2';
    }

    return String(whole);
  }

  function buildBatchSizeStepper(options) {
    var canEdit = options.allowEdit !== false;
    var value = normalizeBatchSizeValue(options.initialValue);

    var stepper = document.createElement('div');
    stepper.className = 'modal-batch-stepper' + (canEdit ? '' : ' modal-batch-stepper--locked');

    var decreaseButton = document.createElement('button');
    decreaseButton.type = 'button';
    decreaseButton.className = 'modal-batch-stepper-button';
    decreaseButton.textContent = '-';
    decreaseButton.setAttribute('aria-label', 'Decrease batch size');

    var valueNode = document.createElement('div');
    valueNode.className = 'modal-batch-stepper-value';
    valueNode.textContent = formatBatchSizeFraction(value);

    var increaseButton = document.createElement('button');
    increaseButton.type = 'button';
    increaseButton.className = 'modal-batch-stepper-button';
    increaseButton.textContent = '+';
    increaseButton.setAttribute('aria-label', 'Increase batch size');

    function refresh() {
      valueNode.textContent = formatBatchSizeFraction(value);
      decreaseButton.disabled = !canEdit || value <= 0.5;
      increaseButton.disabled = !canEdit;
      if (typeof options.onChange === 'function') {
        options.onChange(value);
      }
    }

    increaseButton.addEventListener('click', function () {
      if (!canEdit) {
        return;
      }

      value = normalizeBatchSizeValue(value + 0.5);
      refresh();
    });

    decreaseButton.addEventListener('click', function () {
      if (!canEdit) {
        return;
      }

      value = normalizeBatchSizeValue(value - 0.5);
      refresh();
    });

    stepper.appendChild(decreaseButton);
    stepper.appendChild(valueNode);
    stepper.appendChild(increaseButton);
    refresh();

    return {
      node: stepper,
      focus: function () {
        if (canEdit) {
          increaseButton.focus();
        }
      },
      getValue: function () {
        return value;
      }
    };
  }

  function ShowBatchSizeModal(config) {
    return showModal(function (bodyNode, confirmButton, cancelButton) {
      var form = document.createElement('div');
      form.className = 'modal-item-form';

      var label = document.createElement('label');
      label.className = 'modal-field-label';
      label.textContent = config.label || 'Batch Size';
      form.appendChild(label);

      var stepper = buildBatchSizeStepper({
        initialValue: config.initialBatchSize == null ? 1 : config.initialBatchSize,
        allowEdit: config.allowBatchEdit !== false
      });
      form.appendChild(stepper.node);

      if (config.message) {
        var messageNode = document.createElement('p');
        messageNode.className = 'modal-hint';
        messageNode.textContent = config.message;
        form.appendChild(messageNode);
      }

      bodyNode.appendChild(form);

      requestAnimationFrame(function () {
        if (config.allowBatchEdit === false) {
          cancelButton.focus();
          return;
        }

        stepper.focus();
      });

      return function () {
        return stepper.getValue();
      };
    }, {
      title: config.title || 'Set Batch Size',
      confirmLabel: config.confirmLabel || 'Save',
      cancelValue: null,
      isDanger: false
    });
  }

  function ShowAddToListModal(config) {
    // config: { recipeName, ingredients, initialBatchSize, batchLabel, batchHintFormatter }
    return new Promise(function (resolve) {
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');

      titleNode.textContent = 'Add to Grocery List';
      confirmButton.textContent = 'Add';
      card.setAttribute('aria-label', 'Add to Grocery List');
      cancelButton.classList.add('modal-button--secondary');
      confirmButton.classList.add('modal-button--primary');

      var form = document.createElement('div');
      form.className = 'modal-item-form';

      var batchHintNode = null;

      var batchLabel = document.createElement('label');
      batchLabel.className = 'modal-field-label';
      batchLabel.textContent = config.batchLabel || 'Batch Size';
      form.appendChild(batchLabel);

      var batchStepper = buildBatchSizeStepper({
        initialValue: config.initialBatchSize == null ? 1 : config.initialBatchSize,
        allowEdit: true,
        onChange: function (value) {
          if (batchHintNode && typeof config.batchHintFormatter === 'function') {
            batchHintNode.textContent = String(config.batchHintFormatter(value) || '');
          }
        }
      });
      form.appendChild(batchStepper.node);

      if (typeof config.batchHintFormatter === 'function') {
        batchHintNode = document.createElement('p');
        batchHintNode.className = 'modal-hint';
        batchHintNode.textContent = String(config.batchHintFormatter(batchStepper.getValue()) || '');
        form.appendChild(batchHintNode);
      }

      // ---- Ingredients ----
      var ingredientsLabel = document.createElement('span');
      ingredientsLabel.className = 'modal-field-label';
      ingredientsLabel.textContent = 'Ingredients';
      form.appendChild(ingredientsLabel);

      var ingredientList = document.createElement('div');
      ingredientList.className = 'modal-checklist';

      var checkboxes = [];
      (config.ingredients || []).forEach(function (ingredient) {
        var row = document.createElement('label');
        row.className = 'modal-checklist-row';

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        var ingredientKey = ingredient.id
          ? String(ingredient.id)
          : String((ingredient.name || '')).trim().toLowerCase();
        checkbox.checked = config.preCheckedKeys ? config.preCheckedKeys.has(ingredientKey) : true;
        checkbox.className = 'modal-checklist-checkbox';

        var nameNode = document.createElement('span');
        nameNode.className = 'modal-checklist-name';
        nameNode.textContent = ingredient.name;

        row.appendChild(checkbox);
        row.appendChild(nameNode);

        var qty = ingredient.quantityValue != null ? ingredient.quantityValue : ingredient.quantity;
        var abbr = ingredient.uomAbbreviation || null;
        var numericQty = Number(qty);
        var hasQty = qty != null && !Number.isNaN(numericQty) && numericQty !== 0;
        if (hasQty || abbr) {
          var qtyBadge = document.createElement('span');
          qtyBadge.className = 'modal-checklist-qty';
          var badgeText = hasQty ? String(qty) : '';
          if (abbr) { badgeText = badgeText ? badgeText + '\u00a0' + abbr : abbr; }
          qtyBadge.textContent = badgeText;
          row.appendChild(qtyBadge);
        }

        ingredientList.appendChild(row);
        checkboxes.push({ checkbox: checkbox, ingredient: ingredient });
      });

      form.appendChild(ingredientList);

      var errorNode = document.createElement('p');
      errorNode.className = 'modal-error';
      form.appendChild(errorNode);

      bodyNode.appendChild(form);

      // ---- State ----
      function close(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.body.removeChild(node);
        resolve(result);
      }

      function validateAndClose() {
        errorNode.textContent = '';

        var selectedIngredients = checkboxes
          .filter(function (item) { return item.checkbox.checked; })
          .map(function (item) { return item.ingredient; });

        if (selectedIngredients.length === 0) {
          errorNode.textContent = 'Select at least one ingredient.';
          return;
        }

        close({
          selectedIngredients: selectedIngredients,
          batchSize: batchStepper.getValue()
        });
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          close(null);
        }
      }

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) { close(null); }
      });
      cancelButton.addEventListener('click', function () { close(null); });
      confirmButton.addEventListener('click', function () { validateAndClose(); });

      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(node);

      requestAnimationFrame(function () {
        batchStepper.focus();
      });
    });
  }

  function ShowNewVersionModal(config) {
    // config: { availableVersions, defaultBaseVersionId, defaultVersionName }
    return new Promise(function (resolve) {
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');

      titleNode.textContent = 'New Version';
      confirmButton.textContent = 'Create';
      card.setAttribute('aria-label', 'New Version');
      cancelButton.classList.add('modal-button--secondary');
      confirmButton.classList.add('modal-button--primary');

      var form = document.createElement('div');
      form.className = 'modal-item-form';

      var baseLabel = document.createElement('label');
      baseLabel.className = 'modal-field-label';
      baseLabel.textContent = 'Base new version on';
      form.appendChild(baseLabel);

      var baseSelect = document.createElement('select');
      baseSelect.className = 'modal-input';

      var versions = (config.availableVersions || []).slice().sort(function (a, b) {
        var dateA = new Date(String(a && a.createdDate) || '0');
        var dateB = new Date(String(b && b.createdDate) || '0');
        return dateB.getTime() - dateA.getTime();
      });
      versions.forEach(function (version) {
        var option = document.createElement('option');
        option.value = String(version.id || '');
        var label = String(version.versionName || 'Unnamed version');
        option.textContent = label;
        option.selected = String(version.id || '') === String(config.defaultBaseVersionId || '');
        baseSelect.appendChild(option);
      });
      form.appendChild(baseSelect);

      var nameLabel = document.createElement('label');
      nameLabel.className = 'modal-field-label';
      nameLabel.textContent = 'Version name';
      form.appendChild(nameLabel);

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'modal-input';
      nameInput.placeholder = 'Version name (e.g., 2026-05-03 14:30)';
      nameInput.value = String(config.defaultVersionName || '').trim();
      form.appendChild(nameInput);

      var errorNode = document.createElement('p');
      errorNode.className = 'modal-error';
      errorNode.style.display = 'none';
      form.appendChild(errorNode);

      nameInput.addEventListener('input', function () {
        if (errorNode.style.display !== 'none') {
          errorNode.style.display = 'none';
        }
      });

      bodyNode.appendChild(form);

      function close(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.body.removeChild(node);
        resolve(result);
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          close(null);
        }
      }

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          close(null);
        }
      });

      cancelButton.addEventListener('click', function () {
        close(null);
      });

      confirmButton.addEventListener('click', function () {
        var versionName = String(nameInput.value || '').trim();
        if (!versionName) {
          errorNode.textContent = 'Version name is required.';
          errorNode.style.display = 'block';
          nameInput.focus();
          return;
        }

        close({
          baseVersionId: String(baseSelect.value || ''),
          versionName: versionName,
          versionNote: ''
        });
      });

      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(node);

      requestAnimationFrame(function () {
        nameInput.focus();
        nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
      });
    });
  }

  function ShowRecipeCloneModal(config) {
    return new Promise(function (resolve) {
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');

      titleNode.textContent = config.title || 'Clone Recipe';
      confirmButton.textContent = config.confirmLabel || 'Clone';
      card.setAttribute('aria-label', titleNode.textContent);
      cancelButton.classList.add('modal-button--secondary');
      confirmButton.classList.add('modal-button--primary');

      var form = document.createElement('div');
      form.className = 'modal-item-form';

      var nameLabel = document.createElement('label');
      nameLabel.className = 'modal-field-label';
      nameLabel.textContent = 'Recipe name';
      form.appendChild(nameLabel);

      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'modal-input';
      nameInput.value = config.initialName || '';
      form.appendChild(nameInput);

      var infoRow = document.createElement('div');
      infoRow.className = 'modal-inline-info';

      var infoText = document.createElement('p');
      infoText.className = 'modal-message modal-inline-info-text';
      infoText.textContent = 'Clones start as a separate recipe with their own history.';
      infoRow.appendChild(infoText);

      var infoWrap = document.createElement('span');
      infoWrap.className = 'accordion-info-wrap';

      var infoButton = document.createElement('button');
      infoButton.type = 'button';
      infoButton.className = 'accordion-info-icon';
      infoButton.textContent = '?';
      infoButton.setAttribute('aria-label', 'About recipe cloning');
      infoWrap.appendChild(infoButton);

      var infoTooltip = document.createElement('span');
      infoTooltip.className = 'accordion-info-tooltip';
      infoTooltip.textContent = config.infoText || '';
      infoWrap.appendChild(infoTooltip);
      infoRow.appendChild(infoWrap);
      form.appendChild(infoRow);

      var errorNode = document.createElement('p');
      errorNode.className = 'modal-error';
      form.appendChild(errorNode);
      bodyNode.appendChild(form);

      function close(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.body.removeChild(node);
        resolve(result);
      }

      function validateAndClose() {
        var trimmedName = String(nameInput.value || '').trim();
        if (!trimmedName) {
          errorNode.textContent = 'Recipe name is required.';
          nameInput.focus();
          return;
        }

        close({ name: trimmedName });
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          close(null);
          return;
        }

        if (event.key === 'Enter' && event.target === nameInput) {
          event.preventDefault();
          validateAndClose();
        }
      }

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          close(null);
        }
      });

      cancelButton.addEventListener('click', function () {
        close(null);
      });

      confirmButton.addEventListener('click', function () {
        validateAndClose();
      });

      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(node);

      requestAnimationFrame(function () {
        nameInput.focus();
        nameInput.select();
      });
    });
  }

  function ShowImportModeModal() {
    return showModal(function (bodyNode, confirmButton) {
      var form = document.createElement('div');
      form.className = 'modal-item-form';

      var options = [
        {
          value: 'merge',
          title: 'Merge',
          description: 'Use Merge mode? Merge keeps existing data and applies newer imported records.'
        },
        {
          value: 'replace',
          title: 'Replace',
          description: 'Replace deletes all current local data and restores only the imported file.'
        }
      ];

      var selectedValue = 'merge';

      options.forEach(function (option, index) {
        var label = document.createElement('label');
        label.className = 'modal-choice-row' + (option.value === 'replace' ? ' modal-choice-row--danger' : '');

        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'kap-import-mode';
        radio.value = option.value;
        radio.className = 'modal-choice-radio';
        radio.checked = index === 0;
        radio.addEventListener('change', function () {
          if (radio.checked) {
            selectedValue = option.value;
          }
        });
        label.appendChild(radio);

        var content = document.createElement('div');
        content.className = 'modal-choice-content';

        var title = document.createElement('div');
        title.className = 'modal-choice-title';
        title.textContent = option.title;
        content.appendChild(title);

        var description = document.createElement('p');
        description.className = 'modal-choice-description';
        description.textContent = option.description;
        content.appendChild(description);

        label.appendChild(content);
        form.appendChild(label);
      });

      bodyNode.appendChild(form);

      requestAnimationFrame(function () {
        var firstRadio = form.querySelector('.modal-choice-radio');
        if (firstRadio) {
          firstRadio.focus();
        } else {
          confirmButton.focus();
        }
      });

      return function () {
        return selectedValue;
      };
    }, {
      title: 'Import Data',
      confirmLabel: 'Import',
      cancelValue: null,
      isDanger: false,
      compact: false
    });
  }

  function ShowRecipeExportModal(config) {
    return showModal(function (bodyNode, confirmButton) {
      var form = document.createElement('div');
      form.className = 'modal-item-form';

      var options = [
        {
          value: 'pdf',
          title: 'PDF File',
          description: String(config.pdfDescription || 'Download a printable PDF file.')
        },
        {
          value: 'text',
          title: 'Copy as Text',
          description: String(config.textDescription || 'Copy a user-readable recipe to your clipboard.')
        },
        {
          value: 'kap',
          title: '.kap File',
          description: String(config.kapDescription || 'Download recipe data in .kap format.')
        }
      ];

      var selectedValue = String(config.defaultFormat || 'kap');
      var foundDefault = false;

      options.forEach(function (option) {
        if (option.value === selectedValue) {
          foundDefault = true;
        }
      });

      if (!foundDefault) {
        selectedValue = 'kap';
      }

      options.forEach(function (option) {
        var label = document.createElement('label');
        label.className = 'modal-choice-row';

        var radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'kap-recipe-export-format';
        radio.value = option.value;
        radio.className = 'modal-choice-radio';
        radio.checked = option.value === selectedValue;
        radio.addEventListener('change', function () {
          if (radio.checked) {
            selectedValue = option.value;
          }
        });
        label.appendChild(radio);

        var content = document.createElement('div');
        content.className = 'modal-choice-content';

        var title = document.createElement('div');
        title.className = 'modal-choice-title';
        title.textContent = option.title;
        content.appendChild(title);

        var description = document.createElement('p');
        description.className = 'modal-choice-description';
        description.textContent = option.description;
        content.appendChild(description);

        label.appendChild(content);
        form.appendChild(label);
      });

      bodyNode.appendChild(form);

      requestAnimationFrame(function () {
        var selectedRadio = form.querySelector('.modal-choice-radio:checked');
        if (selectedRadio) {
          selectedRadio.focus();
        } else {
          confirmButton.focus();
        }
      });

      return function () {
        return selectedValue;
      };
    }, {
      title: config.title || 'Export Recipe',
      confirmLabel: config.confirmLabel || 'Continue',
      cancelValue: null,
      isDanger: false,
      compact: false
    });
  }

  function ShowIngredientNameConflictPrompt(config) {
    return new Promise(function (resolve) {
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');

      titleNode.textContent = 'Ingredient Name Conflict';
      card.setAttribute('aria-label', 'Ingredient Name Conflict');
      cancelButton.style.display = 'none';
      confirmButton.style.display = 'none';

      var form = document.createElement('div');
      form.className = 'modal-item-form modal-conflict-form';

      var lineOne = document.createElement('p');
      lineOne.className = 'modal-message';
      lineOne.textContent = 'Imported ingredient uses the same Id as an existing ingredient, but the names are different.';
      form.appendChild(lineOne);

      var idLine = document.createElement('p');
      idLine.className = 'modal-message';
      idLine.textContent = 'Id: ' + String(config.ingredientId || '');
      form.appendChild(idLine);

      var existingLine = document.createElement('p');
      existingLine.className = 'modal-message';
      existingLine.textContent = 'Existing: ' + String(config.existingName || '');
      form.appendChild(existingLine);

      var incomingLine = document.createElement('p');
      incomingLine.className = 'modal-message';
      incomingLine.textContent = 'Incoming: ' + String(config.incomingName || '');
      form.appendChild(incomingLine);

      var applyWrap = document.createElement('label');
      applyWrap.className = 'modal-conflict-apply-row';

      var applyCheckbox = document.createElement('input');
      applyCheckbox.type = 'checkbox';
      applyCheckbox.className = 'modal-choice-radio';
      applyWrap.appendChild(applyCheckbox);

      var applyText = document.createElement('span');
      applyText.textContent = 'Apply this decision to all remaining conflicts.';
      applyWrap.appendChild(applyText);
      form.appendChild(applyWrap);

      var actions = document.createElement('div');
      actions.className = 'modal-conflict-actions';

      var useIncomingButton = document.createElement('button');
      useIncomingButton.type = 'button';
      useIncomingButton.className = 'modal-button modal-button--primary';
      useIncomingButton.textContent = 'Use Incoming Name';

      var keepExistingButton = document.createElement('button');
      keepExistingButton.type = 'button';
      keepExistingButton.className = 'modal-button modal-button--secondary';
      keepExistingButton.textContent = 'Keep Existing Name';

      var cancelImportButton = document.createElement('button');
      cancelImportButton.type = 'button';
      cancelImportButton.className = 'modal-button modal-button--secondary';
      cancelImportButton.textContent = 'Cancel Import';

      actions.appendChild(useIncomingButton);
      actions.appendChild(keepExistingButton);
      actions.appendChild(cancelImportButton);
      form.appendChild(actions);

      bodyNode.appendChild(form);

      function close(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.body.removeChild(node);
        resolve(result);
      }

      function decisionResult(decision) {
        return {
          decision: decision,
          applyToAll: applyCheckbox.checked === true
        };
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(null);
          return;
        }

        if (event.key === 'Enter') {
          var focused = document.activeElement;
          if (focused === useIncomingButton || focused === keepExistingButton || focused === cancelImportButton) {
            event.preventDefault();
            focused.click();
          }
        }
      }

      useIncomingButton.addEventListener('click', function () {
        close(decisionResult('use_incoming'));
      });

      keepExistingButton.addEventListener('click', function () {
        close(decisionResult('keep_existing'));
      });

      cancelImportButton.addEventListener('click', function () {
        close(null);
      });

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          close(null);
        }
      });

      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(node);

      requestAnimationFrame(function () {
        keepExistingButton.focus();
      });
    });
  }

  function ShowRecipeImportReviewModal(config) {
    return new Promise(function (resolve) {
      var preflight = config && config.preflight ? config.preflight : null;
      var node = newFromTemplate('modal-template');
      var overlay = node;
      var card = node.querySelector('.modal-card');
      var titleNode = node.querySelector('.modal-title');
      var bodyNode = node.querySelector('.modal-body');
      var cancelButton = node.querySelector('.modal-cancel-button');
      var confirmButton = node.querySelector('.modal-confirm-button');

      overlay.classList.add('modal-overlay--compact');
      card.classList.add('modal-card--compact');
      card.classList.add('modal-card--import-review');
      titleNode.textContent = 'Review Recipe Import';
      card.setAttribute('aria-label', 'Review Recipe Import');
      cancelButton.style.display = 'none';
      confirmButton.style.display = 'none';

      var wrap = document.createElement('div');
      wrap.className = 'modal-import-review';

      var intro = document.createElement('p');
      intro.className = 'modal-message modal-import-review-intro';
      intro.textContent = 'Review what will change before you apply this import.';
      wrap.appendChild(intro);

      var targetCard = document.createElement('div');
      targetCard.className = 'modal-import-section';
      var targetTitle = document.createElement('h3');
      targetTitle.className = 'modal-import-section-title';
      targetTitle.textContent = 'Import Target';
      targetCard.appendChild(targetTitle);

      var recipeLine = document.createElement('p');
      recipeLine.className = 'modal-import-line';
      recipeLine.textContent = 'Recipe: ' + String((preflight && preflight.target && preflight.target.recipeName) || 'Unknown');
      targetCard.appendChild(recipeLine);

      var versionLine = document.createElement('p');
      versionLine.className = 'modal-import-line';
      versionLine.textContent = 'Version: ' + String((preflight && preflight.target && preflight.target.versionName) || 'Unknown');
      targetCard.appendChild(versionLine);

      wrap.appendChild(targetCard);

      var changesCard = document.createElement('div');
      changesCard.className = 'modal-import-section';
      var changesTitle = document.createElement('h3');
      changesTitle.className = 'modal-import-section-title';
      changesTitle.textContent = 'What Will Change';
      changesCard.appendChild(changesTitle);

      var metrics = document.createElement('div');
      metrics.className = 'modal-import-metrics';

      function addMetric(label, value) {
        var row = document.createElement('div');
        row.className = 'modal-import-metric';

        var labelNode = document.createElement('span');
        labelNode.className = 'modal-import-metric-label';
        labelNode.textContent = label;

        var valueNode = document.createElement('span');
        valueNode.className = 'modal-import-metric-value';
        valueNode.textContent = String(value);

        row.appendChild(labelNode);
        row.appendChild(valueNode);
        metrics.appendChild(row);
      }

      addMetric('Ingredients to add', preflight && preflight.ingredientCounts ? preflight.ingredientCounts.newCount : 0);
      addMetric('Ingredients to update', preflight && preflight.ingredientCounts ? preflight.ingredientCounts.overwriteCount : 0);
      addMetric('Instructions to add', preflight && preflight.instructionCounts ? preflight.instructionCounts.newCount : 0);
      addMetric('Instructions to update', preflight && preflight.instructionCounts ? preflight.instructionCounts.overwriteCount : 0);

      if (preflight && preflight.ingredientConflictCount > 0) {
        addMetric('Name decisions needed', preflight.ingredientConflictCount);
      }

      if (preflight && preflight.recipeDerivedListsPreservedCount > 0) {
        addMetric('Existing grocery lists kept', preflight.recipeDerivedListsPreservedCount);
      }

      changesCard.appendChild(metrics);
      wrap.appendChild(changesCard);

      if (preflight && preflight.versionConflictDetail) {
        var versionNote = document.createElement('p');
        versionNote.className = 'modal-message modal-import-note';
        versionNote.textContent = 'Version note: ' + preflight.versionConflictDetail;
        wrap.appendChild(versionNote);
      }

      if (preflight && Array.isArray(preflight.warnings) && preflight.warnings.length > 0) {
        var warningCard = document.createElement('div');
        warningCard.className = 'modal-import-section modal-import-warning';

        var warningTitle = document.createElement('h3');
        warningTitle.className = 'modal-import-section-title';
        warningTitle.textContent = 'Please Review';
        warningCard.appendChild(warningTitle);

        var warningList = document.createElement('ul');
        warningList.className = 'modal-import-warning-list';
        for (var i = 0; i < preflight.warnings.length; i++) {
          var item = document.createElement('li');
          item.textContent = String(preflight.warnings[i]);
          warningList.appendChild(item);
        }

        warningCard.appendChild(warningList);
        wrap.appendChild(warningCard);
      }

      var dangerNote = document.createElement('p');
      dangerNote.className = 'modal-message modal-import-danger-note';
      dangerNote.textContent = 'Applying import replaces matching data for this recipe version. There is no automatic undo.';
      wrap.appendChild(dangerNote);

      var decisionTitle = document.createElement('h3');
      decisionTitle.className = 'modal-import-section-title';
      decisionTitle.textContent = 'Choose What To Do';
      wrap.appendChild(decisionTitle);

      var decisions = document.createElement('div');
      decisions.className = 'modal-import-decisions';

      var applyButton = document.createElement('button');
      applyButton.type = 'button';
      applyButton.className = 'modal-import-decision modal-import-decision--danger';
      applyButton.innerHTML = '<span class="modal-import-decision-title">Apply Import</span>'
        + '<span class="modal-import-decision-description">Update this recipe version using the imported file.</span>';

      var cancelImportButton = document.createElement('button');
      cancelImportButton.type = 'button';
      cancelImportButton.className = 'modal-import-decision modal-import-decision--safe';
      cancelImportButton.innerHTML = '<span class="modal-import-decision-title">Cancel Import</span>'
        + '<span class="modal-import-decision-description">Close this dialog and keep everything unchanged.</span>';

      decisions.appendChild(applyButton);
      decisions.appendChild(cancelImportButton);
      wrap.appendChild(decisions);
      bodyNode.appendChild(wrap);

      function close(result) {
        document.removeEventListener('keydown', onKeyDown);
        document.body.removeChild(node);
        resolve(result);
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          close({ action: 'cancel' });
          return;
        }

        if (event.key === 'Enter') {
          var focused = document.activeElement;
          if (focused === applyButton || focused === cancelImportButton) {
            event.preventDefault();
            focused.click();
          }
        }
      }

      applyButton.addEventListener('click', function () {
        close({ action: 'apply' });
      });

      cancelImportButton.addEventListener('click', function () {
        close({ action: 'cancel' });
      });

      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          close({ action: 'cancel' });
        }
      });

      document.addEventListener('keydown', onKeyDown);
      document.body.appendChild(node);

      requestAnimationFrame(function () {
        cancelImportButton.focus();
      });
    });
  }

  function ShowConfirm(config) {
    return showModal(function (bodyNode, confirmButton, cancelButton) {
      if (config.message) {
        var p = document.createElement('p');
        p.className = 'modal-message';
        p.textContent = config.message;
        bodyNode.appendChild(p);
      }

      requestAnimationFrame(function () {
        cancelButton.focus();
      });

      return function () { return true; };
    }, {
      title: config.title,
      confirmLabel: config.confirmLabel || 'Confirm',
      cancelValue: false,
      isDanger: config.isDanger || false,
      compact: true
    });
  }

  function ShowAlert(config) {
    return showModal(function (bodyNode, confirmButton) {
      if (config.message) {
        var p = document.createElement('p');
        p.className = 'modal-message';
        p.textContent = config.message;
        bodyNode.appendChild(p);
      }

      requestAnimationFrame(function () {
        confirmButton.focus();
      });

      return function () { return true; };
    }, {
      title: config.title,
      confirmLabel: config.confirmLabel || 'OK',
      cancelValue: null,
      showCancel: false,
      isDanger: false
    });
  }

  function ShowAboutModal(config) {
    return showModal(function (bodyNode, confirmButton) {
      var companyName = String(config.companyName || 'Ignyos').trim();
      var companyUrl = String(config.companyUrl || 'https://ignyos.com').trim();
      var releaseNotesUrl = String(config.releaseNotesUrl || 'https://github.com/Ignyos/KAP/releases').trim();
      var releaseVersion = String(config.releaseVersion || 'Unknown').trim();

      var aboutWrap = document.createElement('div');
      aboutWrap.className = 'modal-about-content';

      var companyMessage = document.createElement('p');
      companyMessage.className = 'modal-message modal-about-line';
      companyMessage.appendChild(document.createTextNode('Created by '));
      var companyLink = document.createElement('a');
      companyLink.className = 'modal-link';
      companyLink.href = companyUrl;
      companyLink.target = '_blank';
      companyLink.rel = 'noopener noreferrer';
      companyLink.textContent = companyName;
      companyMessage.appendChild(companyLink);
      companyMessage.appendChild(document.createTextNode('.'));
      aboutWrap.appendChild(companyMessage);

      var versionMessage = document.createElement('p');
      versionMessage.className = 'modal-message modal-about-line';
      versionMessage.textContent = 'Version: ' + releaseVersion;
      aboutWrap.appendChild(versionMessage);

      var releaseNotesMessage = document.createElement('p');
      releaseNotesMessage.className = 'modal-message modal-about-line';
      var releaseNotesLink = document.createElement('a');
      releaseNotesLink.className = 'modal-link';
      releaseNotesLink.href = releaseNotesUrl;
      releaseNotesLink.target = '_blank';
      releaseNotesLink.rel = 'noopener noreferrer';
      releaseNotesLink.textContent = 'Release Notes';
      releaseNotesMessage.appendChild(releaseNotesLink);
      aboutWrap.appendChild(releaseNotesMessage);

      bodyNode.appendChild(aboutWrap);

      return function () { return true; };
    }, {
      title: config.title || 'About',
      cancelValue: null,
      showCancel: false,
      showConfirm: false,
      isDanger: false,
      compact: true
    });
  }

  function ShowTimedNotice(config) {
    var durationMs = Number(config && config.durationMs);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      durationMs = 3000;
    }

    if (activeTimedNotice && typeof activeTimedNotice.close === 'function') {
      activeTimedNotice.close();
    }

    var notice = document.createElement('div');
    notice.className = 'timed-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');

    var textWrap = document.createElement('div');
    textWrap.className = 'timed-notice-text';

    var titleNode = document.createElement('div');
    titleNode.className = 'timed-notice-title';
    titleNode.textContent = String((config && config.title) || 'Done');
    textWrap.appendChild(titleNode);

    if (config && config.message) {
      var messageNode = document.createElement('p');
      messageNode.className = 'timed-notice-message';
      messageNode.textContent = String(config.message);
      textWrap.appendChild(messageNode);
    }

    var closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'timed-notice-close';
    closeButton.textContent = '\u00d7';
    closeButton.setAttribute('aria-label', 'Dismiss notice');

    var timeoutId = null;

    function closeNotice() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (notice.parentNode) {
        notice.parentNode.removeChild(notice);
      }

      if (activeTimedNotice && activeTimedNotice.node === notice) {
        activeTimedNotice = null;
      }
    }

    closeButton.addEventListener('click', function () {
      closeNotice();
    });

    notice.appendChild(textWrap);
    notice.appendChild(closeButton);
    document.body.appendChild(notice);

    requestAnimationFrame(function () {
      notice.classList.add('timed-notice--visible');
    });

    timeoutId = setTimeout(function () {
      closeNotice();
    }, durationMs);

    activeTimedNotice = {
      node: notice,
      close: closeNotice
    };
  }

  window.KaPUI = {
    NewMainTab: NewMainTab,
    AddMainTab: AddMainTab,
    ReplaceMainTabs: ReplaceMainTabs,
    NewListRecordRow: NewListRecordRow,
    ReplaceRecordList: ReplaceRecordList,
    NewMainContentShell: NewMainContentShell,
    AddMainContentShell: AddMainContentShell,
    ReplaceMainContent: ReplaceMainContent,
    NewDetailShell: NewDetailShell,
    ReplaceDetailContent: ReplaceDetailContent,
    NewDetailItemRow: NewDetailItemRow,
    ReplaceDetailItemRows: ReplaceDetailItemRows,
    NewSettingsToggle: NewSettingsToggle,
    ShowDiscoveryItemModal: ShowDiscoveryItemModal,
    ShowCreateUnitModal: ShowCreateUnitModal,
    ShowEditUnitModal: ShowEditUnitModal,
    ShowTemplateConfigModal: ShowTemplateConfigModal,
    ShowTemplateTargetListModal: ShowTemplateTargetListModal,
    ShowPrompt: ShowPrompt,
    ShowStepEditorModal: ShowStepEditorModal,
    ShowBatchSizeModal: ShowBatchSizeModal,
    FormatBatchSize: formatBatchSizeFraction,
    ShowAddToListModal: ShowAddToListModal,
    ShowNewVersionModal: ShowNewVersionModal,
    ShowRecipeCloneModal: ShowRecipeCloneModal,
    ShowImportModeModal: ShowImportModeModal,
    BuildBatchSizeStepper: buildBatchSizeStepper,
    ShowRecipeExportModal: ShowRecipeExportModal,
    ShowRecipeImportReviewModal: ShowRecipeImportReviewModal,
    ShowIngredientNameConflictPrompt: ShowIngredientNameConflictPrompt,
    ShowConfirm: ShowConfirm,
    ShowAlert: ShowAlert,
    ShowAboutModal: ShowAboutModal,
    ShowTimedNotice: ShowTimedNotice,
    SetActiveOverflowMenu: setActiveOverflowMenu,
    ShouldOpenOverflowUp: shouldOpenOverflowUp
  };
})();
