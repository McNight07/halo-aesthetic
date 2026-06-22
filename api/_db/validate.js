function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidEmail(value) {
  return isNonEmptyString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function missingFields(body, requiredFields) {
  return requiredFields.filter((field) => !isNonEmptyString(body[field]));
}

module.exports = { isNonEmptyString, isValidEmail, missingFields };
