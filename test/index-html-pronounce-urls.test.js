'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CDN_BASE = 'https://mrjkorea.github.io/mrj-decodable-try/pronounce/';
const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const graderPath = path.join(__dirname, '..', 'pronounce', 'grade-browser.js');
const grader = fs.readFileSync(graderPath, 'utf8');

(function testPronounceScriptSrcs() {
  const re = /<script\b[^>]*\ssrc=["']([^"']+)["']/gi;
  const pronounceSrcs = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].indexOf('/pronounce/') !== -1 || m[1].indexOf('pronounce/') === 0) {
      pronounceSrcs.push(m[1]);
    }
  }
  assert.ok(pronounceSrcs.length >= 4, 'expected at least four pronounce-related script tags');
  const cdn = pronounceSrcs.filter((url) => url.startsWith(CDN_BASE));
  assert.ok(cdn.length >= 3, 'ort/engine/audio must load from Books 1-20 host');
  assert.ok(
    html.includes('pronounce/grade-browser.js?v=20261014-sayfix'),
    'grade-browser must be local with cache bust'
  );
  assert.ok(
    !html.includes('mrj-decodable-try-21/pronounce'),
    'must not load pronounce from mrj-decodable-try-21 (404)'
  );
})();

(function testCitrinetOnlyGrader() {
  assert.ok(grader.includes("mode: 'citrinet-only'"), 'grader must boot citrinet-only');
  assert.ok(grader.includes('loadHints: false'), 'grader must disable ZIPA hints');
  assert.ok(!/\bwhistle\b/i.test(grader), 'grader must not load Whistle');
  assert.ok(!/\bzipa\b/i.test(grader), 'grader must not load ZIPA');
  assert.ok(!/\bneedle\b/i.test(grader), 'grader must not load Needle WASM');
  assert.ok(!/SpeechRecognition/i.test(grader), 'grader must not use SpeechRecognition');
  assert.ok(!/wav2vec/i.test(grader), 'grader must not use wav2vec2');
})();

console.log('index-html-pronounce-urls: ok');
