/**
 * Alsaleh World Cup Tournament 2026 - Google Sheets API
 * ------------------------------------------------------
 * Paste this file in Google Sheets > Extensions > Apps Script.
 * Deploy as Web app:
 *   Execute as: Me
 *   Who has access: Anyone
 * Then paste the /exec URL into scores.js.
 */

const CONFIG = {
  // Leave blank if this script is bound to the Google Sheet.
  // Or paste the Google Sheet ID if this is a standalone Apps Script project.
  SPREADSHEET_ID: '',

  // Sheet names that should not be treated as participant sheets.
  EXCLUDE_SHEETS: [
    'Results', 'Settings', 'Config', 'Match Scores', 'Matches',
    'Leaderboard', 'Summary', 'Families', 'Participants'
  ],

  // Scoring rules. Change these numbers if your tournament rules change.
  POINTS: {
    correctResult: 48,
    exactHome: 15,
    exactAway: 15,
    exactGoalDiff: 12
  },

  // calculate = calculate points from predictions and scores.
  // sheet = use an existing Total/Points column if present.
  SCORE_MODE: 'calculate'
};

function doGet(e) {
  try {
    const data = buildLeaderboard_();
    const callback = e && e.parameter && e.parameter.callback;
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(data) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return json_(data);
  } catch (err) {
    const payload = { ok: false, error: String(err && err.stack ? err.stack : err) };
    const callback = e && e.parameter && e.parameter.callback;
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(payload) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return json_(payload);
  }
}

function buildLeaderboard_() {
  const ss = CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet found. Bind this script to your Google Sheet or set CONFIG.SPREADSHEET_ID.');

  const externalScores = readExternalScores_(ss);
  const participantMeta = readParticipantsMeta_(ss);

  const players = ss.getSheets()
    .filter(sheet => isParticipantSheet_(sheet.getName()))
    .map(sheet => parseParticipantSheet_(sheet, externalScores, participantMeta))
    .filter(Boolean)
    .sort(sortPlayers_);

  players.forEach((p, idx) => p.rank = idx + 1);

  return {
    ok: true,
    meta: {
      tournament: 'Alsaleh World Cup Tournament 2026',
      updatedAt: new Date().toISOString(),
      participantCount: players.length,
      completedMatches: max_(players.map(p => p.completedMatches || 0)),
      scoring: CONFIG.POINTS
    },
    players,
    families: summarizeFamilies_(players)
  };
}

function isParticipantSheet_(name) {
  return CONFIG.EXCLUDE_SHEETS.map(normalize_).indexOf(normalize_(name)) === -1;
}

function parseParticipantSheet_(sheet, externalScores, participantMeta) {
  const name = sheet.getName().trim();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(normalize_);
  const col = headerMap_(headers);

  // Required fields: match/team text and home/away prediction.
  if (col.teams < 0 || col.hp < 0 || col.ap < 0) return null;

  let totalPoints = 0;
  let exactScores = 0;
  let correctResults = 0;
  let completedMatches = 0;
  const matches = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const match = String(row[col.teams] || '').trim();
    if (!match) continue;

    const hp = numberOrNull_(row[col.hp]);
    const ap = numberOrNull_(row[col.ap]);
    let hr = col.hr >= 0 ? numberOrNull_(row[col.hr]) : null;
    let ar = col.ar >= 0 ? numberOrNull_(row[col.ar]) : null;

    // Optional score override from the master score sheet.
    const key = normalizeMatch_(match);
    if (externalScores[key]) {
      hr = externalScores[key].home;
      ar = externalScores[key].away;
    }

    let calc = scoreMatch_(hp, ap, hr, ar);
    if (CONFIG.SCORE_MODE === 'sheet' && col.total >= 0 && isNumber_(row[col.total])) {
      calc.totalPoints = Number(row[col.total]);
    }

    if (calc.completed) {
      completedMatches++;
      totalPoints += calc.totalPoints;
      if (calc.exactHome && calc.exactAway) exactScores++;
      if (calc.correctResult) correctResults++;
    }

    matches.push({
      match,
      prediction: hp === null || ap === null ? '' : hp + '-' + ap,
      actual: hr === null || ar === null ? '' : hr + '-' + ar,
      completed: calc.completed,
      resultPoints: calc.resultPoints,
      homePoints: calc.homePoints,
      awayPoints: calc.awayPoints,
      diffPoints: calc.diffPoints,
      totalPoints: calc.totalPoints
    });
  }

  const meta = participantMeta[normalize_(name)] || {};
  return {
    name,
    family: meta.family || detectFamily_(name),
    totalPoints,
    exactScores,
    correctResults,
    completedMatches,
    matches
  };
}

function headerMap_(headers) {
  const find = function() {
    const names = Array.prototype.slice.call(arguments).map(normalize_);
    return headers.findIndex(h => names.indexOf(h) >= 0);
  };
  return {
    teams: find('teams', 'team', 'match', 'fixture', 'game', 'المباراة', 'الفرق'),
    hp: find('hp', 'home prediction', 'home pred', 'prediction home', 'توقع المضيف', 'توقع الفريق الأول'),
    ap: find('ap', 'away prediction', 'away pred', 'prediction away', 'توقع الضيف', 'توقع الفريق الثاني'),
    hr: find('hr', 'home result', 'home score', 'actual home', 'نتيجة المضيف', 'نتيجة الفريق الأول'),
    ar: find('ar', 'away result', 'away score', 'actual away', 'نتيجة الضيف', 'نتيجة الفريق الثاني'),
    total: find('total', 'points', 'total points', 'score', 'النقاط', 'المجموع')
  };
}

function scoreMatch_(hp, ap, hr, ar) {
  const completed = [hp, ap, hr, ar].every(v => v !== null && !isNaN(v));
  if (!completed) return emptyScore_(false);

  const correctResult = resultType_(hp, ap) === resultType_(hr, ar);
  const exactHome = hp === hr;
  const exactAway = ap === ar;
  const exactDiff = Math.abs(hp - ap) === Math.abs(hr - ar);

  const resultPoints = correctResult ? CONFIG.POINTS.correctResult : 0;
  const homePoints = exactHome ? CONFIG.POINTS.exactHome : 0;
  const awayPoints = exactAway ? CONFIG.POINTS.exactAway : 0;
  const diffPoints = exactDiff ? CONFIG.POINTS.exactGoalDiff : 0;

  return {
    completed: true,
    correctResult,
    exactHome,
    exactAway,
    exactDiff,
    resultPoints,
    homePoints,
    awayPoints,
    diffPoints,
    totalPoints: resultPoints + homePoints + awayPoints + diffPoints
  };
}

function emptyScore_(completed) {
  return { completed, correctResult:false, exactHome:false, exactAway:false, exactDiff:false, resultPoints:0, homePoints:0, awayPoints:0, diffPoints:0, totalPoints:0 };
}

function resultType_(home, away) {
  if (home > away) return 'H';
  if (home < away) return 'A';
  return 'D';
}

function readExternalScores_(ss) {
  const sheet = ss.getSheetByName('Match Scores') || ss.getSheetByName('Matches');
  if (!sheet) return {};
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};
  const headers = values[0].map(normalize_);
  const col = headerMap_(headers);
  if (col.teams < 0 || col.hr < 0 || col.ar < 0) return {};

  const map = {};
  values.slice(1).forEach(row => {
    const match = String(row[col.teams] || '').trim();
    const home = numberOrNull_(row[col.hr]);
    const away = numberOrNull_(row[col.ar]);
    if (match && home !== null && away !== null) {
      map[normalizeMatch_(match)] = { home, away };
    }
  });
  return map;
}

function readParticipantsMeta_(ss) {
  const sheet = ss.getSheetByName('Participants');
  if (!sheet) return {};
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {};
  const headers = values[0].map(normalize_);
  const nameCol = headers.findIndex(h => ['name','participant','player','الاسم','المشارك'].indexOf(h) >= 0);
  const familyCol = headers.findIndex(h => ['family','العائلة'].indexOf(h) >= 0);
  if (nameCol < 0 || familyCol < 0) return {};
  const map = {};
  values.slice(1).forEach(row => {
    const name = String(row[nameCol] || '').trim();
    const family = String(row[familyCol] || '').trim();
    if (name && family) map[normalize_(name)] = { family };
  });
  return map;
}

function summarizeFamilies_(players) {
  const map = {};
  players.forEach(p => {
    const family = p.family || 'Other';
    if (!map[family]) map[family] = { family, participants: 0, totalPoints: 0, averagePoints: 0 };
    map[family].participants++;
    map[family].totalPoints += Number(p.totalPoints || 0);
  });
  return Object.keys(map).map(k => {
    const f = map[k];
    f.averagePoints = f.participants ? Math.round(f.totalPoints / f.participants) : 0;
    return f;
  }).sort((a, b) => b.averagePoints - a.averagePoints || b.totalPoints - a.totalPoints);
}

function sortPlayers_(a, b) {
  return b.totalPoints - a.totalPoints || b.correctResults - a.correctResults || b.exactScores - a.exactScores || a.name.localeCompare(b.name);
}

function detectFamily_(name) {
  const n = normalize_(name);
  if (n.indexOf('abdulhadi') >= 0 || n.indexOf('abdul hadi') >= 0 || n.indexOf('عبدالهادي') >= 0 || n.indexOf('عبد الهادي') >= 0) return 'Abdulhadi';
  if (n.indexOf('alsaleh') >= 0 || n.indexOf('saleh') >= 0 || n.indexOf('الصالح') >= 0 || n.indexOf('صالح') >= 0) return 'Alsaleh';
  return 'Other';
}

function normalize_(v) { return String(v || '').trim().toLowerCase(); }
function normalizeMatch_(v) { return normalize_(v).replace(/\s+/g, ' ').replace(/&/g, 'and').replace(/[–—]/g, '-'); }
function numberOrNull_(v) { return isNumber_(v) ? Number(v) : null; }
function isNumber_(v) { return (typeof v === 'number' && !isNaN(v)) || (v !== '' && v !== null && !isNaN(Number(v))); }
function max_(arr) { return arr.length ? Math.max.apply(null, arr) : 0; }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
