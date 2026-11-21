function toFils(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
}

function fromFils(fils) {
  return Math.round(Number(fils)) / 100;
}

function formatAed(value) {
  if (value == null || value === "") return null;
  const fils = toFils(value);
  if (fils == null) return null;
  return `AED ${fromFils(fils).toFixed(2)}`;
}

function displayAed(value) {
  const fils = toFils(value);
  if (fils == null) return null;
  const amount = fromFils(fils);
  if (Number.isInteger(amount)) return `AED ${amount.toLocaleString("en-US")}`;
  return `AED ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

module.exports = { toFils, fromFils, formatAed, displayAed };
