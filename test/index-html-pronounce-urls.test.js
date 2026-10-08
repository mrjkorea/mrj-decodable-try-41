'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PRONOUNCE_BASE = 'https://mrjkorea.github.io/mrj-decodable-try/pronounce/';
const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

(function testPronounceScriptSrcs() {
  const re = /<script\b[^>]*\ssrc=["']([^"']+)["']/gi;
  const pronounceSrcs = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1].indexOf('/pronounce/') !== -1) pronounceSrcs.push(m[1]);
  }
  assert.ok(pronounceSrcs.length >= 4, 'expected at least four pronounce script tags');
  pronounceSrcs.forEach((url) => {
    assert.ok(
      url.startsWith(PRONOUNCE_BASE),
      'pronounce script must use Books 1-20 host: ' + url
    );
  });
  assert.ok(
    !html.includes('mrj-decodable-try-21/pronounce'),
    'must not load pronounce from mrj-decodable-try-21 (404)'
  );
})();

console.log('index-html-pronounce-urls: ok');
