import type { Capabilities } from '@/services/assistant';
import { ALBA_SELECTION_ENABLED, CLOUD_TEXT_ENABLED, CLOUD_TRANSCRIPTION_ENABLED, SARVAM_SPEECH_ENABLED } from './policy';
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
export type ListenerId = 'offline' | 'groq';
export type InterpreterId = 'local' | 'groq';
export type SpeakerId = 'device' | 'pocket' | 'sarvam';
export type Readiness = 'ready' | 'checking' | 'needs_download' | 'needs_consent' | 'needs_key' | 'unavailable' | 'paused';
export type Provider<Id extends string> = { id: Id; label: string; online: boolean; readiness: Readiness; detail: string };
export type Environment = {
  supported: boolean;
  model: { checked: boolean; ready: boolean };
  deviceVoice: { ready: boolean };
  alba: { checked: boolean; ready: boolean; supported: boolean };
  caps: Capabilities;
};
export type Choices = { listening: ListenerId; understanding: InterpreterId; speaking: SpeakerId; fallback: OfflineFallbackVoice | null };
export type InUse<Id extends string> = { chosen: Id; ready: boolean; reason: string };

export const READINESS_LABEL: Record<Readiness, string> = {
  ready: 'Ready', checking: 'Checking…', needs_download: 'Needs download', needs_consent: 'Needs your consent',
  needs_key: 'Needs a configured key', unavailable: 'Unavailable', paused: 'Paused',
};

/** The saved choices, read from preferences that loadPreferences has already sanitised. */
export function choicesFrom(prefs: Preferences): Choices {
  return {
    listening: CLOUD_TRANSCRIPTION_ENABLED && prefs.inputProvider === 'groq' && prefs.audioOptIn ? 'groq' : 'offline',
    understanding: CLOUD_TEXT_ENABLED && prefs.cloud ? 'groq' : 'local',
    speaking: prefs.speechProvider === 'sarvam' && SARVAM_SPEECH_ENABLED && prefs.sarvamSpeechOptIn ? 'sarvam' : prefs.speechProvider === 'pocket' && ALBA_SELECTION_ENABLED ? 'pocket' : 'device',
    fallback: prefs.speechFallback ?? null,
  };
}

export function listeners(env: Environment): Provider<ListenerId>[] {
  const offline: Provider<ListenerId> = { id: 'offline', label: 'Offline · Moonshine on this phone', online: false,
    ...(!env.supported ? { readiness: 'unavailable', detail: 'Recording needs the Android app. You can still type.' }
      : !env.model.checked ? { readiness: 'checking', detail: 'Checking the speech pack…' }
      : env.model.ready ? { readiness: 'ready', detail: 'Recordings stay on this phone; live words appear while you speak.' }
      : { readiness: 'needs_download', detail: 'Download the English speech pack once.' }) };
  if (!CLOUD_TRANSCRIPTION_ENABLED) return [offline];
  const groq: Provider<ListenerId> = { id: 'groq', label: 'Groq Whisper · online', online: true,
    ...(!env.supported ? { readiness: 'unavailable', detail: 'Recording needs the Android app. You can still type.' }
      : !env.caps.transcription_providers.includes('groq') ? { readiness: 'unavailable', detail: 'Not configured on this server.' }
      : !env.caps.scopes.includes('groq_audio') ? { readiness: 'needs_consent', detail: 'Uploads the finished recording for its transcript.' }
      : { readiness: 'ready', detail: 'The finished recording is uploaded; review the words before Send.' }) };
  return [offline, groq];
}

export function interpreters(env: Environment): Provider<InterpreterId>[] {
  const local: Provider<InterpreterId> = { id: 'local', label: 'On this phone', online: false, readiness: 'ready',
    detail: 'Understands familiar commands, filters, comparisons, exclusions and drafts without sending anything.' };
  if (!CLOUD_TEXT_ENABLED) return [local];
  const contracts = env.caps.interpret_contracts || [];
  const groq: Provider<InterpreterId> = { id: 'groq', label: 'Groq · online', online: true,
    ...(!env.caps.interpret ? { readiness: 'unavailable', detail: 'Not configured on this server.' }
      : !env.caps.scopes.includes('groq_text') ? { readiness: 'needs_consent', detail: 'Sends the reviewed question text after Send, only when the phone cannot understand it.' }
      : { readiness: 'ready', detail: contracts.includes(3) ? 'Ready for multi-part requests (contract 3).' : contracts.includes(2)
        ? 'Ready, but this server is older (contract 2): some multi-part requests will ask you to rephrase.'
        : 'Ready for basic requests only (contract 1). Update the backend for filters and drafts.' }) };
  return [local, groq];
}

export function speakers(env: Environment, prefs: Preferences): Provider<SpeakerId>[] {
  const device: Provider<SpeakerId> = { id: 'device', label: 'Device voice · offline', online: false,
    ...(env.deviceVoice.ready ? { readiness: 'ready', detail: 'Android text-to-speech on this phone.' }
      : { readiness: 'unavailable', detail: 'Install an English voice in Android Text-to-speech settings.' }) };
  const pocket: Provider<SpeakerId> = { id: 'pocket', label: 'Alba · offline', online: false,
    ...(!ALBA_SELECTION_ENABLED ? { readiness: 'paused', detail: 'Paused until it passes the phone acceptance checks.' }
      : !env.alba.supported ? { readiness: 'unavailable', detail: 'Needs the Android app.' }
      : !env.alba.checked ? { readiness: 'checking', detail: 'Checking the Alba pack…' }
      : env.alba.ready ? { readiness: 'ready', detail: 'Generated inside CareKosh.' }
      : { readiness: 'needs_download', detail: 'Download the Alba pack once.' }) };
  if (!SARVAM_SPEECH_ENABLED) return [device, pocket];
  const source = prefs.sarvamKeySource ?? 'application';
  const sarvam: Provider<SpeakerId> = { id: 'sarvam', label: 'Sarvam English · online', online: true,
    ...(!sarvamSourceAvailable(env.caps, source) ? source === 'personal'
        ? { readiness: 'needs_key', detail: 'Your personal key is missing or cannot be used. Shared credits are never used instead.' }
        : { readiness: 'unavailable', detail: 'The CareKosh Sarvam account is not configured on this server.' }
      : !env.caps.scopes.includes('sarvam_speech') ? { readiness: 'needs_consent', detail: 'Sends the short answer text for speech.' }
      : { readiness: 'ready', detail: (source === 'personal' ? 'Uses your personal key.' : 'Uses the CareKosh Sarvam account.') + ' Provider validity and credits are checked when speech is requested.' }) };
  return [device, pocket, sarvam];
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
  const advanced = comparison || /\b(?:critical|priority|urgent|urgently|immediately|shortfall|excluding|exclude|except|apart from|other than|leave out|leaving out|omit|skip|not|never|don't)\b/.test(q);
  const filteredDraft = draft && /\b(?:category|categories|supplier|supplied|brand|wound care|(?:from|for|with) (?:those|these|them|the list|the results)|previous|shown|results)\b/.test(q);
  const groupedFilters = /\b(?:and|or|plus|also|as well as)\b/.test(q) && /\b(?:category|categories|supplier|brand)\b/.test(q);
  if (advanced || filteredDraft || groupedFilters) return 3;
  if (draft || /\b(?:category|categories|supplier|supplied|brand|below (?:their |the )?minimum|sort|sorted)\b/.test(q) || /\blow stock\b/.test(q) && /\bout of stock\b/.test(q)) return 2;
  return 1;
}
