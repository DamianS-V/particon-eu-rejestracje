// Only an aggregate snapshot is accepted; participant records stay offline.
export function parseAttendance(value) {
  if (!value?.trim()) return null;
  try {
    const data = JSON.parse(value);
    const result = {};
    for (const key of ['uniquePersons', 'reportCount', 'unresolvedEntries']) {
      if (!Number.isSafeInteger(data[key]) || data[key] < 0) throw new Error();
      result[key] = data[key];
    }
    for (const key of ['periodStart', 'periodEnd', 'compiledOn']) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data[key]) || new Date(data[key]).toISOString().slice(0, 10) !== data[key]) throw new Error();
      result[key] = data[key];
    }
    if (result.periodStart > result.periodEnd || result.periodEnd > result.compiledOn) throw new Error();
    return result;
  } catch {
    throw new Error('ATTENDANCE_SUMMARY zawiera nieprawidłowe podsumowanie obecności.');
  }
}
