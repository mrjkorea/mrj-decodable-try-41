#!/usr/bin/env node
/**
 * Headless Chrome benchmark for decodable Say mode (Citrinet-only grader).
 * node tools/bench-speak.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wavDir = join(root, 'test', 'bench-wavs');
const TARGET = 'The phone rings.';
const CLIPS = [
  { id: 'correct', file: 'correct-phone.wav', target: TARGET },
  { id: 'silence', file: 'silence.wav', target: TARGET },
];

async function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: opts.quiet ? 'pipe' : 'inherit', ...opts });
    let out = '';
    if (opts.quiet) p.stdout.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exit ${code}`))));
  });
}

async function ensureWavs() {
  await mkdir(wavDir, { recursive: true });
  const silence = join(wavDir, 'silence.wav');
  const correct = join(wavDir, 'correct-phone.wav');
  try {
    await stat(silence);
  } catch {
    await run(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '2', silence],
      { quiet: true },
    );
  }
  try {
    await stat(correct);
  } catch {
    await run(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        "flite=text='The phone rings':voice=slt",
        '-ar',
        '16000',
        '-ac',
        '1',
        correct,
      ],
      { quiet: true },
    );
  }
}

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
            wav: 'audio/wav',
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
      const port = server.address().port;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

async function main() {
  await ensureWavs();
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(300000);

  let bootBytes = 0;
  page.on('response', async (res) => {
    const u = res.url();
    if (
      !u.includes('/models/') &&
      !u.includes('/vendor/ort/') &&
      !u.includes('jsdelivr.net/gh/mrjkorea/pronounce')
    ) {
      return;
    }
    try {
      bootBytes += (await res.body()).length;
    } catch (_) {}
  });

  const t0 = Date.now();
  await page.goto(url + '?bench=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__mrjPronounceBench === 'function');
  await page.evaluate(() => window.MRJPronounce.load());
  const readyMs = Date.now() - t0;
  const boot = await page.evaluate(() => window.__mrjTrialBoot());

  const checkTimes = [];
  const correctUrl = `${url}test/bench-wavs/correct-phone.wav`;
  for (let i = 0; i < 3; i++) {
    const ms = await page.evaluate(
      async ({ clipUrl, sentence }) => {
        const blob = await fetch(clipUrl).then((r) => r.blob());
        const t = performance.now();
        await window.__mrjPronounceBench(blob, sentence, { hints: false });
        return performance.now() - t;
      },
      { clipUrl: correctUrl, sentence: TARGET },
    );
    checkTimes.push(Math.round(ms));
  }

  const clips = {};
  for (const clip of CLIPS) {
    const clipUrl = `${url}test/bench-wavs/${clip.file}`;
    clips[clip.id] = await page.evaluate(
      async ({ clipUrl, target }) => {
        const blob = await fetch(clipUrl).then((r) => r.blob());
        const graded = await window.__mrjPronounceBench(blob, target, { hints: false });
        return {
          doorFail: !!graded.result.doorFail,
          pass: !!graded.result.pass,
          scorePct: graded.result.scorePct,
          perf: graded.perf,
          meta: graded.result.meta,
        };
      },
      { clipUrl, target: clip.target },
    );
  }

  await browser.close();
  server.close();

  const report = {
    generatedAt: new Date().toISOString(),
    target: TARGET,
    trialMode: boot.trialMode,
    readyMs,
    checkTimesMs: checkTimes,
    downloadBytes: bootBytes,
    downloadMb: Math.round((bootBytes / (1024 * 1024)) * 10) / 10,
    clips,
  };
  const outPath = join(root, 'test', 'bench-speak-report.json');
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.error('Wrote', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
