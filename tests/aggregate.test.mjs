import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SURVEY_IDS, parseLimeSurveyJson, aggregate } from '../scripts/aggregate.mjs';
import { seal, unseal } from '../scripts/crypto.mjs';

function allEmpty() { return Object.fromEntries(SURVEY_IDS.map(sid => [sid, { responses: [] }])); }
const record = (id, email, code, submitdate, extra = {}) => ({ id, EMAIL: email, CONFIRM: code, submitdate, ...extra });

test('obsługuje opakowany format JSON LimeSurvey', () => {
  assert.deepEqual(parseLimeSurveyJson({ responses: [{ '15': { id: '15', EMAIL: 'a@b.c' } }] }, '887516'), [{ id: '15', EMAIL: 'a@b.c' }]);
});

test('deduplikuje osoby między ankietami, ale zachowuje daty i seminaria', () => {
  const payload = allEmpty();
  payload['887516'] = { responses: [
    record('1', '  Ada@Example.Org ', 'NOV10', '2026-11-09 08:00:00', { SOURCEFIRST: 'FB', ROLE: 'PRIV', 'SOURCEOTHER[IG]': 'Y' }),
    record('2', 'bea@example.org', 'NOV12', '2026-11-09 09:00:00', { SOURCEFIRST: 'LI', ROLE: 'UNI' })
  ] };
  payload['798891'] = { responses: [record('3', 'ada@example.org', 'NOV10', '2026-11-09 10:00:00', { SOURCEFIRST: 'IG' })] };
  payload['968655'] = { responses: [record('4', 'ADA@EXAMPLE.ORG', 'NO17', '2026-11-10 12:00:00')] };
  const result = aggregate(payload, new Date('2026-11-10T14:00:00.000Z'));
  assert.equal(result.metrics.uniquePersons, 2);
  assert.equal(result.metrics.registrations, 4);
  assert.equal(result.metrics.duplicateRegistrations, 2);
  assert.equal(result.events.find(e => e.key === '2026-11-10T19:00|PL').registered, 1);
  assert.equal(result.events.find(e => e.key === '2026-11-10T19:00|PL').submissions, 2);
  assert.equal(result.events.find(e => e.key === '2026-11-17T19:00|PL').registered, 1);
  assert.equal(result.channels.find(c => c.code === 'FB').first, 1);
  assert.equal(result.channels.find(c => c.code === 'IG').first, 0);
  assert.equal(result.channels.find(c => c.code === 'IG').other, 1);
  assert.equal(result.daily.at(-1).newUnique, 0);
  assert.equal(result.daily.at(-2).newUnique, 2);
  assert.ok(!JSON.stringify(result).includes('example.org'), 'E-mail nie może znaleźć się w agregatach');
});

test('odmawia publikacji nieznanego terminu (nie gubi rejestracji po cichu)', () => {
  const payload = allEmpty();
  payload['968655'] = { responses: [record('4', 'bad@example.org', 'UNKNOWN', '2026-11-09 10:00:00')] };
  assert.throws(() => aggregate(payload, new Date('2026-11-09T14:00:00Z')), /Nieznany termin/);
});

test('szyfrowanie AES-256-GCM odszyfrowuje się tylko prawidłowym kluczem', () => {
  const key = randomBytes(32);
  const summary = { metrics: { uniquePersons: 2 }, label: 'test' };
  const encrypted = seal(summary, key);
  assert.deepEqual(unseal(encrypted, key), summary);
  assert.throws(() => unseal(encrypted, randomBytes(32)));
  assert.ok(!JSON.stringify(encrypted).includes('uniquePersons'));
});
