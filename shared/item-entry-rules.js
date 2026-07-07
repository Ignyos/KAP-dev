(function () {
  function ensureValidItemEntryName(name) {
    var trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Item name is required.');
    }

    return trimmed;
  }

  function normalizeDescription(description) {
    return (description || '').trim();
  }

  function normalizeOptionalIntegerQuantity(quantity) {
    var raw = String(quantity == null ? '' : quantity).trim();
    if (!raw) {
      return null;
    }

    if (!/^-?\d+$/.test(raw)) {
      throw new Error('Quantity must be an integer.');
    }

    return Number(raw);
  }

  function normalizeOptionalDecimalQuantity(quantity) {
    var raw = String(quantity == null ? '' : quantity).trim();
    if (!raw) {
      return null;
    }

    if (!/^-?(?:\d+|\d*\.\d+|\d+\/\d+|\d+\s+\d+\/\d+)$/.test(raw)) {
      throw new Error('Quantity must be a decimal number or fraction.');
    }

    if (/^-?\d+\s+\d+\/\d+$/.test(raw)) {
      var wholeAndFraction = raw.split(/\s+/);
      var wholePart = Number(wholeAndFraction[0]);
      var fractionParts = wholeAndFraction[1].split('/');
      var mixedNumerator = Number(fractionParts[0]);
      var mixedDenominator = Number(fractionParts[1]);

      if (!Number.isFinite(wholePart) || !Number.isFinite(mixedNumerator) || !Number.isFinite(mixedDenominator) || mixedDenominator === 0) {
        throw new Error('Quantity must be a decimal number or fraction.');
      }

      var sign = wholePart < 0 ? -1 : 1;
      return wholePart + sign * (mixedNumerator / mixedDenominator);
    }

    if (raw.indexOf('/') >= 0) {
      var parts = raw.split('/');
      var numerator = Number(parts[0]);
      var denominator = Number(parts[1]);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        throw new Error('Quantity must be a decimal number or fraction.');
      }

      return numerator / denominator;
    }

    var parsed = Number(raw);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      throw new Error('Quantity must be a decimal number or fraction.');
    }

    return parsed;
  }

  function validateQuantityForBehavior(quantityValue, quantityBehavior, quantityStep) {
    if (quantityValue == null) {
      return true;
    }

    var numeric = Number(quantityValue);
    if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {
      throw new Error('Quantity must be a decimal number or fraction.');
    }

    return true;
  }

  function normalizeNameKey(name) {
    return String(name || '').trim().toLowerCase();
  }

  function findJoinRecordByName(joinRecords, name) {
    var nameKey = normalizeNameKey(name);
    return (joinRecords || []).find(function (record) {
      return normalizeNameKey(record && record.name) === nameKey;
    }) || null;
  }

  function incrementQuantity(currentQuantity) {
    return currentQuantity == null ? 1 : currentQuantity + 1;
  }

  window.KaPItemEntryRules = {
    ensureValidItemEntryName: ensureValidItemEntryName,
    normalizeDescription: normalizeDescription,
    normalizeOptionalIntegerQuantity: normalizeOptionalIntegerQuantity,
    normalizeOptionalDecimalQuantity: normalizeOptionalDecimalQuantity,
    validateQuantityForBehavior: validateQuantityForBehavior,
    findJoinRecordByName: findJoinRecordByName,
    incrementQuantity: incrementQuantity
  };
})();
