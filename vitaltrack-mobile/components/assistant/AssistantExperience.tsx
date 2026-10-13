import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, AppState, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as Sharing from 'expo-sharing';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/ThemeContext';
import { captureSession, assertSession, type Session } from '@/services/assistantSession';
import * as assistant from '@/services/assistant';
import { answerIntent, command, commandExamples, speechText, type Answer, type Intent } from '@/features/assistant/core';
import { defaults, loadPreferences, permittedSpeechProvider, savePreferences, type OfflineFallbackVoice, type Preferences } from '@/features/assistant/preferences';
import { playSarvamSpeech } from '@/features/assistant/cloudSpeech';
import { fallbackVoiceLabel, narrateWithFallback } from '@/features/assistant/narration';
import { sarvamSourceAvailable } from '@/features/assistant/sarvam';
import { cachedCategoryNames, cachedItemNames, inventorySnapshot, categorySnapshot } from '@/features/assistant/snapshot';
import { discardAudio, rememberAudio } from '@/features/assistant/audioFiles';
import { MicrophoneCapture, type CapturePhase } from '@/features/assistant/capture';
import { createLiveRecorder, liveCaptureSupported, offlineVoice, offlineSupported, pocketVoice, pocketVoiceSupported, pocketOutputCheckSupported, type PocketPlacementName, type PocketVoiceStatus } from '@/features/assistant/offlineVoice';
import { ALBA_SELECTION_ENABLED, CLOUD_TEXT_ENABLED, CLOUD_TRANSCRIPTION_ENABLED, CLOUD_VOICE_ENABLED, SARVAM_SPEECH_ENABLED, VOICE_DIAGNOSTICS_ENABLED } from '@/features/assistant/policy';
import { minimumInterpretContract } from '@/features/assistant/providers';
import { ANSWER_VISIBLE_MS, canDismissAnswer, microphoneReadiness } from '@/features/assistant/readiness';
import AnswerList from '@/components/assistant/AnswerList';
import AssistantDock from '@/components/assistant/AssistantDock';
import { AssistantLayer } from '@/components/assistant/AssistantLayer';
import { routeLocally, inventoryAnswer, Clarification } from '@/features/assistant/queries';
import { condition, plan, queryDefaults, selection, toPlan, upgradeQuery, type ClarifyReason, type Plan, type Selection, type Specification } from '@/features/assistant/contracts';
import { getDraft, prepareDraftResult, writeDraft, mergeDrafts, type CartItem } from '@/features/assistant/drafts';
import { describeSelection, evaluateSelection, selectionAnswer } from '@/features/assistant/selection';
import { isCriticalEquipment, isLowStock, isOutOfStock, type Category, type Item } from '@/types';
import { exportInventoryPdf } from '@/utils/inventoryPdfExport';
import VoiceSetup, { VoiceButton } from '@/components/assistant/VoiceSetup';
import SarvamKeySettings from '@/components/assistant/SarvamKeySettings';

const recordingOptions = { ...RecordingPresets.HIGH_QUALITY, sampleRate: 44100, numberOfChannels: 1, bitRate: 128000, isMeteringEnabled: true,
  android: { ...RecordingPresets.HIGH_QUALITY.android, audioSource: 'voice_recognition' as const } };
/** Permission results can arrive before Android resumes our activity. Never record behind the dialog. */
function waitForMicrophoneForeground(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('Microphone request cancelled.'));
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout); subscription.remove(); signal.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve();
    };
    const onAbort = () => finish(new Error('Microphone request cancelled.'));
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') finish(); });
    const timeout = setTimeout(() => finish(new Error('Microphone permission finished, but CareKosh is not in the foreground. Return to the app and tap the microphone again.')), 3000);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    else if (AppState.currentState === 'active') finish();
  });
}
function scopeEnabled(scope: assistant.ConsentScope) {
  if (scope === 'groq_text') return CLOUD_TEXT_ENABLED;
  if (scope === 'groq_audio') return CLOUD_TRANSCRIPTION_ENABLED;
  if (scope === 'sarvam_speech') return SARVAM_SPEECH_ENABLED;
  return false;
}
function speechFailure(error: unknown): string {
  // Native rejections can be Error-like objects rather than this realm's Error class.
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' && error.message.trim()) return error.message.slice(0, 1000);
  return 'Speech unavailable.';
}

/** One step of the current list: a selection plus the item choices made for it. Follow-ups narrow the last rows. */
type ChainLink = { selection: Selection; selected: Record<string, string> };
const MAX_FOLLOW_UPS = 6;
/** Rows of the current list, re-evaluated on this snapshot so a refresh never reuses stale stock. */
function chainRows(chain: ChainLink[], items: Item[], categories: Category[], categoriesKnown: boolean): Item[] | undefined {
  let rows: Item[] | undefined;
  for (const link of chain) rows = evaluateSelection(link.selection, items, { categories, categoriesKnown, previous: rows, selected: link.selected }).rows;
  return rows;
}
const describeChain = (chain: ChainLink[]) => chain.map(link => describeSelection(link.selection)).join(' → ');
const conditionsOf = (list: (Selection | null | undefined)[]) => list.flatMap(sel => sel ? [...sel.any_of, ...sel.exclude] : []);
const CLARIFY_TEXT: Record<ClarifyReason, string> = {
  ambiguous: 'This request could mean more than one thing. Name the exact items, filters or quantities you mean.',
  unsupported_condition: 'Part of this request, such as dates, usage or forecasts, cannot be checked against current stock. Nothing was dropped; ask again without it.',
  conflict: 'This request contains conflicting instructions, such as two quantities for one item. Say one final instruction.',
  missing_context: 'Ask for a list or prepare a draft first, then refer to it.',
};
const draftSummary = (rows: CartItem[]) => {
  const explicit = rows.filter(r => r.source === 'spoken').length, suggested = rows.filter(r => r.source === 'suggested').length;
  return `${rows.length} ${rows.length === 1 ? 'line' : 'lines'} ready${explicit || suggested ? ` · ${explicit} from your request, ${suggested} suggested` : ''}. Nothing has been saved. Review it and tap Confirm order & export PDF.`;
};

/** Queries and local drafts only. No order-save or inventory-mutation service is imported. */
export default function AssistantExperience({ embedded = false, active = true, screenKey = '' }: {
  embedded?: boolean; active?: boolean; screenKey?: string;
}) {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const settingsOpen = !embedded && params.mode === 'settings';
  const { colors } = useTheme();
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const userId = useAuthStore(s => s.isAuthenticated ? s.user?.id : undefined);
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [caps, setCaps] = useState(assistant.unavailable);
  const [loaded, setLoaded] = useState(false);
  const [question, setQuestion] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [liveWords, setLiveWords] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const liveRecorder = useRef<ReturnType<typeof createLiveRecorder> | null>(null);
  if (liveCaptureSupported && !liveRecorder.current) liveRecorder.current = createLiveRecorder();
  const [proposalChoice, setProposalChoice] = useState<((merge: boolean) => void) | null>(null);
  const [draftRows, setDraftRows] = useState<CartItem[] | undefined>(undefined);
  const resultChain = useRef<ChainLink[]>([]);
  /** Items a follow-up such as "add five more" may refer to: the draft or single item just shown. */
  const focusItems = useRef<Item[]>([]);
  const selections = useRef<Record<string,string>>({});
  const choiceQuery = useRef('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [capturePhase, setCapturePhase] = useState<CapturePhase>('idle');
  const [model, setModel] = useState({ ready: false, bytes: 0 });
  const [modelChecked, setModelChecked] = useState(!offlineSupported);
  const [deviceVoice, setDeviceVoice] = useState({ ready: false, name: 'Checking device voice…' });
  const [alba, setAlba] = useState<PocketVoiceStatus>({ ready: false, supported: pocketVoiceSupported, bytes: 0, name: 'Alba · Pocket TTS · English' });
  const [albaChecked, setAlbaChecked] = useState(!pocketVoiceSupported);
  const [albaProgress, setAlbaProgress] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [keptOpen, setKeptOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [screenReader, setScreenReader] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechStatus, setSpeechStatus] = useState('');
  const [speechFeedback, setSpeechFeedback] = useState<{ message: string; details: string; failed: boolean } | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState('');
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const permissionPending = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const mounted = useRef(true);
  const previousItem = useRef<string | undefined>(undefined);
  const pendingIntent = useRef<Intent | Specification | Plan | undefined>(undefined);
  const answeredQuestion = useRef('');
  const understandingSource = useRef('Matched locally');
  const turn = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingEvent = useRef<(error: string | null) => void>(() => {});
  const recorder = useAudioRecorder(recordingOptions, status => {
    if (status.hasError || status.isFinished) recordingEvent.current(status.hasError ? status.error || 'Android interrupted the microphone. Please try again.' : null);
  });
  const captureRef = useRef<MicrophoneCapture | null>(null);
  if (!captureRef.current) captureRef.current = new MicrophoneCapture(liveRecorder.current || recorder, rememberAudio, discardAudio,
    phase => { if (mounted.current) setCapturePhase(phase); },
    () => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }));
  const capture = captureRef.current;
  useEffect(() => {
    const sub = liveRecorder.current?.subscribe(event => {
      if (!active || capture.phase !== 'recording') return;
      if (event.transcript !== undefined) setLiveWords(event.transcript);
      if (event.previewError) setError('Live words are unavailable for this take. Review the final transcript after stopping.');
      if (event.finished) recordingEvent.current(event.error || null);
    });
    return () => sub?.remove();
  }, [active, capture]);

  const discard = async (uri: string | null) => {
    await discardAudio(uri).catch(() => {});
  };
  const cancel = () => {
    turn.current++;
    controller.current?.abort();
    offlineVoice.cancel();
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    recordingTimer.current = null;
    capture.cancel();
    setBusy(''); setSpeaking(false); setSpeechStatus(''); setLiveWords(''); setFallbackNotice('');
  };
  const close = () => { cancel(); previousItem.current = undefined; resultChain.current = []; focusItems.current = []; selections.current = {}; setDraftRows(undefined); setProposalChoice(null); setAnswer(null); setQuestion(''); setError(''); setReviewOpen(false); if (!embedded) { if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); } };
  const openSetup = () => { cancel(); setAnswer(null); if (embedded) router.navigate({ pathname: '/assistant', params: { mode: 'settings' } }); else router.setParams({ mode: 'settings', listen: undefined }); };
  const openAssistant = () => { cancel(); setAnswer(null); router.setParams({ mode: undefined, listen: undefined }); };
  const closeRef = useRef(close); closeRef.current = close;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (active) setScreenReader(value); });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!active || settingsOpen || !canDismissAnswer({ hasAnswer: !!answer, hasChoices: !!answer?.choices.length, keptOpen, busy: !!busy || speaking, recording: capturePhase !== 'idle', screenReader })) return;
    const expires = Date.now() + ANSWER_VISIBLE_MS;
    setSecondsLeft(10);
    const timer = setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((expires - Date.now()) / 1000))), 250);
    const dismiss = setTimeout(() => closeRef.current(), ANSWER_VISIBLE_MS);
    return () => { clearInterval(timer); clearTimeout(dismiss); };
  }, [answer, keptOpen, busy, speaking, capturePhase, screenReader, settingsOpen, active]);

  useEffect(() => {
    mounted.current = true;
    if (!active) { cancel(); setAnswer(null); setQuestion(''); setReviewOpen(false); return; }
    let currentScreen = true;
    const session = userId ? captureSession() : null;
    setPrefs(defaults); setCaps(assistant.unavailable); setAnswer(null); setQuestion('');
    previousItem.current = undefined; pendingIntent.current = undefined; resultChain.current = []; focusItems.current = []; selections.current = {}; setDraftRows(undefined); answeredQuestion.current = ''; setLoaded(false); setModelChecked(!offlineSupported); setError(''); setReviewOpen(false);
    if (session) {
      // Local setup is never held hostage by a slow/unavailable cloud server.
      void loadPreferences(session.owner)
        .then(preferences => { if (currentScreen) { assertSession(session); setPrefs({ ...preferences, speechProvider: permittedSpeechProvider(preferences.speechProvider, preferences.sarvamSpeechOptIn) }); setLoaded(true); } })
        .catch(() => { if (currentScreen) setError('Session changed. Reopen the assistant.'); });
      // This reads availability only; no question is sent until opt-in and Send.
      if (CLOUD_TEXT_ENABLED || CLOUD_TRANSCRIPTION_ENABLED || SARVAM_SPEECH_ENABLED || CLOUD_VOICE_ENABLED) void assistant.capabilities(session).then(available => { if (currentScreen) { assertSession(session); setCaps(available); } }).catch(() => {});
      if (offlineSupported) {
        void offlineVoice.status().then(status => { if (currentScreen) setModel(status); }).catch(() => { if (currentScreen) setError('Offline speech pack could not be checked. Open Voice setup and recheck.'); }).finally(() => { if (currentScreen) setModelChecked(true); });
        void offlineVoice.deviceStatus().then(voice => { if (currentScreen) setDeviceVoice(voice); }).catch(() => { if (currentScreen) setDeviceVoice({ ready: false, name: 'Install an offline English voice in Android Text-to-speech settings.' }); });
      }
    }
    if (session && pocketVoiceSupported) {
      setAlbaChecked(false);
      void pocketVoice.status().then(value => { if (currentScreen) setAlba(value); }).catch(() => { if (currentScreen) setAlba(value => ({ ...value, ready: false })); }).finally(() => { if (currentScreen) setAlbaChecked(true); });
    }
    const pocketProgress = pocketVoice.progress(event => { if (currentScreen && event.total > 0) setAlbaProgress(Math.round(100 * event.downloaded / event.total)); });
    const progress = offlineVoice.progress(event => { if (currentScreen && event.total > 0) setDownloadProgress(Math.round(100 * event.downloaded / event.total)); });
    const auth = useAuthStore.subscribe((state, previous) => {
      if (state.user?.id !== previous.user?.id || state.isAuthenticated !== previous.isAuthenticated) { cancel(); setAnswer(null); previousItem.current = undefined; }
    });
    const lifecycle = AppState.addEventListener('change', state => {
      // The permission activity can background the app before recording starts.
      // microphonePermission waits for foreground before allowing preparation.
      // Navigation, logout and explicit cancellation still invalidate the request.
      if (permissionPending.current && (capture.phase === 'idle' || capture.phase === 'preparing')) return;
      if (state === 'background' || state === 'inactive') {
        const interrupted = capture.phase !== 'idle' || permissionPending.current;
        const wasRecording = capture.phase === 'recording';
        cancel();
        if (interrupted) setError(wasRecording
          ? 'Recording stopped when the app lost focus. Return here and tap the microphone again.'
          : 'Microphone startup was interrupted because the app lost focus. Return here and tap the microphone again.');
      }
    });
    return () => { currentScreen = false; mounted.current = false; auth(); lifecycle.remove(); progress?.remove(); pocketProgress?.remove(); cancel(); };
    // Lifecycle closures use stable native objects and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, active, screenKey]);

  async function update(next: Preferences) {
    if (!userId || !active || !mounted.current) return;
    const session = captureSession();
    // A callback from a previous render must never change the next account's preferences.
    if (session.owner !== userId) return;
    next = { ...next, speechProvider: permittedSpeechProvider(next.speechProvider, next.sarvamSpeechOptIn) };
    cancel(); setError('');
    setPrefs(next); // Disabling must take effect even if storage/network is unavailable.
    try { await savePreferences(session.owner, next); assertSession(session); }
    catch { if (mounted.current) setError('Settings changed for this screen, but could not be saved for next time.'); }
  }
  async function microphonePermission(signal: AbortSignal) {
    // A granted permission must not open another Android permission activity.
    let permission = await AudioModule.getRecordingPermissionsAsync();
    if (signal.aborted) throw new Error('Microphone request cancelled.');
    try {
      if (!permission.granted && permission.canAskAgain) {
        permissionPending.current = true;
        permission = await AudioModule.requestRecordingPermissionsAsync();
      }
      if (signal.aborted) throw new Error('Microphone request cancelled.');
      if (mounted.current) setPermissionBlocked(!permission.granted && !permission.canAskAgain);
      if (!permission.granted) throw new Error(permission.canAskAgain
        ? 'Microphone permission was not granted. Tap again and choose Allow, or type your question.'
        : 'Microphone permission is blocked. Open Android settings below and allow Microphone access.');
      if (permissionPending.current) await waitForMicrophoneForeground(signal);
    } finally { permissionPending.current = false; }
  }
  async function enableMicrophone() {
    if (busy || !loaded || permissionPending.current || capture.phase !== 'idle') return;
    cancel(); setError(''); setBusy('Requesting microphone access…');
    const abort = new AbortController(); controller.current = abort;
    const current = turn.current;
    try {
      const session = captureSession();
      await microphonePermission(abort.signal);
      if (current !== turn.current) return;
      assertSession(session);
      await update({ ...prefs, enabled: true, microphone: true });
    } catch (e) { if (current === turn.current) setError(e instanceof Error ? e.message : 'Microphone permission unavailable.'); }
    finally { if (mounted.current && controller.current === abort) setBusy(''); }
  }
  async function cloudConsent(scope: assistant.ConsentScope, next: Preferences, session: Session) {
    if (!scopeEnabled(scope)) return;
    try { assertSession(session); } catch { return; }
    cancel(); setBusy('Saving consent…');
    const current = turn.current;
    const abort = new AbortController(); controller.current = abort;
    const assertCurrent = () => {
      assertSession(session);
      if (!active || !mounted.current || current !== turn.current || abort.signal.aborted) throw new Error('Consent cancelled.');
    };
    try {
      // Re-read current scopes: an old capability snapshot must not re-grant a withdrawn scope.
      const before = await assistant.capabilities(session, abort.signal);
      assertCurrent();
      // Adding text consent must not silently revoke an explicitly chosen listening scope.
      await assistant.setConsent(session, [...new Set([...before.scopes, scope])]);
      assertCurrent();
      const available = await assistant.capabilities(session, abort.signal);
      assertCurrent();
      setCaps(available); await update(next);
    } catch { if (current === turn.current) setError('Consent could not be saved. Please retry.'); }
    finally { if (current === turn.current) setBusy(''); }
  }
  function chooseCloud(scope: assistant.ConsentScope, next: Preferences) {
    if (!scopeEnabled(scope)) return;
    const session = captureSession(), current = turn.current;
    const canConfirm = () => {
      if (!mounted.current || !active || current !== turn.current || AppState.currentState !== 'active') return false;
      try { assertSession(session); return session.owner === userId; } catch { return false; }
    };
    if (!canConfirm()) return;
    if (caps.scopes.includes(scope)) { void update(next); return; }
    const disclosure = {
      groq_text: 'After you tap Send, unfamiliar typed questions or reviewed transcripts go through CareKosh to Groq for understanding. This text option uploads no recording or inventory list. Words and item names you include in your question are sent. CareKosh saves your consent and usage counts; this cannot change your stock.',
      groq_audio: 'Recordings go through CareKosh to Groq (US) for Whisper transcription. This is an online, potentially paid service.',
      sarvam_audio: 'Recordings go through CareKosh to Sarvam for Saaras transcription. This is an online, potentially paid service, not an offline model.',
      kokoro_speech: 'The answer text, including quantities and recorded suppliers, goes to our hosted Kokoro speech service. Hosting has a cost; no audio is uploaded for this speaking option.',
      sarvam_speech: 'The short answer text, which may include item names, quantities and recorded suppliers, goes through CareKosh to Sarvam to create English speech. Internet and API credits are required. This choice does not enable microphone uploads or change your stock.',
    }[scope];
    const retention = scope.startsWith('groq_') ? ' Groq may retain request content for reliability or abuse monitoring unless the service account has Zero Data Retention enabled.' : ' Answer text is processed by the selected speech service under its data policy.';
    Alert.alert('Optional cloud processing — adult pilot', disclosure + ' Avoid patient identifiers.' + retention + ' Continue only if you are 18+ and agree. Use “Withdraw all cloud consent” below to turn it off.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'I am 18+ and agree', onPress: () => { if (canConfirm()) void cloudConsent(scope, next, session); } }]);
  }
  async function revokeCloud() {
    if (!CLOUD_TEXT_ENABLED && !CLOUD_TRANSCRIPTION_ENABLED && !SARVAM_SPEECH_ENABLED && !CLOUD_VOICE_ENABLED) return;
    if (!mounted.current || !active) return;
    let session: Session;
    try { session = captureSession(); } catch { return; }
    if (session.owner !== userId) return;
    cancel();
    setCaps(value => ({ ...value, scopes: [], consented: false }));
    // update() cancels synchronously, then awaits account-scoped preference storage. Bind
    // that new turn before the await: a slow save must not withdraw the next user's consent.
    const saving = update({ ...prefs, cloud: false, audioOptIn: false, sarvamSpeechOptIn: false, inputProvider: 'offline', speechProvider: ALBA_SELECTION_ENABLED && prefs.speechProvider === 'pocket' ? 'pocket' : 'device' });
    const current = turn.current;
    await saving;
    if (!mounted.current || !active || current !== turn.current) return;
    try { assertSession(session); } catch { return; }
    try { await assistant.setConsent(session, []); }
    catch { if (current === turn.current) setError('Cloud is off on this device. Server withdrawal failed; reconnect and press Withdraw again.'); }
  }
  async function setupOffline(remove = false) {
    cancel(); setError(''); setBusy(remove ? 'Removing speech pack…' : 'Downloading and verifying speech pack…'); setDownloadProgress(0);
    const current = turn.current;
    try {
      if (remove) await offlineVoice.remove(); else await offlineVoice.download();
      const status = await offlineVoice.status();
      if (current === turn.current) setModel(status);
    } catch (e) { if (current === turn.current) setError(e instanceof Error ? e.message : 'Speech pack setup failed. Please retry.'); }
    finally { if (current === turn.current) setBusy(''); }
  }
  async function setupAlba(remove: boolean) {
    if (!loaded || !pocketVoiceSupported) return;
    if (!remove && !ALBA_SELECTION_ENABLED) return;
    const session = captureSession();
    cancel(); setError(''); setBusy(remove ? 'Removing Alba voice pack…' : 'Downloading and verifying Alba voice pack…'); setAlbaProgress(0);
    const current = turn.current;
    try {
      if (remove) await pocketVoice.remove(); else await pocketVoice.download();
      const status = await pocketVoice.status();
      if (current !== turn.current || !mounted.current) return;
      assertSession(session); setAlba(status); setAlbaChecked(true);
      // Download selects the voice; reading aloud stays a separate user choice.
      if (!remove) await update({ ...prefs, speechProvider: 'pocket' });
      else if (prefs.speechProvider === 'pocket') await update({ ...prefs, speechProvider: 'device' });
    } catch (e) { if (current === turn.current) setError(e instanceof Error ? e.message : 'Alba setup failed. Please retry.'); }
    finally { if (current === turn.current) setBusy(''); }
  }
  async function playAnswer(value: Answer, current: number, signal: AbortSignal, preview = false, personalTest = false) {
    if ((!prefs.spokenReplies && !preview) || speaking || capture.phase !== 'idle' || current !== turn.current || signal.aborted) return;
    setSpeaking(true);
    setSpeechFeedback(null);
    setSpeechStatus(prefs.speechProvider === 'pocket' ? 'Preparing Alba speech…' : 'Reading aloud…');
    try {
      const session = captureSession();
      const provider = personalTest ? 'sarvam' : prefs.speechProvider;
      const keySource = personalTest ? 'personal' : prefs.sarvamKeySource ?? 'application';
      if (provider === 'pocket' && ALBA_SELECTION_ENABLED) {
        assertSession(session);
        if (!alba.ready) throw new Error('Download Alba in Voice setup first.');
        const result = await pocketVoice.speak(speechText(value), prefs.speechPace ?? 1, message => {
          if (mounted.current && current === turn.current && !signal.aborted) setSpeechStatus(message);
        }, signal);
        const details = await pocketVoice.diagnostics().catch(() => '') || '';
        if (mounted.current && current === turn.current && !signal.aborted) {
          setSpeechFeedback({ message: result ? `Android completed Alba playback · ${result.output} · media volume ${result.volumePercent}%. If you heard nothing, try Check audio output below.` : 'Voice playback completed. If you heard nothing, try Check audio output below.', details, failed: false });
        }
        return;
      }
      if (!personalTest && permittedSpeechProvider(provider, prefs.sarvamSpeechOptIn) === 'device') {
        assertSession(session);
        await offlineVoice.speak(speechText(value));
        return;
      }
      if (provider !== 'sarvam' || !SARVAM_SPEECH_ENABLED) throw new Error('This speaking voice is unavailable. Select device voice in Voice setup.');
      const text = speechText(value);
      const status = (message: string) => { if (mounted.current && current === turn.current && !signal.aborted) setSpeechStatus(message); };
      const outcome = await narrateWithFallback({
        speakOnline: async onPlaybackStarted => {
          status('Checking Sarvam English voice…');
          const available = await assistant.capabilities(session, signal);
          if (current !== turn.current || signal.aborted) throw new Error('Speech cancelled.');
          assertSession(session); setCaps(available);
          if (!available.scopes.includes('sarvam_speech')) throw new Error('Enable Sarvam English voice in Voice setup to confirm answer-text consent.');
          if (!sarvamSourceAvailable(available, keySource)) throw new Error(keySource === 'personal' ? 'Your personal Sarvam key is unavailable. Recheck, replace your key or choose another voice. Shared credits were not used.' : 'The application Sarvam account is unavailable. Choose your personal key or device voice.');
          await playSarvamSpeech(session, text, prefs.speechPace ?? 1, signal, status, keySource, onPlaybackStarted);
        },
        // Same validated answer text, read once, on the phone; nothing further is sent online.
        speakOffline: async voice => {
          assertSession(session);
          if (voice === 'pocket') await pocketVoice.speak(text, prefs.speechPace ?? 1, status, signal);
          else await offlineVoice.speak(text);
        },
        // A personal-key test checks that key; it never falls back. Loaded preferences are already sanitised.
        fallback: personalTest ? null : prefs.speechFallback ?? null,
        fallbackReady: voice => voice === 'device' ? deviceVoice.ready : ALBA_SELECTION_ENABLED && alba.ready,
        stillCurrent: () => {
          if (!mounted.current || current !== turn.current || signal.aborted) return false;
          try { assertSession(session); return true; } catch { return false; }
        },
        onFallback: voice => status(`Sarvam unavailable · reading with ${fallbackVoiceLabel(voice)}…`),
      });
      if (mounted.current && current === turn.current && !signal.aborted && outcome.voice !== 'online') setFallbackNotice(`Read aloud with ${fallbackVoiceLabel(outcome.voice)} because Sarvam was unavailable.`);
      if (mounted.current && current === turn.current && !signal.aborted) setSpeechFeedback(outcome.voice === 'online'
        ? { message: 'Sarvam voice playback completed.', details: '', failed: false }
        : { message: `Sarvam was unavailable, so this answer was read with ${fallbackVoiceLabel(outcome.voice)}. No second online request was sent.`, details: `Sarvam reason: ${outcome.onlineError ?? 'unknown'}`, failed: false });
    } catch (e) {
      const message = speechFailure(e);
      const details = prefs.speechProvider === 'pocket' ? await pocketVoice.diagnostics().catch(() => '') || '' : '';
      if (mounted.current && current === turn.current && !signal.aborted) {
        setError(`${message} Your answer is still on screen.`);
        setSpeechFeedback({ message, details, failed: true });
      }
    }
    finally { if (current === turn.current) { setSpeaking(false); setSpeechStatus(''); } }
  }
  async function changePersonalKey(key?: string) {
    if (!loaded || busy || speaking || capture.phase !== 'idle') return;
    const session = captureSession();
    cancel(); setError(''); setBusy(key ? 'Saving personal key securely…' : 'Removing personal key…');
    const abort = new AbortController(); controller.current = abort;
    const current = turn.current;
    try {
      if (key) await assistant.saveSarvamKey(session, key, abort.signal);
      else await assistant.removeSarvamKey(session, abort.signal);
      const available = await assistant.capabilities(session, abort.signal);
      if (current !== turn.current || abort.signal.aborted || !mounted.current) return;
      assertSession(session); setCaps(available);
      // Explicitly saving a personal key selects its billing source, not narration.
      // Removing a selected personal key returns to device speech, never shared billing.
      await update({ ...prefs, sarvamKeySource: key ? 'personal' : prefs.sarvamKeySource,
        speechProvider: !key && prefs.sarvamKeySource === 'personal' ? 'device' : prefs.speechProvider });
    } catch {
      if (current === turn.current && mounted.current) setError('Personal key changes could not be confirmed. Recheck before retrying; the server may have saved the change.');
    } finally {
      if (current === turn.current && mounted.current) setBusy('');
    }
  }
  async function checkAudioOutput() {
    cancel(); setError(''); setSpeechFeedback(null);
    const abort = new AbortController(); controller.current = abort;
    const current = turn.current;
    setSpeaking(true); setSpeechStatus('Playing a short test tone…');
    try {
      const session = captureSession(); assertSession(session);
      const result = await pocketVoice.checkOutput(abort.signal);
      const details = await pocketVoice.diagnostics().catch(() => '');
      assertSession(session);
      if (mounted.current && current === turn.current && !abort.signal.aborted) setSpeechFeedback({
        message: `Android completed the sound check · ${result.output} · media volume ${result.volumePercent}%. A short tone should have played.`, details, failed: false,
      });
    } catch (e) {
      const details = await pocketVoice.diagnostics().catch(() => '');
      if (mounted.current && current === turn.current && !abort.signal.aborted) setSpeechFeedback({ message: speechFailure(e), details, failed: true });
    } finally { if (mounted.current && current === turn.current) { setSpeaking(false); setSpeechStatus(''); } }
  }
  /** The fallback is saved only after this exact voice was heard in a successful preview. */
  async function chooseFallback(voice: OfflineFallbackVoice | null) {
    if (!voice) { await update({ ...prefs, speechFallback: undefined }); setSpeechFeedback({ message: 'Offline fallback is off. A failed online reply keeps the answer on screen without speaking it.', details: '', failed: false }); return; }
    cancel(); setError(''); setSpeechFeedback(null);
    const abort = new AbortController(); controller.current = abort;
    const current = turn.current;
    setSpeaking(true); setSpeechStatus(`Previewing ${fallbackVoiceLabel(voice)} as the fallback…`);
    try {
      const session = captureSession(); assertSession(session);
      const preview = 'Hello. I am your CareKosh stock assistant.';
      if (voice === 'pocket') {
        if (!ALBA_SELECTION_ENABLED || !alba.ready) throw new Error('Download Alba before choosing it as the fallback.');
        await pocketVoice.speak(preview, prefs.speechPace ?? 1, undefined, abort.signal);
      } else {
        if (!deviceVoice.ready) throw new Error('No offline English device voice is installed.');
        await offlineVoice.speak(preview);
      }
      if (current !== turn.current || abort.signal.aborted || !mounted.current) return;
      assertSession(session);
      await update({ ...prefs, speechFallback: voice });
      setSpeechFeedback({ message: `Fallback set to ${fallbackVoiceLabel(voice)}. It reads an answer only when Sarvam is unavailable and never sends anything online.`, details: '', failed: false });
    } catch (e) {
      if (mounted.current && current === turn.current && !abort.signal.aborted) setSpeechFeedback({ message: `Fallback unchanged: ${speechFailure(e)}`, details: '', failed: true });
    } finally { if (mounted.current && current === turn.current) { setSpeaking(false); setSpeechStatus(''); } }
  }
  /** Diagnostics builds only. Counts, timings and states are reported; no answer text or inventory. */
  async function runAlbaDiagnostic(play: boolean, placement: PocketPlacementName) {
    if (!VOICE_DIAGNOSTICS_ENABLED) return;
    cancel(); setError(''); setSpeechFeedback(null);
    const abort = new AbortController(); controller.current = abort;
    const current = turn.current;
    const header = `Diagnostic placement: ${placement} (app version and code are in the native header)\n`;
    setSpeaking(true); setSpeechStatus(play ? 'Alba diagnostic: generating and playing…' : 'Alba diagnostic: generating without playing…');
    try {
      const session = captureSession(); assertSession(session);
      const result = await pocketVoice.speakDiagnostic('Hello. I am your CareKosh stock assistant. Low stock: 1 item. Surgical mask: 3 boxes.', play, placement, abort.signal);
      const details = await pocketVoice.diagnostics().catch(() => '');
      if (mounted.current && current === turn.current && !abort.signal.aborted) setSpeechFeedback({ message: play
        ? `Alba diagnostic finished · ${result.output} · media volume ${result.volumePercent}%. Record whether you heard it.`
        : `Synthesis-only diagnostic finished · ${result.audioSeconds.toFixed(1)} s of audio generated; nothing was played.`, details: header + details, failed: false });
    } catch (e) {
      const details = await pocketVoice.diagnostics().catch(() => '');
      if (mounted.current && current === turn.current && !abort.signal.aborted) setSpeechFeedback({ message: speechFailure(e), details: header + details, failed: true });
    } finally { if (mounted.current && current === turn.current) { setSpeaking(false); setSpeechStatus(''); } }
  }
  async function ask(text = question, chosen?: Intent | Specification | Plan, force = false) {
    if (!loaded || !prefs.enabled || !text.trim() || busy || capture.phase !== 'idle') return;
    Keyboard.dismiss();
    // Refreshing a follow-up re-runs it on the same base list instead of narrowing twice.
    const refreshing = force && !!chosen && chosen === pendingIntent.current;
    cancel(); setError(''); setDetailsOpen(false); setAnswer(null); setDraftRows(undefined); setProposalChoice(null); setKeptOpen(false);
    if (!chosen) selections.current = {};
    const current = turn.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy('Understanding…');
    if (!chosen) understandingSource.current = 'Matched locally';
    try {
      const session = captureSession();
      const names = cachedItemNames(session);
      const hasDraft = !!getDraft(session)?.rows.length;
      let intent = chosen || routeLocally(text, names, hasDraft, cachedCategoryNames(session));
      if (!intent) {
        if (!CLOUD_TEXT_ENABLED || !prefs.cloud) throw new Error('That wording needs online understanding. Enable Groq understanding in Voice setup, or use an example while offline.');
        // A cold start or a new staging deployment must not leave availability stale for this screen.
        const available = await assistant.capabilities(session, abort.signal);
        assertSession(session);
        if (current !== turn.current || abort.signal.aborted) return;
        setCaps(available);
        if (!available.interpret) throw new Error('Groq understanding is unavailable on this backend. Recheck the staging deployment and AI settings in Voice setup.');
        if (!available.scopes.includes('groq_text')) throw new Error('Enable Groq understanding in Voice setup to confirm text-processing consent for this account.');
        const contracts = available.interpret_contracts || [];
        const required = minimumInterpretContract(text);
        if (required === 3 && !contracts.includes(3) || required === 2 && !contracts.includes(2) && !contracts.includes(3)) {
          throw new Error(`This request needs interpretation contract ${required}, which this backend does not offer. Deploy the latest feature branch to staging and recheck Voice setup. No filters were dropped and no draft was changed.`);
        }
        if (!contracts.includes(2) && !contracts.includes(3) && /\b(?:draft|order)\b/i.test(text)) throw new Error('This backend does not support voice order drafts yet. Deploy the latest feature branch to staging, then recheck Voice setup.');
        const context = resultChain.current.length > 0 || !!previousItem.current || hasDraft;
        try { intent = contracts.includes(3) ? await assistant.interpretPlan(session, text.trim(), context, abort.signal)
          : contracts.includes(2) ? await assistant.interpretExpanded(session, text.trim(), context, abort.signal)
          : await assistant.interpret(session, text.trim(), !!previousItem.current, abort.signal);
          understandingSource.current = 'Understood with Groq'; }
        catch (e) {
          if (abort.signal.aborted) throw e;
          throw new Error(`Online understanding could not complete this question. ${e instanceof Error ? e.message : 'Please retry later.'} Nothing was saved. You can edit the question or use a basic command.`);
        }
      }
      const assertReady = () => { assertSession(session); if (!active || !mounted.current || current !== turn.current || abort.signal.aborted) throw new Error('Question cancelled.'); };
      assertReady();
      pendingIntent.current = intent; answeredQuestion.current = text;
      if (!('version' in intent)) {
        if (intent.intent === 'close') { close(); return; }
        if (intent.intent === 'stop_speaking') { cancel(); return; }
        if (intent.intent !== 'read_item' || intent.reference === 'named') previousItem.current = undefined;
      }
      // Version 2 answers from older servers are upgraded; every plan runs through one deterministic executor.
      const planned = 'version' in intent ? toPlan(intent) : null;
      const baseChain = refreshing && planned?.selection?.scope === 'previous' ? resultChain.current.slice(0, -1) : resultChain.current;
      if (planned?.intent === 'inventory_export') {
        if (!resultChain.current.length) throw new Error('Show and review an inventory list first, then request its inventory PDF.');
        const snapshot = await inventorySnapshot(session, abort.signal, force);
        let categories = [] as Category[], categoriesKnown = true;
        try { categories = await categorySnapshot(session, abort.signal); }
        catch (e) { if (conditionsOf(resultChain.current.map(l => l.selection)).some(c => c.category !== null)) throw e; assertReady(); categoriesKnown = false; /* Missing category names are labelled in the PDF; rows are never dropped. */ }
        const rows = chainRows(resultChain.current, snapshot.items, categories, categoriesKnown) || [];
        assertReady(); const result: Answer = { ...inventoryAnswer(rows, snapshot.timestamp, snapshot.stale), filters: describeChain(resultChain.current) };
        setAnswer(result); setKeptOpen(true); setBusy('');
        let exporting = false;
        // Voice only requests the report. A touch reviews the exact rows before printing/sharing.
        Alert.alert('Review inventory PDF', `${rows.length} items · ${snapshot.stale ? 'last-known/offline' : 'last synced'} ${new Date(snapshot.timestamp).toLocaleString()}. Review the list on screen before exporting. This does not save an order.`,
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Export reviewed inventory PDF', onPress: () => {
            if (exporting) return;
            try { assertReady(); } catch { return; }
            exporting = true;
            setBusy('Generating inventory report…');
            void exportInventoryPdf({ items: rows, categories, includePhotos: false, timestamp: snapshot.timestamp, stale: snapshot.stale, assertReady })
              .then(value => { assertReady(); setError(value.shared ? 'Inventory PDF generated; share sheet opened.' : 'Inventory PDF generated. Sharing is unavailable on this device.'); })
              .catch(e => { if (current === turn.current) setError(e instanceof Error ? e.message : 'PDF could not be generated.'); })
              .finally(() => { if (current === turn.current) setBusy(''); });
          } }]);
        return;
      }
      if (planned?.intent === 'review_draft') {
        const local = getDraft(session);
        if (!local?.rows.length) throw new Error('There is no unsaved draft in this session.');
        resultChain.current = []; focusItems.current = local.rows.map(r => r.item);
        setDraftRows(local.rows); setAnswer({ ...inventoryAnswer(local.rows.map(r => r.item), Date.now(), true), kind: 'draft', title: local.attempt?.saved ? 'Saved order · PDF pending' : local.attempt ? 'Submission outcome unknown' : 'Unsaved order draft', text: (local.attempt?.saved ? 'This order is already saved. Re-export it from Create Order; no new order will be created.' : local.attempt ? 'The server may already have saved this order. Open Create Order to retry the same submission.' : 'Nothing has been saved. Review the quantities and tap Confirm order & export PDF on the Create Order screen.') + ' Stock shown is the draft snapshot; a new confirmation refreshes it.' });
        setKeptOpen(true); return;
      }
      const needsStock = ['read_item','summary','low_stock','out_of_stock','inventory_query','draft_order'].includes(intent.intent);
      setBusy('Checking inventory…');
      const snapshot = needsStock ? await inventorySnapshot(session, abort.signal, force) : { items: [], timestamp: Date.now(), stale: false };
      assertReady();
      let result: Answer;
      if (planned && (planned.intent === 'inventory_query' || planned.intent === 'draft_order')) {
        const used = conditionsOf([planned.selection, ...(planned.selection?.scope === 'previous' ? baseChain.map(l => l.selection) : [])]);
        let categories = [] as Category[], categoriesKnown = false;
        if (used.some(c => c.category !== null)) { categories = await categorySnapshot(session, abort.signal); categoriesKnown = true; }
        else if (used.some(c => c.critical !== null)) {
          // Only to ask whether "critical" means a category; offline, critical equipment is used and labelled.
          try { categories = await categorySnapshot(session, abort.signal); categoriesKnown = true; } catch { assertReady(); }
        }
        assertReady();
        const previousRows = planned.selection?.scope === 'previous' && baseChain.length ? chainRows(baseChain, snapshot.items, categories, categoriesKnown) : undefined;
        if (planned.intent === 'inventory_query') {
          const sel = planned.selection!;
          const evaluation = evaluateSelection(sel, snapshot.items, { categories, categoriesKnown, previous: previousRows, selected: selections.current });
          const link = { selection: sel, selected: { ...selections.current } };
          const nextChain = sel.scope === 'previous' ? [...baseChain, link] : [link];
          if (nextChain.length > MAX_FOLLOW_UPS) throw new Clarification('That is a long chain of follow-ups. Ask the full question again so every filter is explicit.');
          assertReady();
          result = { ...selectionAnswer(evaluation, sel, snapshot.timestamp, snapshot.stale), filters: describeChain(nextChain) };
          resultChain.current = nextChain; focusItems.current = evaluation.rows;
        } else {
          const draft = planned.draft!;
          const local = getDraft(session);
          if (local?.attempt) throw new Error('A submission is already in progress or may be saved. Open the draft review screen to retry or re-export it.');
          if (draft.mode === 'edit' && !local?.rows.length) throw new Error('Prepare a draft first, then ask to edit its order quantities.');
          const { rows, evaluation } = prepareDraftResult(planned, snapshot.items, draft.mode === 'edit' ? local!.rows : [], selections.current,
            { categories, categoriesKnown, previous: previousRows, focus: draft.mode === 'edit' && !focusItems.current.length ? local!.rows.map(r => r.item) : focusItems.current });
          if (!rows.length && draft.mode === 'new') throw new Clarification('No active items matched this draft request. Low-stock and out-of-stock are separate groups. Ask for both groups, or name the items and quantities you want. Your existing draft is unchanged.');
          assertReady();
          resultChain.current = [];
          const filters = planned.selection ? describeSelection(planned.selection) : undefined;
          const excluded = evaluation?.excluded.map(e => ({ name: e.item.name, reason: e.reason }));
          const draftAnswer = (next: CartItem[], title: string, body: string): Answer => ({ ...inventoryAnswer(next.map(r => r.item), snapshot.timestamp, snapshot.stale),
            title, text: body, filters, excluded, reasons: evaluation?.reasons, kind: 'draft' });
          const publish = (next: CartItem[]) => {
            assertReady();
            if (getDraft(session)?.revision !== local?.revision) throw new Error('The existing draft changed. Ask again before replacing it.');
            writeDraft(session, next, true, 'voice'); setDraftRows(next); focusItems.current = next.map(r => r.item);
            setAnswer(draftAnswer(next, 'Unsaved order draft', draftSummary(next))); setKeptOpen(true);
          };
          if (local?.rows.length && (draft.mode === 'new' || local.origin === 'manual' || local.rows.some(r => r.source === 'manual'))) {
            setDraftRows(rows); setKeptOpen(true);
            setAnswer({ ...draftAnswer(rows, 'Proposed draft — existing work retained', 'Review these proposed quantities. Your existing draft is unchanged until you choose Merge or Replace. Nothing is saved.'), kind: 'proposal' });
            setBusy('');
            const apply = (merge: boolean) => { try { publish(merge ? mergeDrafts(local.rows, rows) : rows); return true; } catch(e) { if (current === turn.current) setError(e instanceof Error ? e.message : 'Draft could not be prepared.'); return false; } };
            setProposalChoice(() => (merge: boolean) => { if (apply(merge)) setProposalChoice(null); });
            return;
          }
          publish(rows); result = draftAnswer(rows, 'Unsaved order draft', draftSummary(rows));
        }
      } else if (planned) {
        result = planned.intent === 'clarify' && planned.clarify_reason
          ? { title: 'Please clarify', text: CLARIFY_TEXT[planned.clarify_reason], items: [], choices: [], timestamp: snapshot.timestamp, stale: false, kind: 'clarify' }
          : answerIntent(command(planned.intent === 'unsupported_action' ? 'unsupported_action' : 'clarify'), [], snapshot.timestamp);
      } else {
        const legacy = 'version' in intent ? command('clarify') : intent;
        result = answerIntent(legacy, snapshot.items, snapshot.timestamp, previousItem.current, snapshot.stale);
        if (intent.intent === 'read_item') resultChain.current = [];
        if (result.resolvedId) { previousItem.current = result.resolvedId; focusItems.current = result.items; }
        if (['summary','low_stock','out_of_stock'].includes(intent.intent)) {
          resultChain.current = [{ selection: upgradeQuery({ ...queryDefaults, status: intent.intent === 'low_stock' ? 'low' : intent.intent === 'out_of_stock' ? 'out' : 'any' }), selected: {} }];
          focusItems.current = result.items;
        }
      }
      assertReady(); setAnswer(result); setBusy(''); if (needsStock) setKeptOpen(true);
      await playAnswer(result, current, abort.signal);
    } catch (e) {
      if (current === turn.current && e instanceof Clarification) {
        choiceQuery.current = e.query;
        setAnswer({ title: 'Please clarify', text: e.message, items: [], choices: e.choices, options: e.options, timestamp: Date.now(), stale: false, kind: 'clarify' }); setKeptOpen(true);
      } else if (current === turn.current) setError(e instanceof Error ? e.message : 'Question failed. Try the regular inventory screen.');
    } finally { if (current === turn.current) setBusy(''); }
  }
  /** One-tap refinements of the list on screen, offered only when they would change it. */
  function refinements(items: Item[]): { label: string; spoken: string; plan: Plan }[] {
    const narrow = (label: string, spoken: string, patch: Parameters<typeof condition>[0], keep: (item: Item) => boolean) =>
      items.some(keep) && !items.every(keep) ? [{ label, spoken, plan: plan('inventory_query', { selection: selection([condition(patch)], { scope: 'previous' }) }) }] : [];
    const sorted = (label: string, spoken: string, sort: Selection['sort']) => items.length > 1 ? [{ label, spoken, plan: plan('inventory_query', { selection: selection([condition()], { scope: 'previous', sort }) }) }] : [];
    return [
      ...narrow('Only critical', 'Only the critical ones', { critical: true }, isCriticalEquipment),
      ...narrow('Only low stock', 'Only show the low-stock ones', { stock: ['low'] }, isLowStock),
      ...narrow('Only out of stock', 'Only show the out-of-stock ones', { stock: ['out'] }, isOutOfStock),
      ...sorted('Sort alphabetically', 'Sort alphabetically', 'name'),
      ...(items.some(i => isLowStock(i) || isOutOfStock(i)) ? sorted('Order priority', 'Sort by order priority', 'priority') : []),
    ];
  }
  async function stopRecording() {
    if (capture.phase !== 'recording') return;
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    recordingTimer.current = null;
    const current = turn.current;
    let uri: string | null = null;
    setBusy('Finishing recording…');
    try {
      uri = await capture.finish();
      if (current !== turn.current || !uri) return;
      const session = captureSession();
      const online = CLOUD_TRANSCRIPTION_ENABLED && prefs.inputProvider === 'groq' && prefs.audioOptIn;
      setBusy(online ? 'Groq Whisper is transcribing — review before sending…' : 'Recognizing on this phone — review before sending…');
      const abort = new AbortController(); controller.current = abort;
      if (online) {
        const available = await assistant.capabilities(session, abort.signal);
        assertSession(session);
        if (current !== turn.current || abort.signal.aborted) return;
        setCaps(available);
        if (!available.scopes.includes('groq_audio') || !available.transcription_providers.includes('groq')) throw new Error('Online listening is unavailable or its consent was withdrawn. Recheck Voice setup, or choose Offline listening. No offline transcript was substituted.');
      }
      const result = !CLOUD_TRANSCRIPTION_ENABLED || !online ? await offlineVoice.transcribe(uri) : await assistant.transcribe(session, uri, abort.signal, 'groq');
      if (current === turn.current) {
        assertSession(session);
        setReviewOpen(true);
        if (!result.transcript.trim()) throw new Error('No words were recognized. Check Android microphone access, then try again or type.');
        setQuestion(result.transcript);
      }
    } catch (e) { if (current === turn.current) setError(e instanceof Error ? e.message : 'Recording failed. Please type instead.'); }
    finally { await discard(uri); if (current === turn.current) setBusy(''); }
  }
  async function startRecording() {
    if (!active || busy || permissionPending.current || capture.phase !== 'idle') return;
    if (readiness) { setError(readiness); return; }
    Keyboard.dismiss();
    cancel(); setError(''); setQuestion(''); setAnswer(null); setReviewOpen(false); pendingIntent.current = undefined;
    liveRecorder.current?.configure(model.ready);
    const current = turn.current;
    const abort = new AbortController(); controller.current = abort;
    const assertCanRecord = () => {
      if (abort.signal.aborted || current !== turn.current || AppState.currentState !== 'active') throw new Error('Recording cancelled. Tap the microphone again when the app is open.');
    };
    setBusy('Preparing microphone…');
    try {
      const started = await capture.start(async () => {
        await microphonePermission(abort.signal);
        assertCanRecord();
        // Do not mix other apps' audio into our recording. This is not a promise of AEC.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix' });
      }, assertCanRecord);
      if (started && current === turn.current) recordingTimer.current = setTimeout(() => { void stopRecording(); }, 28_000);
    } catch (e) { if (current === turn.current) setError(e instanceof Error ? e.message : 'Microphone unavailable.'); }
    finally { if (current === turn.current) setBusy(''); }
  }

  recordingEvent.current = message => {
    if (!active) return;
    if (message) { cancel(); setError(message); }
    else if (capture.phase === 'recording') void stopRecording();
  };
  const readiness = microphoneReadiness({ loaded, supported: offlineSupported, modelChecked, modelReady: model.ready, enabled: prefs.enabled, microphone: prefs.microphone, cloudListening: CLOUD_TRANSCRIPTION_ENABLED && prefs.audioOptIn && prefs.inputProvider === 'groq' });

  const textStyle = { color: colors.textPrimary };
  const microphoneBusy = capturePhase !== 'idle';
  const locked = !!busy || microphoneBusy || !loaded;
  const isRecording = capturePhase === 'recording';
  const button = (label: string, action: () => void, disabled = false) => <VoiceButton label={label} onPress={action} disabled={disabled} secondary />;
  const iconButton = (name: React.ComponentProps<typeof Ionicons>['name'], label: string, action: () => void) =>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} onPress={action} style={[styles.iconButton, { backgroundColor: colors.bgTertiary }]}><Ionicons name={name} size={22} color={colors.textSecondary} /></TouchableOpacity>;
  const feedback = <>
    {settingsOpen && !!busy && !busy.includes('speech pack') && !busy.includes('Alba voice pack') && <View style={styles.row}><ActivityIndicator color={colors.accentBlue} /><Text accessibilityLiveRegion="polite" style={[styles.body, textStyle, { flex: 1 }]}>{busy}</Text></View>}
    {!!error && <View style={[styles.feedback, { backgroundColor: colors.statusRedBg }]}><Text accessibilityRole="alert" style={[styles.body, { color: colors.statusRed }]}>{error}</Text>
      {permissionBlocked && button('Open Android app permissions', () => { void Linking.openSettings().catch(() => setError('Open Android Settings → Apps → CareKosh → Permissions → Microphone.')); })}</View>}
  </>;
  const setup = <VoiceSetup prefs={prefs} loaded={loaded} supported={offlineSupported} busy={busy} model={model} modelChecked={modelChecked} progress={downloadProgress} deviceVoice={deviceVoice}
    caps={caps}
    chooseListening={id => { if (id === 'groq') chooseCloud('groq_audio', { ...prefs, inputProvider: 'groq', audioOptIn: true }); else void update({ ...prefs, inputProvider: 'offline', audioOptIn: false }); }}
    chooseUnderstanding={id => { if (id === 'groq') chooseCloud('groq_text', { ...prefs, cloud: true }); else void update({ ...prefs, cloud: false }); }}
    withdrawCloud={() => { void revokeCloud(); }}
    selectSarvam={() => chooseCloud('sarvam_speech', { ...prefs, speechProvider: 'sarvam', sarvamSpeechOptIn: true })}
    sarvamKeyControls={<SarvamKeySettings key={userId} status={caps.sarvam_personal_key} source={prefs.sarvamKeySource ?? 'application'}
      applicationAvailable={sarvamSourceAvailable(caps, 'application')} consented={caps.scopes.includes('sarvam_speech')} locked={locked || speaking}
      saveKey={key => changePersonalKey(key)} removeKey={() => changePersonalKey()}
      chooseSource={source => { void update({ ...prefs, sarvamKeySource: source }); }}
      testKey={() => {
        cancel(); setError(''); const abort = new AbortController(); controller.current = abort;
        void playAnswer({ title: 'Personal voice test', text: 'Hello. Your personal Sarvam voice is ready.', items: [], choices: [], timestamp: Date.now(), stale: false }, turn.current, abort.signal, true, true);
      }} />}
    speechStatus={speechStatus} stopSpeech={cancel}
    speechFeedback={speechFeedback} outputCheckSupported={pocketOutputCheckSupported} checkAudioOutput={() => { void checkAudioOutput(); }}
    chooseFallback={voice => { void chooseFallback(voice); }}
    diagnosticsEnabled={VOICE_DIAGNOSTICS_ENABLED} runAlbaDiagnostic={(play, placement) => { void runAlbaDiagnostic(play, placement); }}
    alba={alba} albaChecked={albaChecked} albaProgress={albaProgress}
    manageAlba={() => {
      if (!alba.ready && !ALBA_SELECTION_ENABLED) return;
      const session = captureSession(); const current = turn.current;
      Alert.alert(alba.ready ? 'Remove Alba voice?' : 'Download Alba voice?', alba.ready
        ? `Remove only the downloaded Alba pack.${ALBA_SELECTION_ENABLED ? '' : ' Alba selection and new downloads are currently disabled.'} Speech recognition, inventory, drafts and orders are not affected.`
        : `Download ${Math.ceil(alba.bytes / 1_000_000)} MB once. Speech is generated inside CareKosh. No additional app is needed. Wi-Fi is recommended.`,
        [{ text: 'Cancel', style: 'cancel' }, { text: alba.ready ? 'Remove' : 'Download', onPress: () => { if (current !== turn.current || !mounted.current) return; assertSession(session); void setupAlba(alba.ready); } }]);
    }}
    cancelSetup={() => cancel()}
    exportLicences={() => {
      cancel(); setError(''); const session = captureSession(); const current = turn.current;
      void pocketVoice.licences().then(async uri => {
        if (current !== turn.current || !mounted.current) return;
        assertSession(session);
        if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is unavailable');
        if (current !== turn.current || !mounted.current) return;
        assertSession(session);
        await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'CareKosh offline voice licences' });
      }).catch(() => { if (current === turn.current) setError('Licence export unavailable. The notices are also included in the Android APK.'); });
    }}
    update={next => { void update(next); }} enableMicrophone={() => { void enableMicrophone(); }}
    openAssistant={openAssistant}
    manageModel={() => {
      const session = captureSession(), current = turn.current;
      Alert.alert(model.ready ? 'Remove speech pack?' : 'Download English speech pack?', model.ready
        ? 'Only the speech model is removed. Your inventory stays unchanged. Voice recording will need a new download.'
        : 'Download the offline English model from Moonshine. Wi-Fi is recommended. No recording or inventory is uploaded.',
        [{ text: 'Cancel', style: 'cancel' }, { text: model.ready ? 'Remove' : 'Download', onPress: () => {
          if (!mounted.current || current !== turn.current || AppState.currentState !== 'active') return;
          try { assertSession(session); } catch { return; }
          void setupOffline(model.ready);
        } }]);
    }}
    previewVoice={() => {
      cancel(); setError('');
      const abort = new AbortController(); controller.current = abort;
      void playAnswer({ title: 'Voice preview', text: 'Hello. I am your CareKosh stock assistant.', items: [], choices: [], timestamp: Date.now(), stale: false }, turn.current, abort.signal, true);
    }}
    recheck={() => {
      setError(''); setModelChecked(false);
      const session = captureSession();
      if (CLOUD_TEXT_ENABLED || CLOUD_TRANSCRIPTION_ENABLED || SARVAM_SPEECH_ENABLED || CLOUD_VOICE_ENABLED) void assistant.capabilities(session).then(value => { assertSession(session); if (mounted.current) setCaps(value); }).catch(() => { if (mounted.current) setError('Online services could not be checked. Basic commands remain available.'); });
      if (!offlineSupported) { setModelChecked(true); return; }
      void offlineVoice.status().then(value => { if (mounted.current) setModel(value); }).catch(() => { if (mounted.current) setError('Speech pack check failed. Please retry.'); }).finally(() => { if (mounted.current) setModelChecked(true); });
      if (pocketVoiceSupported) { setAlbaChecked(false); void pocketVoice.status().then(value => { if (mounted.current) setAlba(value); }).catch(() => { if (mounted.current) setAlba(value => ({ ...value, ready: false })); }).finally(() => { if (mounted.current) setAlbaChecked(true); }); }
      void offlineVoice.deviceStatus().then(value => { if (mounted.current) setDeviceVoice(value); }).catch(() => { if (mounted.current) setDeviceVoice({ ready: false, name: 'No offline voice available' }); });
    }}
  />;

  if (settingsOpen) return <SafeAreaView style={[styles.screen, { backgroundColor: colors.bgPrimary }]}>
    <View style={styles.header}>{iconButton('arrow-back', 'Close voice setup', close)}<Text style={[styles.heading, textStyle, { flex: 1 }]}>Voice setup</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {feedback}
      {!!busy && button('Cancel operation', cancel)}
      {setup}
    </ScrollView>
  </SafeAreaView>;

  const content = <>
          {feedback}
          {!embedded && readiness && <View style={[styles.card, { backgroundColor: colors.accentBlueBg }]}>
            <Text style={[styles.label, textStyle]}>Let’s get voice ready</Text><Text style={[styles.body, { color: colors.textSecondary }]}>{readiness}</Text>
            <VoiceButton label="Open voice setup" onPress={openSetup} disabled={!!busy || microphoneBusy} />
          </View>}
          {!answer && <>
            <AssistantDock standalone recording={isRecording} disabled={!!busy || (microphoneBusy && !isRecording) || !loaded}
              busy={busy} live={liveWords} question={question} review={!isRecording} canSend={!!question.trim() && !locked && prefs.enabled}
              onMic={() => { if (isRecording) void stopRecording(); else void startRecording(); }}
              onType={() => setReviewOpen(true)} onEdit={setQuestion} onSend={() => { void ask(); }} onClose={close} />
            <View style={styles.chips}>{(['Summary', 'Low stock', 'Out of stock'] as const).map(label => <View key={label}>{button(label, () => { setQuestion(label); void ask(label); }, locked || !prefs.enabled)}</View>)}</View>
            {button(helpOpen ? 'Hide examples' : 'What can I ask?', () => setHelpOpen(!helpOpen))}
            {helpOpen && <View style={[styles.card, { backgroundColor: colors.bgCard }]}>{commandExamples.map(example => <Text key={example} style={[styles.body, textStyle]}>• {example}</Text>)}<Text style={[styles.caption, { color: colors.textSecondary }]}>Use your inventory item names. Stock edits and order saving are blocked. Voice can prepare a local unsaved draft; saving requires touch confirmation.</Text></View>}
          </>}
          {answer && <View style={{ gap: 10 }}>
            <View style={styles.row}>
              {(!keptOpen || !!answer.choices.length || speaking) && <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.textSecondary, flex: 1 }]}>{answer.choices.length ? 'Choose an item to continue' : speaking ? speechStatus : keptOpen || screenReader ? 'Answer stays open' : `Closes in ${secondsLeft}s`}</Text>}
              {!answer.choices.length && !keptOpen && !screenReader && button('Keep open', () => setKeptOpen(true))}
            </View>
            {!!fallbackNotice && <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.textSecondary }]}>{fallbackNotice}</Text>}
            <View style={styles.answerCard}>
              <Text accessibilityRole="header" style={[styles.answerTitle, textStyle]}>{answer.title}</Text>
              {!!answer.filters && <View style={[styles.filters, { backgroundColor: colors.bgTertiary }]}>
                <Ionicons name="funnel-outline" size={14} color={colors.textSecondary} />
                <Text selectable style={[styles.caption, { color: colors.textSecondary, flex: 1 }]}>Filters understood: {answer.filters}</Text>
              </View>}
              {!!answer.statistics?.length && <View style={styles.statistics}>
                {answer.statistics.map(stat => <View key={stat.label} style={[styles.stat, { backgroundColor: stat.tone === 'out' ? colors.statusRedBg : stat.tone === 'low' ? colors.statusOrangeBg : colors.accentBlueBg }]}>
                  <Text style={[styles.statValue, { color: stat.tone === 'out' ? colors.statusRed : stat.tone === 'low' ? colors.statusOrange : colors.accentBlue }]}>{stat.value}</Text>
                  <Text style={[styles.caption, { color: colors.textSecondary }]}>{stat.label}</Text>
                </View>)}
              </View>}
              {(!answer.statistics?.length || detailsOpen || !!draftRows || !!proposalChoice || answer.kind === 'list' && !answer.items.length) && <Text selectable accessibilityLiveRegion="polite" style={[styles.answer, textStyle]} onPress={() => setKeptOpen(true)}>{answer.text}</Text>}
              {!!answer.excluded?.length && <Text selectable style={[styles.caption, { color: colors.textSecondary }]}>Excluded by your request: {answer.excluded.map(e => e.name).join(', ')}</Text>}
              {answer.notes?.map(note => <Text key={note} style={[styles.caption, { color: colors.statusOrange }]}>{note}</Text>)}
              {<TouchableOpacity accessibilityRole="button" accessibilityLabel="Show answer details" accessibilityState={{ expanded: detailsOpen }} onPress={() => { setDetailsOpen(!detailsOpen); setKeptOpen(true); }} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={[styles.caption, { color: colors.textSecondary }]}>Filters & question {detailsOpen ? '−' : '+'}</Text>
              </TouchableOpacity>}
              {detailsOpen && <Text selectable style={[styles.caption, { color: colors.textSecondary }]}>{understandingSource.current} · “{answeredQuestion.current}”</Text>}
              {pendingIntent.current && ['read_item', 'summary', 'low_stock', 'out_of_stock', 'inventory_query', 'draft_order', 'inventory_export'].includes(pendingIntent.current.intent) && <View style={[styles.freshness, { backgroundColor: answer.stale ? colors.statusOrangeBg : colors.statusGreenBg }]}>
                <Ionicons name={answer.stale ? 'time-outline' : 'checkmark-circle-outline'} size={16} color={answer.stale ? colors.statusOrange : colors.statusGreen} />
                <Text style={[styles.caption, { color: colors.textSecondary, flex: 1 }]}>{answer.stale ? 'Last known stock' : 'Last synced'} · {answer.stale ? new Date(answer.timestamp).toLocaleString() : new Date(answer.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>}
              {answer.choices.map(item => <View key={item.id}>{button(item.name + ' · ' + item.unit + ' · ' + item.id.slice(-6), () => {
                const intent = pendingIntent.current || command('clarify');
                if ('version' in intent) { selections.current[choiceQuery.current] = item.id; void ask(answeredQuestion.current, intent); }
                else { previousItem.current = item.id; void ask(answeredQuestion.current, { ...intent, reference: 'previous', item_query: null }); }
              }, locked)}</View>)}
              {answer.options?.map(option => <View key={option.id}>{button(option.label, () => {
                selections.current[choiceQuery.current] = option.id;
                if (pendingIntent.current) void ask(answeredQuestion.current, pendingIntent.current);
              }, locked)}</View>)}
            </View>
            <View style={styles.chips}>
              {answer.kind === 'list' && !draftRows && !!resultChain.current.length && <>
                {refinements(answer.items).map(r => <View key={r.label}>{button(r.label, () => { void ask(r.spoken, r.plan); }, locked)}</View>)}
                {!!answer.items.length && button('Draft these items', () => { void ask('Create a draft from those', plan('draft_order', { selection: selection([condition()], { scope: 'previous' }), draft: { mode: 'new', lines: [], include_selection: true } })); }, locked)}
              </>}
              {!!proposalChoice && <>
                {pendingIntent.current && 'version' in pendingIntent.current && toPlan(pendingIntent.current).draft?.mode === 'new' && button('Merge with existing draft', () => proposalChoice(true), locked)}
                {button('Replace existing draft with this proposal', () => proposalChoice(false), locked)}
                {button('Cancel proposal · keep existing draft', () => { cancel(); setProposalChoice(null); setAnswer(null); setDraftRows(undefined); }, locked)}
              </>}
            </View>
          </View>}
  </>;

  const answerAction = (name: React.ComponentProps<typeof Ionicons>['name'], label: string, action: () => void, disabled = false) =>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={action}
      style={[styles.iconButton, { opacity: disabled ? 0.35 : 1, backgroundColor: colors.bgTertiary }]}><Ionicons name={name} size={20} color={colors.textSecondary} /></TouchableOpacity>;
  const footer = answer && <View style={[styles.answerFooter, { borderColor: colors.borderPrimary, backgroundColor: colors.bgPrimary }]}>
    {!!draftRows && !proposalChoice && <VoiceButton label="Review unsaved order draft" onPress={() => { cancel(); setAnswer(null); router.navigate('/order/create'); }} disabled={locked} />}
    <View style={[styles.row, { flexWrap: 'wrap', gap: 8 }]}>
      {speaking ? answerAction('stop', 'Cancel / stop speech', () => { cancel(); setKeptOpen(true); }) : answerAction('volume-medium-outline', 'Hear answer', () => { setKeptOpen(true); const abort = new AbortController(); controller.current = abort; void playAnswer(answer, turn.current, abort.signal, true); }, locked || !(prefs.speechProvider === 'sarvam' ? SARVAM_SPEECH_ENABLED && caps.speech_providers.includes('sarvam') && caps.scopes.includes('sarvam_speech') : prefs.speechProvider === 'pocket' ? ALBA_SELECTION_ENABLED && alba.ready : deviceVoice.ready))}
      {!draftRows && answerAction('refresh-outline', 'Refresh answer', () => { void ask(answeredQuestion.current, pendingIntent.current, true); }, locked || pendingIntent.current?.intent === 'inventory_export')}
      {!!resultChain.current.length && !draftRows && answerAction('download-outline', 'Export inventory report', () => { void ask('Export this inventory list as PDF', plan('inventory_export')); }, locked)}
      <View style={{ flex: 1, minWidth: 120 }}><VoiceButton label="Ask another question" secondary onPress={() => { cancel(); setAnswer(null); setQuestion(''); setError(''); setReviewOpen(false); }} /></View>
    </View>
  </View>;

  const overlay = <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { backgroundColor: colors.overlayDark }]}>
    <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss voice assistant" accessibilityRole="button" />
    <SafeAreaView style={styles.overlay} pointerEvents="box-none">
      <View accessibilityViewIsModal style={[styles.sheet, answer && { height: Math.min(windowHeight * 0.86, (300 + Math.min(answer.items.length, 7) * 70) * Math.max(1, Math.min(fontScale, 1.5))) }, { backgroundColor: colors.bgPrimary, borderColor: colors.borderPrimary }]}>
        <View style={[styles.handle, { backgroundColor: colors.borderSecondary }]} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}><Text accessibilityRole="header" style={[styles.heading, textStyle]}>Care Coach</Text><Text style={[styles.caption, { color: colors.textSecondary }]}>{draftRows ? 'Unsaved draft · review to continue' : 'Your inventory, at a glance'}</Text></View>
          {iconButton('settings-outline', 'Voice setup', openSetup)}
          {iconButton('close', 'Close assistant', close)}
        </View>
        {answer ? <AnswerList items={answer.items} draftRows={draftRows} reasons={answer.reasons} header={content} /> : <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{content}</ScrollView>}
        {footer}
      </View>
    </SafeAreaView>
  </KeyboardAvoidingView>;
  if (!embedded) return overlay;
  return <View style={{ backgroundColor: colors.bgCard }}>
    <AssistantDock recording={isRecording} disabled={!!busy || (microphoneBusy && !isRecording) || !loaded}
      busy={busy} live={liveWords} question={question} review={reviewOpen} canSend={!!question.trim() && !locked && prefs.enabled}
      onMic={() => { if (isRecording) void stopRecording(); else void startRecording(); }}
      onType={() => { cancel(); setReviewOpen(true); }} onEdit={setQuestion} onSend={() => { void ask(); }} onClose={close} />
    {!!error && <View style={styles.dockContent}>{feedback}{!!readiness && button('Voice setup', openSetup)}</View>}
    <AssistantLayer visible={!!answer && active} onClose={close}>{overlay}</AssistantLayer>
  </View>;
}

const styles = StyleSheet.create({
  answerFooter: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  statistics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stat: { flexGrow: 1, flexBasis: 75, padding: 10, borderRadius: 12, gap: 2 }, statValue: { fontSize: 25, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dockContent: { paddingHorizontal: 14, paddingBottom: 12, gap: 10 },
  screen: { flex: 1 }, overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '94%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, overflow: 'hidden' },
  handle: { width: 36, height: 4, borderRadius: 4, alignSelf: 'center', marginTop: 10 },
  header: { paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  content: { padding: 18, gap: 12, paddingBottom: 20 }, heading: { fontSize: 20, fontWeight: '700' }, body: { fontSize: 15, lineHeight: 23 },
  caption: { fontSize: 13, lineHeight: 20 }, label: { fontSize: 16, fontWeight: '600' }, answer: { fontSize: 15, lineHeight: 23 },
  answerTitle: { fontSize: 23, lineHeight: 29, fontWeight: '700' },
  card: { padding: 18, borderRadius: 18, gap: 12 }, answerCard: { padding: 0, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  freshness: { paddingVertical: 6, borderRadius: 8, flexDirection: 'row', gap: 8, alignItems: 'center' },
  filters: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  feedback: { padding: 14, borderRadius: 14, gap: 12 },
});
