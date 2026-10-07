'use strict';

const assert = require('assert');
const M = require('../dec41-progress-merge.js');

(function testMergeBoolsAndScores() {
  const a = { passed: false, listen: true, dictScore: 70, readPages: { '0': true } };
  const b = { passed: true, song: true, dictScore: 85, readPages: { '1': true } };
  const m = M.mergeBookProgress(a, b);
  assert.strictEqual(m.passed, true);
  assert.strictEqual(m.listen, true);
  assert.strictEqual(m.song, true);
  assert.strictEqual(m.dictScore, 85);
  assert.strictEqual(m.readPages['0'], true);
  assert.strictEqual(m.readPages['1'], true);
})();

(function testSpeakPagesMax() {
  const m = M.mergeBookProgress({ speakPages: { '0': 60, '1': 90 } }, { speakPages: { '0': 80 } });
  assert.strictEqual(m.speakPages['0'], 80);
  assert.strictEqual(m.speakPages['1'], 90);
})();

(function testUnparseablePack() {
  const p = M.parsePackBooks('{not json');
  assert.strictEqual(p.ok, true);
  assert.deepStrictEqual(p.books, {});
  assert.strictEqual(p.unparseable, true);
})();

(function testSaveGating() {
  const gate = M.createPackSaveGate();
  assert.strictEqual(gate.requestSave().sent, false);
  gate.beginLoad();
  assert.strictEqual(gate.requestSave().queued, true);
  gate.finishLoadOk();
  assert.strictEqual(gate.requestSave().sent, true);
  gate.finishLoadFail();
  assert.strictEqual(gate.maySave(), false);
})();

console.log('dec41-progress-merge: ok');
