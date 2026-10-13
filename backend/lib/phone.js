function normalizePhone(countryCode, nationalNumber) {
  const cc = String(countryCode || "").replace(/\D/g, "");
  let national = String(nationalNumber || "").replace(/\D/g, "");
  if (!cc || !national) return null;
  if (national.startsWith(cc) && national.length > cc.length + 5) national = national.slice(cc.length);
  if (national.startsWith("0")) national = national.replace(/^0+/, "");
  const phone = `+${cc}${national}`;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return phone;
}

module.exports = { normalizePhone };
