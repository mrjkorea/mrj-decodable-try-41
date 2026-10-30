#!/usr/bin/env python3
"""Regenerate word mp3 clips with ElevenLabs (voices.words) or edge-tts fallback."""
import json
import os
import re
import subprocess
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VOICE_ID = "851d4a3a36814f8faef50db1884e1ef6"
EDGE_VOICE = "en-US-AndrewNeural"


def speak_text(lemma: str) -> str:
    # On-page token is lowercased; restore apostrophe forms for TTS.
    if lemma.endswith("'s"):
        return lemma[:-2] + "'s"
    return lemma


def elevenlabs(text: str, out: Path) -> bool:
    key = os.environ.get("XI_API_KEY") or os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        return False
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    body = json.dumps({"text": text, "model_id": "eleven_monolingual_v1"}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        out.write_bytes(resp.read())
    return True


def edge_tts(text: str, out: Path) -> None:
    raw = out.with_suffix(".raw.mp3")
    edge = str(Path.home() / ".local/bin/edge-tts")
    last_err = None
    for attempt in range(5):
        try:
            subprocess.run(
                [edge, "--voice", EDGE_VOICE, "--text", text, "--write-media", str(raw)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=120,
            )
            break
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            last_err = e
            import time

            time.sleep(2 + attempt * 2)
    else:
        raise last_err
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(raw),
            "-ar",
            "44100",
            "-ac",
            "1",
            "-b:a",
            "192k",
            str(out),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    raw.unlink(missing_ok=True)


def regen_lemma(lemma: str, out: Path) -> str:
    text = speak_text(lemma)
    if elevenlabs(text, out):
        return "elevenlabs"
    edge_tts(text, out)
    return "edge-tts"


def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--lemmas", nargs="*", help="Lemma list; default from word-tts-unresolved.json")
    ap.add_argument("--cache-dir", default=str(ROOT / "assets" / "word_tts_cache"))
    args = ap.parse_args()

    cache = Path(args.cache_dir)
    cache.mkdir(parents=True, exist_ok=True)

    regen_list = ROOT / "tools" / "word-tts-regen-list.json"
    if args.lemmas:
        lemmas = args.lemmas
    elif regen_list.is_file():
        lemmas = json.loads(regen_list.read_text())
    else:
        un = ROOT / "tools" / "word-tts-unresolved.json"
        lemmas = [x["lemma"] for x in json.loads(un.read_text())]

    method_counts = {}
    for lem in lemmas:
        dest = cache / f"{lem}.mp3"
        if dest.is_file() and dest.stat().st_size > 500:
            print(f"{lem}: skip (cached)")
            continue
        m = regen_lemma(lem, dest)
        method_counts[m] = method_counts.get(m, 0) + 1
        print(f"{lem}: {m} -> {dest}")

    print("methods:", method_counts)


if __name__ == "__main__":
    main()
