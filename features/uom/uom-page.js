(function () {
  var BEHAVIOR_LABELS = { decimal: 'Decimal', whole_or_half: 'Whole / half', user_defined: 'Custom step' };

  function getGroupOrder(units) {
    var seen = {};
    var naturalGroups = [];
    (units || []).forEach(function (u) {
      var g = String(u && u.group || '').trim();
      if (g && !seen[g]) {
        seen[g] = true;
        naturalGroups.push(g);
      }
    });

    var savedOrder = window.KaPSettings.get(window.KaPSettings.KEYS.UOM_GROUP_ORDER) || [];
    var result = [];
    var inResult = {};

    savedOrder.forEach(function (g) {
      if (g && !inResult[g]) {
        result.push(g);
        inResult[g] = true;
      }
    });

    naturalGroups.forEach(function (g) {
      if (!inResult[g]) {
        result.push(g);
        inResult[g] = true;
      }
    });

    return result;
  }

  function saveGroupOrder(groups) {
    window.KaPSettings.set(window.KaPSettings.KEYS.UOM_GROUP_ORDER, groups);
  }

  async function renderBodyInto(bodyWrap) {
    bodyWrap.replaceChildren();

    var units = [];
    try {
      units = await window.KaPRecipesService.getAllUnitOfMeasures({ includeInactive: true });
    } catch (_e) {}

    var orderedGroups = getGroupOrder(units);

    if (orderedGroups.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'uom-empty';
      empty.textContent = 'No units found.';
      bodyWrap.appendChild(empty);
      return;
    }

    var unitsByGroup = {};
    units.forEach(function (u) {
      var g = String(u && u.group || '').trim() || 'Other';
      if (!unitsByGroup[g]) { unitsByGroup[g] = []; }
      unitsByGroup[g].push(u);
    });

    orderedGroups.forEach(function (groupName, groupIdx) {
      var groupUnits = unitsByGroup[groupName] || [];

      var groupSection = document.createElement('div');
      groupSection.className = 'uom-group-section';

      var groupHeader = document.createElement('div');
      groupHeader.className = 'uom-group-header';

      var groupNameSpan = document.createElement('span');
      groupNameSpan.className = 'uom-group-name';
      groupNameSpan.textContent = groupName;
      groupHeader.appendChild(groupNameSpan);

      var groupMenuWrap = document.createElement('div');
      groupMenuWrap.className = 'detail-overflow-menu';

      var groupMenuTrigger = document.createElement('button');
      groupMenuTrigger.type = 'button';
      groupMenuTrigger.className = 'record-action-button detail-overflow-trigger';
      groupMenuTrigger.setAttribute('aria-haspopup', 'menu');
      groupMenuTrigger.setAttribute('aria-expanded', 'false');
      groupMenuTrigger.setAttribute('aria-label', 'Group actions');

      var groupMenuDots = document.createElement('span');
      groupMenuDots.className = 'detail-overflow-dots';
      groupMenuDots.textContent = '\u2026';
      groupMenuTrigger.appendChild(groupMenuDots);

      var groupMenuList = document.createElement('div');
      groupMenuList.className = 'detail-overflow-list';
      groupMenuList.setAttribute('role', 'menu');

      (function (gName, gIdx, gCount, gUnits, mTrigger, mList, mWrap) {
        function setMenuOpen(isOpen) {
          mList.style.display = isOpen ? 'grid' : 'none';
          mTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          window.KaPUI.SetActiveOverflowMenu(mWrap, setMenuOpen, isOpen);
          if (isOpen) {
            mList.classList.remove('detail-overflow-list--up');
            if (window.KaPUI.ShouldOpenOverflowUp(mTrigger, mList)) {
              mList.classList.add('detail-overflow-list--up');
            }
          }
        }

        setMenuOpen(false);

        var groupMenuActions = [
          {
            label: 'Move Up',
            isDisabled: gIdx === 0,
            onClick: function () {
              var current = getGroupOrder(units);
              var idx = current.indexOf(gName);
              if (idx > 0) {
                current.splice(idx, 1);
                current.splice(idx - 1, 0, gName);
                saveGroupOrder(current);
                renderBodyInto(bodyWrap);
              }
            }
          },
          {
            label: 'Move Down',
            isDisabled: gIdx === gCount - 1,
            onClick: function () {
              var current = getGroupOrder(units);
              var idx = current.indexOf(gName);
              if (idx >= 0 && idx < current.length - 1) {
                current.splice(idx, 1);
                current.splice(idx + 1, 0, gName);
                saveGroupOrder(current);
                renderBodyInto(bodyWrap);
              }
            }
          },
          {
            label: 'Rename',
            onClick: async function () {
              var newName = await window.KaPUI.ShowPrompt({
                title: 'Rename Group',
                value: gName,
                confirmLabel: 'Rename'
              });
              if (!newName) { return; }
              var trimmed = String(newName).trim();
              if (!trimmed || trimmed === gName) { return; }
              await window.KaPRecipesService.renameGroup(gName, trimmed);
              var savedOrder = (window.KaPSettings.get(window.KaPSettings.KEYS.UOM_GROUP_ORDER) || []).map(function (g) {
                return g === gName ? trimmed : g;
              });
              saveGroupOrder(savedOrder);
              await renderBodyInto(bodyWrap);
            }
          },
          {
            label: 'Remove',
            isDanger: gUnits.length === 0,
            isDisabled: gUnits.length > 0,
            onClick: async function () {
              var savedOrder = (window.KaPSettings.get(window.KaPSettings.KEYS.UOM_GROUP_ORDER) || []).filter(function (g) {
                return g !== gName;
              });
              saveGroupOrder(savedOrder);
              await renderBodyInto(bodyWrap);
            }
          }
        ];

        groupMenuActions.forEach(function (action) {
          var item = document.createElement('button');
          item.type = 'button';
          item.className = 'detail-overflow-item' + (action.isDanger ? ' detail-overflow-item--danger' : '');
          item.textContent = action.label;
          item.setAttribute('role', 'menuitem');
          if (action.isDisabled) {
            item.disabled = true;
          } else {
            item.addEventListener('click', function () {
              setMenuOpen(false);
              action.onClick();
            });
          }
          mList.appendChild(item);
        });

        mTrigger.addEventListener('click', function (event) {
          event.stopPropagation();
          var isOpen = mList.style.display !== 'none';
          setMenuOpen(!isOpen);
        });
      })(groupName, groupIdx, orderedGroups.length, groupUnits, groupMenuTrigger, groupMenuList, groupMenuWrap);

      groupMenuWrap.appendChild(groupMenuTrigger);
      groupMenuWrap.appendChild(groupMenuList);
      groupHeader.appendChild(groupMenuWrap);
      groupSection.appendChild(groupHeader);

      groupUnits.forEach(function (unit) {
        var row = document.createElement('div');
        row.className = 'uom-row';

        var nameBlock = document.createElement('div');
        nameBlock.className = 'uom-row-name-block';

        var nameSpan = document.createElement('span');
        nameSpan.className = 'uom-row-name';
        nameSpan.textContent = unit.name;
        nameBlock.appendChild(nameSpan);

        if (unit.abbreviation) {
          var abbrSpan = document.createElement('span');
          abbrSpan.className = 'uom-row-abbr';
          abbrSpan.textContent = unit.abbreviation;
          nameBlock.appendChild(abbrSpan);
        }

        row.appendChild(nameBlock);

        var metaBlock = document.createElement('div');
        metaBlock.className = 'uom-row-meta';

        var behaviorSpan = document.createElement('span');
        behaviorSpan.className = 'uom-row-behavior';
        behaviorSpan.textContent = BEHAVIOR_LABELS[unit.quantityBehavior] || unit.quantityBehavior || '';
        metaBlock.appendChild(behaviorSpan);

        row.appendChild(metaBlock);

        var rowActions = document.createElement('div');
        rowActions.className = 'uom-row-actions';

        var menuWrap = document.createElement('div');
        menuWrap.className = 'detail-overflow-menu';

        var menuTrigger = document.createElement('button');
        menuTrigger.type = 'button';
        menuTrigger.className = 'record-action-button detail-overflow-trigger';
        menuTrigger.setAttribute('aria-haspopup', 'menu');
        menuTrigger.setAttribute('aria-expanded', 'false');
        menuTrigger.setAttribute('aria-label', 'Unit actions');

        var menuDots = document.createElement('span');
        menuDots.className = 'detail-overflow-dots';
        menuDots.textContent = '\u2026';
        menuTrigger.appendChild(menuDots);

        var menuList = document.createElement('div');
        menuList.className = 'detail-overflow-list';
        menuList.setAttribute('role', 'menu');

        (function (u, mTrigger, mList, mWrap) {
          function setMenuOpen(isOpen) {
            mList.style.display = isOpen ? 'grid' : 'none';
            mTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            window.KaPUI.SetActiveOverflowMenu(mWrap, setMenuOpen, isOpen);
            if (isOpen) {
              mList.classList.remove('detail-overflow-list--up');
              if (window.KaPUI.ShouldOpenOverflowUp(mTrigger, mList)) {
                mList.classList.add('detail-overflow-list--up');
              }
            }
          }

          setMenuOpen(false);

          var menuActions = [
            {
              label: 'Edit',
              isDanger: false,
              onClick: async function () {
                var allUnits = await window.KaPRecipesService.getAllUnitOfMeasures({ includeInactive: true });
                var knownGroups = getGroupOrder(allUnits);
                var result = await window.KaPUI.ShowEditUnitModal({
                  unit: u,
                  groups: knownGroups,
                  updateUnitOfMeasure: function (id, updates) {
                    return window.KaPRecipesService.updateUnitOfMeasure(id, updates);
                  }
                });
                if (result) { await renderBodyInto(bodyWrap); }
              }
            },
            {
              label: 'Remove',
              isDanger: true,
              onClick: async function () {
                var confirmed = await window.KaPUI.ShowConfirm({
                  title: 'Remove Unit',
                  message: 'Remove "' + u.name + '"?',
                  confirmLabel: 'Remove',
                  isDanger: true
                });
                if (!confirmed) { return; }
                await window.KaPRecipesService.deleteUnitOfMeasure(u.id);
                await renderBodyInto(bodyWrap);
              }
            }
          ];

          menuActions.forEach(function (action) {
            var item = document.createElement('button');
            item.type = 'button';
            item.className = 'detail-overflow-item' + (action.isDanger ? ' detail-overflow-item--danger' : '');
            item.textContent = action.label;
            item.setAttribute('role', 'menuitem');
            item.addEventListener('click', function () {
              setMenuOpen(false);
              action.onClick();
            });
            mList.appendChild(item);
          });

          mTrigger.addEventListener('click', function (event) {
            event.stopPropagation();
            var isOpen = mList.style.display !== 'none';
            setMenuOpen(!isOpen);
          });
        })(unit, menuTrigger, menuList, menuWrap);

        menuWrap.appendChild(menuTrigger);
        menuWrap.appendChild(menuList);
        rowActions.appendChild(menuWrap);

        row.appendChild(rowActions);
        groupSection.appendChild(row);
      });

      if (groupUnits.length === 0) {
        var groupEmptyRow = document.createElement('div');
        groupEmptyRow.className = 'uom-group-empty-row';
        groupEmptyRow.textContent = 'No units of measure in this group.';
        groupSection.appendChild(groupEmptyRow);
      }

      bodyWrap.appendChild(groupSection);
    });
  }

  async function renderInto(container, hooks) {
    var section = document.createElement('section');
    section.className = 'uom-shell';

    var header = document.createElement('div');
    header.className = 'detail-header uom-header';

    if (hooks && typeof hooks.onBack === 'function') {
      var backButton = document.createElement('button');
      backButton.type = 'button';
      backButton.className = 'detail-back-button';
      backButton.textContent = '\u2190 Back';
      backButton.addEventListener('click', hooks.onBack);
      header.appendChild(backButton);
    }

    var heading = document.createElement('h2');
    heading.className = 'detail-title';
    heading.textContent = 'Units of Measure';
    header.appendChild(heading);

    var headerActions = document.createElement('div');
    headerActions.className = 'detail-actions';

    var addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'record-action-button uom-add-button';
    addButton.textContent = '+ Add Unit';
    addButton.addEventListener('click', async function () {
      var allUnits = await window.KaPRecipesService.getAllUnitOfMeasures({ includeInactive: true });
      var knownGroups = getGroupOrder(allUnits);
      var created = await window.KaPUI.ShowCreateUnitModal({
        groups: knownGroups,
        createUnitOfMeasure: function (name, abbr, group, behavior, step) {
          return window.KaPRecipesService.createUnitOfMeasure(name, abbr, group, behavior, step);
        }
      });
      if (created) {
        await renderBodyInto(bodyWrap);
      }
    });
    headerActions.appendChild(addButton);

    var addGroupButton = document.createElement('button');
    addGroupButton.type = 'button';
    addGroupButton.className = 'record-action-button uom-add-button';
    addGroupButton.textContent = '+ Add Group';
    addGroupButton.addEventListener('click', async function () {
      var newName = await window.KaPUI.ShowPrompt({
        title: 'New Group',
        placeholder: 'Group name',
        confirmLabel: 'Add'
      });
      if (!newName) { return; }
      var trimmed = String(newName).trim();
      if (!trimmed) { return; }
      var currentOrder = window.KaPSettings.get(window.KaPSettings.KEYS.UOM_GROUP_ORDER) || [];
      if (currentOrder.some(function (g) { return g.toLowerCase() === trimmed.toLowerCase(); })) { return; }
      saveGroupOrder(currentOrder.concat([trimmed]));
      await renderBodyInto(bodyWrap);
    });
    headerActions.appendChild(addGroupButton);

    header.appendChild(headerActions);

    section.appendChild(header);

    var bodyWrap = document.createElement('div');
    bodyWrap.className = 'uom-body';
    await renderBodyInto(bodyWrap);
    section.appendChild(bodyWrap);

    container.replaceChildren(section);
  }

  window.KaPUomPage = {
    renderInto: renderInto
  };
})();
