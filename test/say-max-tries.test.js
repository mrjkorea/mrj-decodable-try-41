'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const grader = fs.readFileSync(path.join(__dirname, '..', 'pronounce', 'grade-browser.js'), 'utf8');

(function testDoorFailCountsAsTry() {
  const gradeBlob = html.slice(html.indexOf('async function gradeBlob'), html.indexOf('function finishSayPage'));
  assert.ok(gradeBlob.includes('if(j.doorFail)'), 'doorFail branch must exist');
  assert.ok(
    /if\(j\.doorFail\)[\s\S]*sayAttemptDone/.test(gradeBlob),
    'doorFail must call sayAttemptDone (count toward max tries)',
  );
  assert.ok(
    !/if\(j\.doorFail\)[\s\S]*?return;[\s\S]*sayAttemptDone/.test(gradeBlob) ||
      /if\(j\.doorFail\)[\s\S]*sayAttemptDone[\s\S]*return;/.test(gradeBlob),
    'doorFail must not return before counting the attempt',
  );
})();

(function testMicPressSafetyNet() {
  assert.ok(html.includes('sayMicPresses'), 'mic press counter required');
  assert.ok(html.includes('sayMicPressBump'), 'mic press bump on each mic tap');
  assert.ok(html.includes('sayAtMaxTries'), 'unified max-tries check');
  assert.ok(html.includes('sayUnlockAfterMaxTries'), 'must unlock Next after max tries');
})();

(function testSingleWordTripleLikeDay4() {
  const m = html.match(/function sayTarget\(text\)\{[\s\S]*?\n\}/);
  assert.ok(m, 'sayTarget must exist');
  assert.ok(m[0].includes("w+' '+w+' '+w"), 'single-word lines must triple with spaces like Day 4 scoringTarget');
  assert.ok(!m[0].includes("w+', '+w"), 'must not use comma triple');
})();

(function testTrialJsMatchesPronounceMain() {
  assert.ok(
    grader.includes('mrjkorea/pronounce@5f096806'),
    'trial.js must track pronounce main (Day 4 citrinet checker)',
  );
})();

console.log('say-max-tries: ok');
