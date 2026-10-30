'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const MERGE = require('../dec41-progress-merge.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const lib = JSON.parse(fs.readFileSync(path.join(root, 'assets/decodable_library.json'), 'utf8'));
const introDir = path.join(root, 'assets/decodable/letter_intro');
const BOOKS = Array.from({ length: 20 }, (_, i) => 'mlr_dec_0' + (41 + i));

function extractFunctionSource(source, name) {
  const sig = 'function ' + name + '(';
  const start = source.indexOf(sig);
  assert.ok(start >= 0, 'function ' + name + ' not found');
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unclosed function ' + name);
}

function extractConst(name) {
  const m = html.match(new RegExp('const ' + name + '=\\{[\\s\\S]*?\\n?\\};'));
  assert.ok(m, 'const ' + name + ' not found');
  return m[0];
}

const LETTER_INTRO = JSON.parse(JSON.stringify(
  vm.runInNewContext('(' + extractConst('LETTER_INTRO').replace(/^const LETTER_INTRO=/, '').replace(/;$/, '') + ')')
));

(function testMapCoversBooks41to60Only() {
  assert.deepStrictEqual(Object.keys(LETTER_INTRO), BOOKS);
  assert.deepStrictEqual(lib.books.map((b) => b.id), BOOKS);
})();

(function testAlignJsonMatchesFallbackAndReadme() {
  const readme = fs.readFileSync(path.join(introDir, 'README.md'), 'utf8');
  for (const id of BOOKS) {
    const align = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'align_' + id + '.json'), 'utf8'));
    assert.deepStrictEqual(align.letter_intros, LETTER_INTRO[id], id + ': align letter_intros must match LETTER_INTRO');
    for (const name of align.letter_intros) {
      assert.ok(/^[a-z0-9_]+_letter_intro\.mp4$/.test(name), id + ': bad file name ' + name);
      assert.ok(readme.includes('`' + name + '`'), 'README must list ' + name);
    }
  }
})();

(function testMp4sAllOrNothing() {
  const expected = BOOKS.flatMap((id) => LETTER_INTRO[id]);
  const present = fs.readdirSync(introDir).filter((f) => f.toLowerCase().endsWith('.mp4'));
  const extra = present.filter((f) => !expected.includes(f));
  assert.deepStrictEqual(extra, [], 'unexpected mp4 in assets/decodable/letter_intro');
  if (present.length) {
    const missing = expected.filter((f) => !present.includes(f));
    assert.deepStrictEqual(missing, [], 'some letter-intro mp4s are missing');
  }
})();

function introSandbox() {
  const ctx = vm.createContext({ calls: [] });
  const src = [
    "let pack=null, mode='intro', introStep='cousin', cousinIdx=0, introDone=false, preVideoDone=false;",
    'let famousVidEnded=false, famousAudEnded=false, letterIntroDone=false;',
    html.match(/const NEW_LETTERS=\{.*\};/)[0],
    extractConst('SOUND_CARD'),
    extractConst('LETTER_INTRO'),
    "const els={}; const $=id=>els[id]||(els[id]={textContent:'',disabled:false});",
    "function showIntro(){ calls.push(introStep); }",
    "function showLib(){ calls.push('library'); }",
    "function setMode(m){ calls.push('mode:'+m); }",
    "function kickLetterIntro(){ calls.push('kick'); }",
    'function stopFamousMedia(){} function syncFamousGate(){}',
    extractFunctionSource(html, 'cousinLetters'),
    extractFunctionSource(html, 'letterIntroClips'),
    extractFunctionSource(html, 'introAdvance'),
    extractFunctionSource(html, 'testBackIntro'),
    'function state(){ return {introStep, cousinIdx}; }'
  ].join('\n');
  vm.runInContext(src, ctx);
  return {
    run: (code) => vm.runInContext(code, ctx),
    json: (code) => JSON.parse(vm.runInContext('JSON.stringify(' + code + ')', ctx)),
    step: () => vm.runInContext('state().introStep', ctx),
    calls: ctx.calls
  };
}

(function testForwardFlowCousinLetterIntroFamousCardFamousChase() {
  for (const id of BOOKS) {
    const align = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'align_' + id + '.json'), 'utf8'));
    const sb = introSandbox();
    sb.run('pack=' + JSON.stringify(align) + "; introStep='cousin'; cousinIdx=0;");
    assert.deepStrictEqual(sb.run('cousinLetters()').length, 0, id + ': NEW_LETTERS empty');
    sb.run('introAdvance()');
    assert.strictEqual(sb.step(), 'letter-intro', id + ': cousin -> letter-intro');
    sb.run('introAdvance()');
    assert.strictEqual(sb.step(), 'letter-intro', id + ': Next is gated until the video ends');
    assert.strictEqual(sb.calls[sb.calls.length - 1], 'kick');
    sb.run('letterIntroDone=true; introAdvance()');
    assert.strictEqual(sb.step(), 'famous-card', id + ': letter-intro -> famous-card');
    sb.run('introAdvance()');
    assert.strictEqual(sb.step(), 'famous', id + ': famous-card -> famous');
    sb.run('famousVidEnded=true; famousAudEnded=true; introAdvance()');
    assert.strictEqual(sb.step(), 'chase', id + ': famous -> chase');
  }
})();

(function testFallbackWhenAlignJsonHasNoLetterIntros() {
  const sb = introSandbox();
  sb.run("pack={book_id:'mlr_dec_047', famous:['under'], law_breaker:['hour']}; introStep='cousin';");
  assert.deepStrictEqual(sb.json('letterIntroClips()'), ['ed_letter_intro.mp4']);
  sb.run('introAdvance()');
  assert.strictEqual(sb.step(), 'letter-intro');
  sb.run("pack.letter_intros=['custom_letter_intro.mp4'];");
  assert.deepStrictEqual(sb.json('letterIntroClips()'), ['custom_letter_intro.mp4'], 'align JSON wins');
})();

(function testOtherBooksSkipLetterIntro() {
  const sb = introSandbox();
  sb.run("pack={book_id:'mlr_dec_061', famous:['x']}; introStep='cousin';");
  sb.run('introAdvance()');
  assert.strictEqual(sb.step(), 'famous-card');
})();

(function testBackNav() {
  const sb = introSandbox();
  sb.run("pack={book_id:'mlr_dec_041', famous:['boat'], law_breaker:['done']};");
  sb.run("introStep='chase'; testBackIntro()");
  assert.strictEqual(sb.step(), 'famous');
  sb.run('testBackIntro()');
  assert.strictEqual(sb.step(), 'famous-card');
  sb.run('testBackIntro()');
  assert.strictEqual(sb.step(), 'letter-intro', 'famous-card <- letter-intro');
  sb.run('testBackIntro()');
  assert.deepStrictEqual(sb.json('state()'), { introStep: 'cousin', cousinIdx: 0 }, 'letter-intro <- cousin (sound card)');
  sb.run('testBackIntro()');
  assert.strictEqual(sb.calls[sb.calls.length - 1], 'library');
})();

(function testReportIntroStepAfterMerge() {
  const merged = MERGE.mergeBookProgress({ listen: true }, {});
  assert.ok(merged.reported && !Array.isArray(merged.reported), 'merge turns reported into an object map');
  const cases = [
    [merged, 1],
    [{ reported: ['letter-intro'] }, 0],
    [{ reported: { 'letter-intro': true } }, 0],
    [{ 'letter-intro': true }, 0],
    [{}, 1]
  ];
  for (const [bp, want] of cases) {
    const reports = [];
    const patches = [];
    const ctx = vm.createContext({
      pack: { book_id: 'mlr_dec_041', sound: 'ph' },
      bookProg: () => bp,
      setBookProg: (id, patch) => patches.push(patch),
      reportScore: (id, section, raw, max, extra) => reports.push({ id, section, raw, max, extra }),
      soundLine: () => 'ph'
    });
    vm.runInContext(extractFunctionSource(html, 'reportIntroStep'), ctx);
    vm.runInContext("reportIntroStep('letter-intro', {clips:['ph_letter_intro.mp4']})", ctx);
    assert.strictEqual(reports.length, want, JSON.stringify(bp));
    if (want) {
      assert.strictEqual(reports[0].section, 'letter-intro');
      assert.strictEqual(reports[0].extra.itemType, 'completion');
      assert.strictEqual(patches[0]['letter-intro'], true);
    }
  }
})();

(function testShowIntroRendersGatedFullBleedVideo() {
  const show = extractFunctionSource(html, 'showIntro');
  const at = (s) => show.indexOf(s);
  assert.ok(at("if(introStep==='cousin')") < at("if(introStep==='letter-intro')"));
  assert.ok(at("if(introStep==='letter-intro')") < at("if(introStep==='famous-card')"));
  assert.ok(show.includes("classList.toggle('intro-bleed', introStep==='letter-intro')"));
  assert.ok(show.includes("asset('decodable/letter_intro/'+clips[0])"));
  assert.ok(show.includes("reportIntroStep('letter-intro'"));
  assert.ok(/#introStage\.intro-bleed\{padding:0;/.test(html), 'full-bleed stage css');
})();

console.log('letter-intro: ok');
