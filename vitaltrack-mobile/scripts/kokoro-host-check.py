# Host check for the Kokoro test voice. moonshine-voice 0.1.5 for Python wraps the same native core as the
# Android library CareKosh ships. It loads exactly the files pinned in kokoro-manifest.json from one folder,
# with no download, using the language CareKosh uses for each voice (en_gb for British voices). It then
# speaks app-prepared replies at the three paces. Host evidence only: no Android, phone timing or audio route.
#
#   python -m venv /tmp/kokoro && /tmp/kokoro/bin/pip install moonshine-voice==0.1.5 numpy
#   /tmp/kokoro/bin/python -I scripts/kokoro-host-check.py <pinned folder> <wav output folder> \
#       modules/carekosh-voice/android/src/main/assets/kokoro-manifest.json
#
# The pinned folder holds kokoro/... and en_us/... exactly as in the manifest, downloaded outside Git from
# https://huggingface.co/moonshine-ai/moonshine-voice-assets/resolve/<revision>/tts/<path>. The WAVs and
# index.tsv (file name, text) can feed a speech-recognition check.
import hashlib
import json
import sys
import time
import wave
from pathlib import Path

import numpy as np
from moonshine_voice.tts import TextToSpeech

# Replies as the phone sends them: speechFriendly (core.ts), then kokoroText (KokoroSpeech.kt).
TEXTS = [
    "Yes. Done.",
    "Draft cleared.",
    "Low stock: 1 item. Surgical Mask: 3 boxes.",
    "Saline 0 point 9 percent bottles: 12 point 5 liters remaining. Recorded supplier: MedPlus.",
    "I added 2 items to the draft order. Gloves, 4 boxes. Syringes, 10 pieces. Review the draft before sending it.",
    "Ambu Bag, Nebulizer Kit and Paracetamol 500 milligrams are below the minimum stock.",
]


def main(root: Path, out: Path, manifest_path: Path) -> None:
    manifest = json.loads(manifest_path.read_text())
    for entry in manifest["assets"] + manifest["voices"]:
        data = (root / entry["path"]).read_bytes()
        assert len(data) == entry["bytes"] and hashlib.sha256(data).hexdigest() == entry["sha256"], entry["path"]
    files_before = sorted(p for p in root.rglob("*") if p.is_file())
    out.mkdir(parents=True, exist_ok=True)
    index = []
    for voice in [v["id"] for v in manifest["voices"]]:
        language = "en_gb" if voice.startswith("b") else "en_us"  # kokoroLanguage in KokoroSpeech.kt
        started = time.monotonic()
        tts = TextToSpeech().language(language).voice("kokoro_" + voice).models_from(root).load()
        load_ms = (time.monotonic() - started) * 1000
        synthesis = audio = 0.0
        for i, text in enumerate(TEXTS):
            for pace in (0.9, 1.0, 1.1) if i == 2 else (1.0,):
                started = time.monotonic()
                samples, rate = tts.synthesize(text, speed=pace)
                seconds = time.monotonic() - started
                x = np.asarray(samples, dtype=np.float32)
                assert rate == 24000 and len(x) and np.isfinite(x).all(), (voice, i, rate)
                if pace == 1.0:
                    synthesis += seconds
                    audio += len(x) / rate
                    name = f"{voice}-{i}.wav"
                    with wave.open(str(out / name), "wb") as w:
                        w.setnchannels(1)
                        w.setsampwidth(2)
                        w.setframerate(rate)
                        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
                    index.append(f"{name}\t{text}")
                else:
                    print(f"  {voice} pace {pace}: {len(x) / rate:.2f} s")
        print(f"{voice} ({language}): loaded in {load_ms:.0f} ms, real-time factor {synthesis / audio:.3f} on this host")
    assert sorted(p for p in root.rglob("*") if p.is_file()) == files_before, "the library must not download anything"
    (out / "index.tsv").write_text("\n".join(index) + "\n")
    print("PASS pinned Kokoro files: every voice loads from the folder alone and speaks at 24 kHz")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: kokoro-host-check.py <pinned folder> <wav output folder> <kokoro-manifest.json>")
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
