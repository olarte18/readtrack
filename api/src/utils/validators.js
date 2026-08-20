const httpError = require("./httpError");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isString = (v) => typeof v === "string";
const isNumber = (v) => typeof v === "number" && !Number.isNaN(v);
const isInteger = (v) => Number.isInteger(v);

// validate(body, { field: { required, type, min, max, enum } }) => campos limpios
function validate(body = {}, schema) {
  const result = {};
  for (const [field, rules] of Object.entries(schema)) {
    const raw = body[field];
    const hasValue = raw !== undefined && raw !== null && raw !== "";

    if (!hasValue) {
      if (rules.required) throw httpError(400, `${field} es requerido`);
      continue;
    }

    const isNumeric = rules.type === "number" || rules.type === "integer";
    const value = isNumeric ? Number(raw) : typeof raw === "string" ? raw.trim() : raw;

    if (rules.type === "email" && !EMAIL_RE.test(value)) {
      throw httpError(400, `${field} no es un email válido`);
    } else if (rules.type === "string" && !isString(value)) {
      throw httpError(400, `${field} debe ser texto`);
    } else if (isNumeric && !isNumber(value)) {
      throw httpError(400, `${field} debe ser numérico`);
    } else if (rules.type === "integer" && !isInteger(value)) {
      throw httpError(400, `${field} debe ser un entero`);
    }

    if (rules.min !== undefined && (isNumeric ? value < rules.min : value.length < rules.min)) {
      throw httpError(400, `${field} no es válido`);
    }
    if (rules.max !== undefined && (isNumeric ? value > rules.max : value.length > rules.max)) {
      throw httpError(400, `${field} no es válido`);
    }
    if (rules.enum && !rules.enum.includes(value)) {
      throw httpError(400, `${field} no es válido`);
    }

    result[field] = value;
  }
  return result;
}

module.exports = { validate };