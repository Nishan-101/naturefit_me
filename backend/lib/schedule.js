const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function formatISODate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dubaiParts(now) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function parseCutoff(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return 18 * 60;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return 18 * 60;
  return hours * 60 + minutes;
}

function earliestDeliveryDate(now, cutoffTime, leadDays) {
  const lead = Number.isInteger(leadDays) && leadDays >= 0 ? leadDays : 1;
  const { date, minutes } = dubaiParts(now instanceof Date ? now : new Date(now));
  const extra = minutes >= parseCutoff(cutoffTime) ? lead + 1 : lead;
  return formatISODate(addDays(parseISODate(date), extra));
}

function inPause(isoDate, pauseRanges) {
  return (pauseRanges || []).some((range) => isoDate >= range.startDate && isoDate <= range.endDate);
}

function buildDeliveryDates(startDate, weekdays, count, pauseRanges) {
  const start = parseISODate(startDate);
  const days = [...new Set((weekdays || []).map(Number))].filter((day) => day >= 0 && day <= 6);
  const total = Number(count);
  if (!start || !days.length || !Number.isInteger(total) || total < 1) return [];
  const dates = [];
  let cursor = start;
  let guard = 0;
  while (dates.length < total && guard < 1200) {
    const iso = formatISODate(cursor);
    if (days.includes(cursor.getUTCDay()) && !inPause(iso, pauseRanges)) dates.push(iso);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return dates;
}

function reconcileDeliveries(existing, targetDates) {
  const target = new Set(targetDates);
  const actions = [];
  const seen = new Set();
  (existing || []).forEach((row) => {
    seen.add(row.date);
    if (row.status === "delivered") return;
    if (!target.has(row.date)) actions.push({ type: "delete", id: row.id, date: row.date });
    else if (row.status !== "scheduled") actions.push({ type: "update", id: row.id, date: row.date, status: "scheduled" });
  });
  targetDates.forEach((date) => {
    if (!seen.has(date)) actions.push({ type: "insert", date, status: "scheduled" });
  });
  return actions;
}

function addDaysIso(isoDate, days) {
  return formatISODate(addDays(parseISODate(isoDate), days));
}

function effectivePauseRanges(requests) {
  const pauses = (requests || []).filter((item) => item.requestType === "pause" && item.status === "approved");
  const resumes = (requests || []).filter((item) => item.requestType === "resume" && item.status === "approved");
  let ranges = pauses.map((item) => ({ startDate: item.startDate, endDate: item.endDate }));
  resumes.forEach((resume) => {
    const next = [];
    ranges.forEach((range) => {
      if (resume.endDate < range.startDate || resume.startDate > range.endDate) {
        next.push(range);
        return;
      }
      if (resume.startDate > range.startDate) {
        next.push({ startDate: range.startDate, endDate: addDaysIso(resume.startDate, -1) });
      }
      if (resume.endDate < range.endDate) {
        next.push({ startDate: addDaysIso(resume.endDate, 1), endDate: range.endDate });
      }
    });
    ranges = next.filter((range) => range.startDate && range.endDate && range.startDate <= range.endDate);
  });
  return ranges;
}

function remainingDeliveryDays(dates, today) {
  return (dates || []).filter((date) => date.date >= today && date.status === "scheduled").length;
}

module.exports = {
  DAY_NAMES,
  parseISODate,
  formatISODate,
  addDays,
  dubaiParts,
  earliestDeliveryDate,
  buildDeliveryDates,
  reconcileDeliveries,
  effectivePauseRanges,
  remainingDeliveryDays,
};
