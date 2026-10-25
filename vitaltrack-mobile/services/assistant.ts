import { api } from './api';
import { assertSession, type Session } from './assistantSession';
import { validatePlan, validateSpecification } from '@/features/assistant/contracts';
import { validateIntent } from '@/features/assistant/core';

export const CONSENT_VERSION = 'voice-2026-10-06';
export type ConsentScope = 'groq_text' | 'groq_audio' | 'sarvam_audio' | 'kokoro_speech' | 'sarvam_speech' | 'openai_text';
export type SarvamKeySource = 'application' | 'personal';
export type SarvamKeyStatus = { setup_available: boolean; configured: boolean; usable: boolean; updated_at: string | null };
export type OpenAIKeyStatus = { setup_available: boolean; configured: boolean; usable: boolean; updated_at: string | null };
export type OpenAIModel = { id: string; label: string };
export type OpenAILimits = { daily_requests: number; daily_budget_microusd: number; max_output_tokens: number };
export type Capabilities = { interpret: boolean; interpret_contracts?: number[]; order_review_guard?: boolean; transcribe: boolean; speak: boolean; consented: boolean; consent_version: string; voice: string; scopes: ConsentScope[]; transcription_providers: string[]; speech_providers: string[]; sarvam_english_voice?: { model: string; speaker: string; language_code: string } | null; sarvam_personal_key?: SarvamKeyStatus; sarvam_application_available?: boolean;
  interpretation_providers?: ('groq' | 'openai')[]; openai_personal_key?: OpenAIKeyStatus; openai_model?: OpenAIModel | null; openai_limits?: OpenAILimits;
  /** Set by the phone when the server's consent version differs; every online choice is then unavailable. */
  consent_mismatch?: boolean };
export const unavailable: Capabilities = { interpret: false, transcribe: false, speak: false, consented: false, consent_version: CONSENT_VERSION, voice: '', scopes: [], transcription_providers: [], speech_providers: [] };

/**
 * One automatic retry after a short "AI is busy" answer (Retry-After of 10 s or less), which the server sends
 * before any provider call. Never used for speech: each speech request may be billed.
 */
async function retryOnceWhenBusy<T>(request: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try { return await request(); }
  catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
    const data = typeof error === 'object' && error !== null && 'data' in error ? (error as { data?: { retryAfter?: unknown; errorCode?: string } }).data : undefined;
    const wait = data?.retryAfter;
    if (status !== 429 || data?.errorCode !== 'busy' || typeof wait !== 'number' || !Number.isFinite(wait) || wait < 0 || wait > 10 || signal?.aborted) throw error;
    await new Promise<void>((resolve, reject) => {
      const stop = () => { clearTimeout(timer); reject(new Error('Request cancelled.')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, wait * 1000);
      signal?.addEventListener('abort', stop, { once: true });
    });
    return request();
  }
}

export async function capabilities(session: Session, signal?: AbortSignal): Promise<Capabilities> {
  const value = await api.assistantRequest<Capabilities>('/ai/capabilities', { method: 'GET', signal }, () => assertSession(session));
  if (value.consent_version !== CONSENT_VERSION) return { ...unavailable, consent_mismatch: true };
  return { ...unavailable, ...value, scopes: value.scopes || [], transcription_providers: value.transcription_providers || [], speech_providers: value.speech_providers || [] };
}
export async function setConsent(session: Session, scopes: ConsentScope[]) {
  return api.assistantRequest('/ai/consent', { method: 'PUT', body: JSON.stringify({ version: CONSENT_VERSION, accepted: scopes.length > 0, scopes }) }, () => assertSession(session));
}
export async function interpret(session: Session, question: string, hasPrevious: boolean, signal: AbortSignal) {
  return validateIntent(await retryOnceWhenBusy(() => api.assistantRequest('/ai/interpret', { method: 'POST', signal,
    body: JSON.stringify({ question, has_previous_item: hasPrevious }) }, () => assertSession(session)), signal));
}
export async function transcribe(session: Session, uri: string, signal: AbortSignal, provider: 'groq' | 'sarvam' = 'groq') {
  const form = new FormData();
  const wav = uri.toLowerCase().endsWith('.wav');
  form.append('file', { uri, name: wav ? 'question.wav' : 'question.m4a', type: wav ? 'audio/wav' : 'audio/mp4' } as unknown as Blob);
  form.append('provider', provider);
  return retryOnceWhenBusy(() => api.assistantRequest<{ transcript: string }>('/ai/transcribe', { method: 'POST', body: form, signal }, () => assertSession(session)), signal);
}
export async function speak(session: Session, text: string, signal: AbortSignal, provider: 'kokoro' | 'sarvam', pace = 1, credentialSource: SarvamKeySource = 'application') {
  return api.assistantRequest<Blob>('/ai/speak', { method: 'POST', body: JSON.stringify({ text, provider, pace, credential_source: credentialSource }), signal }, () => assertSession(session), 'blob');
}

/** Only this authenticated route receives key text; never persist it on the phone. */
export async function saveSarvamKey(session: Session, key: string, signal: AbortSignal) {
  return api.assistantRequest<SarvamKeyStatus>('/ai/sarvam-key', { method: 'PUT', body: JSON.stringify({ api_key: key, storage_consent: true }), signal }, () => assertSession(session));
}
export async function removeSarvamKey(session: Session, signal: AbortSignal) {
  return api.assistantRequest<SarvamKeyStatus>('/ai/sarvam-key', { method: 'DELETE', signal }, () => assertSession(session));
}

/** Credentials only travel to these authenticated enrollment routes; never to preferences. */
export async function saveOpenAIKey(session: Session, key: string, signal: AbortSignal) {
  return api.assistantRequest<OpenAIKeyStatus>('/ai/openai-key', { method: 'PUT', body: JSON.stringify({ api_key: key, storage_consent: true }), signal }, () => assertSession(session));
}
export async function removeOpenAIKey(session: Session, signal: AbortSignal) {
  return api.assistantRequest<OpenAIKeyStatus>('/ai/openai-key', { method: 'DELETE', signal }, () => assertSession(session));
}
/** Explicit model-access check. No question, recording or inventory is sent. */
export async function checkOpenAIKey(session: Session, signal: AbortSignal) {
  return api.assistantRequest<{ available: boolean; model: string }>('/ai/openai-key/check', { method: 'POST', signal }, () => assertSession(session));
}

/** Older servers are detected before sending the versioned request. */
export async function interpretExpanded(session: Session, question: string, hasPrevious: boolean, signal: AbortSignal) {
  return validateSpecification(await retryOnceWhenBusy(() => api.assistantRequest('/ai/interpret', { method: 'POST', signal,
    body: JSON.stringify({ question, has_previous_item: hasPrevious, contract_version: 2 }) }, () => assertSession(session)), signal));
}

/** Version 3 (bounded selection plan). Sent only after capabilities list contract 3; older servers keep version 2. */
export async function interpretPlan(session: Session, question: string, hasPrevious: boolean, signal: AbortSignal, provider: 'groq' | 'openai' = 'groq') {
  return validatePlan(await retryOnceWhenBusy(() => api.assistantRequest('/ai/interpret', { method: 'POST', signal,
    body: JSON.stringify({ question, has_previous_item: hasPrevious, contract_version: 3, ...(provider === 'openai' ? { provider } : {}) }) }, () => assertSession(session)), signal));
}
