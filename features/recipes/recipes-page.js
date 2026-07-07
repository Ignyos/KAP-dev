(function () {
  var VERSION_ACCORDION_STATE_KEY = 'kap.recipeVersionAccordionState';
  var DESCRIPTION_ACCORDION_STATE_KEY = 'kap.recipeDescriptionAccordionState';
  var TAGS_ACCORDION_STATE_KEY = 'kap.recipeTagsAccordionState';
  var VERSION_SECTION_VISIBLE_KEY = 'kap.recipeVersionSectionVisible';
  var DESCRIPTION_SECTION_VISIBLE_KEY = 'kap.recipeDescriptionSectionVisible';
  var TAGS_SECTION_VISIBLE_KEY = 'kap.recipeTagsSectionVisible';
  var BATCH_SIZE_STATE_KEY = 'kap.recipeBatchSizeState';
  var LAST_VIEWED_VERSION_KEY = 'kap.recipeLastViewedVersion';
  var DETAILS_ACTIVE_SECTION_KEY = 'kap.recipeDetailsActiveSection';
  var DETAILS_COLLAPSED_KEY = 'kap.recipeDetailsCollapsed';
  var DETAILS_SECTION_INFORMATION = 'information';
  var DETAILS_SECTION_DESCRIPTION = 'description';
  var DETAILS_SECTION_VERSIONS = 'versions';
  var DETAILS_SECTION_TAGS = 'tags';
  var versionNoteFocusTargets = {};

  async function showError(message) {
    await window.KaPUI.ShowAlert({ title: 'Error', message: message });
  }

  function sanitizeFilePart(value, fallback) {
    var sanitized = String(value || '')
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!sanitized) {
      return fallback || 'value';
    }

    return sanitized;
  }

  function getRecipeExportBaseName(recipeName, versionName) {
    var safeRecipeName = sanitizeFilePart(recipeName, 'recipe');
    var safeVersionName = sanitizeFilePart(versionName, 'version');
    return safeRecipeName + '_' + safeVersionName;
  }

  function getGreatestCommonDivisor(a, b) {
    var x = Math.abs(Math.round(a));
    var y = Math.abs(Math.round(b));

    while (y) {
      var temp = y;
      y = x % y;
      x = temp;
    }

    return x || 1;
  }

  function formatNumericQuantityAsFraction(value) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '';
    }

    var sign = numeric < 0 ? '-' : '';
    var absolute = Math.abs(numeric);
    var whole = Math.floor(absolute);
    var remainder = absolute - whole;
    var tolerance = 0.0001;

    if (remainder <= tolerance) {
      return sign + String(whole);
    }

    if (Math.abs(1 - remainder) <= tolerance) {
      return sign + String(whole + 1);
    }

    var bestNumerator = 0;
    var bestDenominator = 1;
    var bestError = Number.POSITIVE_INFINITY;
    var denominator = 0;

    for (denominator = 2; denominator <= 16; denominator += 1) {
      var numerator = Math.round(remainder * denominator);
      if (numerator <= 0 || numerator >= denominator) {
        continue;
      }

      var error = Math.abs(remainder - (numerator / denominator));
      if (error < bestError) {
        bestError = error;
        bestNumerator = numerator;
        bestDenominator = denominator;
      }
    }

    if (!Number.isFinite(bestError) || bestError > 0.02) {
      return sign + numeric.toFixed(3).replace(/\.?0+$/, '');
    }

    var divisor = getGreatestCommonDivisor(bestNumerator, bestDenominator);
    bestNumerator = bestNumerator / divisor;
    bestDenominator = bestDenominator / divisor;

    if (whole <= 0) {
      return sign + String(bestNumerator) + '/' + String(bestDenominator);
    }

    return sign + String(whole) + ' ' + String(bestNumerator) + '/' + String(bestDenominator);
  }

  function getIngredientQuantityText(item) {
    if (item && item.quantityText != null && String(item.quantityText).trim() !== '') {
      return String(item.quantityText).trim();
    }

    if (item && item.quantityValue != null && !Number.isNaN(Number(item.quantityValue))) {
      return formatNumericQuantityAsFraction(item.quantityValue);
    }

    if (item && item.quantity != null && String(item.quantity).trim() !== '') {
      var rawQuantity = String(item.quantity).trim();
      if (/^-?(?:\d+|\d*\.\d+)$/.test(rawQuantity) && !Number.isNaN(Number(rawQuantity))) {
        return formatNumericQuantityAsFraction(Number(rawQuantity));
      }

      return rawQuantity;
    }

    return '';
  }

  function formatScaledQuantityText(baseQuantityText, baseQuantityValue, batchSize) {
    if (baseQuantityValue == null) {
      return null;
    }

    var scaled = Number(baseQuantityValue) * Number(batchSize);
    if (!Number.isFinite(scaled)) {
      return null;
    }

    if (Number(batchSize) === 1 && baseQuantityText) {
      return String(baseQuantityText).trim() || null;
    }

    return formatNumericQuantityAsFraction(scaled);
  }

  function getRecipeBatchSizeState() {
    try {
      var raw = localStorage.getItem(BATCH_SIZE_STATE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeRecipeBatchSizeState(state) {
    try {
      localStorage.setItem(BATCH_SIZE_STATE_KEY, JSON.stringify(state || {}));
    } catch (error) {
      // Ignore session persistence failures.
    }
  }

  function getRecipeBatchSize(recipeId, versionId) {
    var state = getRecipeBatchSizeState();
    var key = String(recipeId || '') + '::' + String(versionId || '');
    var value = state[key];
    var numeric = Number(value);

    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 1;
    }

    return numeric;
  }

  function setRecipeBatchSize(recipeId, versionId, batchSize) {
    var state = getRecipeBatchSizeState();
    var key = String(recipeId || '') + '::' + String(versionId || '');
    state[key] = Number(batchSize) > 0 ? Number(batchSize) : 1;
    writeRecipeBatchSizeState(state);
  }

  function buildBatchScaledDetailItem(detailItem, batchSize) {
    var baseQuantityValue = detailItem.quantityValue != null
      ? detailItem.quantityValue
      : (detailItem.quantity != null ? detailItem.quantity : null);

    return Object.assign({}, detailItem, {
      displayQuantityValue: baseQuantityValue == null ? null : Number(baseQuantityValue) * Number(batchSize),
      displayQuantityText: formatScaledQuantityText(detailItem.quantityText, baseQuantityValue, batchSize),
      displayUomAbbreviation: detailItem.uomAbbreviation || detailItem.unitOfMeasureAbbreviation || null
    });
  }

  function buildIngredientDisplayLine(item) {
    var quantity = getIngredientQuantityText(item);
    var uom = '';
    if (item && item.uomAbbreviation) {
      uom = String(item.uomAbbreviation).trim();
    } else if (item && item.unitOfMeasureAbbreviation) {
      uom = String(item.unitOfMeasureAbbreviation).trim();
    }
    var name = item && item.name ? String(item.name).trim() : 'Unnamed ingredient';
    var optionalSuffix = item && item.isOptional === true ? ' (optional)' : '';
    var prefix = '';

    if (quantity && uom) {
      prefix = quantity + ' ' + uom + ' ';
    } else if (quantity) {
      prefix = quantity + ' ';
    } else if (uom) {
      prefix = uom + ' ';
    }

    return prefix + name + optionalSuffix;
  }

  function normalizeInstructionIngredientRefs(instruction) {
    var seen = {};
    return (Array.isArray(instruction && instruction.ingredientRefs) ? instruction.ingredientRefs : []).map(function (itemId) {
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

    var durationSeconds = Number(timer.durationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return null;
    }

    return {
      durationSeconds: Math.floor(durationSeconds),
      label: String(timer.label || '').trim()
    };
  }

  function formatStepTimerDuration(durationSeconds) {
    var totalSeconds = Number(durationSeconds);
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
      return '';
    }

    totalSeconds = Math.floor(totalSeconds);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    var parts = [];

    if (hours > 0) {
      parts.push(String(hours) + 'h');
    }
    if (minutes > 0) {
      parts.push(String(minutes) + 'm');
    }
    if (seconds > 0 || parts.length === 0) {
      parts.push(String(seconds) + 's');
    }

    return parts.join(' ');
  }

  function buildStepEditorIngredientOptions(detailItems, instructions, currentInstructionId) {
    var usedByOtherSteps = {};
    (instructions || []).forEach(function (instruction) {
      if (instruction && instruction.id === currentInstructionId) {
        return;
      }

      normalizeInstructionIngredientRefs(instruction).forEach(function (itemId) {
        usedByOtherSteps[itemId] = true;
      });
    });

    var seen = {};
    return sortByNameAscending((detailItems || []).filter(function (detailItem) {
      var itemId = String(detailItem && detailItem.itemId || '').trim();
      if (!itemId || seen[itemId]) {
        return false;
      }

      seen[itemId] = true;
      return true;
    }).map(function (detailItem) {
      var displayLine = buildIngredientDisplayLine(detailItem);
      var name = String(detailItem.name || '').trim() || displayLine;
      return {
        itemId: String(detailItem.itemId || '').trim(),
        name: name,
        meta: displayLine !== name ? displayLine : '',
        isUsedElsewhere: usedByOtherSteps[String(detailItem.itemId || '').trim()] === true
      };
    }));
  }

  function buildStepDraftFromInstruction(instruction) {
    return {
      text: String(instruction && instruction.text || ''),
      ingredientRefs: normalizeInstructionIngredientRefs(instruction),
      timer: normalizeInstructionTimer(instruction && instruction.timer)
    };
  }

  async function showStepEditor(detailItems, instructions, currentInstruction, title, confirmLabel) {
    return window.KaPUI.ShowStepEditorModal({
      title: title,
      confirmLabel: confirmLabel,
      placeholder: 'Describe this cooking step',
      initialStep: buildStepDraftFromInstruction(currentInstruction),
      ingredients: buildStepEditorIngredientOptions(detailItems, instructions, currentInstruction && currentInstruction.id),
      overlapWarningMessage: 'Some selected ingredients are already used in other steps.'
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildRecipeInformationForExport(recipeRecord) {
    var info = getRecipeInformation(recipeRecord || {});
    return {
      prepMinutes: info.prepMinutes,
      cookMinutes: info.cookMinutes,
      additionalMinutes: info.additionalMinutes,
      servings: info.servings,
      yield: info.yield
    };
  }

  function buildRecipeExportPayload(recipeRecord, activeVersion, detailItems, instructions, tags) {
    var exportedAt = new Date().toISOString();
    var versionId = activeVersion && activeVersion.id != null ? String(activeVersion.id) : '';
    var versionName = activeVersion && activeVersion.versionName ? String(activeVersion.versionName) : '';

    return {
      exportType: 'recipe-version',
      schemaVersion: 1,
      exportedAt: exportedAt,
      recipe: {
        id: recipeRecord && recipeRecord.id != null ? String(recipeRecord.id) : '',
        name: recipeRecord && recipeRecord.name ? String(recipeRecord.name) : '',
        tags: Array.isArray(tags) ? tags.slice() : [],
        information: buildRecipeInformationForExport(recipeRecord)
      },
      version: {
        id: versionId,
        name: versionName,
        createdDate: activeVersion && activeVersion.createdDate ? String(activeVersion.createdDate) : '',
        updatedDate: activeVersion && activeVersion.updatedDate ? String(activeVersion.updatedDate) : ''
      },
      ingredients: (detailItems || []).map(function (item) {
        return {
          id: item && item.id != null ? String(item.id) : '',
          itemId: item && item.itemId != null ? String(item.itemId) : '',
          name: item && item.name ? String(item.name) : '',
          quantityValue: item && item.quantityValue != null ? item.quantityValue : (item ? item.quantity : null),
          quantityText: item && item.quantityText != null ? String(item.quantityText) : '',
          unitOfMeasureId: item && item.unitOfMeasureId != null ? String(item.unitOfMeasureId) : '',
          unitOfMeasureAbbreviation: item && item.uomAbbreviation ? String(item.uomAbbreviation) : '',
          isOptional: item && item.isOptional === true,
          description: item && item.description ? String(item.description) : ''
        };
      }),
      instructions: (instructions || []).map(function (step) {
        return {
          id: step && step.id != null ? String(step.id) : '',
          stepNumber: step && step.stepNumber != null ? Number(step.stepNumber) : null,
          text: step && step.text ? String(step.text) : '',
          ingredientRefs: normalizeInstructionIngredientRefs(step),
          timer: normalizeInstructionTimer(step && step.timer)
        };
      })
    };
  }

  function buildRecipeExportText(payload) {
    var lines = [];
    var recipeName = payload && payload.recipe ? payload.recipe.name : 'Recipe';
    var versionName = payload && payload.version ? payload.version.name : '';

    lines.push(String(recipeName || 'Recipe'));
    if (versionName) {
      lines.push('Version: ' + versionName);
    }

    if (payload && Array.isArray(payload.recipe.tags) && payload.recipe.tags.length > 0) {
      lines.push('Tags: ' + payload.recipe.tags.join(', '));
    }

    var info = payload && payload.recipe ? payload.recipe.information : null;
    if (info) {
      var hasInfo = info.prepMinutes != null
        || info.cookMinutes != null
        || info.additionalMinutes != null
        || String(info.servings || '').trim() !== ''
        || String(info.yield || '').trim() !== '';

      if (hasInfo) {
        var hasDuration = info.prepMinutes != null || info.cookMinutes != null || info.additionalMinutes != null;
        var totalMinutes = hasDuration ? ((info.prepMinutes || 0) + (info.cookMinutes || 0) + (info.additionalMinutes || 0)) : null;
        lines.push('');
        lines.push('Information');
        lines.push('- Prep Time: ' + (formatDurationFromMinutes(info.prepMinutes) || 'Not set'));
        lines.push('- Cook Time: ' + (formatDurationFromMinutes(info.cookMinutes) || 'Not set'));
        lines.push('- Additional Time: ' + (formatDurationFromMinutes(info.additionalMinutes) || 'Not set'));
        lines.push('- Total Time: ' + (formatDurationFromMinutes(totalMinutes) || 'Not set'));
        lines.push('- Servings: ' + (String(info.servings || '').trim() || 'Not set'));
        lines.push('- Yield: ' + (String(info.yield || '').trim() || 'Not set'));
      }
    }

    lines.push('');
    lines.push('Ingredients');

    if (payload && Array.isArray(payload.ingredients) && payload.ingredients.length > 0) {
      payload.ingredients.forEach(function (ingredient) {
        lines.push('- ' + buildIngredientDisplayLine(ingredient));
      });
    } else {
      lines.push('- None');
    }

    lines.push('');
    lines.push('Instructions');

    if (payload && Array.isArray(payload.instructions) && payload.instructions.length > 0) {
      payload.instructions.forEach(function (instruction, index) {
        var number = instruction && instruction.stepNumber != null
          ? instruction.stepNumber
          : (index + 1);
        lines.push(String(number) + '. ' + String((instruction && instruction.text) || ''));
      });
    } else {
      lines.push('1. No instructions.');
    }

    return lines.join('\n');
  }

  function buildRecipeExportPrintHtml(payload, pdfFileName) {
    var text = buildRecipeExportText(payload);
    return [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      '<title>' + escapeHtml(pdfFileName) + '</title>',
      '<style>',
      'body { font-family: "Segoe UI", Tahoma, sans-serif; margin: 24px; color: #111; }',
      'h1 { margin: 0 0 12px 0; font-size: 24px; }',
      'pre { white-space: pre-wrap; line-height: 1.4; font-size: 14px; margin: 0; }',
      '</style>',
      '</head>',
      '<body>',
      '<pre>' + escapeHtml(text) + '</pre>',
      '<script>setTimeout(function(){ window.print(); }, 120);<\/script>',
      '</body>',
      '</html>'
    ].join('');
  }

  function downloadTextFile(fileName, textContent, mimeType) {
    var blob = new Blob([String(textContent || '')], {
      type: mimeType || 'text/plain;charset=utf-8'
    });
    var link = document.createElement('a');
    var objectUrl = URL.createObjectURL(blob);

    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(function () {
      URL.revokeObjectURL(objectUrl);
    }, 0);
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }

    var temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', 'readonly');
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    temp.focus();
    temp.select();

    var copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }

    document.body.removeChild(temp);

    if (!copied) {
      throw new Error('Clipboard copy is not available in this browser session.');
    }
  }

  async function exportRecipeVersion(record, activeVersion, detailItems, instructions, tags) {
    var versionName = activeVersion && activeVersion.versionName
      ? activeVersion.versionName
      : 'version';
    var baseName = getRecipeExportBaseName(record && record.name, versionName);
    var payload = buildRecipeExportPayload(record, activeVersion, detailItems, instructions, tags);

    var exportFormat = await window.KaPUI.ShowRecipeExportModal({
      title: 'Export Recipe',
      confirmLabel: 'Export',
      defaultFormat: 'kap',
      pdfDescription: 'Create printable file as ' + baseName + '.pdf',
      textDescription: 'Copy readable text to clipboard for messages and email.',
      kapDescription: 'Download recipe data as ' + baseName + '.kap'
    });

    if (!exportFormat) {
      return;
    }

    if (exportFormat === 'kap') {
      downloadTextFile(baseName + '.kap', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
      window.KaPUI.ShowTimedNotice({
        title: 'Export Complete',
        message: 'Downloaded ' + baseName + '.kap',
        durationMs: 3000
      });
      return;
    }

    if (exportFormat === 'text') {
      await copyTextToClipboard(buildRecipeExportText(payload));
      window.KaPUI.ShowTimedNotice({
        title: 'Copied',
        message: 'Recipe text copied to clipboard.',
        durationMs: 3000
      });
      return;
    }

    if (exportFormat === 'pdf') {
      var printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Popup blocked. Allow popups to export PDF.');
      }

      printWindow.document.open();
      printWindow.document.write(buildRecipeExportPrintHtml(payload, baseName + '.pdf'));
      printWindow.document.close();

      window.KaPUI.ShowTimedNotice({
        title: 'PDF Export Ready',
        message: 'Use Save as PDF in the print dialog and name the file ' + baseName + '.pdf',
        durationMs: 3000
      });
    }
  }

  function asTrimmedString(value) {
    return String(value == null ? '' : value).trim();
  }

  function asOptionalString(value) {
    var trimmed = asTrimmedString(value);
    return trimmed || '';
  }

  function asOptionalNumber(value) {
    if (value == null || value === '') {
      return null;
    }

    var numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizeTagListForImport(tags) {
    var source = Array.isArray(tags) ? tags : [];
    var seen = {};
    var normalized = [];

    for (var i = 0; i < source.length; i++) {
      var tag = asTrimmedString(source[i]).toLowerCase();
      if (!tag || seen[tag]) {
        continue;
      }

      seen[tag] = true;
      normalized.push(tag);
    }

    return normalized;
  }

  function normalizeImportedIngredients(rawIngredients) {
    var ingredients = Array.isArray(rawIngredients) ? rawIngredients : [];

    return ingredients.map(function (ingredient, index) {
      var id = asTrimmedString(ingredient && ingredient.id) || window.KaPIds.NewId();
      var itemId = asTrimmedString(ingredient && ingredient.itemId) || window.KaPIds.NewId();
      var quantityValue = asOptionalNumber(ingredient && ingredient.quantityValue);
      var quantityText = asOptionalString(ingredient && ingredient.quantityText);

      return {
        id: id,
        itemId: itemId,
        name: asTrimmedString(ingredient && ingredient.name) || ('Imported ingredient ' + String(index + 1)),
        quantityValue: quantityValue,
        quantityText: quantityText,
        unitOfMeasureId: asOptionalString(ingredient && ingredient.unitOfMeasureId),
        unitOfMeasureAbbreviation: asOptionalString(ingredient && ingredient.unitOfMeasureAbbreviation),
        description: asOptionalString(ingredient && ingredient.description),
        isOptional: ingredient && ingredient.isOptional === true
      };
    });
  }

  function normalizeImportedInstructions(rawInstructions) {
    var instructions = Array.isArray(rawInstructions) ? rawInstructions : [];

    return instructions.map(function (instruction, index) {
      var stepNumber = asOptionalNumber(instruction && instruction.stepNumber);
      var timer = normalizeInstructionTimer(instruction && instruction.timer);
      if (instruction && instruction.timer && !timer) {
        throw new Error('Instruction timer duration must be greater than zero.');
      }

      return {
        id: asTrimmedString(instruction && instruction.id) || window.KaPIds.NewId(),
        stepNumber: stepNumber == null ? (index + 1) : stepNumber,
        text: asTrimmedString(instruction && instruction.text),
        ingredientRefs: normalizeInstructionIngredientRefs(instruction),
        timer: timer
      };
    }).filter(function (instruction) {
      return !!instruction.text;
    }).sort(function (a, b) {
      return Number(a.stepNumber || 0) - Number(b.stepNumber || 0);
    }).map(function (instruction, index) {
      instruction.stepNumber = index + 1;
      return instruction;
    });
  }

  function normalizeImportedRecipeInformation(rawInformation) {
    var source = rawInformation && typeof rawInformation === 'object' ? rawInformation : {};
    return {
      prepMinutes: normalizeMinutesValue(source.prepMinutes),
      cookMinutes: normalizeMinutesValue(source.cookMinutes),
      additionalMinutes: normalizeMinutesValue(source.additionalMinutes),
      servings: asOptionalString(source.servings),
      yield: asOptionalString(source.yield)
    };
  }

  function validateKapRecipePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid .kap file.');
    }

    if (String(payload.exportType || '') !== 'recipe-version') {
      throw new Error('Unsupported .kap file type.');
    }

    if (!payload.recipe || !payload.version) {
      throw new Error('.kap file is missing recipe/version data.');
    }

    var recipeId = asTrimmedString(payload.recipe.id);
    var versionId = asTrimmedString(payload.version.id);
    if (!recipeId || !versionId) {
      throw new Error('.kap file must include recipe id and version id.');
    }

    var recipeName = asTrimmedString(payload.recipe.name);
    var versionName = asTrimmedString(payload.version.name);
    if (!recipeName || !versionName) {
      throw new Error('.kap file must include recipe and version names.');
    }

    var ingredients = normalizeImportedIngredients(payload.ingredients);
    var instructions = normalizeImportedInstructions(payload.instructions);

    return {
      schemaVersion: Number(payload.schemaVersion || 1),
      exportedAt: asOptionalString(payload.exportedAt),
      recipe: {
        id: recipeId,
        name: recipeName,
        tags: normalizeTagListForImport(payload.recipe.tags),
        information: normalizeImportedRecipeInformation(payload.recipe.information)
      },
      version: {
        id: versionId,
        name: versionName,
        createdDate: asOptionalString(payload.version.createdDate),
        updatedDate: asOptionalString(payload.version.updatedDate)
      },
      ingredients: ingredients,
      instructions: instructions
    };
  }

  function toTimestampMs(value) {
    var raw = asOptionalString(value);
    if (!raw) {
      return null;
    }

    var parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function countActiveRecipeDerivedLists(recipeId, versionId) {
    var allRecords = await window.KaPDB.readAll(window.KaPStores.STORE_NAMES.LIST_RECORDS);
    var targetRecipeId = asTrimmedString(recipeId);
    var targetVersionId = asTrimmedString(versionId);

    var active = allRecords.filter(function (record) {
      if (!record || String(record.type || '') !== 'List') {
        return false;
      }

      if (String(record.sourceKind || '') !== 'recipe') {
        return false;
      }

      if (asTrimmedString(record.sourceRecipeId) !== targetRecipeId) {
        return false;
      }

      if (asTrimmedString(record.sourceRecipeVersionId) !== targetVersionId) {
        return false;
      }

      if (record.isDeleted === true) {
        return false;
      }

      if (record.deletedDate && asTrimmedString(record.deletedDate)) {
        return false;
      }

      return true;
    });

    return active.length;
  }

  function pickKapFile() {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.kap,application/json';
      input.style.display = 'none';

      function cleanup() {
        input.removeEventListener('change', onChange);
        if (input.parentNode) {
          document.body.removeChild(input);
        }
      }

      function onChange() {
        var file = input.files && input.files[0] ? input.files[0] : null;
        cleanup();
        resolve(file);
      }

      input.addEventListener('change', onChange);
      document.body.appendChild(input);
      input.click();
    });
  }

  async function parseKapFile(file) {
    if (!file) {
      return null;
    }

    var fileName = asTrimmedString(file.name).toLowerCase();
    if (fileName && fileName.lastIndexOf('.kap') < 0) {
      throw new Error('Only .kap files are supported for recipe import.');
    }

    var text = await file.text();
    var payload = JSON.parse(text);
    return validateKapRecipePayload(payload);
  }

  async function readRecipeVersionScope(importDraft) {
    var recipeRecord = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.LIST_RECORDS, importDraft.recipe.id);
    var versionRecord = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, importDraft.version.id);
    var hasRecipe = !!(recipeRecord && recipeRecord.type === 'Recipe');
    var hasVersion = !!(versionRecord && versionRecord.recipeId === importDraft.recipe.id);

    return {
      recipeRecord: hasRecipe ? recipeRecord : null,
      versionRecord: hasVersion ? versionRecord : null,
      hasMatch: hasRecipe && hasVersion
    };
  }

  function normalizeImportedIngredientForCompare(ingredient, recipeId) {
    return {
      id: asTrimmedString(ingredient && ingredient.id),
      listRecordId: asTrimmedString(recipeId),
      itemId: asTrimmedString(ingredient && ingredient.itemId),
      name: asTrimmedString(ingredient && ingredient.name),
      quantityValue: asOptionalNumber(ingredient && ingredient.quantityValue),
      quantityText: asOptionalString(ingredient && ingredient.quantityText),
      unitOfMeasureId: asOptionalString(ingredient && ingredient.unitOfMeasureId),
      description: asOptionalString(ingredient && ingredient.description),
      isOptional: ingredient && ingredient.isOptional === true
    };
  }

  function normalizeExistingIngredientForCompare(existing) {
    var quantityValue = existing && existing.quantityValue != null
      ? asOptionalNumber(existing.quantityValue)
      : asOptionalNumber(existing && existing.quantity);

    return {
      id: asTrimmedString(existing && existing.id),
      listRecordId: asTrimmedString(existing && existing.listRecordId),
      itemId: asTrimmedString(existing && existing.itemId),
      name: asTrimmedString(existing && existing.name),
      quantityValue: quantityValue,
      quantityText: asOptionalString(existing && existing.quantityText),
      unitOfMeasureId: asOptionalString(existing && existing.unitOfMeasureId),
      description: asOptionalString(existing && existing.description),
      isOptional: existing && existing.isOptional === true
    };
  }

  function areIngredientsEquivalent(existing, incoming, recipeId) {
    var lhs = normalizeExistingIngredientForCompare(existing);
    var rhs = normalizeImportedIngredientForCompare(incoming, recipeId);

    return lhs.id === rhs.id
      && lhs.listRecordId === rhs.listRecordId
      && lhs.itemId === rhs.itemId
      && lhs.name === rhs.name
      && lhs.quantityValue === rhs.quantityValue
      && lhs.quantityText === rhs.quantityText
      && lhs.unitOfMeasureId === rhs.unitOfMeasureId
      && lhs.description === rhs.description
      && lhs.isOptional === rhs.isOptional;
  }

  function normalizeImportedInstructionForCompare(instruction, recipeId, stepNumber) {
    return {
      id: asTrimmedString(instruction && instruction.id),
      recipeId: asTrimmedString(recipeId),
      stepNumber: Number(stepNumber || 0),
      text: asTrimmedString(instruction && instruction.text),
      ingredientRefs: normalizeInstructionIngredientRefs(instruction),
      timer: normalizeInstructionTimer(instruction && instruction.timer)
    };
  }

  function normalizeExistingInstructionForCompare(instruction) {
    return {
      id: asTrimmedString(instruction && instruction.id),
      recipeId: asTrimmedString(instruction && instruction.recipeId),
      stepNumber: Number(instruction && instruction.stepNumber || 0),
      text: asTrimmedString(instruction && instruction.text),
      ingredientRefs: normalizeInstructionIngredientRefs(instruction),
      timer: normalizeInstructionTimer(instruction && instruction.timer)
    };
  }

  function areInstructionsEquivalent(existing, incoming, recipeId, stepNumber) {
    var lhs = normalizeExistingInstructionForCompare(existing);
    var rhs = normalizeImportedInstructionForCompare(incoming, recipeId, stepNumber);

    return lhs.id === rhs.id
      && lhs.recipeId === rhs.recipeId
      && lhs.stepNumber === rhs.stepNumber
      && lhs.text === rhs.text
      && JSON.stringify(lhs.ingredientRefs) === JSON.stringify(rhs.ingredientRefs)
      && JSON.stringify(lhs.timer) === JSON.stringify(rhs.timer);
  }

  function findDuplicateIds(records, selector) {
    var seen = {};
    var duplicates = [];

    for (var i = 0; i < records.length; i++) {
      var id = asTrimmedString(selector(records[i]));
      if (!id) {
        continue;
      }

      if (seen[id]) {
        duplicates.push(id);
      } else {
        seen[id] = true;
      }
    }

    return duplicates;
  }

  async function buildIngredientNameConflicts(importDraft, scope) {
    var conflicts = [];
    if (scope.hasMatch) {
      return conflicts;
    }

    for (var i = 0; i < importDraft.ingredients.length; i++) {
      var ingredient = importDraft.ingredients[i];
      var itemId = asTrimmedString(ingredient.itemId);
      if (!itemId) {
        continue;
      }

      var existingItem = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.ITEMS, itemId);
      if (!existingItem) {
        continue;
      }

      var existingName = asTrimmedString(existingItem.name);
      var incomingName = asTrimmedString(ingredient.name);
      if (!existingName || !incomingName || existingName.toLowerCase() === incomingName.toLowerCase()) {
        continue;
      }

      conflicts.push({
        ingredientId: itemId,
        existingName: existingName,
        incomingName: incomingName
      });
    }

    return conflicts;
  }

  async function buildImportPreflight(importDraft, scope, ingredientConflicts) {
    var preflight = {
      target: {
        recipeId: importDraft.recipe.id,
        recipeName: importDraft.recipe.name,
        versionId: importDraft.version.id,
        versionName: importDraft.version.name
      },
      versionConflictStatus: scope.hasMatch ? 'same_or_unknown' : 'new_version',
      versionConflictDetail: '',
      ingredientCounts: {
        newCount: 0,
        overwriteCount: 0,
        unchangedCount: 0
      },
      instructionCounts: {
        newCount: 0,
        overwriteCount: 0,
        unchangedCount: 0
      },
      ingredientConflictCount: Array.isArray(ingredientConflicts) ? ingredientConflicts.length : 0,
      recipeDerivedListsPreservedCount: 0,
      blockingErrors: [],
      warnings: []
    };

    preflight.recipeDerivedListsPreservedCount = await countActiveRecipeDerivedLists(importDraft.recipe.id, importDraft.version.id);

    var ingredientIdDuplicates = findDuplicateIds(importDraft.ingredients, function (ingredient) {
      return ingredient && ingredient.id;
    });
    if (ingredientIdDuplicates.length > 0) {
      preflight.blockingErrors.push('Duplicate ingredient ids in .kap payload.');
    }

    var instructionIdDuplicates = findDuplicateIds(importDraft.instructions, function (instruction) {
      return instruction && instruction.id;
    });
    if (instructionIdDuplicates.length > 0) {
      preflight.blockingErrors.push('Duplicate instruction ids in .kap payload.');
    }

    if (importDraft.ingredients.length === 0) {
      preflight.warnings.push('No ingredients were found in this .kap file.');
    }

    if (importDraft.instructions.length === 0) {
      preflight.warnings.push('No instructions were found in this .kap file.');
    }

    for (var i = 0; i < importDraft.ingredients.length; i++) {
      var incomingIngredient = importDraft.ingredients[i];
      var existingIngredient = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, incomingIngredient.id);

      if (!existingIngredient) {
        preflight.ingredientCounts.newCount += 1;
        continue;
      }

      if (areIngredientsEquivalent(existingIngredient, incomingIngredient, importDraft.recipe.id)) {
        preflight.ingredientCounts.unchangedCount += 1;
      } else {
        preflight.ingredientCounts.overwriteCount += 1;
      }
    }

    for (var j = 0; j < importDraft.instructions.length; j++) {
      var incomingInstruction = importDraft.instructions[j];
      var existingInstruction = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS, incomingInstruction.id);

      if (!existingInstruction) {
        preflight.instructionCounts.newCount += 1;
        continue;
      }

      if (areInstructionsEquivalent(existingInstruction, incomingInstruction, importDraft.recipe.id, j + 1)) {
        preflight.instructionCounts.unchangedCount += 1;
      } else {
        preflight.instructionCounts.overwriteCount += 1;
      }
    }

    if (scope.hasMatch) {
      preflight.warnings.push('This recipe version already exists. Import will update that version with the incoming file data.');

      var existingUpdatedMs = toTimestampMs(scope.versionRecord && scope.versionRecord.updatedDate);
      var importedUpdatedMs = toTimestampMs(importDraft.version.updatedDate) || toTimestampMs(importDraft.exportedAt);

      if (existingUpdatedMs != null && importedUpdatedMs != null) {
        if (importedUpdatedMs < existingUpdatedMs) {
          preflight.versionConflictStatus = 'older';
          preflight.versionConflictDetail = 'Imported version timestamp is older than local version timestamp.';
        } else if (importedUpdatedMs > existingUpdatedMs) {
          preflight.versionConflictStatus = 'newer';
          preflight.versionConflictDetail = 'Imported version timestamp is newer than local version timestamp.';
        } else {
          preflight.versionConflictStatus = 'same';
          preflight.versionConflictDetail = 'Imported and local version timestamps match.';
        }
      }

      if (preflight.ingredientCounts.newCount === 0
        && preflight.ingredientCounts.overwriteCount === 0
        && preflight.instructionCounts.newCount === 0
        && preflight.instructionCounts.overwriteCount === 0
        && asTrimmedString(importDraft.version.name) === asTrimmedString(scope.versionRecord && scope.versionRecord.versionName)) {
        preflight.versionConflictStatus = 'duplicate';
        preflight.versionConflictDetail = 'Imported payload matches the current recipe/version state.';
        preflight.warnings.push('This file matches what is already saved. No changes are needed.');
      }
    }

    if (preflight.recipeDerivedListsPreservedCount > 0) {
      preflight.warnings.push('Existing grocery lists created from this recipe version will stay as-is: '
        + String(preflight.recipeDerivedListsPreservedCount) + '.');
    }

    return preflight;
  }

  function buildImportPreflightMessage(preflight) {
    var lines = [];
    lines.push('You are importing: ' + preflight.target.recipeName);
    lines.push('Version: ' + preflight.target.versionName);
    lines.push('');
    lines.push('What will change:');
    lines.push('- Ingredients to add: ' + String(preflight.ingredientCounts.newCount));
    lines.push('- Ingredients to update: ' + String(preflight.ingredientCounts.overwriteCount));
    lines.push('- Instructions to add: ' + String(preflight.instructionCounts.newCount));
    lines.push('- Instructions to update: ' + String(preflight.instructionCounts.overwriteCount));

    if (preflight.ingredientConflictCount > 0) {
      lines.push('- Ingredient name decisions needed: ' + String(preflight.ingredientConflictCount));
    }

    if (preflight.recipeDerivedListsPreservedCount > 0) {
      lines.push('- Existing grocery lists kept: ' + String(preflight.recipeDerivedListsPreservedCount));
    }

    if (preflight.versionConflictDetail) {
      lines.push('');
      lines.push('Version note: ' + preflight.versionConflictDetail);
    }

    if (preflight.warnings.length > 0) {
      lines.push('');
      lines.push('Please review:');
      for (var i = 0; i < preflight.warnings.length; i++) {
        lines.push('- ' + preflight.warnings[i]);
      }
    }

    lines.push('');
    lines.push('Important: Applying import will replace matching items in this recipe version.');
    lines.push('There is no automatic undo for this action.');
    return lines.join('\n');
  }

  async function ensureTagRecordByName(tagName) {
    var normalizedTag = asTrimmedString(tagName).toLowerCase();
    if (!normalizedTag) {
      return null;
    }

    var existingMatches = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.TAGS,
      window.KaPStores.INDEX_NAMES.TAGS_BY_NAME,
      normalizedTag
    );

    if (existingMatches && existingMatches[0]) {
      return existingMatches[0];
    }

    var created = {
      id: window.KaPIds.NewId(),
      name: normalizedTag,
      createdDate: new Date().toISOString()
    };
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.TAGS, created);
    return created;
  }

  async function replaceRecipeTagMappings(recipeId, tagNames) {
    var existingMaps = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.RECIPE_TAG_MAP,
      window.KaPStores.INDEX_NAMES.RECIPE_TAG_MAP_BY_RECIPE_ID,
      recipeId
    );

    for (var i = 0; i < existingMaps.length; i++) {
      await window.KaPDB.remove(window.KaPStores.STORE_NAMES.RECIPE_TAG_MAP, existingMaps[i].id);
    }

    var tags = normalizeTagListForImport(tagNames);
    for (var j = 0; j < tags.length; j++) {
      var tagRecord = await ensureTagRecordByName(tags[j]);
      if (!tagRecord) {
        continue;
      }

      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_TAG_MAP, {
        id: window.KaPIds.NewId(),
        recipeId: recipeId,
        tagId: tagRecord.id,
        createdDate: new Date().toISOString()
      });
    }
  }

  async function resolveIngredientNameConflicts(importDraft, conflicts) {
    if (!Array.isArray(conflicts) || conflicts.length === 0) {
      return;
    }

    var applyAllDecision = null;
    for (var i = 0; i < conflicts.length; i++) {
      var conflict = conflicts[i];
      var itemId = asTrimmedString(conflict.ingredientId);
      var ingredient = importDraft.ingredients.find(function (entry) {
        return asTrimmedString(entry && entry.itemId) === itemId;
      });
      if (!ingredient) {
        continue;
      }

      var existingItem = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.ITEMS, itemId);
      if (!existingItem) {
        continue;
      }

      var decision = applyAllDecision;
      if (!decision) {
        var userChoice = await window.KaPUI.ShowIngredientNameConflictPrompt({
          ingredientId: itemId,
          existingName: asTrimmedString(conflict.existingName),
          incomingName: asTrimmedString(conflict.incomingName)
        });

        if (!userChoice || !userChoice.decision) {
          throw new Error('Import cancelled.');
        }

        decision = userChoice.decision;
        if (userChoice.applyToAll === true) {
          applyAllDecision = decision;
        }
      }

      if (decision === 'keep_existing') {
        ingredient.name = asTrimmedString(conflict.existingName);
        continue;
      }

      existingItem.name = asTrimmedString(conflict.incomingName);
      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.ITEMS, existingItem);
    }
  }

  async function upsertRecipeImportData(importDraft, scope) {
    var nowIso = new Date().toISOString();
    var existingRecipe = scope.recipeRecord;
    var recipeRecord = existingRecipe || {
      id: importDraft.recipe.id,
      type: 'Recipe',
      createdDate: nowIso
    };

    recipeRecord.name = importDraft.recipe.name;
    recipeRecord.description = asOptionalString(recipeRecord.description);
    recipeRecord.tags = normalizeTagListForImport(importDraft.recipe.tags);
    setRecipeInformationOnRecord(recipeRecord, importDraft.recipe.information || {});
    recipeRecord.updatedDate = nowIso;
    if (!recipeRecord.createdDate) {
      recipeRecord.createdDate = nowIso;
    }
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORDS, recipeRecord);

    await replaceRecipeTagMappings(recipeRecord.id, recipeRecord.tags);

    var incomingIngredientIds = {};
    for (var i = 0; i < importDraft.ingredients.length; i++) {
      var ingredient = importDraft.ingredients[i];
      incomingIngredientIds[ingredient.id] = true;

      var itemRecord = await window.KaPDB.readByKey(window.KaPStores.STORE_NAMES.ITEMS, ingredient.itemId);
      if (!itemRecord) {
        itemRecord = {
          id: ingredient.itemId,
          name: ingredient.name,
          description: ingredient.description || '',
          categoryId: '',
          categoryName: ''
        };
      }

      itemRecord.name = ingredient.name;
      if (ingredient.description) {
        itemRecord.description = ingredient.description;
      }
      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.ITEMS, itemRecord);

      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, {
        id: ingredient.id,
        listRecordId: recipeRecord.id,
        itemId: ingredient.itemId,
        name: ingredient.name,
        quantity: ingredient.quantityValue,
        quantityValue: ingredient.quantityValue,
        quantityText: ingredient.quantityText || null,
        unitOfMeasureId: ingredient.unitOfMeasureId || null,
        description: ingredient.description || '',
        isOptional: ingredient.isOptional === true
      });
    }

    var existingRecipeItems = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS,
      window.KaPStores.INDEX_NAMES.LIST_RECORD_ITEMS_BY_LIST_RECORD_ID,
      recipeRecord.id
    );
    for (var j = 0; j < existingRecipeItems.length; j++) {
      var existingIngredientRecord = existingRecipeItems[j];
      if (!incomingIngredientIds[existingIngredientRecord.id]) {
        await window.KaPDB.remove(window.KaPStores.STORE_NAMES.LIST_RECORD_ITEMS, existingIngredientRecord.id);
      }
    }

    var incomingInstructionIds = {};
    for (var k = 0; k < importDraft.instructions.length; k++) {
      var instruction = importDraft.instructions[k];
      incomingInstructionIds[instruction.id] = true;
      await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS, {
        id: instruction.id,
        recipeId: recipeRecord.id,
        stepNumber: k + 1,
        text: instruction.text,
        createdDate: nowIso,
        updatedDate: nowIso
      });
    }

    var existingInstructions = await window.KaPDB.readAllFromIndex(
      window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS,
      window.KaPStores.INDEX_NAMES.RECIPE_INSTRUCTIONS_BY_RECIPE_ID,
      recipeRecord.id
    );
    for (var m = 0; m < existingInstructions.length; m++) {
      var existingInstruction = existingInstructions[m];
      if (!incomingInstructionIds[existingInstruction.id]) {
        await window.KaPDB.remove(window.KaPStores.STORE_NAMES.RECIPE_INSTRUCTIONS, existingInstruction.id);
      }
    }

    var snapshotItems = importDraft.ingredients.map(function (ingredient) {
      return {
        itemId: ingredient.itemId,
        name: ingredient.name,
        quantity: ingredient.quantityValue,
        quantityValue: ingredient.quantityValue,
        quantityText: ingredient.quantityText || null,
        unitOfMeasureId: ingredient.unitOfMeasureId || null,
        description: ingredient.description || '',
        categoryId: '',
        categoryName: '',
        isOptional: ingredient.isOptional === true
      };
    });

    var snapshotInstructions = importDraft.instructions.map(function (instruction, index) {
      return {
        instructionId: instruction.id,
        stepNumber: index + 1,
        text: instruction.text,
        ingredientRefs: normalizeInstructionIngredientRefs(instruction),
        timer: normalizeInstructionTimer(instruction.timer)
      };
    });

    var existingVersion = scope.versionRecord;
    await window.KaPDB.upsert(window.KaPStores.STORE_NAMES.RECIPE_VERSIONS, {
      id: importDraft.version.id,
      recipeId: recipeRecord.id,
      versionName: importDraft.version.name,
      parentVersionId: asOptionalString(existingVersion && existingVersion.parentVersionId),
      createdDate: asOptionalString(existingVersion && existingVersion.createdDate) || nowIso,
      updatedDate: nowIso,
      versionNote: 'Imported on ' + new Date().toLocaleString(),
      snapshotItems: snapshotItems,
      snapshotInstructions: snapshotInstructions
    });

    var preservedCountAfterImport = await countActiveRecipeDerivedLists(recipeRecord.id, importDraft.version.id);

    return {
      recipeId: recipeRecord.id,
      recipeName: recipeRecord.name,
      versionId: importDraft.version.id,
      versionName: importDraft.version.name,
      ingredientCount: importDraft.ingredients.length,
      instructionCount: importDraft.instructions.length,
      recipeDerivedListsPreservedCount: preservedCountAfterImport
    };
  }

  async function importRecipeFromKap() {
    var file = await pickKapFile();
    if (!file) {
      return null;
    }

    var importDraft = await parseKapFile(file);
    var scope = await readRecipeVersionScope(importDraft);
    var ingredientConflicts = await buildIngredientNameConflicts(importDraft, scope);
    var preflight = await buildImportPreflight(importDraft, scope, ingredientConflicts);

    if (preflight.blockingErrors.length > 0) {
      throw new Error('Import blocked:\n- ' + preflight.blockingErrors.join('\n- '));
    }

    if (preflight.versionConflictStatus === 'duplicate') {
      window.KaPUI.ShowTimedNotice({
        title: 'No Changes Applied',
        message: 'Imported recipe/version is already up to date.',
        durationMs: 3000
      });
      return null;
    }

    if (preflight.versionConflictStatus === 'older') {
      var importOlderConfirmed = await window.KaPUI.ShowConfirm({
        title: 'Import Older Version?',
        message: 'This file appears older than what you currently have. Continue only if you want to replace current recipe-version data with older data.',
        confirmLabel: 'Import Older Version',
        isDanger: true
      });

      if (!importOlderConfirmed) {
        return null;
      }
    }

    var reviewDecision = await window.KaPUI.ShowRecipeImportReviewModal({
      preflight: preflight
    });

    if (!reviewDecision || reviewDecision.action !== 'apply') {
      return null;
    }

    await resolveIngredientNameConflicts(importDraft, ingredientConflicts);
    var result = await upsertRecipeImportData(importDraft, scope);

    window.KaPUI.ShowTimedNotice({
      title: 'Import Complete',
      message: 'Imported ' + result.recipeName + ' (' + result.versionName + '). Preserved recipe-derived lists: '
        + String(result.recipeDerivedListsPreservedCount || 0),
      durationMs: 3000
    });

    return result;
  }

  function readAccordionState(storageKey) {
    try {
      var raw = sessionStorage.getItem(storageKey);
      if (!raw) {
        return {};
      }

      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeAccordionState(storageKey, state) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state || {}));
    } catch (error) {
      // Ignore session persistence failures and keep the current in-memory render behavior.
    }
  }

  function isAccordionExpanded(storageKey, recipeId, defaultExpanded) {
    var state = readAccordionState(storageKey);
    if (Object.prototype.hasOwnProperty.call(state, recipeId)) {
      return !!state[recipeId];
    }

    return !!defaultExpanded;
  }

  function setAccordionExpanded(storageKey, recipeId, isExpanded) {
    var state = readAccordionState(storageKey);
    state[recipeId] = !!isExpanded;
    writeAccordionState(storageKey, state);
  }

  function isVersionAccordionExpanded(recipeId) {
    return isAccordionExpanded(VERSION_ACCORDION_STATE_KEY, recipeId, true);
  }

  function setVersionAccordionExpanded(recipeId, isExpanded) {
    setAccordionExpanded(VERSION_ACCORDION_STATE_KEY, recipeId, isExpanded);
  }

  function isDescriptionAccordionExpanded(recipeId) {
    return isAccordionExpanded(DESCRIPTION_ACCORDION_STATE_KEY, recipeId, true);
  }

  function setDescriptionAccordionExpanded(recipeId, isExpanded) {
    setAccordionExpanded(DESCRIPTION_ACCORDION_STATE_KEY, recipeId, isExpanded);
  }

  function isTagsAccordionExpanded(recipeId) {
    return isAccordionExpanded(TAGS_ACCORDION_STATE_KEY, recipeId, true);
  }

  function setTagsAccordionExpanded(recipeId, isExpanded) {
    setAccordionExpanded(TAGS_ACCORDION_STATE_KEY, recipeId, isExpanded);
  }

  function isSectionVisible(storageKey, recipeId) {
    return isAccordionExpanded(storageKey, recipeId, true);
  }

  function setSectionVisible(storageKey, recipeId, isVisible) {
    setAccordionExpanded(storageKey, recipeId, isVisible);
  }

  function isVersionSectionVisible(recipeId) {
    return isSectionVisible(VERSION_SECTION_VISIBLE_KEY, recipeId);
  }

  function setVersionSectionVisible(recipeId, isVisible) {
    setSectionVisible(VERSION_SECTION_VISIBLE_KEY, recipeId, isVisible);
  }

  function isDescriptionSectionVisible(recipeId) {
    return isSectionVisible(DESCRIPTION_SECTION_VISIBLE_KEY, recipeId);
  }

  function setDescriptionSectionVisible(recipeId, isVisible) {
    setSectionVisible(DESCRIPTION_SECTION_VISIBLE_KEY, recipeId, isVisible);
  }

  function isTagsSectionVisible(recipeId) {
    return isSectionVisible(TAGS_SECTION_VISIBLE_KEY, recipeId);
  }

  function setTagsSectionVisible(recipeId, isVisible) {
    setSectionVisible(TAGS_SECTION_VISIBLE_KEY, recipeId, isVisible);
  }



  function getLastViewedVersionId(recipeId) {
    try {
      var raw = sessionStorage.getItem(LAST_VIEWED_VERSION_KEY);
      var state = raw ? JSON.parse(raw) : {};
      var value = state && typeof state === 'object' ? state[recipeId] : undefined;
      return typeof value === 'string' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function setLastViewedVersionId(recipeId, versionId) {
    try {
      var raw = sessionStorage.getItem(LAST_VIEWED_VERSION_KEY);
      var state = (raw ? JSON.parse(raw) : null) || {};
      state[recipeId] = String(versionId);
      sessionStorage.setItem(LAST_VIEWED_VERSION_KEY, JSON.stringify(state));
    } catch (error) {
      // Ignore session persistence failures.
    }
  }

  function markVersionNameForFocus(recipeId, versionId) {
    versionNoteFocusTargets[recipeId] = String(versionId || '');
  }

  function shouldFocusVersionName(recipeId, versionId) {
    return String(versionNoteFocusTargets[recipeId] || '') === String(versionId || '');
  }

  function clearVersionNoteFocus(recipeId) {
    delete versionNoteFocusTargets[recipeId];
  }

  function readLocalJsonState(storageKey) {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) {
        return {};
      }

      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeLocalJsonState(storageKey, state) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state || {}));
    } catch (error) {
      // Ignore persistence failures.
    }
  }

  function getActiveDetailsSection() {
    var state = readLocalJsonState(DETAILS_ACTIVE_SECTION_KEY);
    var value = String(state.active || '').toLowerCase();
    if (
      value !== DETAILS_SECTION_INFORMATION
      && value !== DETAILS_SECTION_DESCRIPTION
      && value !== DETAILS_SECTION_VERSIONS
      && value !== DETAILS_SECTION_TAGS
    ) {
      return DETAILS_SECTION_INFORMATION;
    }

    return value;
  }

  function setActiveDetailsSection(sectionName) {
    writeLocalJsonState(DETAILS_ACTIVE_SECTION_KEY, {
      active: String(sectionName || '').toLowerCase() || DETAILS_SECTION_INFORMATION
    });
  }

  function isDetailsBlockCollapsed() {
    var state = readLocalJsonState(DETAILS_COLLAPSED_KEY);
    return state.collapsed === true;
  }

  function setDetailsBlockCollapsed(isCollapsed) {
    writeLocalJsonState(DETAILS_COLLAPSED_KEY, {
      collapsed: isCollapsed === true
    });
  }

  function normalizeMinutesValue(value) {
    if (value == null || String(value).trim() === '') {
      return null;
    }

    var parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }

    return Math.floor(parsed);
  }

  function splitMinutesToParts(totalMinutes) {
    var normalized = normalizeMinutesValue(totalMinutes);
    if (normalized == null) {
      return {
        hours: '',
        minutes: ''
      };
    }

    return {
      hours: String(Math.floor(normalized / 60)),
      minutes: String(normalized % 60)
    };
  }

  function combineDurationParts(hoursValue, minutesValue) {
    var hasHours = String(hoursValue == null ? '' : hoursValue).trim() !== '';
    var hasMinutes = String(minutesValue == null ? '' : minutesValue).trim() !== '';
    if (!hasHours && !hasMinutes) {
      return null;
    }

    var hours = Number(hasHours ? hoursValue : 0);
    var minutes = Number(hasMinutes ? minutesValue : 0);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || minutes < 0) {
      throw new Error('Time values must be zero or greater.');
    }

    return Math.floor(hours) * 60 + Math.floor(minutes);
  }

  function formatDurationFromMinutes(totalMinutes) {
    var normalized = normalizeMinutesValue(totalMinutes);
    if (normalized == null) {
      return '';
    }

    var hours = Math.floor(normalized / 60);
    var minutes = normalized % 60;
    return String(hours) + 'h ' + String(minutes) + 'm';
  }

  function getRecipeInformation(record) {
    var information = record && record.information && typeof record.information === 'object'
      ? record.information
      : {};

    return {
      prepMinutes: normalizeMinutesValue(information.prepMinutes != null ? information.prepMinutes : record.infoPrepMinutes),
      cookMinutes: normalizeMinutesValue(information.cookMinutes != null ? information.cookMinutes : record.infoCookMinutes),
      additionalMinutes: normalizeMinutesValue(information.additionalMinutes != null ? information.additionalMinutes : record.infoAdditionalMinutes),
      servings: String((information.servings != null ? information.servings : record.infoServings) || '').trim(),
      yield: String((information.yield != null ? information.yield : record.infoYield) || '').trim()
    };
  }

  function setRecipeInformationOnRecord(record, info) {
    var next = Object.assign({}, getRecipeInformation(record), info || {});
    record.infoPrepMinutes = normalizeMinutesValue(next.prepMinutes);
    record.infoCookMinutes = normalizeMinutesValue(next.cookMinutes);
    record.infoAdditionalMinutes = normalizeMinutesValue(next.additionalMinutes);
    record.infoServings = String(next.servings == null ? '' : next.servings).trim();
    record.infoYield = String(next.yield == null ? '' : next.yield).trim();
    record.information = {
      prepMinutes: record.infoPrepMinutes,
      cookMinutes: record.infoCookMinutes,
      additionalMinutes: record.infoAdditionalMinutes,
      servings: record.infoServings,
      yield: record.infoYield
    };
  }

  async function createRecipe() {
    var name = await window.KaPUI.ShowPrompt({
      title: 'New Recipe',
      placeholder: 'Recipe name',
      confirmLabel: 'Create'
    });
    if (name === null) {
      return;
    }

    try {
      return await window.KaPRecipesService.createRecipe(name);
    } catch (error) {
      await showError(error.message || 'Unable to create recipe.');
      return null;
    }
  }

  function buildRecipeIngredientModalOptions(overrides) {
    var baseOptions = window.KaPItemDiscovery.buildAddItemModalOptions({
      title: 'Add Ingredient',
      currentContextLabel: 'recipe',
      detailItems: overrides.detailItems || [],
      quantityPlaceholder: 'e.g. 1/2 or 1.5',
      quantityHelpText: 'Accepted formats: 1.5, 3/4, or 1 1/2',
      validateQuantity: window.KaPItemDiscovery.validateOptionalDecimal,
      showOptionalField: true,
      optionalLabel: 'Mark ingredient as optional'
    });

    baseOptions.getUnitOfMeasures = function () {
      return window.KaPRecipesService.getAllUnitOfMeasures();
    };
    baseOptions.createUnitOfMeasure = function (name, abbr, group, behavior, step) {
      return window.KaPRecipesService.createUnitOfMeasure(name, abbr, group, behavior, step);
    };

    baseOptions.confirmLabel = overrides.confirmLabel || baseOptions.confirmLabel;
    baseOptions.title = overrides.title || baseOptions.title;
    baseOptions.itemNamePlaceholder = overrides.itemNamePlaceholder || 'Ingredient name';
    baseOptions.categoryPlaceholder = overrides.categoryPlaceholder || 'Search or type category';
    baseOptions.descriptionPlaceholder = overrides.descriptionPlaceholder || 'Ingredient notes';
    baseOptions.initialName = overrides.initialName || '';
    baseOptions.initialCategoryId = overrides.initialCategoryId || '';
    baseOptions.initialCategoryName = overrides.initialCategoryName || '';
    baseOptions.initialDescription = overrides.initialDescription || '';
    baseOptions.initialQuantity = overrides.initialQuantity != null ? overrides.initialQuantity : 1;
    baseOptions.initialIsOptional = overrides.initialIsOptional === true;
    baseOptions.initialUnitOfMeasureId = overrides.initialUnitOfMeasureId || null;
    baseOptions.showQuantityField = true;
    baseOptions.showCategoryField = true;
    baseOptions.showOptionalField = true;
    baseOptions.enableSuggestions = overrides.enableSuggestions !== undefined
      ? overrides.enableSuggestions === true
      : true;
    return baseOptions;
  }

  async function renameRecipe(record) {
    var nextName = await window.KaPUI.ShowPrompt({
      title: 'Edit Recipe',
      placeholder: 'Recipe name',
      value: record.name,
      confirmLabel: 'Save'
    });
    if (nextName === null) {
      return null;
    }

    try {
      return await window.KaPRecipesService.renameRecipe(record.id, nextName);
    } catch (error) {
      await showError(error.message || 'Unable to update recipe.');
      return null;
    }
  }

  async function deleteRecipe(record) {
    var versionWarning = '';
    try {
      var versions = await window.KaPRecipesService.getRecipeVersions(record.id);
      if ((versions || []).length > 1) {
        versionWarning = '\n\nThis recipe has ' + String(versions.length) + ' versions. Deleting it will remove all versions.';
      }
    } catch (error) {
      // Keep the base confirmation message if version lookup fails.
    }

    var confirmed = await window.KaPUI.ShowConfirm({
      title: 'Delete Recipe',
      message: 'Delete "' + record.name + '"?' + versionWarning,
      confirmLabel: 'Delete',
      isDanger: true
    });
    if (!confirmed) {
      return false;
    }

    try {
      await window.KaPRecipesService.deleteRecipe(record.id);
      return true;
    } catch (error) {
      await showError(error.message || 'Unable to delete recipe.');
      return false;
    }
  }

  async function createNextVersion(recipeRecord, activeVersion, versionName, versionNote) {
    try {
      var createdVersion = await window.KaPRecipesService.createNewVersion(
        recipeRecord.id,
        versionName,
        versionNote,
        activeVersion ? activeVersion.id : ''
      );
      return createdVersion;
    } catch (error) {
      await showError(error.message || 'Unable to create new version.');
      return null;
    }
  }

  async function cloneRecipeFromActiveVersion(recipeRecord, activeVersion, cloneName) {
    try {
      var clonedRecord = await window.KaPRecipesService.cloneRecipe(
        recipeRecord.id,
        activeVersion ? activeVersion.id : '',
        cloneName
      );
      return clonedRecord;
    } catch (error) {
      await showError(error.message || 'Unable to clone recipe.');
      return null;
    }
  }

  async function deleteSelectedVersion(recipeRecord, activeVersion) {
    var confirmed = await window.KaPUI.ShowConfirm({
      title: 'Delete Version',
      message: 'Delete version \"' + (activeVersion.versionName || 'Unknown') + '\"?',
      confirmLabel: 'Delete',
      isDanger: true
    });
    if (!confirmed) {
      return false;
    }

    try {
      await window.KaPRecipesService.deleteRecipeVersion(recipeRecord.id, activeVersion.id);
      return true;
    } catch (error) {
      await showError(error.message || 'Unable to delete version.');
      return false;
    }
  }

  async function addRecipeItemWithDiscoveryModal(recipeRecord, detailItems, activeVersionId, isViewingLatestVersion) {
    var baseOptions = buildRecipeIngredientModalOptions({
      detailItems: detailItems,
      title: 'Add Ingredient',
      confirmLabel: 'Add Item',
      enableSuggestions: true
    });
    var result = await window.KaPUI.ShowDiscoveryItemModal(baseOptions);

    if (result === null) {
      return;
    }

    try {
      var itemRecord = result.item;
      if (!itemRecord || !itemRecord.id) {
        itemRecord = await window.KaPItemDiscovery.resolveExactItem(result.name);
        if (!itemRecord) {
          itemRecord = await window.KaPItemsService.createItem(result.name, '');
        }
      }

      if (isViewingLatestVersion) {
        await window.KaPRecipesService.addItemToRecipe(
          recipeRecord.id,
          itemRecord.id,
          result.name,
          result.quantity,
          result.quantityText,
          result.description,
          result.unitOfMeasureId || null,
          result.isOptional === true
        );
      } else {
        await window.KaPRecipesService.addItemToVersion(
          recipeRecord.id,
          activeVersionId,
          itemRecord.id,
          result.name,
          result.quantity,
          result.quantityText,
          result.description,
          result.unitOfMeasureId || null,
          result.isOptional === true
        );
      }

      await window.KaPItemsService.setItemCategory(
        itemRecord.id,
        result.categoryId || '',
        result.categoryName || '',
        result.name
      );
    } catch (error) {
      await showError(error.message || 'Unable to add ingredient.');
    }
  }

  async function editRecipeItemWithPrompt(recipeRecord, detailItem) {
    var result = await window.KaPUI.ShowDiscoveryItemModal(buildRecipeIngredientModalOptions({
      title: 'Edit Ingredient',
      confirmLabel: 'Save',
      initialName: detailItem.name,
      initialCategoryId: detailItem.categoryId,
      initialCategoryName: detailItem.categoryName,
      initialDescription: detailItem.description,
      initialQuantity: detailItem.quantityText != null ? detailItem.quantityText : (detailItem.quantityValue != null ? detailItem.quantityValue : (detailItem.quantity != null ? detailItem.quantity : null)),
      initialIsOptional: detailItem.isOptional === true,
      initialUnitOfMeasureId: detailItem.unitOfMeasureId || null,
      enableSuggestions: false
    }));

    if (result === null) {
      return;
    }

    try {
      await window.KaPRecipesService.updateRecipeItem(
        recipeRecord.id,
        detailItem.id,
        result.name,
        result.quantity,
        result.quantityText,
        result.description,
        result.unitOfMeasureId !== undefined ? result.unitOfMeasureId : detailItem.unitOfMeasureId,
        result.isOptional === true
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
      await showError(error.message || 'Unable to update ingredient.');
    }
  }

  async function removeRecipeItemWithConfirm(recipeRecord, detailItem) {
    var itemName = detailItem.name || 'this ingredient';
    var confirmed = await window.KaPUI.ShowConfirm({
      title: 'Remove Ingredient',
      message: 'Remove "' + itemName + '" from this recipe?',
      confirmLabel: 'Remove',
      isDanger: true
    });

    if (!confirmed) {
      return;
    }

    try {
      await window.KaPRecipesService.removeItemFromRecipe(recipeRecord.id, detailItem.id);
    } catch (error) {
      await showError(error.message || 'Unable to remove ingredient.');
    }
  }

  async function addInstructionWithPrompt(recipeRecord, detailItems, instructions) {
    var stepDraft = await showStepEditor(detailItems, instructions, null, 'Add Step', 'Add');

    if (stepDraft === null) {
      return false;
    }

    try {
      await window.KaPRecipesService.addInstructionToRecipe(recipeRecord.id, stepDraft);
      return true;
    } catch (error) {
      await showError(error.message || 'Unable to add instruction.');
      return false;
    }
  }

  async function addInstructionToVersionWithPrompt(recipeRecord, selectedVersionId, detailItems, instructions) {
    var stepDraft = await showStepEditor(detailItems, instructions, null, 'Add Step', 'Add');

    if (stepDraft === null) {
      return false;
    }

    try {
      await window.KaPRecipesService.addInstructionToVersion(recipeRecord.id, selectedVersionId, stepDraft);
      return true;
    } catch (error) {
      await showError(error.message || 'Unable to add instruction.');
      return false;
    }
  }

  async function editInstructionWithPrompt(recipeRecord, instruction, detailItems, instructions, selectedVersionId, isViewingLatestVersion) {
    var nextDraft = await showStepEditor(
      detailItems,
      instructions,
      instruction,
      'Edit Step ' + instruction.stepNumber,
      'Save'
    );

    if (nextDraft === null) {
      return false;
    }

    try {
      if (isViewingLatestVersion === false) {
        await window.KaPRecipesService.updateVersionInstruction(recipeRecord.id, selectedVersionId, instruction.id, nextDraft);
      } else {
        await window.KaPRecipesService.updateRecipeInstruction(recipeRecord.id, instruction.id, nextDraft);
      }
      return true;
    } catch (error) {
      await showError(error.message || 'Unable to update instruction.');
      return false;
    }
  }

  async function removeInstructionWithConfirm(recipeRecord, instruction, selectedVersionId, isViewingLatestVersion) {
    var confirmed = await window.KaPUI.ShowConfirm({
      title: 'Remove Step',
      message: 'Remove step ' + instruction.stepNumber + '?',
      confirmLabel: 'Remove',
      isDanger: true
    });

    if (!confirmed) {
      return false;
    }

    try {
      if (isViewingLatestVersion === false) {
        await window.KaPRecipesService.removeVersionInstruction(recipeRecord.id, selectedVersionId, instruction.id);
      } else {
        await window.KaPRecipesService.removeRecipeInstruction(recipeRecord.id, instruction.id);
      }
      return true;
    } catch (error) {
      await showError(error.message || 'Unable to remove instruction.');
      return false;
    }
  }

  async function moveInstruction(recipeRecord, instruction, direction, selectedVersionId, isViewingLatestVersion) {
    try {
      if (isViewingLatestVersion === false) {
        await window.KaPRecipesService.moveVersionInstruction(recipeRecord.id, selectedVersionId, instruction.id, direction);
      } else {
        await window.KaPRecipesService.moveRecipeInstruction(recipeRecord.id, instruction.id, direction);
      }
      return true;
    } catch (error) {
      await showError(error.message || 'Unable to move instruction.');
      return false;
    }
  }

  function sortByNameAscending(records) {
    return (records || []).slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        sensitivity: 'base'
      });
    });
  }

  function normalizeTags(tags) {
    return (Array.isArray(tags) ? tags : []).map(function (tag) {
      return String(tag || '').trim().toLowerCase();
    }).filter(function (tag) {
      return !!tag;
    });
  }

  function buildRecipeDetailItemRow(recipeRecord, detailItem, container, hooks, selectedVersionId, isViewingLatestVersion, batchSize) {
    var displayDetailItem = buildBatchScaledDetailItem(detailItem, batchSize || 1);

    return window.KaPUI.NewDetailItemRow(displayDetailItem, {
      onEdit: async function () {
        if (isViewingLatestVersion) {
          await editRecipeItemWithPrompt(recipeRecord, detailItem);
        } else {
          var result = await window.KaPUI.ShowDiscoveryItemModal(buildRecipeIngredientModalOptions({
            title: 'Edit Ingredient',
            confirmLabel: 'Save',
            initialName: detailItem.name,
            initialCategoryId: detailItem.categoryId,
            initialCategoryName: detailItem.categoryName,
            initialDescription: detailItem.description,
            initialQuantity: detailItem.quantityText != null ? detailItem.quantityText : (detailItem.quantityValue != null ? detailItem.quantityValue : (detailItem.quantity != null ? detailItem.quantity : null)),
            initialIsOptional: detailItem.isOptional === true,
            initialUnitOfMeasureId: detailItem.unitOfMeasureId || null,
            enableSuggestions: false
          }));

          if (result !== null) {
            await window.KaPRecipesService.updateVersionItem(
              recipeRecord.id,
              selectedVersionId,
              detailItem.id,
              result.name,
              result.quantity,
              result.quantityText,
              result.description,
              result.unitOfMeasureId !== undefined ? result.unitOfMeasureId : detailItem.unitOfMeasureId,
              result.isOptional === true
            );
          }
        }
        await renderDetailInto(container, recipeRecord, hooks, selectedVersionId);
      },
      onRemove: async function () {
        if (isViewingLatestVersion) {
          await removeRecipeItemWithConfirm(recipeRecord, detailItem);
        } else {
          var itemName = detailItem.name || 'this ingredient';
          var confirmed = await window.KaPUI.ShowConfirm({
            title: 'Remove Ingredient',
            message: 'Remove "' + itemName + '" from this recipe?',
            confirmLabel: 'Remove',
            isDanger: true
          });

          if (confirmed) {
            await window.KaPRecipesService.removeItemFromVersion(recipeRecord.id, selectedVersionId, detailItem.id);
          }
        }
        await renderDetailInto(container, recipeRecord, hooks, selectedVersionId);
      }
    });
  }

  function buildReadOnlyRecipeDetailItemRow(detailItem) {
    var row = window.KaPUI.NewDetailItemRow(detailItem, null);
    var actionsNode = row.querySelector('.detail-item-actions');
    if (actionsNode) {
      actionsNode.style.display = 'none';
    }

    return row;
  }

  function getDetailItemsFromVersionSnapshot(activeVersion) {
    var snapshotItems = (activeVersion && activeVersion.snapshotItems) || [];
    return snapshotItems.map(function (snapshotItem, index) {
      return {
        id: String(snapshotItem.itemId || '') + '::' + String(index),
        listRecordId: activeVersion.recipeId,
        itemId: snapshotItem.itemId || '',
        name: snapshotItem.name || 'Unknown Item',
        quantity: snapshotItem.quantity,
        description: snapshotItem.description || '',
        categoryId: snapshotItem.categoryId || '',
        categoryName: snapshotItem.categoryName || '',
        item: null
      };
    });
  }

  function getInstructionItemsFromVersionSnapshot(activeVersion) {
    var snapshotInstructions = (activeVersion && activeVersion.snapshotInstructions) || [];
    return snapshotInstructions
      .slice()
      .sort(function (a, b) {
        return Number(a.stepNumber || 0) - Number(b.stepNumber || 0);
      })
      .map(function (snapshotInstruction, index) {
        return {
          id: snapshotInstruction.instructionId || ('snapshot-step-' + String(index)),
          stepNumber: Number(snapshotInstruction.stepNumber || index + 1),
          text: snapshotInstruction.text || '',
          ingredientRefs: normalizeInstructionIngredientRefs(snapshotInstruction),
          timer: normalizeInstructionTimer(snapshotInstruction.timer)
        };
      });
  }

  async function chooseVersionNumber(record, activeVersion, availableVersions) {
    var versionInput = await window.KaPUI.ShowPrompt({
      title: 'View Version',
      placeholder: 'Enter version number',
      value: activeVersion ? String(activeVersion.versionNumber) : '',
      confirmLabel: 'View'
    });

    if (versionInput === null) {
      return null;
    }

    var parsedVersionNumber = Number(String(versionInput || '').trim());
    if (!Number.isInteger(parsedVersionNumber) || parsedVersionNumber <= 0) {
      await showError('Version number must be a positive integer.');
      return null;
    }

    var hasVersion = (availableVersions || []).some(function (version) {
      return Number(version.versionNumber || 0) === parsedVersionNumber;
    });

    if (!hasVersion) {
      await showError('Version ' + parsedVersionNumber + ' does not exist for this recipe.');
      return null;
    }

    return parsedVersionNumber;
  }

  function findVersionIndex(availableVersions, activeVersion) {
    return (availableVersions || []).findIndex(function (version) {
      return activeVersion && version.id === activeVersion.id;
    });
  }

  async function promptCloneVersionName(recipeRecord) {
    return window.KaPUI.ShowRecipeCloneModal({
      title: 'Clone Version',
      initialName: recipeRecord.name + ' - copy',
      confirmLabel: 'Clone',
      infoText: 'Cloning a version creates a new recipe with that version\'s ingredients and instructions, without carrying over any version history.'
    });
  }

  function appendInformationTabContent(content, record) {
    var info = getRecipeInformation(record);

    var grid = document.createElement('div');
    grid.className = 'recipe-info-grid';

    function appendDurationField(labelText, fieldKey) {
      var row = document.createElement('div');
      row.className = 'recipe-info-row';

      var label = document.createElement('label');
      label.className = 'recipe-info-label';
      label.textContent = labelText;
      row.appendChild(label);

      var currentParts = splitMinutesToParts(info[fieldKey]);
      var inputWrap = document.createElement('div');
      inputWrap.className = 'recipe-info-duration-wrap';

      var hoursInput = document.createElement('input');
      hoursInput.type = 'number';
      hoursInput.min = '0';
      hoursInput.step = '1';
      hoursInput.className = 'recipe-info-input recipe-info-duration-input';
      hoursInput.placeholder = 'h';
      hoursInput.value = currentParts.hours;

      var minutesInput = document.createElement('input');
      minutesInput.type = 'number';
      minutesInput.min = '0';
      minutesInput.step = '1';
      minutesInput.className = 'recipe-info-input recipe-info-duration-input';
      minutesInput.placeholder = 'm';
      minutesInput.value = currentParts.minutes;

      var hoursSuffix = document.createElement('span');
      hoursSuffix.className = 'recipe-info-duration-suffix';
      hoursSuffix.textContent = 'h';

      var minutesSuffix = document.createElement('span');
      minutesSuffix.className = 'recipe-info-duration-suffix';
      minutesSuffix.textContent = 'm';

      function createDurationPartWrap(inputNode, suffixNode, labelPrefix) {
        var partWrap = document.createElement('div');
        partWrap.className = 'recipe-info-duration-part';

        var inputShell = document.createElement('div');
        inputShell.className = 'recipe-info-duration-shell';

        var stepper = document.createElement('div');
        stepper.className = 'recipe-info-stepper';

        var incrementButton = document.createElement('button');
        incrementButton.type = 'button';
        incrementButton.className = 'recipe-info-stepper-button';
        incrementButton.textContent = '+';
        incrementButton.setAttribute('aria-label', 'Increase ' + labelText + ' ' + labelPrefix);

        var decrementButton = document.createElement('button');
        decrementButton.type = 'button';
        decrementButton.className = 'recipe-info-stepper-button';
        decrementButton.textContent = '-';
        decrementButton.setAttribute('aria-label', 'Decrease ' + labelText + ' ' + labelPrefix);

        stepper.appendChild(incrementButton);
        stepper.appendChild(decrementButton);

        inputShell.appendChild(inputNode);
        inputShell.appendChild(stepper);

        partWrap.appendChild(inputShell);
        partWrap.appendChild(suffixNode);

        return {
          wrap: partWrap,
          incrementButton: incrementButton,
          decrementButton: decrementButton
        };
      }

      var hoursPart = createDurationPartWrap(hoursInput, hoursSuffix, 'hours');
      var minutesPart = createDurationPartWrap(minutesInput, minutesSuffix, 'minutes');

      inputWrap.appendChild(hoursPart.wrap);
      inputWrap.appendChild(minutesPart.wrap);

      async function saveDuration() {
        try {
          var nextMinutes = combineDurationParts(hoursInput.value, minutesInput.value);
          var currentMinutes = normalizeMinutesValue(info[fieldKey]);
          if (nextMinutes === currentMinutes) {
            var unchangedParts = splitMinutesToParts(nextMinutes);
            hoursInput.value = unchangedParts.hours;
            minutesInput.value = unchangedParts.minutes;
            return;
          }

          var patch = {};
          patch[fieldKey] = nextMinutes;
          var updated = await window.KaPRecipesService.updateRecipeInformation(record.id, patch);
          setRecipeInformationOnRecord(record, updated && updated.information ? updated.information : patch);
          info = getRecipeInformation(record);

          var normalizedParts = splitMinutesToParts(info[fieldKey]);
          hoursInput.value = normalizedParts.hours;
          minutesInput.value = normalizedParts.minutes;
          totalValue.textContent = formatDurationFromMinutes(
            (info.prepMinutes || 0) + (info.cookMinutes || 0) + (info.additionalMinutes || 0)
          ) || 'Not set';
        } catch (error) {
          await showError(error.message || 'Unable to update recipe information.');
          var fallbackParts = splitMinutesToParts(info[fieldKey]);
          hoursInput.value = fallbackParts.hours;
          minutesInput.value = fallbackParts.minutes;
        }
      }

      function adjustDurationPart(inputNode, delta) {
        var raw = String(inputNode.value || '').trim();
        var current = raw === '' ? 0 : Number(raw);
        if (!Number.isFinite(current) || current < 0) {
          current = 0;
        }

        var next = Math.max(0, Math.floor(current) + delta);
        inputNode.value = String(next);
      }

      function bindStepper(buttonNode, inputNode, delta) {
        buttonNode.addEventListener('mousedown', function (event) {
          event.preventDefault();
        });
        buttonNode.addEventListener('click', async function (event) {
          event.preventDefault();
          adjustDurationPart(inputNode, delta);
          await saveDuration();
        });
      }

      hoursInput.addEventListener('blur', saveDuration);
      minutesInput.addEventListener('blur', saveDuration);
      bindStepper(hoursPart.incrementButton, hoursInput, 1);
      bindStepper(hoursPart.decrementButton, hoursInput, -1);
      bindStepper(minutesPart.incrementButton, minutesInput, 1);
      bindStepper(minutesPart.decrementButton, minutesInput, -1);

      row.appendChild(inputWrap);
      grid.appendChild(row);
    }

    function appendTextField(labelText, fieldKey, placeholder) {
      var row = document.createElement('div');
      row.className = 'recipe-info-row';

      var label = document.createElement('label');
      label.className = 'recipe-info-label';
      label.textContent = labelText;
      row.appendChild(label);

      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'recipe-info-input';
      input.placeholder = placeholder;
      input.value = info[fieldKey] || '';

      input.addEventListener('blur', async function () {
        var nextValue = String(input.value || '').trim();
        if (nextValue === String(info[fieldKey] || '').trim()) {
          input.value = nextValue;
          return;
        }

        try {
          var patch = {};
          patch[fieldKey] = nextValue;
          var updated = await window.KaPRecipesService.updateRecipeInformation(record.id, patch);
          setRecipeInformationOnRecord(record, updated && updated.information ? updated.information : patch);
          info = getRecipeInformation(record);
          input.value = info[fieldKey] || '';
        } catch (error) {
          await showError(error.message || 'Unable to update recipe information.');
          input.value = info[fieldKey] || '';
        }
      });

      row.appendChild(input);
      grid.appendChild(row);
    }

    appendDurationField('Prep Time', 'prepMinutes');
    appendDurationField('Cook Time', 'cookMinutes');
    appendDurationField('Additional Time', 'additionalMinutes');

    var totalRow = document.createElement('div');
    totalRow.className = 'recipe-info-row';
    var totalLabel = document.createElement('label');
    totalLabel.className = 'recipe-info-label';
    totalLabel.textContent = 'Total Time';
    var totalValue = document.createElement('div');
    totalValue.className = 'recipe-info-readonly';
    var totalMinutes = (info.prepMinutes || 0) + (info.cookMinutes || 0) + (info.additionalMinutes || 0);
    totalValue.textContent = formatDurationFromMinutes(totalMinutes) || 'Not set';
    if (info.prepMinutes == null && info.cookMinutes == null && info.additionalMinutes == null) {
      totalValue.textContent = 'Not set';
    }
    totalRow.appendChild(totalLabel);
    totalRow.appendChild(totalValue);
    grid.appendChild(totalRow);

    appendTextField('Servings', 'servings', 'e.g. 4');
    appendTextField('Yield', 'yield', 'e.g. 2 loaves');

    content.appendChild(grid);
  }

  function appendDescriptionTabContent(content, record) {
    var originalDescription = record.description || '';
    var descriptionInput = document.createElement('textarea');
    descriptionInput.className = 'recipe-version-note-input';
    descriptionInput.rows = 4;
    descriptionInput.placeholder = 'Optional recipe description';
    descriptionInput.value = originalDescription;

    var saveStatus = document.createElement('span');
    saveStatus.className = 'recipe-version-save-status';
    saveStatus.setAttribute('aria-live', 'polite');

    var saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'recipe-version-save-button';
    saveButton.textContent = 'Save';
    saveButton.disabled = true;

    function updateDescriptionSaveState() {
      var isDirty = descriptionInput.value !== originalDescription;
      saveButton.disabled = !isDirty;
      saveStatus.textContent = isDirty ? 'Unsaved changes' : 'Saved';
      saveStatus.classList.toggle('is-dirty', isDirty);
    }

    descriptionInput.addEventListener('input', updateDescriptionSaveState);

    saveButton.addEventListener('click', async function () {
      try {
        await window.KaPRecipesService.updateRecipeDescription(record.id, descriptionInput.value);
        originalDescription = descriptionInput.value;
        record.description = originalDescription;
        updateDescriptionSaveState();
      } catch (error) {
        await showError(error.message || 'Unable to update recipe description.');
      }
    });

    updateDescriptionSaveState();
    content.appendChild(descriptionInput);

    var saveRow = document.createElement('div');
    saveRow.className = 'recipe-version-clone-row';
    var saveActions = document.createElement('div');
    saveActions.className = 'recipe-version-save-actions';
    saveActions.appendChild(saveStatus);
    saveActions.appendChild(saveButton);
    saveRow.appendChild(saveActions);
    content.appendChild(saveRow);
  }

  async function appendVersionsTabContent(content, container, record, hooks, availableVersions, activeVersion, latestVersion) {
    if (!activeVersion) {
      var noVersion = document.createElement('p');
      noVersion.className = 'recipe-description-readonly';
      noVersion.textContent = 'No versions available.';
      content.appendChild(noVersion);
      return;
    }

    var toolbar = document.createElement('div');
    toolbar.className = 'recipe-version-toolbar';

    var versionSelect = document.createElement('select');
    versionSelect.className = 'recipe-version-select';
    versionSelect.setAttribute('aria-label', 'Select recipe version');
    availableVersions.slice().reverse().forEach(function (version) {
      var option = document.createElement('option');
      option.value = String(version.id);
      option.textContent = version.versionName;
      option.selected = version.id === activeVersion.id;
      versionSelect.appendChild(option);
    });
    versionSelect.addEventListener('change', async function () {
      await renderDetailInto(container, record, hooks, versionSelect.value);
    });
    toolbar.appendChild(versionSelect);

    var newVersionButton = document.createElement('button');
    newVersionButton.type = 'button';
    newVersionButton.className = 'accordion-new-button';
    newVersionButton.textContent = '+ Version';
    newVersionButton.addEventListener('click', async function () {
      var choice = await window.KaPUI.ShowNewVersionModal({
        availableVersions: availableVersions,
        defaultBaseVersionId: activeVersion ? activeVersion.id : (latestVersion ? latestVersion.id : null),
        defaultVersionName: window.KaPRecipesService.getDefaultVersionName ? window.KaPRecipesService.getDefaultVersionName() : new Date().toLocaleString()
      });
      if (!choice) {
        return;
      }

      var baseVersion = availableVersions.find(function (v) {
        return v.id === (choice.baseVersionId || activeVersion.id);
      }) || activeVersion;
      var createdVersion = await createNextVersion(record, baseVersion, choice.versionName, choice.versionNote);
      if (!createdVersion) {
        return;
      }

      markVersionNameForFocus(record.id, createdVersion.id);
      setActiveDetailsSection(DETAILS_SECTION_VERSIONS);
      await renderDetailInto(container, record, hooks, createdVersion.id);
    });
    toolbar.appendChild(newVersionButton);
    content.appendChild(toolbar);

    var nameSection = document.createElement('div');
    nameSection.className = 'recipe-version-name-section';
    var originalVersionName = activeVersion.versionName || '';

    var versionNameInput = document.createElement('input');
    versionNameInput.className = 'recipe-version-name-input';
    versionNameInput.type = 'text';
    versionNameInput.placeholder = 'Version name (e.g., 2026-05-03 14:30)';
    versionNameInput.value = originalVersionName;
    nameSection.appendChild(versionNameInput);

    versionNameInput.addEventListener('change', async function () {
      var newName = versionNameInput.value.trim();
      if (!newName) {
        versionNameInput.value = originalVersionName;
        return;
      }

      try {
        await window.KaPRecipesService.updateVersionName(record.id, activeVersion.id, newName);
        originalVersionName = newName;
      } catch (error) {
        await showError(error.message || 'Unable to update version name.');
        versionNameInput.value = originalVersionName;
      }
    });
    content.appendChild(nameSection);

    var noteSection = document.createElement('div');
    noteSection.className = 'recipe-version-note-section';
    var originalVersionNote = activeVersion.versionNote || '';

    var noteInput = document.createElement('textarea');
    noteInput.className = 'recipe-version-note-input';
    noteInput.rows = 4;
    noteInput.placeholder = 'Optional version note';
    noteInput.value = originalVersionNote;
    noteSection.appendChild(noteInput);

    noteInput.addEventListener('change', async function () {
      var newNote = noteInput.value.trim();
      try {
        await window.KaPRecipesService.updateVersionNote(record.id, activeVersion.id, newNote);
        originalVersionNote = newNote;
      } catch (error) {
        await showError(error.message || 'Unable to update version note.');
        noteInput.value = originalVersionNote;
      }
    });
    content.appendChild(noteSection);

    var cloneRow = document.createElement('div');
    cloneRow.className = 'recipe-version-clone-row';

    var cloneButton = document.createElement('button');
    cloneButton.type = 'button';
    cloneButton.className = 'recipe-version-secondary-button';
    cloneButton.textContent = 'Clone Version';
    cloneButton.addEventListener('click', async function () {
      var cloneConfig = await promptCloneVersionName(record);
      if (!cloneConfig) {
        return;
      }

      var clonedRecord = await cloneRecipeFromActiveVersion(record, activeVersion, cloneConfig.name);
      if (!clonedRecord) {
        return;
      }

      hooks.onOpen(clonedRecord);
    });
    cloneRow.appendChild(cloneButton);

    var deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'recipe-version-secondary-button recipe-version-delete-button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async function () {
      var deleted = await deleteSelectedVersion(record, activeVersion);
      if (!deleted) {
        return;
      }

      var remainingVersions = await window.KaPRecipesService.getRecipeVersions(record.id);
      var nextVersion = remainingVersions.length > 0 ? remainingVersions[remainingVersions.length - 1] : null;
      await renderDetailInto(container, record, hooks, nextVersion ? nextVersion.id : null);
    });
    cloneRow.appendChild(deleteButton);
    content.appendChild(cloneRow);

    if (shouldFocusVersionName(record.id, activeVersion.id)) {
      requestAnimationFrame(function () {
        versionNameInput.focus();
        versionNameInput.setSelectionRange(versionNameInput.value.length, versionNameInput.value.length);
      });
      clearVersionNoteFocus(record.id);
    }
  }

  function appendTagsTabContent(content, container, record, hooks, selectedVersionId, allRecipeTags) {
    var currentTags = normalizeTags(record.tags);
    var allKnownTags = normalizeTags(allRecipeTags);
    var dropdownOpen = false;

    var lead = document.createElement('div');
    lead.className = 'recipe-tags-lead';

    var buttonWrap = document.createElement('div');
    buttonWrap.className = 'recipe-tags-picker';

    var pickerButton = document.createElement('button');
    pickerButton.type = 'button';
    pickerButton.className = 'recipe-tags-button';
    pickerButton.textContent = '\ud83c\udff7';
    pickerButton.setAttribute('aria-label', 'Add or select recipe tag');
    pickerButton.setAttribute('aria-haspopup', 'menu');
    pickerButton.setAttribute('aria-expanded', 'false');
    pickerButton.addEventListener('click', function (event) {
      event.stopPropagation();
      setDropdownOpen(!dropdownOpen);
    });

    var dropdown = document.createElement('div');
    dropdown.className = 'recipe-tags-dropdown';
    dropdown.hidden = true;

    var tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.className = 'recipe-tags-input';
    tagInput.placeholder = 'Select or add tag';
    tagInput.setAttribute('aria-label', 'Select or add tag');

    var optionsWrap = document.createElement('div');
    optionsWrap.className = 'recipe-tags-options';

    function renderOptions() {
      var query = String(tagInput.value || '').trim().toLowerCase();
      var available = allKnownTags.filter(function (tag) {
        if (currentTags.indexOf(tag) >= 0) {
          return false;
        }

        if (!query) {
          return true;
        }

        return tag.indexOf(query) >= 0;
      });

      optionsWrap.replaceChildren();

      available.slice(0, 12).forEach(function (tag) {
        var optionButton = document.createElement('button');
        optionButton.type = 'button';
        optionButton.className = 'recipe-tags-option';
        optionButton.textContent = tag;
        optionButton.addEventListener('click', async function (event) {
          event.stopPropagation();
          await window.KaPRecipesService.addTagToRecipe(record.id, tag);
          await renderDetailInto(container, record, hooks, selectedVersionId);
        });
        optionsWrap.appendChild(optionButton);
      });

      if (available.length === 0) {
        var empty = document.createElement('span');
        empty.className = 'recipe-tags-options-empty';
        empty.textContent = 'No matching tags.';
        optionsWrap.appendChild(empty);
      }
    }

    function setDropdownOpen(isOpen) {
      dropdownOpen = !!isOpen;
      dropdown.hidden = !dropdownOpen;
      pickerButton.setAttribute('aria-expanded', dropdownOpen ? 'true' : 'false');

      if (dropdownOpen) {
        window.KaPUI.SetActiveOverflowMenu(buttonWrap, setDropdownOpen, true);
        renderOptions();
        requestAnimationFrame(function () {
          tagInput.focus();
        });
      } else {
        window.KaPUI.SetActiveOverflowMenu(buttonWrap, setDropdownOpen, false);
      }
    }

    tagInput.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    tagInput.addEventListener('input', renderOptions);
    tagInput.addEventListener('keydown', async function (event) {
      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      var value = String(tagInput.value || '').trim();
      if (!value) {
        return;
      }

      await window.KaPRecipesService.addTagToRecipe(record.id, value);
      await renderDetailInto(container, record, hooks, selectedVersionId);
    });

    dropdown.appendChild(tagInput);
    dropdown.appendChild(optionsWrap);
    buttonWrap.appendChild(pickerButton);
    buttonWrap.appendChild(dropdown);
    lead.appendChild(buttonWrap);

    var tagsWrap = document.createElement('div');
    tagsWrap.className = 'recipe-tags-list';

    if (currentTags.length === 0) {
      var emptyTag = document.createElement('span');
      emptyTag.className = 'recipe-tag-empty';

      var emptyTagArrow = document.createElement('span');
      emptyTagArrow.className = 'recipe-tag-empty-arrow';
      emptyTagArrow.textContent = '\u2190';
      emptyTag.appendChild(emptyTagArrow);

      var emptyTagText = document.createElement('span');
      emptyTagText.className = 'recipe-tag-empty-text';
      emptyTagText.textContent = 'Click to add tags';
      emptyTag.appendChild(emptyTagText);

      tagsWrap.appendChild(emptyTag);
    } else {
      currentTags.forEach(function (tag) {
        var tagNode = document.createElement('span');
        tagNode.className = 'recipe-tag-pill';

        var tagLabel = document.createElement('span');
        tagLabel.className = 'recipe-tag-label';
        tagLabel.textContent = tag;
        tagNode.appendChild(tagLabel);

        var removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'recipe-tag-remove-button';
        removeButton.setAttribute('aria-label', 'Remove tag ' + tag);
        removeButton.textContent = 'x';
        removeButton.addEventListener('click', async function (event) {
          event.stopPropagation();
          await window.KaPRecipesService.removeTagFromRecipe(record.id, tag);
          await renderDetailInto(container, record, hooks, selectedVersionId);
        });
        tagNode.appendChild(removeButton);

        tagsWrap.appendChild(tagNode);
      });
    }

    lead.appendChild(tagsWrap);
    content.appendChild(lead);
  }

  async function appendRecipeDetailsTabbedSection(container, record, hooks, availableVersions, activeVersion, latestVersion, allRecipeTags) {
    var detailShell = container.querySelector('.detail-shell');
    if (!detailShell) {
      return;
    }

    var detailsCard = document.createElement('section');
    detailsCard.className = 'recipe-detail-tabs-card';

    var header = document.createElement('div');
    header.className = 'recipe-detail-tabs-header';

    var collapseButton = document.createElement('button');
    collapseButton.type = 'button';
    var detailsCollapsed = isDetailsBlockCollapsed();
    collapseButton.className = 'recipe-detail-tabs-collapse' + (detailsCollapsed ? ' is-collapsed' : '');
    collapseButton.setAttribute('aria-label', isDetailsBlockCollapsed() ? 'Expand recipe details block' : 'Collapse recipe details block');
    collapseButton.addEventListener('click', function () {
      setDetailsBlockCollapsed(!isDetailsBlockCollapsed());
      renderDetailInto(container, record, hooks, activeVersion ? activeVersion.id : null);
    });
    header.appendChild(collapseButton);

    var tabs = document.createElement('div');
    tabs.className = 'recipe-detail-tabs';
    var activeSection = getActiveDetailsSection();
    var definitions = [
      { key: DETAILS_SECTION_INFORMATION, label: 'Info' },
      { key: DETAILS_SECTION_DESCRIPTION, label: 'Description' },
      { key: DETAILS_SECTION_VERSIONS, label: 'Versions' },
      { key: DETAILS_SECTION_TAGS, label: 'Tags' }
    ];

    definitions.forEach(function (definition) {
      var tabButton = document.createElement('button');
      tabButton.type = 'button';
      tabButton.className = 'recipe-detail-tab' + (activeSection === definition.key ? ' is-active' : '');
      tabButton.textContent = definition.label;
      tabButton.setAttribute('aria-pressed', activeSection === definition.key ? 'true' : 'false');
      tabButton.addEventListener('click', function () {
        setActiveDetailsSection(definition.key);
        renderDetailInto(container, record, hooks, activeVersion ? activeVersion.id : null);
      });
      tabs.appendChild(tabButton);
    });

    header.appendChild(tabs);
    detailsCard.appendChild(header);

    if (!isDetailsBlockCollapsed()) {
      var body = document.createElement('div');
      body.className = 'recipe-detail-tabs-body';

      if (activeSection === DETAILS_SECTION_INFORMATION) {
        appendInformationTabContent(body, record);
      } else if (activeSection === DETAILS_SECTION_DESCRIPTION) {
        appendDescriptionTabContent(body, record);
      } else if (activeSection === DETAILS_SECTION_VERSIONS) {
        await appendVersionsTabContent(body, container, record, hooks, availableVersions, activeVersion, latestVersion);
      } else {
        appendTagsTabContent(body, container, record, hooks, activeVersion ? activeVersion.id : null, allRecipeTags);
      }

      detailsCard.appendChild(body);
    }

    detailShell.appendChild(detailsCard);
  }

  function buildAccordionSection(title, isExpanded, onToggle, buildHeaderActions, buildHeaderLead) {
    var section = document.createElement('section');
    section.className = 'recipe-accordion-card';

    var header = document.createElement('div');
    header.className = 'recipe-accordion-header';
    if (!title) {
      header.classList.add('tags');
    }
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    header.addEventListener('click', function (event) {
      if (event.target.closest('.recipe-accordion-header-actions') || event.target.closest('.recipe-accordion-header-control')) {
        return;
      }

      onToggle();
    });
    header.addEventListener('keydown', function (event) {
      if (event.target.closest('.recipe-accordion-header-actions') || event.target.closest('.recipe-accordion-header-control')) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggle();
      }
    });

    if (typeof buildHeaderLead === 'function') {
      var headerLead = buildHeaderLead();
      if (headerLead) {
        headerLead.classList.add('recipe-accordion-header-control');
        header.appendChild(headerLead);
      }
    }

    if (!header.querySelector('.recipe-accordion-header-control')) {
      var headerLabel = document.createElement('span');
      headerLabel.className = 'recipe-accordion-title';
      headerLabel.textContent = title;
      header.appendChild(headerLabel);
    }

    if (typeof buildHeaderActions === 'function') {
      var headerActions = buildHeaderActions();
      if (headerActions) {
        headerActions.classList.add('recipe-accordion-header-actions');
        header.appendChild(headerActions);
      }
    }

    section.appendChild(header);

    var content = document.createElement('div');
    content.className = 'recipe-accordion-content' + (isExpanded ? ' is-expanded' : '');
    if (!isExpanded) {
      content.hidden = true;
    }

    section.appendChild(content);

    return {
      section: section,
      content: content
    };
  }

  function appendVersionsAccordionSection(container, record, hooks, availableVersions, activeVersion, latestVersion, isViewingLatestVersion) {
    var detailShell = container.querySelector('.detail-shell');
    var detailHeader = container.querySelector('.detail-header');
    if (!detailShell || !detailHeader || !activeVersion) {
      return;
    }

    var isExpanded = isVersionAccordionExpanded(record.id);
    var versionSelect = document.createElement('select');
    versionSelect.className = 'recipe-version-select';
    versionSelect.setAttribute('aria-label', 'Select recipe version');
    availableVersions.slice().reverse().forEach(function (version) {
      var option = document.createElement('option');
      option.value = String(version.id);
      option.textContent = version.versionName;
      option.selected = version.id === activeVersion.id;
      versionSelect.appendChild(option);
    });

    versionSelect.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    versionSelect.addEventListener('keydown', function (event) {
      event.stopPropagation();
    });
    versionSelect.addEventListener('change', async function () {
      await renderDetailInto(container, record, hooks, versionSelect.value);
    });

    var accordion = buildAccordionSection('Versions', isExpanded, function () {
      setVersionAccordionExpanded(record.id, !isExpanded);
      renderDetailInto(container, record, hooks, activeVersion.id);
    }, function () {
      if (!isExpanded) {
        return null;
      }

      var actions = document.createElement('div');

      var newVersionButton = document.createElement('button');
      newVersionButton.type = 'button';
      newVersionButton.className = 'accordion-new-button';
      newVersionButton.textContent = '+ Version';
      newVersionButton.addEventListener('click', async function (event) {
        event.stopPropagation();

        var choice = await window.KaPUI.ShowNewVersionModal({
          availableVersions: availableVersions,
          defaultBaseVersionId: activeVersion ? activeVersion.id : (latestVersion ? latestVersion.id : null),
          defaultVersionName: window.KaPRecipesService.getDefaultVersionName ? window.KaPRecipesService.getDefaultVersionName() : new Date().toLocaleString()
        });
        if (!choice) {
          return;
        }

        var baseVersion = availableVersions.find(function (v) {
          return v.id === (choice.baseVersionId || activeVersion.id);
        }) || activeVersion;
        var createdVersion = await createNextVersion(record, baseVersion, choice.versionName, choice.versionNote);
        if (createdVersion) {
          setVersionAccordionExpanded(record.id, true);
          markVersionNameForFocus(record.id, createdVersion.id);
          await renderDetailInto(container, record, hooks, createdVersion.id);
        }
      });
      newVersionButton.addEventListener('keydown', function (event) {
        event.stopPropagation();
      });
      actions.appendChild(newVersionButton);

      return actions;
    }, function () {
      if (!isExpanded) {
        return null;
      }

      return versionSelect;
    });
    var section = accordion.section;
    var content = accordion.content;

    var nameSection = document.createElement('div');
    nameSection.className = 'recipe-version-name-section';

    var originalVersionName = activeVersion.versionName || '';

    var versionNameInput = document.createElement('input');
    versionNameInput.className = 'recipe-version-name-input';
    versionNameInput.type = 'text';
    versionNameInput.placeholder = 'Version name (e.g., 2026-05-03 14:30)';
    versionNameInput.value = originalVersionName;
    nameSection.appendChild(versionNameInput);

    versionNameInput.addEventListener('change', async function () {
      var newName = versionNameInput.value.trim();
      if (!newName) {
        versionNameInput.value = originalVersionName;
        return;
      }

      try {
        await window.KaPRecipesService.updateVersionName(record.id, activeVersion.id, newName);
        originalVersionName = newName;
        activeVersion.versionName = newName;

        var selectedOption = Array.prototype.find.call(versionSelect.options, function (option) {
          return option.value === String(activeVersion.id);
        });
        if (selectedOption) {
          selectedOption.textContent = newName;
        }
      } catch (error) {
        await showError(error.message || 'Unable to update version name.');
        versionNameInput.value = originalVersionName;
      }
    });

    content.appendChild(nameSection);

    var noteSection = document.createElement('div');
    noteSection.className = 'recipe-version-note-section';

    var originalVersionNote = activeVersion.versionNote || '';

    var noteInput = document.createElement('textarea');
    noteInput.className = 'recipe-version-note-input';
    noteInput.rows = 4;
    noteInput.placeholder = 'Optional version note';
    noteInput.value = originalVersionNote;
    noteSection.appendChild(noteInput);

    noteInput.addEventListener('change', async function () {
      var newNote = noteInput.value.trim();
      try {
        await window.KaPRecipesService.updateVersionNote(record.id, activeVersion.id, newNote);
        originalVersionNote = newNote;
        activeVersion.versionNote = newNote;
      } catch (error) {
        await showError(error.message || 'Unable to update version note.');
        noteInput.value = originalVersionNote;
      }
    });

    content.appendChild(noteSection);

    var cloneRow = document.createElement('div');
    cloneRow.className = 'recipe-version-clone-row';

    var cloneButton = document.createElement('button');
    cloneButton.type = 'button';
    cloneButton.className = 'recipe-version-secondary-button';
    cloneButton.textContent = 'Clone Version';
    cloneButton.addEventListener('click', async function () {
      var cloneConfig = await promptCloneVersionName(record);
      if (!cloneConfig) {
        return;
      }

      var clonedRecord = await cloneRecipeFromActiveVersion(record, activeVersion, cloneConfig.name);
      if (!clonedRecord) {
        return;
      }

      hooks.onOpen(clonedRecord);
    });
    cloneRow.appendChild(cloneButton);

    var cloneInfoWrap = document.createElement('span');
    cloneInfoWrap.className = 'accordion-info-wrap';

    var cloneInfoButton = document.createElement('button');
    cloneInfoButton.type = 'button';
    cloneInfoButton.className = 'accordion-info-icon';
    cloneInfoButton.textContent = '?';
    cloneInfoButton.setAttribute('aria-label', 'About cloning a version');
    cloneInfoButton.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    cloneInfoButton.addEventListener('keydown', function (event) {
      event.stopPropagation();
    });
    cloneInfoWrap.appendChild(cloneInfoButton);

    var cloneInfoTooltip = document.createElement('span');
    cloneInfoTooltip.className = 'accordion-info-tooltip';
    cloneInfoTooltip.textContent = 'Cloning a version creates a new recipe with that version\'s ingredients and instructions, without carrying over any version history.';
    cloneInfoWrap.appendChild(cloneInfoTooltip);
    cloneRow.appendChild(cloneInfoWrap);

    var deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'recipe-version-secondary-button recipe-version-delete-button';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async function () {
      var deleted = await deleteSelectedVersion(record, activeVersion);
      if (!deleted) {
        return;
      }

      var remainingVersions = await window.KaPRecipesService.getRecipeVersions(record.id);
      var nextVersion = remainingVersions.length > 0 ? remainingVersions[remainingVersions.length - 1] : null;
      await renderDetailInto(container, record, hooks, nextVersion ? nextVersion.id : null);
    });
    cloneRow.appendChild(deleteButton);

    content.appendChild(cloneRow);

    detailShell.appendChild(section);

    if (shouldFocusVersionName(record.id, activeVersion.id)) {
      requestAnimationFrame(function () {
        versionNameInput.focus();
        versionNameInput.setSelectionRange(versionNameInput.value.length, versionNameInput.value.length);
      });
      clearVersionNoteFocus(record.id);
    }

    return section;
  }

  function appendDescriptionAccordionSection(container, record, hooks, selectedVersionNumber, canEditDescription) {
    var detailShell = container.querySelector('.detail-shell');
    if (!detailShell) {
      return;
    }

    var insertAfterSection = detailShell.querySelector('.recipe-accordion-card');

    var isExpanded = isDescriptionAccordionExpanded(record.id);
    var accordion = buildAccordionSection('Description', isExpanded, function () {
      setDescriptionAccordionExpanded(record.id, !isExpanded);
      renderDetailInto(container, record, hooks, selectedVersionNumber);
    });
    var section = accordion.section;
    var content = accordion.content;

    if (canEditDescription) {
      var originalDescription = record.description || '';

      var descriptionInput = document.createElement('textarea');
      descriptionInput.className = 'recipe-version-note-input';
      descriptionInput.rows = 4;
      descriptionInput.placeholder = 'Optional recipe description';
      descriptionInput.value = originalDescription;

      var saveStatus = document.createElement('span');
      saveStatus.className = 'recipe-version-save-status';
      saveStatus.setAttribute('aria-live', 'polite');

      var saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'recipe-version-save-button';
      saveButton.textContent = 'Save';
      saveButton.disabled = true;

      function updateDescriptionSaveState() {
        var isDirty = descriptionInput.value !== originalDescription;
        saveButton.disabled = !isDirty;
        saveStatus.textContent = isDirty ? 'Unsaved changes' : 'Saved';
        saveStatus.classList.toggle('is-dirty', isDirty);
      }

      descriptionInput.addEventListener('input', updateDescriptionSaveState);

      saveButton.addEventListener('click', async function () {
        try {
          await window.KaPRecipesService.updateRecipeDescription(record.id, descriptionInput.value);
          setDescriptionAccordionExpanded(record.id, true);
          originalDescription = descriptionInput.value;
          record.description = originalDescription;
          updateDescriptionSaveState();
        } catch (error) {
          await showError(error.message || 'Unable to update recipe description.');
        }
      });

      updateDescriptionSaveState();
      content.appendChild(descriptionInput);

      var saveRow = document.createElement('div');
      saveRow.className = 'recipe-version-clone-row';

      var saveActions = document.createElement('div');
      saveActions.className = 'recipe-version-save-actions';
      saveActions.appendChild(saveStatus);
      saveActions.appendChild(saveButton);
      saveRow.appendChild(saveActions);
      content.appendChild(saveRow);
    } else {
      var readOnlyText = document.createElement('p');
      readOnlyText.className = 'recipe-description-readonly';
      readOnlyText.textContent = record.description || 'No description yet.';
      content.appendChild(readOnlyText);
    }

    if (insertAfterSection) {
      detailShell.insertBefore(section, insertAfterSection.nextSibling);
    } else {
      detailShell.appendChild(section);
    }
    return section;
  }

  function appendTagsAccordionSection(container, record, hooks, selectedVersionNumber, canEditTags, descriptionSection, allRecipeTags) {
    var detailShell = container.querySelector('.detail-shell');
    var insertAfterSection = descriptionSection || (detailShell ? detailShell.querySelector('.recipe-accordion-card') : null);
    if (!detailShell) {
      return;
    }

    var currentTags = normalizeTags(record.tags);
    var dropdownOpen = false;
    var allKnownTags = normalizeTags(allRecipeTags);

    var accordion = buildAccordionSection('', false, function () {
      // Tags section has no accordion body content; keep it non-expandable.
    }, null, function () {
      var lead = document.createElement('div');
      lead.className = 'recipe-tags-lead';

      var buttonWrap = document.createElement('div');
      buttonWrap.className = 'recipe-tags-picker';

      var pickerButton = document.createElement('button');
      pickerButton.type = 'button';
      pickerButton.className = 'recipe-tags-button';
      pickerButton.textContent = '\ud83c\udff7';
      pickerButton.setAttribute('aria-label', 'Add or select recipe tag');
      pickerButton.setAttribute('aria-haspopup', 'menu');
      pickerButton.setAttribute('aria-expanded', 'false');
      pickerButton.addEventListener('click', function (event) {
        event.stopPropagation();
        setDropdownOpen(!dropdownOpen);
      });

      var dropdown = document.createElement('div');
      dropdown.className = 'recipe-tags-dropdown';
      dropdown.hidden = true;

      var tagInput = document.createElement('input');
      tagInput.type = 'text';
      tagInput.className = 'recipe-tags-input';
      tagInput.placeholder = 'Select or add tag';
      tagInput.setAttribute('aria-label', 'Select or add tag');

      var optionsWrap = document.createElement('div');
      optionsWrap.className = 'recipe-tags-options';

      function renderOptions() {
        var query = String(tagInput.value || '').trim().toLowerCase();
        var available = allKnownTags.filter(function (tag) {
          if (currentTags.indexOf(tag) >= 0) {
            return false;
          }

          if (!query) {
            return true;
          }

          return tag.indexOf(query) >= 0;
        });

        optionsWrap.replaceChildren();

        available.slice(0, 12).forEach(function (tag) {
          var optionButton = document.createElement('button');
          optionButton.type = 'button';
          optionButton.className = 'recipe-tags-option';
          optionButton.textContent = tag;
          optionButton.addEventListener('click', async function (event) {
            event.stopPropagation();
            await window.KaPRecipesService.addTagToRecipe(record.id, tag);
            await renderDetailInto(container, record, hooks, selectedVersionNumber);
          });
          optionsWrap.appendChild(optionButton);
        });

        if (available.length === 0) {
          var empty = document.createElement('span');
          empty.className = 'recipe-tags-options-empty';
          empty.textContent = 'No matching tags.';
          optionsWrap.appendChild(empty);
        }
      }

      tagInput.addEventListener('click', function (event) {
        event.stopPropagation();
      });
      tagInput.addEventListener('input', renderOptions);
      tagInput.addEventListener('keydown', async function (event) {
        if (event.key !== 'Enter') {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        var value = String(tagInput.value || '').trim();
        if (!value) {
          return;
        }

        await window.KaPRecipesService.addTagToRecipe(record.id, value);
        await renderDetailInto(container, record, hooks, selectedVersionNumber);
      });

      function setDropdownOpen(isOpen) {
        dropdownOpen = !!isOpen;
        dropdown.hidden = !dropdownOpen;
        pickerButton.setAttribute('aria-expanded', dropdownOpen ? 'true' : 'false');

        if (dropdownOpen) {
          window.KaPUI.SetActiveOverflowMenu(buttonWrap, setDropdownOpen, true);
          renderOptions();
          requestAnimationFrame(function () {
            tagInput.focus();
          });
        } else {
          window.KaPUI.SetActiveOverflowMenu(buttonWrap, setDropdownOpen, false);
        }
      }

      if (!canEditTags) {
        pickerButton.disabled = true;
      }

      dropdown.appendChild(tagInput);
      dropdown.appendChild(optionsWrap);
      buttonWrap.appendChild(pickerButton);
      buttonWrap.appendChild(dropdown);
      lead.appendChild(buttonWrap);

      var tagsWrap = document.createElement('div');
      tagsWrap.className = 'recipe-tags-list';

      if (currentTags.length === 0) {
        var emptyTag = document.createElement('span');
        emptyTag.className = 'recipe-tag-empty';

        var emptyTagArrow = document.createElement('span');
        emptyTagArrow.className = 'recipe-tag-empty-arrow';
        emptyTagArrow.textContent = '←';
        emptyTag.appendChild(emptyTagArrow);

        var emptyTagText = document.createElement('span');
        emptyTagText.className = 'recipe-tag-empty-text';
        emptyTagText.textContent = 'Click to add tags';
        emptyTag.appendChild(emptyTagText);

        tagsWrap.appendChild(emptyTag);
      } else {
        currentTags.forEach(function (tag) {
          var tagNode = document.createElement('span');
          tagNode.className = 'recipe-tag-pill';

          var tagLabel = document.createElement('span');
          tagLabel.className = 'recipe-tag-label';
          tagLabel.textContent = tag;
          tagNode.appendChild(tagLabel);

          if (canEditTags) {
            var removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'recipe-tag-remove-button';
            removeButton.setAttribute('aria-label', 'Remove tag ' + tag);
            removeButton.textContent = 'x';
            removeButton.addEventListener('click', async function (event) {
              event.stopPropagation();
              await window.KaPRecipesService.removeTagFromRecipe(record.id, tag);
              await renderDetailInto(container, record, hooks, selectedVersionNumber);
            });
            tagNode.appendChild(removeButton);
          }

          tagsWrap.appendChild(tagNode);
        });
      }

      lead.appendChild(tagsWrap);

      return lead;
    });

    var section = accordion.section;
    if (insertAfterSection) {
      detailShell.insertBefore(section, insertAfterSection.nextSibling);
    } else {
      detailShell.appendChild(section);
    }
  }

  function appendBatchSizeSection(container, record, hooks, selectedVersionId, batchSize) {
    var detailShell = container.querySelector('.detail-shell');
    if (!detailShell) {
      return;
    }

    var section = document.createElement('section');
    section.className = 'recipe-batch-size-section';

    var row = document.createElement('div');
    row.className = 'recipe-batch-size-row';

    var textWrap = document.createElement('div');
    textWrap.className = 'recipe-batch-size-text';

    var label = document.createElement('label');
    label.className = 'recipe-batch-size-label';
    label.textContent = 'Batch Size';
    textWrap.appendChild(label);

    var hint = document.createElement('p');
    hint.className = 'recipe-batch-size-hint';
    hint.textContent = 'Recipe source quantities stay the same.';
    textWrap.appendChild(hint);

    row.appendChild(textWrap);

    var stepperWrap = document.createElement('div');
    stepperWrap.className = 'recipe-batch-size-stepper-wrap';

    var isInitializing = true;
    var stepper = window.KaPUI.BuildBatchSizeStepper({
      initialValue: batchSize,
      allowEdit: true,
      onChange: function (value) {
        if (isInitializing) {
          return;
        }

        setRecipeBatchSize(record.id, selectedVersionId, value);
        renderDetailInto(container, record, hooks, selectedVersionId);
      }
    });
    isInitializing = false;

    stepperWrap.appendChild(stepper.node);
    row.appendChild(stepperWrap);

    section.appendChild(row);
    detailShell.appendChild(section);
  }

  function appendIngredientsSection(container, recipeRecord, detailItems, isViewingLatestVersion, hooks, selectedVersionNumber) {
    var detailShell = container.querySelector('.detail-shell');
    var detailList = container.querySelector('[data-detail-item-list]');
    if (!detailShell || !detailList) {
      return;
    }

    var emptyStateCard = detailShell.querySelector(':scope > .empty-state-card');
    if (emptyStateCard) {
      emptyStateCard.remove();
    }

    var section = document.createElement('section');
    section.className = 'recipe-ingredients-section';

    var header = document.createElement('div');
    header.className = 'recipe-ingredients-header';

    var title = document.createElement('h3');
    title.className = 'recipe-ingredients-title';
    title.textContent = 'Ingredients';
    header.appendChild(title);

    if (isViewingLatestVersion) {
      var addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'accordion-new-button';
      addButton.textContent = '+ Item';
      addButton.addEventListener('click', async function () {
        await addRecipeItemWithDiscoveryModal(recipeRecord, detailItems, selectedVersionNumber, isViewingLatestVersion);
        await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber);
      });
      header.appendChild(addButton);
    }

    if (!isViewingLatestVersion) {
      var addButtonForVersion = document.createElement('button');
      addButtonForVersion.type = 'button';
      addButtonForVersion.className = 'accordion-new-button';
      addButtonForVersion.textContent = '+ Item';
      addButtonForVersion.addEventListener('click', async function () {
        await addRecipeItemWithDiscoveryModal(recipeRecord, detailItems, selectedVersionNumber, false);
        await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber);
      });
      header.appendChild(addButtonForVersion);
    }

    section.appendChild(header);

    if (!detailItems || detailItems.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'recipe-ingredients-empty';
      empty.textContent = 'No ingredients yet.';
      section.appendChild(empty);
    } else {
      section.appendChild(detailList);
    }

    detailShell.appendChild(section);
  }

  async function appendInstructionsSection(container, recipeRecord, detailItems, instructions, isViewingLatestVersion, hooks, selectedVersionNumber) {
    var detailShell = container.querySelector('.detail-shell');
    if (!detailShell) {
      return;
    }

    var section = document.createElement('section');
    section.className = 'recipe-instructions-section';

    var header = document.createElement('div');
    header.className = 'recipe-instructions-header';

    var title = document.createElement('h3');
    title.className = 'recipe-instructions-title';
    title.textContent = 'Instructions';
    header.appendChild(title);

    if (isViewingLatestVersion) {
      var addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'accordion-new-button';
      addButton.textContent = '+ Step';
      addButton.addEventListener('click', async function () {
        var changed = await addInstructionWithPrompt(recipeRecord, detailItems, instructions);
        if (changed) {
          await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber);
        }
      });
      header.appendChild(addButton);
    }

    if (!isViewingLatestVersion) {
      var addButtonForVersion = document.createElement('button');
      addButtonForVersion.type = 'button';
      addButtonForVersion.className = 'accordion-new-button';
      addButtonForVersion.textContent = '+ Step';
      addButtonForVersion.addEventListener('click', async function () {
        var changed = await addInstructionToVersionWithPrompt(recipeRecord, selectedVersionNumber, detailItems, instructions);
        if (changed) {
          await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber);
        }
      });
      header.appendChild(addButtonForVersion);
    }

    section.appendChild(header);

    if (!instructions || instructions.length === 0) {
      var empty = document.createElement('p');
      empty.className = 'recipe-instructions-empty';
      empty.textContent = 'No steps yet.';
      section.appendChild(empty);
      detailShell.appendChild(section);
      return;
    }

    var list = document.createElement('div');
    list.className = 'recipe-instruction-list';
    var ingredientNameById = {};
    (detailItems || []).forEach(function (detailItem) {
      var itemId = String(detailItem && detailItem.itemId || '').trim();
      if (itemId && !ingredientNameById[itemId]) {
        ingredientNameById[itemId] = buildIngredientDisplayLine(detailItem);
      }
    });

    instructions.forEach(function (instruction) {
      var row = document.createElement('div');
      row.className = 'recipe-instruction-row';

      var numberNode = document.createElement('span');
      numberNode.className = 'recipe-instruction-number';
      numberNode.textContent = String(instruction.stepNumber) + '.';

      var contentNode = document.createElement('div');
      contentNode.className = 'recipe-instruction-content';

      var textNode = document.createElement('div');
      textNode.className = 'recipe-instruction-text';
      textNode.textContent = instruction.text;
      contentNode.appendChild(textNode);

      var ingredientRefs = normalizeInstructionIngredientRefs(instruction);
      var timer = normalizeInstructionTimer(instruction.timer);
      if (ingredientRefs.length > 0 || timer) {
        var metaNode = document.createElement('div');
        metaNode.className = 'recipe-instruction-meta';

        if (timer) {
          var timerBadge = document.createElement('span');
          timerBadge.className = 'recipe-instruction-badge recipe-instruction-badge--timer';
          timerBadge.textContent = 'Timer ' + formatStepTimerDuration(timer.durationSeconds);
          metaNode.appendChild(timerBadge);
        }

        ingredientRefs.forEach(function (itemId) {
          var ingredientBadge = document.createElement('span');
          ingredientBadge.className = 'recipe-instruction-badge';
          ingredientBadge.textContent = ingredientNameById[itemId] || 'Linked ingredient';
          metaNode.appendChild(ingredientBadge);
        });

        contentNode.appendChild(metaNode);
      }

      row.appendChild(numberNode);
      row.appendChild(contentNode);

      if (isViewingLatestVersion) {
        var menuWrap = document.createElement('div');
        menuWrap.className = 'detail-overflow-menu recipe-instruction-menu';

        var menuTrigger = document.createElement('button');
        menuTrigger.type = 'button';
        menuTrigger.className = 'record-action-button detail-overflow-trigger';
        menuTrigger.setAttribute('aria-haspopup', 'menu');
        menuTrigger.setAttribute('aria-expanded', 'false');
        menuTrigger.setAttribute('aria-label', 'Step actions');

        var menuDots = document.createElement('span');
        menuDots.className = 'detail-overflow-dots';
        menuDots.textContent = '\u2026';
        menuTrigger.appendChild(menuDots);

        var menuList = document.createElement('div');
        menuList.className = 'detail-overflow-list';
        menuList.setAttribute('role', 'menu');

        function setMenuOpen(isOpen) {
          menuList.style.display = isOpen ? 'grid' : 'none';
          menuTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          window.KaPUI.SetActiveOverflowMenu(menuWrap, setMenuOpen, isOpen);
          if (isOpen) {
            menuList.classList.remove('detail-overflow-list--up');
            if (window.KaPUI.ShouldOpenOverflowUp(menuTrigger, menuList)) {
              menuList.classList.add('detail-overflow-list--up');
            }
          }
        }

        setMenuOpen(false);

        var menuActions = [
          { label: 'Move Up', onClick: async function () { var changed = await moveInstruction(recipeRecord, instruction, 'up'); if (changed) { await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber); } } },
          { label: 'Move Down', onClick: async function () { var changed = await moveInstruction(recipeRecord, instruction, 'down'); if (changed) { await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber); } } },
          { label: 'Edit', onClick: async function () { var changed = await editInstructionWithPrompt(recipeRecord, instruction, detailItems, instructions); if (changed) { await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber); } } },
          { label: 'Remove', isDanger: true, onClick: async function () { var changed = await removeInstructionWithConfirm(recipeRecord, instruction); if (changed) { await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber); } } }
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
          menuList.appendChild(item);
        });

        menuTrigger.addEventListener('click', function (event) {
          event.stopPropagation();
          var isOpen = menuList.style.display !== 'none';
          setMenuOpen(!isOpen);
        });

        menuWrap.appendChild(menuTrigger);
        menuWrap.appendChild(menuList);
        row.appendChild(menuWrap);
      }

      if (!isViewingLatestVersion) {
        var menuWrapVersion = document.createElement('div');
        menuWrapVersion.className = 'detail-overflow-menu recipe-instruction-menu';

        var menuTriggerVersion = document.createElement('button');
        menuTriggerVersion.type = 'button';
        menuTriggerVersion.className = 'record-action-button detail-overflow-trigger';
        menuTriggerVersion.setAttribute('aria-haspopup', 'menu');
        menuTriggerVersion.setAttribute('aria-expanded', 'false');
        menuTriggerVersion.setAttribute('aria-label', 'Step actions');

        var menuDotsVersion = document.createElement('span');
        menuDotsVersion.className = 'detail-overflow-dots';
        menuDotsVersion.textContent = '\u2026';
        menuTriggerVersion.appendChild(menuDotsVersion);

        var menuListVersion = document.createElement('div');
        menuListVersion.className = 'detail-overflow-list';
        menuListVersion.setAttribute('role', 'menu');

        function setMenuOpenVersion(isOpen) {
          menuListVersion.style.display = isOpen ? 'grid' : 'none';
          menuTriggerVersion.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          window.KaPUI.SetActiveOverflowMenu(menuWrapVersion, setMenuOpenVersion, isOpen);
          if (isOpen) {
            menuListVersion.classList.remove('detail-overflow-list--up');
            if (window.KaPUI.ShouldOpenOverflowUp(menuTriggerVersion, menuListVersion)) {
              menuListVersion.classList.add('detail-overflow-list--up');
            }
          }
        }

        setMenuOpenVersion(false);

        var menuActionsVersion = [
          {
            label: 'Move Up',
            onClick: async function () {
              var changed = await moveInstruction(recipeRecord, instruction, 'up', selectedVersionNumber, false);
              if (changed) {
                await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber);
              }
            }
          },
          {
            label: 'Move Down',
            onClick: async function () {
              var changed = await moveInstruction(recipeRecord, instruction, 'down', selectedVersionNumber, false);
              if (changed) {
                await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber);
              }
            }
          },
          {
            label: 'Edit',
            onClick: async function () {
              var changed = await editInstructionWithPrompt(recipeRecord, instruction, detailItems, instructions, selectedVersionNumber, false);
              if (changed) {
                await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber);
              }
            }
          },
          {
            label: 'Remove',
            isDanger: true,
            onClick: async function () {
              var changed = await removeInstructionWithConfirm(recipeRecord, instruction, selectedVersionNumber, false);
              if (changed) {
                await renderDetailInto(container, recipeRecord, hooks, selectedVersionNumber);
              }
            }
          }
        ];

        menuActionsVersion.forEach(function (action) {
          var item = document.createElement('button');
          item.type = 'button';
          item.className = 'detail-overflow-item' + (action.isDanger ? ' detail-overflow-item--danger' : '');
          item.textContent = action.label;
          item.setAttribute('role', 'menuitem');
          item.addEventListener('click', function () {
            setMenuOpenVersion(false);
            action.onClick();
          });
          menuListVersion.appendChild(item);
        });

        menuTriggerVersion.addEventListener('click', function (event) {
          event.stopPropagation();
          var isOpen = menuListVersion.style.display !== 'none';
          setMenuOpenVersion(!isOpen);
        });

        menuWrapVersion.appendChild(menuTriggerVersion);
        menuWrapVersion.appendChild(menuListVersion);
        row.appendChild(menuWrapVersion);
      }

      list.appendChild(row);
    });

    section.appendChild(list);
    detailShell.appendChild(section);
  }

  async function renderInto(container, hooks) {
    var records = await window.KaPRecipesService.getAllRecipes();

    window.KaPUI.ReplaceMainContent(container, {
      emptyStateText: 'No recipes yet.',
      records: records,
      rowBuilder: function (record) {
        return window.KaPUI.NewListRecordRow(record, function () {
          hooks.onOpen(record);
        });
      }
    });
  }

  async function renderDetailInto(container, record, hooks, selectedVersionId) {
    try {
      var latestRecord = await window.KaPRecipesService.getRecipeById(record.id);
      if (latestRecord) {
        record = latestRecord;
      }
    } catch (_error) {
      // Continue with the provided record if refresh fails.
    }

    var availableVersions = await window.KaPRecipesService.getRecipeVersions(record.id);
    var latestVersion = availableVersions.length > 0 ? availableVersions[availableVersions.length - 1] : null;
    var resolvedVersionId = selectedVersionId || getLastViewedVersionId(record.id);
    var activeVersion = resolvedVersionId
      ? availableVersions.find(function (v) { return v.id === resolvedVersionId; })
      : latestVersion;

    if (!activeVersion) {
      activeVersion = latestVersion;
    }

    if (activeVersion) {
      setLastViewedVersionId(record.id, activeVersion.id);
    }

    var isViewingLatestVersion = !!(latestVersion && activeVersion && latestVersion.id === activeVersion.id);
    var detailItems = isViewingLatestVersion
      ? await window.KaPRecipesService.getRecipeItems(record.id)
      : await window.KaPRecipesService.getVersionItems(record.id, activeVersion.id);

    // Pre-resolve UOM abbreviations so rows can render without async per-row lookups
    var allUomUnits = [];
    try {
      allUomUnits = await window.KaPRecipesService.getAllUnitOfMeasures();
    } catch (_e) {}
    var uomById = {};
    for (var u = 0; u < allUomUnits.length; u++) {
      uomById[allUomUnits[u].id] = allUomUnits[u];
    }
    detailItems.forEach(function (item) {
      var uom = item.unitOfMeasureId ? uomById[item.unitOfMeasureId] : null;
      item.uomAbbreviation = uom ? (uom.abbreviation || uom.name || null) : null;
    });
    var instructions = isViewingLatestVersion
      ? await window.KaPRecipesService.getRecipeInstructions(record.id)
      : await window.KaPRecipesService.getVersionInstructions(record.id, activeVersion.id);
    var recipeTags = await window.KaPRecipesService.getRecipeTags(record.id);
    var allRecipeTags = await window.KaPRecipesService.getAllRecipeTags();
    record.tags = recipeTags;
    setRecipeInformationOnRecord(record, getRecipeInformation(record));
    var recipeBatchSize = getRecipeBatchSize(record.id, activeVersion ? activeVersion.id : selectedVersionId);

    var sortedItems = sortByNameAscending(detailItems);
    var titleText = record.name;

    window.KaPUI.ReplaceDetailContent(container, {
      title: titleText,
      onBack: hooks.onBack,
      onAddItem: null,
      detailItems: sortedItems,
      itemRowBuilder: function (detailItem) {
        return buildRecipeDetailItemRow(
          record,
          detailItem,
          container,
          hooks,
          activeVersion ? activeVersion.id : undefined,
          isViewingLatestVersion,
          recipeBatchSize
        );
      },
      actions: [
        {
          label: 'Add To Grocery List',
          onClick: async function () {
            var ingredients = detailItems;
            if (!ingredients || ingredients.length === 0) {
              await showError('This recipe has no ingredients to add.');
              return;
            }

            var activeVersionId = activeVersion ? activeVersion.id : '';
            var recipeBatchSize = getRecipeBatchSize(record.id, activeVersionId);
            var existingRecipeList = await window.KaPListsService.findActiveRecipeDerivedList(record.id, activeVersionId);
            var currentBatchSize = existingRecipeList && existingRecipeList.batchSize != null
              ? Number(existingRecipeList.batchSize)
              : 1;

            var existingListItems = existingRecipeList
              ? await window.KaPListsService.getListItems(existingRecipeList.id)
              : [];
            var existingSourceKeys = new Set(
              existingListItems
                .filter(function (item) { return item.sourceRecipeItemKey; })
                .map(function (item) { return String(item.sourceRecipeItemKey); })
            );

            var result = await window.KaPUI.ShowAddToListModal({
              recipeName: record.name,
              ingredients: ingredients,
              initialBatchSize: recipeBatchSize,
              batchLabel: existingRecipeList ? 'Additional Batch' : 'Batch Size',
              preCheckedKeys: existingRecipeList ? existingSourceKeys : null,
              batchHintFormatter: existingRecipeList
                ? function (additionalBatch) {
                  var pluralizeHelper = function(value) {
                    var num = Number(value);
                    return Math.abs(num - 1) < 0.001 ? 'batch' : 'batches';
                  };
                  var additional = Number(additionalBatch || 0);
                  var total = currentBatchSize + additional;
                  return 'This recipe already has a grocery list. Adding \''
                    + window.KaPUI.FormatBatchSize(additional)
                    + '\' ' + pluralizeHelper(additional)
                    + ' for total \''
                    + window.KaPUI.FormatBatchSize(total)
                    + '\' ' + pluralizeHelper(total);
                }
                : null
            });

            if (!result) {
              return;
            }

            try {
              var targetList = existingRecipeList;
              if (!targetList) {
                targetList = await window.KaPListsService.createRecipeDerivedList({
                  recipeId: record.id,
                  recipeVersionId: activeVersionId,
                  recipeVersionName: activeVersion && activeVersion.versionName ? activeVersion.versionName : '',
                  recipeName: record.name,
                  batchSize: result.batchSize
                });
              }

              await window.KaPListsService.upsertRecipeDerivedItems(
                targetList.id,
                result.selectedIngredients,
                existingRecipeList ? result.batchSize : undefined,
                existingRecipeList ? true : false
              );
            } catch (error) {
              await showError(error.message || 'Unable to add ingredients to list.');
            }
          }
        },
        {
          label: 'Edit Recipe Name',
          onClick: async function () {
            var renamed = await renameRecipe(record);
            if (renamed) {
              await renderDetailInto(container, renamed, hooks, activeVersion ? activeVersion.id : null);
            }
          }
        },
        {
          label: 'Export Recipe',
          onClick: async function () {
            try {
              await exportRecipeVersion(record, activeVersion, detailItems, instructions, recipeTags);
            } catch (error) {
              await showError(error.message || 'Unable to export recipe.');
            }
          }
        },
        {
          label: 'Delete',
          isDanger: true,
          onClick: async function () {
            var deleted = await deleteRecipe(record);
            if (deleted) {
              hooks.onDeleted();
            }
          }
        }
      ].filter(function (a) { return a !== null; })
    });

    await appendRecipeDetailsTabbedSection(
      container,
      record,
      hooks,
      availableVersions,
      activeVersion,
      latestVersion,
      allRecipeTags
    );

    appendBatchSizeSection(
      container,
      record,
      hooks,
      activeVersion ? activeVersion.id : null,
      recipeBatchSize
    );
    appendIngredientsSection(
      container,
      record,
      detailItems,
      isViewingLatestVersion,
      hooks,
      activeVersion ? activeVersion.id : null
    );

    await appendInstructionsSection(
      container,
      record,
      detailItems,
      instructions,
      isViewingLatestVersion,
      hooks,
      activeVersion ? activeVersion.id : null
    );
  }

  window.KaPRecipesPage = {
    createRecipe: createRecipe,
    importRecipeFromKap: importRecipeFromKap,
    renderInto: renderInto,
    renderDetailInto: renderDetailInto
  };
})();
