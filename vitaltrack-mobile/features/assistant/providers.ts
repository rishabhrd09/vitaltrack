import type { Capabilities } from '@/services/assistant';
import { ALBA_SELECTION_ENABLED, CLOUD_TEXT_ENABLED, CLOUD_TRANSCRIPTION_ENABLED, KOKORO_SELECTION_ENABLED, SARVAM_SPEECH_ENABLED, WHISTLE_LISTENING_ENABLED } from './policy';
import type { OfflineFallbackVoice, Preferences } from './preferences';
import { sarvamSourceAvailable } from './sarvam';

/**
 * Voice providers by stage. Four things are kept apart:
 * - readiness: what this phone and server can do now (derived, never stored);
 * - the saved choice: per-account preferences (config);
 * - consent: the server's record of accepted scopes;
 * - the provider in use: the choice if it is ready, otherwise a stated reason (never a silent swap).
 * Transient UI state (busy, speaking, progress) stays in the screen.
 */
export type Stage = 'listening' | 'understanding' | 'speaking';
export type ListenerId = 'offline' | 'groq' | 'whistle';
export type InterpreterId = 'local' | 'groq';
export type SpeakerId = 'device' | 'pocket' | 'kokoro_offline' | 'sarvam';
export type Readiness = 'ready' | 'checking' | 'needs_download' | 'needs_consent' | 'needs_key' | 'unavailable' | 'paused';
export type Provider<Id extends string> = { id: Id; label: string; online: boolean; readiness: Readiness; detail: string };
/** Whether the capability request itself worked; distinct from what the server offers. */
export type ServerStatus = { state: 'checking' | 'loaded' | 'failed'; reason?: string };
export type Environment = {
  supported: boolean;
  model: { checked: boolean; ready: boolean };
  /** Experimental listener, preview builds only. Never changes the chosen speaker. */
  whistle?: { checked: boolean; ready: boolean; supported: boolean; telemetryDisabled: boolean; reason?: string };
  /** `checked: false` while Android text-to-speech is still starting. */
  deviceVoice: { ready: boolean; checked?: boolean };
  alba: { checked: boolean; ready: boolean; supported: boolean };
  /** Kokoro test voice (diagnostics builds); `ready` = the chosen voice can speak now. Absent = not offered. */
  kokoro?: { checked: boolean; ready: boolean; supported: boolean };
  caps: Capabilities;
  /** Absent means loaded (older callers). */
  server?: ServerStatus;
};
export type Choices = { listening: ListenerId; understanding: InterpreterId; speaking: SpeakerId; fallback: OfflineFallbackVoice | null };
export type InUse<Id extends string> = { chosen: Id; ready: boolean; reason: string };

export const READINESS_LABEL: Record<Readiness, string> = {
  ready: 'Ready', checking: 'Checking…', needs_download: 'Needs download', needs_consent: 'Needs your consent',
  needs_key: 'Needs a configured key', unavailable: 'Unavailable', paused: 'Paused',
};

/**
 * Online providers first need a capability answer. A pending or failed request is reported as such,
 * never as "not configured on this server", which only a successful answer can establish.
 */
function serverGate(env: Environment): { readiness: Readiness; detail: string } | null {
  const server = env.server;
  if (server?.state === 'checking') return { readiness: 'checking', detail: 'Checking the CareKosh server…' };
  if (server?.state === 'failed') return { readiness: 'unavailable', detail: `Could not reach the CareKosh server${server.reason ? ` (${server.reason})` : ''}. Tap Recheck.` };
  if (env.caps.consent_mismatch) return { readiness: 'unavailable', detail: 'This app and the CareKosh server use different consent versions. Update the app, then tap Recheck.' };
  return null;
}

/** A short, user-facing reason for a failed capability request. */
export function serverFailureReason(error: unknown, offline = false): string {
  if (offline) return 'no internet connection';
  const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  const data = typeof error === 'object' && error !== null && 'data' in error ? (error as { data?: { originalError?: string } }).data : undefined;
  if (status === 401 || status === 403) return 'your sign-in needs renewing';
  if (data?.originalError === 'request_timeout') return 'the server took too long to answer';
  if (status === 0) return 'the server did not respond; it may be starting up';
  if (status !== undefined && status >= 500) return `server error ${status}`;
  if (status !== undefined) return `unexpected answer ${status}`;
  return 'the server did not respond';
}

/** The saved choices, read from preferences that loadPreferences has already sanitised. */
export function choicesFrom(prefs: Preferences): Choices {
  return {
    listening: WHISTLE_LISTENING_ENABLED && prefs.inputProvider === 'whistle' ? 'whistle' : CLOUD_TRANSCRIPTION_ENABLED && prefs.inputProvider === 'groq' && prefs.audioOptIn ? 'groq' : 'offline',
    understanding: CLOUD_TEXT_ENABLED && prefs.cloud ? 'groq' : 'local',
    speaking: prefs.speechProvider === 'sarvam' && SARVAM_SPEECH_ENABLED && prefs.sarvamSpeechOptIn ? 'sarvam'
      : prefs.speechProvider === 'pocket' && ALBA_SELECTION_ENABLED ? 'pocket'
      : prefs.speechProvider === 'kokoro_offline' && KOKORO_SELECTION_ENABLED ? 'kokoro_offline' : 'device',
    fallback: prefs.speechFallback ?? null,
  };
}

export function listeners(env: Environment): Provider<ListenerId>[] {
  const offline: Provider<ListenerId> = { id: 'offline', label: 'Offline · Moonshine on this phone', online: false,
    ...(!env.supported ? { readiness: 'unavailable', detail: 'Recording needs the Android app. You can still type.' }
      : !env.model.checked ? { readiness: 'checking', detail: 'Checking the speech pack…' }
      : env.model.ready ? { readiness: 'ready', detail: 'Recordings stay on this phone; live words appear while you speak.' }
      : { readiness: 'needs_download', detail: 'Download the English speech pack once.' }) };
  const whistleEnv = env.whistle;
  const whistle: Provider<ListenerId> = { id: 'whistle', label: 'Whistle · experimental offline', online: false,
    ...(!env.supported || !whistleEnv?.supported ? { readiness: 'unavailable', detail: whistleEnv?.reason || 'Needs the latest Android ARM64 preview APK.' }
      : !whistleEnv.checked ? { readiness: 'checking', detail: 'Checking Whistle and its telemetry controls…' }
      : !whistleEnv.telemetryDisabled ? { readiness: 'unavailable', detail: 'Whistle is blocked because telemetry could not be disabled.' }
      : whistleEnv.ready ? { readiness: 'ready', detail: 'Recognizes the finished recording on this phone. Review the transcript before Send.' }
      : { readiness: 'needs_download', detail: 'Download Whistle once. English experimental listener; Hindi and Hinglish are not supported.' }) };
  const local = WHISTLE_LISTENING_ENABLED ? [offline, whistle] : [offline];
  if (!CLOUD_TRANSCRIPTION_ENABLED) return local;
  const groq: Provider<ListenerId> = { id: 'groq', label: 'Groq Whisper · online', online: true,
    ...(!env.supported ? { readiness: 'unavailable', detail: 'Recording needs the Android app. You can still type.' }
      : serverGate(env) ?? (!env.caps.transcription_providers.includes('groq') ? { readiness: 'unavailable', detail: 'Not configured on this server.' }
      : !env.caps.scopes.includes('groq_audio') ? { readiness: 'needs_consent', detail: 'Uploads the finished recording for its transcript.' }
      : { readiness: 'ready', detail: 'The finished recording is uploaded; review the words before Send.' })) };
  return [...local, groq];
}

export function interpreters(env: Environment): Provider<InterpreterId>[] {
  const local: Provider<InterpreterId> = { id: 'local', label: 'On this phone', online: false, readiness: 'ready',
    detail: 'Understands familiar commands, filters, comparisons, exclusions and drafts without sending anything.' };
  if (!CLOUD_TEXT_ENABLED) return [local];
  const contracts = env.caps.interpret_contracts || [];
  const groq: Provider<InterpreterId> = { id: 'groq', label: 'Groq · online', online: true,
    ...(serverGate(env) ?? (!env.caps.interpret ? { readiness: 'unavailable', detail: 'Not configured on this server.' }
      : !env.caps.scopes.includes('groq_text') ? { readiness: 'needs_consent', detail: 'Sends the reviewed question text after Send, only when the phone cannot understand it.' }
      : { readiness: 'ready', detail: contracts.includes(3) ? 'Ready for multi-part requests (contract 3).' : contracts.includes(2)
        ? 'Ready, but this server is older (contract 2): some multi-part requests will ask you to rephrase.'
        : 'Ready for basic requests only (contract 1). Update the backend for filters and drafts.' })) };
  return [local, groq];
}

export function speakers(env: Environment, prefs: Preferences): Provider<SpeakerId>[] {
  const device: Provider<SpeakerId> = { id: 'device', label: 'Device voice · offline', online: false,
    ...(env.deviceVoice.checked === false ? { readiness: 'checking', detail: 'Checking Android text-to-speech…' }
      : env.deviceVoice.ready ? { readiness: 'ready', detail: 'Android text-to-speech on this phone.' }
      : { readiness: 'unavailable', detail: 'Install an English voice in Android Text-to-speech settings.' }) };
  const pocket: Provider<SpeakerId> = { id: 'pocket', label: 'Alba · offline', online: false,
    ...(!ALBA_SELECTION_ENABLED ? { readiness: 'paused', detail: 'Paused until it passes the phone acceptance checks.' }
      : !env.alba.supported ? { readiness: 'unavailable', detail: 'Needs the Android app.' }
      : !env.alba.checked ? { readiness: 'checking', detail: 'Checking the Alba pack…' }
      : env.alba.ready ? { readiness: 'ready', detail: 'Generated inside CareKosh.' }
      : { readiness: 'needs_download', detail: 'Download the Alba pack once.' }) };
  const kokoroEnv = env.kokoro ?? { checked: true, ready: false, supported: false };
  const kokoro: Provider<SpeakerId> = { id: 'kokoro_offline', label: 'Kokoro · offline test', online: false,
    ...(!kokoroEnv.supported ? { readiness: 'unavailable', detail: 'Needs the latest Android test APK.' }
      : !kokoroEnv.checked ? { readiness: 'checking', detail: 'Checking the Kokoro files…' }
      : kokoroEnv.ready ? { readiness: 'ready', detail: 'Generated inside CareKosh. Test voice for comparison.' }
      : { readiness: 'needs_download', detail: 'Download the Kokoro test voice once.' }) };
  const offline = KOKORO_SELECTION_ENABLED ? [device, pocket, kokoro] : [device, pocket];
  if (!SARVAM_SPEECH_ENABLED) return offline;
  const source = prefs.sarvamKeySource ?? 'application';
  const sarvam: Provider<SpeakerId> = { id: 'sarvam', label: 'Sarvam English · online', online: true,
    ...(serverGate(env) ?? (!sarvamSourceAvailable(env.caps, source) ? source === 'personal'
        ? { readiness: 'needs_key', detail: 'Your personal key is missing or cannot be used. Shared credits are never used instead.' }
        : { readiness: 'unavailable', detail: 'The CareKosh Sarvam account is not configured on this server.' }
      : !env.caps.scopes.includes('sarvam_speech') ? { readiness: 'needs_consent', detail: 'Sends the short answer text for speech.' }
      : { readiness: 'ready', detail: (source === 'personal' ? 'Uses your personal key.' : 'Uses the CareKosh Sarvam account.') + ' Provider validity and credits are checked when speech is requested.' })) };
  return [...offline, sarvam];
}

/** The chosen provider and whether it can run now; a blocked choice says why instead of pretending to work. */
export function inUse<Id extends string>(chosen: Id, providers: Provider<Id>[]): InUse<Id> {
  const provider = providers.find(p => p.id === chosen);
  if (!provider) return { chosen, ready: false, reason: 'This choice is no longer offered.' };
  return { chosen, ready: provider.readiness === 'ready', reason: provider.readiness === 'ready' ? '' : `${READINESS_LABEL[provider.readiness]} · ${provider.detail}` };
}

/**
 * Fail closed before cloud interpretation when an older contract cannot express a requested
 * condition. The local parser runs first and may still answer an exact request on any server.
 * This is a conservative compatibility gate, not a second natural-language interpreter.
 */
export function minimumInterpretContract(question: string): 1 | 2 | 3 {
  const q = question.toLowerCase().replace(/[–—-]/g, ' ');
  const draft = /\b(?:draft|order)\b/.test(q);
  const comparison = /[<>≤≥]|\b(?:less|fewer|greater|more|lower|higher) than\b|\b(?:at (?:least|most)|no (?:more|less) than|not (?:more|less) than|exactly|equal(?:s| to)?|between|under|above|over)\b|\bbelow\b(?! (?:their |the )?minimum)/.test(q);
  const advanced = comparison || /\b(?:critical|important|imprtant|essential|life support|priority|urgent|urgently|immediately|shortfall|excluding|exclude|except|apart from|other than|leave out|leaving out|omit|skip|not|never|don't)\b/.test(q);
  const filteredDraft = draft && /\b(?:category|categories|supplier|supplied|brand|wound care|(?:from|for|with) (?:those|these|them|the list|the results)|previous|shown|results)\b/.test(q);
  const groupedFilters = /\b(?:and|or|plus|also|as well as)\b/.test(q) && /\b(?:category|categories|supplier|brand)\b/.test(q);
  if (advanced || filteredDraft || groupedFilters) return 3;
  if (draft || /\b(?:category|categories|supplier|supplied|brand|below (?:their |the )?minimum|sort|sorted)\b/.test(q) || /\blow stock\b/.test(q) && /\bout of stock\b/.test(q)) return 2;
  return 1;
}
