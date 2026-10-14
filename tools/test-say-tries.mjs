#!/usr/bin/env node
/**
 * Headless Chrome: Say mode unlocks Next after 5 doorFail grades or 5 mic taps.
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const pathOnly = req.url.split('?')[0];
      const rel = pathOnly === '/' ? '/index.html' : pathOnly;
      const file = join(root, decodeURIComponent(rel));
      readFile(file)
        .then((buf) => {
          const base = file.split('/').pop() || '';
          const ext = base.includes('.') ? base.split('.').pop() : '';
          const types = {
            html: 'text/html',
            js: 'text/javascript',
            mjs: 'text/javascript',
            css: 'text/css',
            json: 'application/json',
          };
          res.writeHead(200, {
            'Content-Type': types[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(buf);
        })
        .catch(() => {
          res.writeHead(404);
          res.end('not found');
        });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

async function setupSayPage(page) {
  await page.evaluate(() => {
    localStorage.clear();
    window.MRJ_AUTH = {
      student: () => 'zz_test_say5',
      token: () => '',
      noteScore: () => {},
    };
    i18n = { books: { mlr_dec_001: { l1: { ko: [''] } } } };
    lang = 'ko';
    pack = {
      book_id: 'mlr_dec_001',
      title: 'Test',
      pages: [{ text: 'Sam sat.', audio: '' }],
    };
    mode = 'speak';
    sayPage = 0;
    sayTries = 0;
    sayBest = 0;
    sayMicPresses = 0;
    pronounceLoaded = true;
    let failN = 0;
    window.MRJPronounce = {
      load: async () => {},
      grade: async () => {
        failN++;
        return {
          doorFail: true,
          reason: 'Say the sentence again, please. Say each word clearly.',
          meta: { scoring_mode: 'citrinet-only' },
        };
      },
    };
    renderSay();
  });
}

async function nextVisible(page) {
  return page.evaluate(() => {
    const el = document.getElementById('sayNext');
    return !!(el && !el.classList.contains('hidden'));
  });
}

async function main() {
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await setupSayPage(page);

  for (let i = 0; i < 4; i++) {
    await page.evaluate(async () => {
      await gradeBlob('Sam sat.', new Blob(['x'], { type: 'audio/webm' }));
    });
    const vis = await nextVisible(page);
    if (vis) throw new Error(`Next visible after ${i + 1} doorFail tries (expected 5)`);
  }
  await page.evaluate(async () => {
    await gradeBlob('Sam sat.', new Blob(['x'], { type: 'audio/webm' }));
  });
  if (!(await nextVisible(page))) throw new Error('Next not visible after 5 doorFail grades');

  await page.evaluate(() => {
    localStorage.clear();
    sayTries = 0;
    sayBest = 0;
    sayMicPresses = 0;
    renderSay();
  });
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      sayMicPressBump();
      sayUnlockAfterMaxTries();
    });
    const vis = await nextVisible(page);
    if (i < 4 && vis) throw new Error(`Next visible after ${i + 1} mic presses (expected 5)`);
    if (i === 4 && !vis) throw new Error('Next not visible after 5 mic presses');
  }

  await page.evaluate(() => {
    localStorage.clear();
    sayTries = 0;
    sayBest = 0;
    sayMicPresses = 0;
    window.MRJPronounce.grade = async () => ({
      doorFail: false,
      overall: { score: 0.12, band: 'fail' },
      words: [{ word: 'Sam', score: 0.1 }],
      meta: { scoring_mode: 'citrinet-only' },
      model_id: 'citrinet-only',
    });
    renderSay();
  });
  for (let i = 0; i < 5; i++) {
    await page.evaluate(async () => {
      await gradeBlob('Sam sat.', new Blob(['x'], { type: 'audio/webm' }));
    });
  }
  if (!(await nextVisible(page))) throw new Error('Next not visible after 5 low-score fails');

  await browser.close();
  server.close();
  console.log(
    JSON.stringify({ ok: true, cases: ['5 doorFail', '5 mic taps', '5 low-score'] }, null, 2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
