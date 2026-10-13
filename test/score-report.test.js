'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const MERGE = require('../dec41-progress-merge.js');

const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractFunctionSource(source, name) {
  const sig = 'function ' + name + '(';
  const start = source.indexOf(sig);
  assert.ok(start >= 0, 'function ' + name + ' not found');
  let i = source.indexOf('{', start);
  assert.ok(i >= 0);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function extractReportingBlock(source) {
  const names = [
    'scoreItemId',
    'sheetPost',
    'localDate',
    'signedInStudent',
    'speakPageSection',
    'speakScoreTotals',
    'reportScore',
    'speakScorePct'
  ];
  return names.map(function (n) { return extractFunctionSource(source, n); }).join('\n');
}

function createReportingSandbox(overrides) {
  const noteScores = [];
  const fetchCalls = [];
  const auth = {
    student: function () { return 'zz_test_mrjmetrics'; },
    noteScore: function (o) { noteScores.push(o); }
  };
  const sandbox = {
    MERGE,
    MRJ_AUTH: auth,
    window: {
      DEC41_PROGRESS_MERGE: MERGE,
      MRJ_AUTH: auth
    },
    SCORE_URL: 'https://example.test/score',
    pack: { book_id: 'mlr_dec_045', pages: new Array(10).fill({ text: 'x' }) },
    speakPagesStore: {},
    bookProg: function (bookId) {
      return { speakPages: sandbox.speakPagesStore[bookId] || {} };
    },
    saveSheetProgress: function () {},
    fetch: function (url, opts) {
      fetchCalls.push({ url: url, body: JSON.parse(opts.body) });
      return Promise.resolve({ ok: true });
    },
    Math: Math,
    Date: Date,
    JSON: JSON,
    String: String,
    isFinite: isFinite,
    Object: Object
  };
  Object.assign(sandbox, overrides || {});
  vm.createContext(sandbox);
  vm.runInContext(extractReportingBlock(html), sandbox);
  return { sandbox, noteScores, fetchCalls };
}

(function testCacheBustMatchesBuild() {
  const build = (html.match(/<meta name="mrj-build" content="([^"]+)"/) || [])[1];
  const inlineBuild = (html.match(/const MRJ_BUILD='([^']+)'/) || [])[1];
  const mergeV = (html.match(/dec41-progress-merge\.js\?v=([^"']+)/) || [])[1];
  assert.ok(build, 'mrj-build meta required');
  assert.strictEqual(inlineBuild, build);
  assert.strictEqual(mergeV, build);
  assert.ok(build.endsWith('-citrinetonly'), 'build stamp should end with -citrinetonly');
  assert.ok(
    html.includes('pronounce/grade-browser.js?v=20261013-citrinetonly'),
    'grade-browser cache bust must match citrinet-only rollout'
  );
})();

(function testDictationReportsCmAndSsi() {
  const { sandbox, noteScores, fetchCalls } = createReportingSandbox();
  const ld = sandbox.localDate();
  sandbox.reportScore('mlr_dec_045', 'dictation', 4, 5, { completed: true, metadata: { misses: 1 } });
  assert.strictEqual(fetchCalls.length, 1);
  const ev = fetchCalls[0].body.events[0];
  assert.strictEqual(ev.item_id, 'mlr_dec_045:dictation');
  assert.strictEqual(ev.score_value, 4);
  assert.strictEqual(ev.score_max, 5);
  assert.strictEqual(ev.score_pct, 80);
  assert.strictEqual(ev.local_date, ld);
  assert.strictEqual(fetchCalls[0].body.student_email, 'zz_test_mrjmetrics');
  assert.strictEqual(fetchCalls[0].body.session_id, 'decodable-zz_test_mrjmetrics-' + ld);
  assert.strictEqual(noteScores.length, 1);
  const ns = noteScores[0];
  assert.strictEqual(ns.program, 'decodable');
  assert.strictEqual(ns.itemId, 'mlr_dec_045:dictation');
  assert.strictEqual(ns.scoreValue, 4);
  assert.strictEqual(ns.scoreMax, 5);
  assert.strictEqual(ns.scorePct, 80);
  assert.strictEqual(ns.localDate, ld);
})();

(function testTenPageSpeakNoteScores() {
  const { sandbox, noteScores, fetchCalls } = createReportingSandbox({
    pack: { book_id: 'mlr_dec_041', pages: new Array(10).fill({ text: 'a' }) },
    speakPagesStore: { mlr_dec_041: {} }
  });
  for (let i = 0; i < 10; i++) {
    sandbox.speakPagesStore.mlr_dec_041[i] = 70;
    sandbox.reportScore('mlr_dec_041', sandbox.speakPageSection(i), 70, 100);
  }
  const tot = sandbox.speakScoreTotals('mlr_dec_041');
  assert.strictEqual(tot.raw, 700);
  assert.strictEqual(tot.max, 1000);
  sandbox.reportScore('mlr_dec_041', 'speak', tot.raw, tot.max, { metadata: { pages: 10 } });
  const pageNotes = noteScores.filter(function (n) { return /:speak-p\d+$/.test(n.itemId); });
  assert.strictEqual(pageNotes.length, 10);
  assert.strictEqual(pageNotes[0].itemId, 'mlr_dec_041:speak-p01');
  assert.strictEqual(pageNotes[9].itemId, 'mlr_dec_041:speak-p10');
  const speakSum = noteScores.find(function (n) { return n.itemId === 'mlr_dec_041:speak'; });
  assert.ok(speakSum);
  assert.strictEqual(speakSum.scoreMax, 1000);
  assert.strictEqual(speakSum.scoreValue, 700);
  assert.ok(fetchCalls.length >= 11);
})();

(function testSignedOutWithLegacyLocalNameSendsNothing() {
  const signedOutAuth = {
    student: function () { return ''; },
    noteScore: function () { throw new Error('should not run'); }
  };
  const { sandbox, noteScores, fetchCalls } = createReportingSandbox({
    MRJ_AUTH: signedOutAuth,
    window: { DEC41_PROGRESS_MERGE: MERGE, MRJ_AUTH: signedOutAuth }
  });
  sandbox.reportScore('mlr_dec_045', 'dictation', 4, 5);
  assert.strictEqual(fetchCalls.length, 0);
  assert.strictEqual(noteScores.length, 0);
})();

console.log('score-report: ok');
