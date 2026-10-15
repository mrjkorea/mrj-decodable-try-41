'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CDN_BASE = 'https://mrjkorea.github.io/mrj-decodable-try/pronounce/';
const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const graderPath = path.join(__dirname, '..', 'pronounce', 'grade-browser.js');
const grader = fs.readFileSync(graderPath, 'utf8');

(function testSharedHubertGrader() {
  assert.ok(html.includes('pronounce/grade-browser.js?v=20261016-hubert'), 'grade-browser must be local with cache bust');
  assert.ok(!html.includes('mrj-decodable-try/pronounce/'), 'no old Books 1-20 engine/ort/audio');
  assert.ok(grader.includes('https://mrjkorea.github.io/pronounce/src/shared.js'), 'shared HuBERT engine');
  assert.ok(!/citrinet|whistle|zipa|needle/i.test(grader), 'no Citrinet/Whistle/ZIPA/Needle');
})();

console.log('index-html-pronounce-urls: ok');
