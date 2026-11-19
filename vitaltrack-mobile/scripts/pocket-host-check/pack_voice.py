# Packs a pocket-tts voice-state .safetensors file into the app's pt_voice_<id>.bin layout, as `pack_voice` and the
# voice loop of john-rocky/LiteRT-Models pockettts/scripts/build_pockettts.py do (MIT): int32 frame count, then K and V
# as fp16 [6 layers x 16 heads, frames, 64], with each K head's dimensions de-interleaved (even dims first).
# PocketVoiceState.kt does the same on the phone; both must give identical bytes.
#
#   python -I pack_voice.py <voice.safetensors> <pt_voice_<id>.bin>
import hashlib
import json
import struct
import sys

import numpy as np

LAYERS, HEADS, HEAD_DIM, MAX_FRAMES = 6, 16, 64, 200
PERM = np.concatenate([np.arange(0, HEAD_DIM, 2), np.arange(1, HEAD_DIM, 2)])


def tensor(header, data, name, dtype, shape=None):
    entry = header.get(name)
    if entry is None or entry["dtype"] != dtype or (shape is not None and entry["shape"] != shape):
        raise SystemExit(f"unexpected tensor {name}: {entry}")
    start, end = entry["data_offsets"]
    values = np.frombuffer(data[start:end], {"F32": "<f4", "I64": "<i8"}[dtype])
    return values.reshape(entry["shape"])


def pack(source, target):
    with open(source, "rb") as f:
        size = struct.unpack("<Q", f.read(8))[0]
        if not 2 <= size <= 100_000:
            raise SystemExit("unexpected safetensors header size")
        header = json.loads(f.read(size))
        data = f.read()
    header.pop("__metadata__", None)
    keys, values, frames = [], [], None
    for layer in range(LAYERS):
        prefix = f"transformer.layers.{layer}.self_attn/"
        offset = int(tensor(header, data, prefix + "offset", "I64", [1])[0])
        if prefix + "pad" in header and int(tensor(header, data, prefix + "pad", "I64", [1])[0]) != 0:
            raise SystemExit("padded voice states are not supported")
        cache = tensor(header, data, prefix + "cache", "F32")
        if list(cache.shape[:2]) != [2, 1] or list(cache.shape[3:]) != [HEADS, HEAD_DIM]:
            raise SystemExit(f"unexpected cache shape {cache.shape}")
        if not 1 <= offset <= min(cache.shape[2], MAX_FRAMES) or frames not in (None, offset):
            raise SystemExit(f"unexpected voice length {offset}")
        frames = offset
        k, v = cache[0, 0, :offset], cache[1, 0, :offset]          # [T,16,64]
        if not (np.isfinite(k).all() and np.isfinite(v).all()):
            raise SystemExit("voice state has non-finite values")
        with np.errstate(over="ignore"):
            keys.append(k[:, :, PERM].transpose(1, 0, 2).astype(np.float16))
            values.append(v.transpose(1, 0, 2).astype(np.float16))
        if not (np.isfinite(keys[-1]).all() and np.isfinite(values[-1]).all()):
            raise SystemExit("voice state is out of float16 range")
    expected = {f"transformer.layers.{i}.self_attn/{n}" for i in range(LAYERS) for n in ("cache", "offset", "pad")}
    if not set(header) <= expected:
        raise SystemExit(f"unexpected tensors {sorted(set(header) - expected)}")
    with open(target, "wb") as f:
        np.array([frames], dtype="<i4").tofile(f)
        np.stack(keys).reshape(LAYERS * HEADS, frames, HEAD_DIM).astype("<f2").tofile(f)
        np.stack(values).reshape(LAYERS * HEADS, frames, HEAD_DIM).astype("<f2").tofile(f)
    with open(target, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    print(f"{target}: {frames} frames, {4 + 2 * LAYERS * HEADS * frames * HEAD_DIM * 2} bytes, sha256 {digest}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__ or "usage: pack_voice.py <voice.safetensors> <pt_voice_<id>.bin>")
    pack(sys.argv[1], sys.argv[2])
