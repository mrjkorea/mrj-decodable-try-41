/* MRJ Decodables — Citrinet-only in-page grader (int8 ONNX, onnxruntime-web WASM). */
(function (global) {
  const MODEL_ORIGIN = 'https://mrjkorea.github.io/pronounce/';
  const TRIAL_SRC =
    'https://cdn.jsdelivr.net/gh/mrjkorea/pronounce@90d9a5743a8d/src/trial.js';
  const WASM_PATHS = MODEL_ORIGIN + 'vendor/ort/';
  const PASS_AT = 60;

  let booted = null;
  let trialApi = null;

  function setBase() {}

  function emitProgress(onProgress, stage, pct) {
    if (typeof onProgress === 'function') {
      try {
        onProgress({ stage, pct });
      } catch (_) {}
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const nodes = document.getElementsByTagName('script');
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].src === src && nodes[i].dataset.mrjReady === '1') {
          resolve();
          return;
        }
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () {
        s.dataset.mrjReady = '1';
        resolve();
      };
      s.onerror = function () {
        reject(new Error('failed to load ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function citrinetModelPaths() {
    return [
      MODEL_ORIGIN + 'models/citrinet/model.int8.onnx',
      MODEL_ORIGIN + 'models/citrinet/sp_pieces.json',
    ];
  }

  function pageResult(result) {
    const doorFail = !!(result && result.doorFail);
    const rawWords = doorFail ? [] : (result && result.words) || [];
    const words = rawWords.map(function (w) {
      return {
        word: w.word,
        score: (Number(w.score) || 0) / 100,
        hint: typeof w.hint === 'string' ? w.hint : '',
      };
    });
    const score = doorFail ? 0 : Number(result && result.score) || 0;
    const pass = doorFail ? false : !!(result && result.pass);
    const scorePct = doorFail
      ? 0
      : Math.round(Number(result && result.scorePct) || score * 100);
    return Object.assign({}, result, {
      words: words,
      overall: { score: score, band: pass ? 'pass' : 'fail' },
      scorePct: scorePct,
      pass: pass,
      doorFail: doorFail,
      reason: (result && result.reason) || '',
      model_id: 'citrinet-only',
      meta: { scoring_mode: 'citrinet-only' },
    });
  }

  function exposeBenchHook() {
    try {
      const q = new URLSearchParams(global.location && global.location.search);
      const auth =
        global.MRJ_AUTH && typeof global.MRJ_AUTH.student === 'function'
          ? String(global.MRJ_AUTH.student() || '')
          : '';
      const bench =
        q.get('bench') === '1' ||
        String(auth).toLowerCase().startsWith('zz_test');
      if (!bench) return;
      global.__mrjPronounceBench = async function (blob, text, gradeOpts) {
        await load();
        const samples = await global.decodeAudioToMono(blob, 16000);
        const opts = Object.assign({ hints: false }, gradeOpts || {});
        const passAt =
          typeof opts.passAt === 'number' ? opts.passAt : PASS_AT;
        const graded = await trialApi.gradeTrialSamples(
          samples,
          text,
          passAt,
          null,
          opts,
        );
        return {
          result: pageResult(graded.result),
          door: graded.door,
          perf: graded.perf,
          trialMode: 'citrinet-only',
        };
      };
      global.__mrjTrialBoot = function () {
        return {
          trialMode: 'citrinet-only',
          grader: 'citrinet-trial',
          ready: !!booted,
        };
      };
    } catch (_) {}
  }

  let citrinetOrt = null;

  async function ensureCitrinetOrt() {
    if (citrinetOrt && citrinetOrt.InferenceSession) return citrinetOrt;
    await loadScript(MODEL_ORIGIN + 'vendor/ort/ort.wasm.min.js');
    citrinetOrt = global.ort;
    if (!citrinetOrt || !citrinetOrt.InferenceSession) {
      throw new Error('onnxruntime-web did not load');
    }
    return citrinetOrt;
  }

  async function load(onProgress) {
    if (booted) {
      const done = await booted;
      emitProgress(onProgress, 'done', 100);
      exposeBenchHook();
      return done;
    }
    booted = (async function () {
      emitProgress(onProgress, 'download', 8);
      const ort = await ensureCitrinetOrt();
      emitProgress(onProgress, 'download', 22);
      trialApi = await import(TRIAL_SRC);
      emitProgress(onProgress, 'session', 42);
      await trialApi.bootTrialInPage({
        ort: ort,
        wasmPaths: WASM_PATHS,
        mode: 'citrinet-only',
        loadHints: false,
        paths: citrinetModelPaths(),
      });
      emitProgress(onProgress, 'done', 100);
      exposeBenchHook();
      return true;
    })().catch(function (e) {
      booted = null;
      trialApi = null;
      throw e;
    });
    return booted;
  }

  async function grade(blob, text) {
    await load();
    const samples = await global.decodeAudioToMono(blob, 16000);
    const graded = await trialApi.gradeTrialSamples(
      samples,
      text,
      PASS_AT,
      null,
      { hints: false },
    );
    return pageResult(graded.result);
  }

  global.MRJPronounce = { setBase: setBase, load: load, grade: grade };
  exposeBenchHook();
})(typeof window !== 'undefined' ? window : globalThis);
