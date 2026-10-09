import { api } from './api';
import { assertSession, type Session } from './assistantSession';
import { validateSpecification } from '@/features/assistant/contracts';
import { validateIntent } from '@/features/assistant/core';

export const CONSENT_VERSION = 'voice-2026-10-06';
export type ConsentScope = 'groq_text' | 'groq_audio' | 'sarvam_audio' | 'kokoro_speech' | 'sarvam_speech';
export type Capabilities = { interpret: boolean; interpret_contracts?: number[]; order_review_guard?: boolean; transcribe: boolean; speak: boolean; consented: boolean; consent_version: string; voice: string; scopes: ConsentScope[]; transcription_providers: string[]; speech_providers: string[] };
export const unavailable: Capabilities = { interpret: false, transcribe: false, speak: false, consented: false, consent_version: CONSENT_VERSION, voice: '', scopes: [], transcription_providers: [], speech_providers: [] };

export async function capabilities(session: Session, signal?: AbortSignal): Promise<Capabilities> {
  const value = await api.assistantRequest<Capabilities>('/ai/capabilities', { method: 'GET', signal }, () => assertSession(session));
  if (value.consent_version !== CONSENT_VERSION) return unavailable;
  return { ...unavailable, ...value, scopes: value.scopes || [], transcription_providers: value.transcription_providers || [], speech_providers: value.speech_providers || [] };
}
export async function setConsent(session: Session, scopes: ConsentScope[]) {
  return api.assistantRequest('/ai/consent', { method: 'PUT', body: JSON.stringify({ version: CONSENT_VERSION, accepted: scopes.length > 0, scopes }) }, () => assertSession(session));
}
export async function interpret(session: Session, question: string, hasPrevious: boolean, signal: AbortSignal) {
  return validateIntent(await api.assistantRequest('/ai/interpret', { method: 'POST', signal,
    body: JSON.stringify({ question, has_previous_item: hasPrevious }) }, () => assertSession(session)));
}
export async function transcribe(session: Session, uri: string, signal: AbortSignal, provider: 'groq' | 'sarvam' = 'groq') {
  const form = new FormData();
  const wav = uri.toLowerCase().endsWith('.wav');
  form.append('file', { uri, name: wav ? 'question.wav' : 'question.m4a', type: wav ? 'audio/wav' : 'audio/mp4' } as unknown as Blob);
  form.append('provider', provider);
  return api.assistantRequest<{ transcript: string }>('/ai/transcribe', { method: 'POST', body: form, signal }, () => assertSession(session));
}
export async function speak(session: Session, text: string, signal: AbortSignal, provider: 'kokoro' | 'sarvam') {
  return api.assistantRequest<Blob>('/ai/speak', { method: 'POST', body: JSON.stringify({ text, provider }), signal }, () => assertSession(session), 'blob');
}

/** Older servers are detected before sending the versioned request. */
export async function interpretExpanded(session: Session, question: string, hasPrevious: boolean, signal: AbortSignal) {
  return validateSpecification(await api.assistantRequest('/ai/interpret', { method: 'POST', signal,
    body: JSON.stringify({ question, has_previous_item: hasPrevious, contract_version: 2 }) }, () => assertSession(session)));
}
