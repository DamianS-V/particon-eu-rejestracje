import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateSurvey, SURVEY_EXPORT_FIELDS } from '../scripts/survey.mjs';

const response = {
  submitdate: '2026-11-21 10:00:00',
  SCREENOUT: '0', AGEOUT: '0', COUNTRYOUT: '0',
  RESCOUNTRY: 'PL', SETTLEMENT: 'P1K', NUTS2: 'PL91',
  AGEGROUP: 1, GENDER: 'F', EMPLOYMENT: 'EMP',
  INCOMESUBJ: '3', BIRTHCOUNTRY: '1', PARENTSABROAD: '1',
  'LAWBACKGROUND[EDU]': 'Y', 'LAWBACKGROUND[PROF]': 'Y',
  'LAWBACKGROUND[APPL]': 'N', 'LAWBACKGROUND[NONE]': 'N',
  ISCEDSTATUS: 'PROVISIONAL', ISCEDLEVEL: '7', CONSTIMPORT100: '80'
};

test('stosuje kryteria kwalifikacji i wspólne kategorie metryczki ankiety', () => {
  const summary = aggregateSurvey({ responses: [
    { id: 1, ...response },
    { id: 2, ...response, RESCOUNTRY: 'IT', SETTLEMENT: 'P1K5K', NUTS2: 'ITI4' },
    { id: 3, ...response, RESCOUNTRY: 'FR', SETTLEMENT: 'wpis lokalny', NUTS2: 'FRF1' },
    { id: 4, ...response, SETTLEMENT: '', NUTS2: 'PL92' },
    { id: 5, ...response, submitdate: 'N', SETTLEMENT: 'P500K' },
    { id: 6, ...response, submitdate: null, AGEOUT: 1 },
    { id: 7, ...response, COUNTRYOUT: '1', RESCOUNTRY: 'OTHER' },
    { id: 8, ...response, submitdate: null, SCREENOUT: '1' }
  ] });
  assert.equal(summary.completed, 4);
  assert.equal(summary.incomplete, 1);
  assert.equal(summary.screenedOut, 3);
  const byLabel = Object.fromEntries(summary.demographics.map(dimension => [dimension.label, dimension]));
  assert.deepEqual(byLabel['Kraj zamieszkania'].groups, [
    { label: 'Polska', count: 2 }, { label: 'Włochy', count: 1 }, { label: 'Francja', count: 1 }
  ]);
  assert.deepEqual(byLabel['Wielkość miejscowości'].groups, [
    { label: 'Poniżej 5 tys. mieszkańców', count: 2 }
  ]);
  assert.equal(byLabel['Wielkość miejscowości'].missing, 1);
  assert.equal(byLabel['Wielkość miejscowości'].unmapped, 1);
  assert.deepEqual(byLabel['Region zamieszkania'].groups, [
    { label: 'Region obejmujący stolicę kraju', count: 2 },
    { label: 'Pozostałe regiony', count: 2 }
  ]);
  assert.deepEqual(byLabel['Grupa wieku'].groups, [{ label: '18–24', count: 4 }]);
  assert.ok(!JSON.stringify(summary).includes('wpis lokalny'));
});

test('liczy udziały dla kraju i rozkład ocen po deduplikacji wskazań', () => {
  const summary = aggregateSurvey({ responses: [
    { id: 1, ...response },
    { id: 2, ...response, INCOMESUBJ: '4', ISCEDSTATUS: 'REVIEW', ISCEDLEVEL: '7', CONSTIMPORT100: '100' },
    {
      id: 3, ...response, RESCOUNTRY: 'CZ', AGEGROUP: null, ISCEDSTATUS: 'NOSCHOOL',
      'LAWBACKGROUND[EDU]': 'N', 'LAWBACKGROUND[PROF]': 'N', 'LAWBACKGROUND[NONE]': 'Y', CONSTIMPORT100: '0'
    },
    { id: 4, ...response, RESCOUNTRY: '', CONSTIMPORT100: '101' },
    { id: 5, ...response, submitdate: '', CONSTIMPORT100: '10' }
  ] });
  const [poland, czechia, slovakia] = summary.comparison.countries;
  assert.equal(poland.total, 2);
  assert.deepEqual(poland.distributions.INCOMESUBJ.groups, [{ label: 'Radzimy sobie z trudem', count: 2 }]);
  assert.deepEqual(poland.distributions.EDUCATION.groups, [
    { label: 'Wyższe (5–8)', count: 1 }, { label: 'Wymaga weryfikacji', count: 1 }
  ]);
  assert.equal(czechia.distributions.AGEGROUP.missing, 1);
  assert.deepEqual(czechia.distributions.EDUCATION.groups, [{ label: 'Do niższego średniego (ISCED 0–2)', count: 1 }]);
  assert.equal(slovakia.total, 0);
  assert.equal(summary.comparison.unassigned, 1);
  assert.deepEqual(summary.importance.map(({ count, bins }) => ({ count, bins })), [
    { count: 2, bins: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1] },
    { count: 1, bins: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
  ]);
});

test('histogram stosuje wspólne granice i uwzględnia oba końce skali', () => {
  const scores = ['0', '9.99', '10', '89.99', '90', '100', '-1', '100.01', '', 'nie wiem'];
  const summary = aggregateSurvey({ responses: scores.map((score, id) => ({
    id, ...response, CONSTIMPORT100: score
  })) });
  assert.equal(summary.importance[0].count, 6);
  assert.deepEqual(summary.importance[0].bins, [2, 1, 0, 0, 0, 0, 0, 0, 1, 2]);
  assert.equal(summary.importance[1].count, 0);
});

test('pusty eksport ma zerowe liczniki, a eksport bez kolumn sygnalizuje błąd', () => {
  assert.equal(aggregateSurvey({ responses: [] }).completed, 0);
  assert.throws(() => aggregateSurvey({ responses: [{ id: 1, submitdate: '' }] }), /wymaganych kolumn/);
  assert.deepEqual(SURVEY_EXPORT_FIELDS, [
    'id', 'submitdate', 'Q2898', 'Q3105', 'Q3106', 'Q2897', 'Q2909', 'Q2908', 'Q2899', 'Q2910', 'Q2911',
    'Q2913', 'Q2915', 'Q2916', 'Q2918_S3137', 'Q2918_S3138', 'Q2918_S3139', 'Q2918_S3140', 'Q3126', 'Q3128', 'Q3113'
  ]);
});
