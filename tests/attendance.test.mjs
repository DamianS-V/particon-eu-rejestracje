import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAttendance } from '../scripts/attendance.mjs';

const snapshot = { uniquePersons: 12, reportCount: 2, unresolvedEntries: 1, periodStart: '2026-11-03', periodEnd: '2026-11-12', compiledOn: '2026-11-17' };
test('attendance is optional and only approved aggregate fields enter the payload', () => {
  assert.equal(parseAttendance(undefined), null);
  assert.deepEqual(parseAttendance(JSON.stringify({ ...snapshot, persons: [{ email: 'private@example.org' }] })), snapshot);
});
test('invalid attendance snapshots fail without exposing source values', () => {
  for (const patch of [{ uniquePersons: -1 }, { uniquePersons: 1.5 }, { periodEnd: '2026-02-30' }, { compiledOn: '2026-11-01' }]) {
    assert.throws(() => parseAttendance(JSON.stringify({ ...snapshot, ...patch })), /^Error: ATTENDANCE_SUMMARY zawiera nieprawidłowe podsumowanie obecności\.$/);
  }
});
