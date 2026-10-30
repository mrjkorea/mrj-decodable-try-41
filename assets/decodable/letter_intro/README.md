# Letter-intro videos (books 41–60)

Each book plays one letter-intro video in the intro, after the sound card and
before the famous word:

```
cousin (sound card) → letter-intro → famous-card → famous → chase → Listen
```

The mp4s are **not in git yet**. They arrive in a follow-up tar.gz; until then
the app requests these URLs and gets a 404 (see "If a file is missing" below).

## Files expected in this folder

| Book | Align JSON | File |
|---|---|---|
| 41 | `align_mlr_dec_041.json` | `ph_letter_intro.mp4` |
| 42 | `align_mlr_dec_042.json` | `a_e_letter_intro.mp4` |
| 43 | `align_mlr_dec_043.json` | `i_e_letter_intro.mp4` |
| 44 | `align_mlr_dec_044.json` | `o_e_letter_intro.mp4` |
| 45 | `align_mlr_dec_045.json` | `u_e_letter_intro.mp4` |
| 46 | `align_mlr_dec_046.json` | `e_e_letter_intro.mp4` |
| 47 | `align_mlr_dec_047.json` | `ed_letter_intro.mp4` |
| 48 | `align_mlr_dec_048.json` | `ing_letter_intro.mp4` |
| 49 | `align_mlr_dec_049.json` | `ce__s_letter_intro.mp4` |
| 50 | `align_mlr_dec_050.json` | `ge__j_letter_intro.mp4` |
| 51 | `align_mlr_dec_051.json` | `ar_letter_intro.mp4` |
| 52 | `align_mlr_dec_052.json` | `or_letter_intro.mp4` |
| 53 | `align_mlr_dec_053.json` | `er_letter_intro.mp4` |
| 54 | `align_mlr_dec_054.json` | `ir_letter_intro.mp4` |
| 55 | `align_mlr_dec_055.json` | `ur_letter_intro.mp4` |
| 56 | `align_mlr_dec_056.json` | `open_syl_letter_intro.mp4` |
| 57 | `align_mlr_dec_057.json` | `y_ai_letter_intro.mp4` |
| 58 | `align_mlr_dec_058.json` | `y_ee_letter_intro.mp4` |
| 59 | `align_mlr_dec_059.json` | `le_letter_intro.mp4` |
| 60 | `align_mlr_dec_060.json` | `old_ild_ind_ost_letter_intro.mp4` |

Only these 20 files belong here; other books' intros live in their own repos.
Use H.264 + AAC mp4 (with `-movflags +faststart`) so iPad/iPhone Safari can
play them inline.

## Adding the follow-up tar.gz

Extract so the 20 mp4s sit directly in this folder (no sub-folder), then check:

```sh
tar -xzf <letter_intros>.tar.gz -C assets/decodable/letter_intro/
ls assets/decodable/letter_intro/*.mp4 | wc -l   # expect 20
npm test                                          # letter-intro test checks names
```

`test/letter-intro.test.js` passes with zero mp4s (today) and with all 20, but
fails if only some are present, a name does not match, or an unexpected mp4 is
in the folder.

## How the app finds the clip

- `index.html` → `letterIntroClips()` reads `letter_intros` from
  `assets/align_mlr_dec_0NN.json`, and falls back to the `LETTER_INTRO` map in
  `index.html` (same names) if the field is missing.
- URL: `asset('decodable/letter_intro/<mp4_name>')`, i.e.
  `assets/decodable/letter_intro/<mp4_name>?v=<ASSET_V>`.
- Next stays disabled until the video ends. When it ends, the app reports
  `reportIntroStep('letter-intro')` once per book (`<book_id>:letter-intro`).
- If autoplay is blocked, the button turns into `▶ Play`; tapping it (or the
  video) starts playback and Next stays locked until the end.

### If a file is missing

A 404 or decode error unlocks Next straight away (nothing is reported), so a
student is never stuck on a black screen while the mp4s are not uploaded yet.

### Replacing a video later

Same file name → bump `ASSET_V` in `index.html` (and the value pinned in
`test/dictation-ui.test.js`) so browsers drop the cached copy.

## Verify on GitHub Pages

1. `https://mrjkorea.github.io/mrj-decodable-try-41/assets/decodable/letter_intro/ph_letter_intro.mp4`
   returns 200 and plays (repeat for any other file in the table).
2. Open a book → sound card → **Next** → the letter-intro video fills the panel
   and Next is greyed out → after the video ends, Next lights up → famous word
   card → red carpet → chase → Listen.
