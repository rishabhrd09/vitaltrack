// Keep the selected runtime/model's notice available in the installed application.
// Distribution also requires a final transitive-native-dependency notice review.
export const offlineSpeechNotice = `Moonshine Voice and Moonshine Small Streaming English
https://github.com/moonshine-ai/moonshine
https://huggingface.co/moonshine-ai/moonshine-streaming-small

MIT License
Copyright (c) 2025 Useful Sensors, Inc. (dba Moonshine AI)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

This notice applies to the selected English streaming model and Moonshine code,
not to unrelated Moonshine models or all third-party native components.
Moonshine recognizes speech; it does not provide a speaking voice.
Device voice uses Android Text-to-speech. The optional downloaded Alba voice
uses Pocket TTS inside CareKosh, under the separate notices below.`;

export const pocketSpeechNotice = `Alba English · Kyutai Pocket TTS
Model and Alba MacKenna voice recordings: Creative Commons Attribution 4.0 International.
https://creativecommons.org/licenses/by/4.0/
https://huggingface.co/kyutai/tts-voices#alba-mackenna
https://huggingface.co/kyutai/pocket-tts-without-voice-cloning

Converted Pocket TTS models and repacked Alba preset by Daisuke Majima:
https://huggingface.co/mlboydaisuke/Pocket-TTS-LiteRT
Revision e0e68d4fb79feb529d7d0f8d0bbfad8d15a18a1e, CC BY 4.0.
CareKosh uses fixed presets for synthetic assistant speech, never arbitrary voice cloning.
This is a different model from Piper Alba/Lyra; identical output is not claimed.

Alba (updated): Kyutai's Alba voice state regenerated to end on a short pause
(pocket-tts #334), kyutai/pocket-tts-without-voice-cloning revision
069025daa1d6a8a9640bd52581e2a2252f8bede4, english_2026-04, CC BY 4.0.
Modified: converted to float16 and repacked on this phone by CareKosh.

Optional preset voices from the Pocket-TTS-LiteRT revision above:
Charles, Eve and Mary: CSTR VCTK Corpus (University of Edinburgh), CC BY 4.0.
https://huggingface.co/kyutai/tts-voices/tree/main/vctk
Javert and Marius: Unmute Voice Donation Project, CC0.
https://huggingface.co/kyutai/tts-voices/tree/main/voice-donations

Android orchestration adapted from john-rocky/LiteRT-Models:
Copyright (c) 2026 Daisuke Majima, MIT License.
https://github.com/john-rocky/LiteRT-Models
CareKosh changes: app-private downloads, preset-only voice selection, bounded
generation, cancellation, audio focus, playback and resource cleanup.

Pocket TTS original code: Copyright (c) Kyutai, MIT License.
LiteRT Android 2.1.6: Apache License 2.0, with bundled third-party notices.
This integration uses LiteRT, not the eSpeak-containing Sherpa/Piper runtime.

Complete licence texts and SDK notices are bundled in the APK's
assets/pocket-licences. Use the licence export button to read them.
Attribution does not imply endorsement by the original creators.`;

/** Diagnostics builds only: the Kokoro test voice and the files it downloads. */
export const kokoroSpeechNotice = `Kokoro test voice · Kokoro-82M through Moonshine (diagnostics builds only)
Kokoro-82M model and voices (Heart, Bella, Emma): hexgrad, Apache License 2.0.
https://huggingface.co/hexgrad/Kokoro-82M
ONNX export: onnx-community/Kokoro-82M-v1.0-ONNX, Apache License 2.0; int8-packed
and split by Moonshine AI. Files from moonshine-ai/moonshine-voice-assets,
revision 0bf2f2e5aff22e6fbba4300b00a4e00bbc4f8aae, checked against pinned SHA-256.
English pronunciation data: CMU Pronouncing Dictionary (BSD-style licence),
Copyright (C) 1993-2015 Carnegie Mellon University, filtered by Moonshine AI,
plus Moonshine's out-of-vocabulary model; Moonshine states that its
pronunciation data follow the terms of their dictionary sources.
moonshine-voice library: Copyright (c) 2025 Useful Sensors, Inc. (dba Moonshine AI), MIT.
No voice cloning is used. Full texts: assets/pocket-licences (KOKORO-ATTRIBUTION.txt).`;


/** Diagnostics builds only: the model and CPU engine used by the experimental listener. */
export const whistleSpeechNotice = `Whistle speech recognition and Needle CPU engine · Cactus Compute, Inc.
Apache License 2.0. English experimental listener in this diagnostic APK.
https://huggingface.co/Cactus-Compute/whistle
https://huggingface.co/Cactus-Compute/needle3
The pinned Whistle model is 16,919,407 bytes (16.9 MB); the Android ARM64 runtime
is included in the APK. CareKosh calls the C API directly, without the Python
wrapper or its automatic runtime downloader. Telemetry opt-outs are applied
before runtime use. Whistle recognizes speech; it does not speak answers.
Full licence and revision notices are bundled in assets/whistle-licences and
included in the offline voice licence export. Attribution does not imply endorsement.`;
