#include <jni.h>
#include "needle.h"
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
std::mutex runtimeMutex;
// needle_load retains tensor pointers into its caller's blob and exposes no unload API.
// Keep exactly one pinned model alive for the process; never free it during native inference.
std::vector<unsigned char> modelBytes;
bool modelLoaded = false;
bool modelLoadAttempted = false;
void requireTelemetryOff() {
    const char* telemetry = std::getenv("NEEDLE_TELEMETRY");
    const char* noTrack = std::getenv("DO_NOT_TRACK");
    if (!telemetry || std::strcmp(telemetry, "0") != 0 || !noTrack || std::strcmp(noTrack, "1") != 0) {
        throw std::runtime_error("Whistle telemetry opt-out is not active");
    }
}
void fail(JNIEnv* env, const char* message) {
    jclass type = env->FindClass("java/lang/IllegalStateException");
    if (type) env->ThrowNew(type, message);
}
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_expo_modules_carekoshvoice_WhistleRuntime_nativeTranscribe(JNIEnv* env, jobject, jstring path, jfloatArray audio) {
    try {
        std::lock_guard<std::mutex> guard(runtimeMutex);
        requireTelemetryOff();
        if (!path || !audio) throw std::runtime_error("Invalid Whistle input");
        const jsize count = env->GetArrayLength(audio);
        if (count < 4800 || count > 448000) throw std::runtime_error("Invalid Whistle recording length");
        std::vector<float> samples(static_cast<size_t>(count));
        env->GetFloatArrayRegion(audio, 0, count, samples.data());
        if (env->ExceptionCheck()) return nullptr;
        for (float value : samples) {
            if (!std::isfinite(value) || value < -1.f || value > 1.f) throw std::runtime_error("Invalid Whistle recording samples");
        }
        if (!modelLoaded) {
            if (modelLoadAttempted) throw std::runtime_error("Restart the app before retrying Whistle");
            const char* chars = env->GetStringUTFChars(path, nullptr);
            if (!chars) return nullptr;
            const std::string modelPath(chars);
            env->ReleaseStringUTFChars(path, chars);
            std::ifstream file(modelPath, std::ios::binary | std::ios::ate);
            if (!file || file.tellg() != 16919407) throw std::runtime_error("Whistle model is unavailable");
            std::vector<unsigned char> bytes(16919407);
            file.seekg(0);
            if (!file.read(reinterpret_cast<char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()))) {
                throw std::runtime_error("Could not read Whistle model");
            }
            // Preserve even a failed load's tensor backing until process exit; don't guess ownership.
            modelLoadAttempted = true;
            modelBytes = std::move(bytes);
            if (needle_load(modelBytes.data(), modelBytes.size()) < 0 || !(needle_models() & NEEDLE_SPEECH)) {
                throw std::runtime_error("Whistle model could not be loaded");
            }
            modelLoaded = true;
        }
        std::vector<char> output(16384, '\0');
        const int result = needle_transcribe(samples.data(), count, "en", nullptr, 0, output.data(), static_cast<int>(output.size()));
        if (result < 0 || !std::memchr(output.data(), '\0', output.size())) {
            // Never expose runtime error strings: they may contain model/input details.
            throw std::runtime_error("Whistle transcription failed");
        }
        // JSON is UTF-8, whereas JNI NewStringUTF expects modified UTF-8.
        const auto length = static_cast<jsize>(std::strlen(output.data()));
        jbyteArray bytes = env->NewByteArray(length);
        if (bytes) env->SetByteArrayRegion(bytes, 0, length, reinterpret_cast<const jbyte*>(output.data()));
        return bytes;
    } catch (const std::bad_alloc&) {
        fail(env, "Not enough memory for Whistle");
    } catch (const std::exception& error) {
        fail(env, error.what());
    } catch (...) {
        fail(env, "Whistle stopped unexpectedly");
    }
    return nullptr;
}
