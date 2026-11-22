import { field, parseLimeSurveyJson } from './aggregate.mjs';

export const SURVEY_ID = '846945';

const screeningFields = {
  SCREENOUT: 'Q2898',
  AGEOUT: 'Q3105',
  COUNTRYOUT: 'Q3106'
};

const capitalRegions = new Set(['PL91', 'CZ01', 'SK01', 'HU11', 'ITI4', 'FR10']);
const nuts2Codes = [
  'PL91 PL92 PL21 PL22 PL41 PL42 PL43 PL51 PL52 PL61 PL62 PL63 PL71 PL72 PL81 PL82 PL84',
  'CZ01 CZ02 CZ03 CZ04 CZ05 CZ06 CZ07 CZ08',
  'SK01 SK02 SK03 SK04',
  'HU11 HU12 HU21 HU22 HU23 HU31 HU32 HU33',
  'ITC1 ITC2 ITC3 ITC4 ITF1 ITF2 ITF3 ITF4 ITF5 ITF6 ITG1 ITG2 ITH1 ITH2 ITH3 ITH4 ITH5 ITI1 ITI2 ITI3 ITI4',
  'FR10 FRB0 FRC1 FRC2 FRD1 FRD2 FRE1 FRE2 FRF1 FRF2 FRF3 FRG0 FRH0 FRI1 FRI2 FRI3 FRJ1 FRJ2 FRK1 FRK2 FRL0 FRM0 FRY1 FRY2 FRY3 FRY4 FRY5'
].flatMap(codes => codes.split(' '));

// LimeSurvey exports selected fields by QID and returns the question codes as headers.
const dimensions = [
  {
    label: 'Kraj zamieszkania',
    code: 'RESCOUNTRY',
    column: 'Q2897',
    categories: { PL: 'Polska', CZ: 'Czechy', SK: 'Słowacja', HU: 'Węgry', IT: 'Włochy', FR: 'Francja', OTHER: 'Inny kraj' }
  },
  {
    label: 'Wielkość miejscowości',
    code: 'SETTLEMENT',
    column: 'Q2909',
    categories: {
      P1K: 'Poniżej 5 tys. mieszkańców',
      P1K5K: 'Poniżej 5 tys. mieszkańców',
      A001: 'Od 5 000 do 49 999 mieszkańców',
      A002: 'Od 5 000 do 49 999 mieszkańców',
      A003: 'Od 5 000 do 49 999 mieszkańców',
      A004: 'Od 50 000 do 499 999 mieszkańców',
      A005: 'Od 50 000 do 499 999 mieszkańców',
      P500K: '500 tys. mieszkańców i więcej',
      DK: 'Nie wiem'
    }
  },
  {
    label: 'Region zamieszkania',
    note: 'Podział na region NUTS 2, w którym leży stolica danego kraju, i pozostałe regiony.',
    code: 'NUTS2',
    column: 'Q2908',
    categories: Object.fromEntries(nuts2Codes.map(code => [
      code, capitalRegions.has(code) ? 'Region obejmujący stolicę kraju' : 'Pozostałe regiony'
    ]))
  },
  {
    label: 'Grupa wieku',
    code: 'AGEGROUP',
    column: 'Q2899',
    categories: { 1: '18–24', 2: '25–34', 3: '35–44', 4: '45–54', 5: '55–64', 6: '65–74', 7: '75+' }
  },
  {
    label: 'Płeć',
    code: 'GENDER',
    column: 'Q2910',
    categories: { F: 'Kobieta', M: 'Mężczyzna', O: 'Osoba niebinarna', A001: 'Inna tożsamość płciowa' }
  },
  {
    label: 'Główna sytuacja zawodowa',
    code: 'EMPLOYMENT',
    column: 'Q2911',
    categories: {
      EMP: 'Praca najemna',
      SELF: 'Praca na własny rachunek',
      STUD: 'Nauka lub studia',
      UNEMP: 'Poszukiwanie pracy',
      RET: 'Emerytura',
      CARE: 'Prowadzenie domu lub opieka',
      INACT: 'Brak pracy z innych powodów',
      OTH: 'Inna sytuacja'
    }
  }
];

export const SURVEY_EXPORT_FIELDS = [
  'id',
  'submitdate',
  ...Object.values(screeningFields),
  ...dimensions.map(dimension => dimension.column)
];

export function aggregateSurvey(payload, now = new Date()) {
  const rows = parseLimeSurveyJson(payload, SURVEY_ID);
  const expectedHeadings = ['submitdate', ...Object.keys(screeningFields), ...dimensions.map(dimension => dimension.code)];
  const missingHeadings = expectedHeadings.filter(code => !rows.some(row => Object.hasOwn(row, code)));
  if (rows.length && missingHeadings.length) {
    throw new Error(`Eksport ankiety 846945 nie zawiera wszystkich wymaganych kolumn (${missingHeadings.join(', ')}).`);
  }
  const completed = [];
  let incomplete = 0;
  let screenedOut = 0;
  for (const row of rows) {
    const submitted = field(row, 'submitdate');
    if (Object.keys(screeningFields).some(code => field(row, code) === '1')) {
      screenedOut++;
    } else if (submitted && submitted !== 'N') {
      completed.push(row);
    } else {
      incomplete++;
    }
  }
  const demographics = dimensions.map(({ label, note, code, categories }) => {
    const counts = new Map();
    let missing = 0;
    let unmapped = 0;
    for (const row of completed) {
      const answer = field(row, code);
      if (!answer) {
        missing++;
      } else if (Object.hasOwn(categories, answer)) {
        const category = categories[answer];
        counts.set(category, (counts.get(category) ?? 0) + 1);
      } else {
        unmapped++;
      }
    }
    const groups = [...new Set(Object.values(categories))].filter(label => counts.has(label))
      .map(label => ({ label, count: counts.get(label) }));
    return { label, note, groups, missing, unmapped };
  });
  return {
    updatedAt: now.toISOString(),
    completed: completed.length,
    incomplete,
    screenedOut,
    demographics
  };
}
