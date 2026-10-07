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

(function testNeverReadsSharedLegacyKey() {
  const legacyPayload = JSON.stringify({
    byStudent: {
      alice: { mlr_dec_041: { passed: true, listen: true } },
      bob: { mlr_dec_042: { passed: true, listen: true } }
    }
  });
  const aliceOnly = JSON.stringify({
    byStudent: { alice: { mlr_dec_043: { listen: true } } }
  });
  const store = { [M.SHARED_DEVICE_KEY]: legacyPayload, [M.studentProgressKey('alice')]: aliceOnly };
  const keysRead = [];
  const data = M.loadStudentProgressStore(function (key) {
    keysRead.push(key);
    return store[key];
  }, 'alice');
  assert.strictEqual(keysRead.length, 1);
  assert.strictEqual(keysRead[0], M.studentProgressKey('alice'));
  assert.ok(!keysRead.includes(M.SHARED_DEVICE_KEY));
  assert.deepStrictEqual(data.byStudent.alice.mlr_dec_043, { listen: true });
  assert.strictEqual(data.byStudent.alice.mlr_dec_041, undefined);
})();

(function testUploadNeverIncludesLegacyMix() {
  const studentStore = {
    byStudent: { alice: { mlr_dec_043: { listen: true } } }
  };
  const legacyOnly = {
    byStudent: {
      alice: { mlr_dec_041: { passed: true } },
      bob: { mlr_dec_042: { passed: true } }
    }
  };
  const upload = JSON.parse(M.progressUploadJson(studentStore, 'alice'));
  assert.deepStrictEqual(upload.books, { mlr_dec_043: { listen: true } });
  const poisoned = JSON.parse(M.progressUploadJson(legacyOnly, 'alice'));
  assert.ok(!poisoned.books.mlr_dec_042);
  assert.deepStrictEqual(poisoned.books, { mlr_dec_041: { passed: true } });
})();

console.log('dec41-progress-merge: ok');
