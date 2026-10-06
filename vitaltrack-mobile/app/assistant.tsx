import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme/ThemeContext';
import { captureSession, assertSession } from '@/services/assistantSession';
import * as assistant from '@/services/assistant';
import { answerIntent, command, commandExamples, parseLocal, speechText, type Answer, type Intent } from '@/features/assistant/core';
import { defaults, loadPreferences, savePreferences, type Preferences } from '@/features/assistant/preferences';
import { inventorySnapshot } from '@/features/assistant/snapshot';
import { discardAudio, rememberAudio } from '@/features/assistant/audioFiles';
import { MicrophoneCapture, microphoneLevel, type CapturePhase } from '@/features/assistant/capture';
import { offlineVoice, offlineSupported } from '@/features/assistant/offlineVoice';
import { offlineSpeechNotice } from '@/features/assistant/notices';
import { CLOUD_VOICE_ENABLED } from '@/features/assistant/policy';

const recordingOptions = { ...RecordingPresets.HIGH_QUALITY, sampleRate: 16000, numberOfChannels: 1, bitRate: 64000, isMeteringEnabled: true };
function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not play speech.'));
    reader.readAsDataURL(blob);
  });
}

/** No mutation/navigation tool is imported: every stock view here is read-only. */
export default function AssistantScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const userId = useAuthStore(s => s.isAuthenticated ? s.user?.id : undefined);
  const [prefs, setPrefs] = useState<Preferences>(defaults);
  const [caps, setCaps] = useState(assistant.unavailable);
  const [loaded, setLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [capturePhase, setCapturePhase] = useState<CapturePhase>('idle');
  const [model, setModel] = useState({ ready: false, bytes: 0 });
  const [deviceVoice, setDeviceVoice] = useState({ ready: false, name: 'Checking device voice…' });
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const mounted = useRef(true);
  const previousItem = useRef<string | undefined>(undefined);
  const pendingIntent = useRef<Intent | undefined>(undefined);
  const answeredQuestion = useRef('');
  const turn = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const audioFile = useRef<string | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorder = useAudioRecorder(recordingOptions);
  const recordState = useAudioRecorderState(recorder, 150);
  const player = useAudioPlayer(null);
  const playback = useAudioPlayerStatus(player);
  const captureRef = useRef<MicrophoneCapture | null>(null);
  if (!captureRef.current) captureRef.current = new MicrophoneCapture(recorder, rememberAudio, discardAudio,
    phase => { if (mounted.current) setCapturePhase(phase); },
    () => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }));
  const capture = captureRef.current;

  const discard = async (uri: string | null) => {
    await discardAudio(uri).catch(() => {});
  };
  const cancel = () => {
    turn.current++;
    controller.current?.abort();
    offlineVoice.cancel();
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    recordingTimer.current = null;
    try { player.pause(); } catch { /* native object may already be released */ }
    void discard(audioFile.current); audioFile.current = null;
    capture.cancel();
    setBusy('');
  };
  const close = () => { cancel(); previousItem.current = undefined; setAnswer(null); if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); };

  useEffect(() => {
    if (playback.didJustFinish) { void discardAudio(audioFile.current).catch(() => {}); audioFile.current = null; }
  }, [playback.didJustFinish]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const session = userId ? captureSession() : null;
    setPrefs(defaults); setCaps(assistant.unavailable); setAnswer(null); setQuestion('');
    previousItem.current = undefined; pendingIntent.current = undefined; answeredQuestion.current = ''; setLoaded(false);
    if (session) {
      // Local setup is never held hostage by a slow/unavailable cloud server.
      void loadPreferences(session.owner)
        .then(preferences => { if (active) { assertSession(session); setPrefs(preferences); setLoaded(true); } })
        .catch(() => { if (active) setError('Session changed. Reopen the assistant.'); });
      // Cloud voice is off in this release: no AI endpoint is called at all.
      if (CLOUD_VOICE_ENABLED) void assistant.capabilities(session).then(available => { if (active) { assertSession(session); setCaps(available); } }).catch(() => {});
      if (offlineSupported) {
        void offlineVoice.status().then(status => { if (active) setModel(status); }).catch(() => { if (active) setError('Offline speech pack could not be checked. Retry setup below.'); });
        void offlineVoice.deviceStatus().then(voice => { if (active) setDeviceVoice(voice); }).catch(() => { if (active) setDeviceVoice({ ready: false, name: 'Install an offline English voice in Android Text-to-speech settings.' }); });
      }
    }
    const progress = offlineVoice.progress(event => { if (active && event.total > 0) setDownloadProgress(Math.round(100 * event.downloaded / event.total)); });
    const auth = useAuthStore.subscribe((state, previous) => {
      if (state.user?.id !== previous.user?.id || state.isAuthenticated !== previous.isAuthenticated) { cancel(); setAnswer(null); previousItem.current = undefined; }
    });
    const lifecycle = AppState.addEventListener('change', state => { if (state !== 'active') cancel(); });
    return () => { active = false; mounted.current = false; auth(); lifecycle.remove(); progress?.remove(); cancel(); };
    // Lifecycle closures use stable native objects and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function update(next: Preferences) {
    if (!userId) return;
    cancel(); setError('');
    const session = captureSession();
    setPrefs(next); // Disabling must take effect even if storage/network is unavailable.
    try { await savePreferences(session.owner, next); assertSession(session); }
    catch { if (mounted.current) setError('Settings changed for this screen, but could not be saved for next time.'); }
  }
  async function cloudConsent(scope: assistant.ConsentScope, next: Preferences) {
    if (!CLOUD_VOICE_ENABLED) return;
    cancel(); setBusy('Saving consent…');
    const current = turn.current;
    try {
      const session = captureSession();
      await assistant.setConsent(session, [...new Set([...caps.scopes, scope])]);
      const available = await assistant.capabilities(session);
      if (current !== turn.current) return;
      assertSession(session); setCaps(available); await update(next);
    } catch { if (current === turn.current) setError('Consent could not be saved. Please retry.'); }
    finally { if (current === turn.current) setBusy(''); }
  }
  function chooseCloud(scope: assistant.ConsentScope, next: Preferences) {
    if (!CLOUD_VOICE_ENABLED) return;
    if (caps.scopes.includes(scope)) { void update(next); return; }
    const disclosure = {
      groq_text: 'Unfamiliar questions (typed or transcribed) go through CareKosh to Groq (US) for intent extraction. Inventory is not uploaded to the LLM.',
      groq_audio: 'Recordings go through CareKosh to Groq (US) for Whisper transcription. This is an online, potentially paid service.',
      sarvam_audio: 'Recordings go through CareKosh to Sarvam for Saaras transcription. This is an online, potentially paid service, not an offline model.',
      kokoro_speech: 'The answer text, including quantities and recorded suppliers, goes to our hosted Kokoro speech service. Hosting has a cost; no audio is uploaded for this speaking option.',
      sarvam_speech: 'The answer text, including quantities and recorded suppliers, goes through CareKosh to Sarvam Bulbul for paid speech generation.',
    }[scope];
    Alert.alert('Optional cloud processing — adult pilot', disclosure + ' Questions and answers can reveal health information. Avoid patient identifiers. Temporary audio is cleaned up; provider handling is described in our privacy notice. Continue only if you are 18+ and agree. Switching providers is never automatic. Use “Withdraw all cloud consent” below to revoke.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'I am 18+ and agree', onPress: () => { void cloudConsent(scope, next); } }]);
  }
  async function revokeCloud() {
    if (!CLOUD_VOICE_ENABLED) return;
    cancel();
    setCaps(assistant.unavailable);
    await update({ ...prefs, cloud: false, inputProvider: 'offline', speechProvider: 'device' });
    const current = turn.current;
    try { await assistant.setConsent(captureSession(), []); }
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
  async function playAnswer(value: Answer, current: number, signal: AbortSignal, preview = false) {
    if ((!prefs.spokenReplies && !preview) || capture.phase !== 'idle' || current !== turn.current || signal.aborted) return;
    try {
      const session = captureSession();
      if (!CLOUD_VOICE_ENABLED || prefs.speechProvider === 'device') {
        assertSession(session);
        await offlineVoice.speak(speechText(value));
        return;
      }
      const scope = prefs.speechProvider === 'sarvam' ? 'sarvam_speech' : 'kokoro_speech';
      if (!caps.scopes.includes(scope) || !caps.speech_providers.includes(prefs.speechProvider)) throw new Error('Selected speech provider unavailable');
      const blob = await assistant.speak(session, speechText(value), signal, prefs.speechProvider);
      const encoded = await blobBase64(blob);
      if (current !== turn.current || signal.aborted) return;
      assertSession(session);
      const uri = FileSystem.cacheDirectory + 'carekosh-voice-' + Date.now() + '.wav';
      await rememberAudio(uri);
      await FileSystem.writeAsStringAsync(uri, encoded, { encoding: FileSystem.EncodingType.Base64 });
      if (current !== turn.current || signal.aborted) { await discard(uri); return; }
      audioFile.current = uri;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
      if (current !== turn.current || signal.aborted) { await discard(uri); return; }
      assertSession(session); player.replace({ uri }); player.play();
    } catch { if (current === turn.current) setError('Speech unavailable. Your answer is still on screen.'); }
  }
  async function ask(text = question, chosen?: Intent, force = false) {
    if (!loaded || !prefs.enabled || !text.trim() || busy || capture.phase !== 'idle') return;
    cancel(); setError(''); setAnswer(null);
    const current = turn.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy('Understanding…');
    try {
      const session = captureSession();
      let intent = chosen || parseLocal(text);
      if (!intent) {
        if (!CLOUD_VOICE_ENABLED) throw new Error('I could not safely match that wording. Try a quick command or check the command examples.');
        if (!prefs.cloud || !caps.scopes.includes('groq_text') || !caps.interpret) throw new Error('I could not safely match that wording locally. Try a quick command, check the command examples, or enable optional cloud understanding.');
        intent = await assistant.interpret(session, text.trim(), !!previousItem.current, abort.signal);
      }
      if (current !== turn.current) return;
      assertSession(session);
      if (intent.intent === 'close') { close(); return; }
      if (intent.intent === 'stop_speaking') { cancel(); return; }
      // A newly named/ambiguous item must not leave an unrelated old item as “those”.
      if (intent.intent !== 'read_item' || intent.reference === 'named') previousItem.current = undefined;
      pendingIntent.current = intent;
      const needsStock = ['read_item', 'summary', 'low_stock', 'out_of_stock'].includes(intent.intent);
      setBusy('Checking stock…');
      const snapshot = needsStock ? await inventorySnapshot(session, abort.signal, force) : { items: [], timestamp: Date.now(), stale: false };
      if (current !== turn.current) return;
      assertSession(session);
      const result = answerIntent(intent, snapshot.items, snapshot.timestamp, previousItem.current, snapshot.stale);
      if (result.resolvedId) previousItem.current = result.resolvedId;
      answeredQuestion.current = text;
      setAnswer(result); setBusy('');
      await playAnswer(result, current, abort.signal);
    } catch (e) { if (current === turn.current) setError(e instanceof Error ? e.message : 'Question failed. Try the regular inventory screen.'); }
    finally { if (current === turn.current) setBusy(''); }
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
      setBusy(!CLOUD_VOICE_ENABLED || prefs.inputProvider === 'offline' ? 'Recognizing on this phone — review before sending…' : 'Cloud transcription — review before sending…');
      const abort = new AbortController(); controller.current = abort;
      const result = !CLOUD_VOICE_ENABLED || prefs.inputProvider === 'offline' ? await offlineVoice.transcribe(uri) : await assistant.transcribe(session, uri, abort.signal, prefs.inputProvider);
      if (current === turn.current) { assertSession(session); setQuestion(result.transcript); }
    } catch (e) { if (current === turn.current) setError(e instanceof Error ? e.message : 'Recording failed. Please type instead.'); }
    finally { await discard(uri); if (current === turn.current) setBusy(''); }
  }
  async function startRecording() {
    if (busy || capture.phase !== 'idle' || !prefs.enabled || !prefs.microphone || !canListen || Platform.OS === 'web') return;
    cancel(); setError(''); setQuestion(''); setAnswer(null); pendingIntent.current = undefined;
    const current = turn.current;
    setBusy('Preparing microphone…');
    try {
      const started = await capture.start(async () => {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (current !== turn.current) return;
        if (!permission.granted) throw new Error('Microphone permission denied. You can still type.');
        // Do not mix other apps' audio into our recording. This is not a promise of AEC.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix' });
      });
      if (started && current === turn.current) recordingTimer.current = setTimeout(() => { void stopRecording(); }, 28_000);
    } catch (e) { if (current === turn.current) setError(e instanceof Error ? e.message : 'Microphone unavailable.'); }
    finally { if (current === turn.current) setBusy(''); }
  }

  const textStyle = { color: colors.textPrimary };
  const canListen = !CLOUD_VOICE_ENABLED || prefs.inputProvider === 'offline' ? offlineSupported && model.ready : caps.transcription_providers.includes(prefs.inputProvider) && caps.scopes.includes(prefs.inputProvider === 'sarvam' ? 'sarvam_audio' : 'groq_audio');
  const canSpeak = !CLOUD_VOICE_ENABLED || prefs.speechProvider === 'device' ? offlineSupported && deviceVoice.ready : caps.speech_providers.includes(prefs.speechProvider) && caps.scopes.includes(prefs.speechProvider === 'sarvam' ? 'sarvam_speech' : 'kokoro_speech');
  const microphoneBusy = capturePhase !== 'idle';
  const level = microphoneLevel(recordState.metering);
  const button = (label: string, action: () => void, disabled = false) => (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={action}
      style={[styles.button, { backgroundColor: colors.accentBlue, opacity: disabled ? 0.45 : 1 }]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>
  );
  const toggle = (label: string, value: boolean, action: (v: boolean) => void, disabled = false) => (
    <View style={styles.row}><Text style={[styles.body, textStyle, { flex: 1 }]}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={action} disabled={disabled || !!busy || microphoneBusy || !loaded} /></View>
  );
  return <SafeAreaView style={[styles.screen, { backgroundColor: colors.bgPrimary }]}>
    <View style={styles.header}><Text style={[styles.heading, textStyle]}>Ask CareKosh</Text>{button('Close', close)}</View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={[styles.body, { color: colors.textSecondary }]}>Read-only • English • Stock and recorded suppliers. No stock edits, orders, purchases or messages.</Text>
      {button(settingsOpen ? 'Hide AI & Voice settings' : 'AI & Voice settings', () => setSettingsOpen(!settingsOpen))}
      {settingsOpen && <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
        {toggle('Enable assistant', prefs.enabled, value => { void update({ ...prefs, enabled: value }); })}
        <Text style={[styles.label, textStyle]}>1 · Listening: {prefs.inputProvider === 'offline' ? 'On this phone' : prefs.inputProvider}</Text>
        <Text style={[styles.caption, { color: colors.textSecondary }]}>Default: Moonshine Small Streaming, English. No listening API key or per-use fee. One explicit model download is needed; it is not included in the APK.</Text>
        {!offlineSupported && <Text style={[styles.caption, textStyle]}>Offline voice requires the new Android APK. It is not available in Expo Go, web or iOS.</Text>}
        <View style={styles.chips}>
          {button('Use offline listening', () => { void update({ ...prefs, inputProvider: 'offline' }); }, !offlineSupported || !!busy || microphoneBusy)}
          {CLOUD_VOICE_ENABLED && button('Sarvam Saaras · cloud pilot', () => chooseCloud('sarvam_audio', { ...prefs, inputProvider: 'sarvam' }), !caps.transcription_providers.includes('sarvam') || !!busy || microphoneBusy)}
          {CLOUD_VOICE_ENABLED && button('Groq Whisper · cloud pilot', () => chooseCloud('groq_audio', { ...prefs, inputProvider: 'groq' }), !caps.transcription_providers.includes('groq') || !!busy || microphoneBusy)}
        </View>
        <Text style={[styles.caption, textStyle]}>{model.ready ? 'English speech pack: verified and ready.' : `Speech pack: not ready. ${model.bytes ? Math.ceil(model.bytes / 1_000_000) + ' MB download.' : 'Allow up to 300 MB for the pack.'}`}</Text>
        {button(model.ready ? 'Remove offline speech pack' : 'Download English speech pack', () => Alert.alert(model.ready ? 'Remove speech pack?' : 'Download offline speech pack?',
          model.ready ? 'This removes only the shared speech model from this phone, not your inventory. Offline listening will need a new download.' : 'Download model data from Moonshine’s model CDN. Wi-Fi is recommended. No recording or inventory is sent. Listening can then run without internet.',
          [{ text: 'Cancel', style: 'cancel' }, { text: model.ready ? 'Remove' : 'Download', onPress: () => { void setupOffline(model.ready); } }]), !offlineSupported || !!busy || microphoneBusy)}
        {!!busy && downloadProgress > 0 && <Text style={[styles.caption, textStyle]}>Model download: {downloadProgress}%</Text>}
        {!!busy && button('Cancel setup / operation', cancel)}
        {toggle('Microphone · tap to record', prefs.microphone, value => { void update({ ...prefs, microphone: value }); }, (!canListen || Platform.OS === 'web') && !prefs.microphone)}
        <Text style={[styles.label, textStyle]}>{CLOUD_VOICE_ENABLED ? '2 · Understanding: local commands first' : '2 · Understanding: local commands'}</Text>
        {CLOUD_VOICE_ENABLED && toggle('Use Groq for unfamiliar wording (optional)', prefs.cloud, value => { if (value) chooseCloud('groq_text', { ...prefs, cloud: true }); else void update({ ...prefs, cloud: false }); }, !caps.interpret && !prefs.cloud)}
        <Text style={[styles.caption, { color: colors.textSecondary }]}>{CLOUD_VOICE_ENABLED
          ? 'There is no local LLM in this release. Validated local commands read inventory; optional Groq returns intent only. Choosing offline listening does not prevent text uploads if you explicitly enable cloud understanding.'
          : 'Cloud processing is off in this release. Questions are matched by validated local commands on this phone; nothing is sent to an AI provider.'}</Text>
        <Text style={[styles.label, textStyle]}>3 · Speaking: {prefs.speechProvider}</Text>
        <View style={styles.chips}>
          {button('Use device voice · offline', () => { void update({ ...prefs, speechProvider: 'device' }); }, !offlineSupported || !!busy || microphoneBusy)}
          {CLOUD_VOICE_ENABLED && button('Kokoro · hosted audition', () => chooseCloud('kokoro_speech', { ...prefs, speechProvider: 'kokoro' }), !caps.speech_providers.includes('kokoro') || !!busy || microphoneBusy)}
          {CLOUD_VOICE_ENABLED && button('Sarvam Bulbul · cloud pilot', () => chooseCloud('sarvam_speech', { ...prefs, speechProvider: 'sarvam' }), !caps.speech_providers.includes('sarvam') || !!busy || microphoneBusy)}
        </View>
        <Text style={[styles.caption, textStyle]}>Device voice: {deviceVoice.name}. Only installed, non-network English voices are selected.{CLOUD_VOICE_ENABLED ? ' Kokoro and Sarvam require server setup and may incur costs.' : ''}</Text>
        {toggle('Spoken replies', prefs.spokenReplies, value => { void update({ ...prefs, spokenReplies: value }); }, !canSpeak && !prefs.spokenReplies)}
        {button('Test selected voice', () => {
          cancel();
          const abort = new AbortController(); controller.current = abort;
          void playAnswer({ title: 'Voice preview', text: 'Hello. I am your CareKosh stock assistant.', items: [], choices: [], timestamp: Date.now(), stale: false }, turn.current, abort.signal, true);
        }, !canSpeak || !!busy || microphoneBusy)}
        <Text style={[styles.caption, { color: colors.textSecondary }]}>{CLOUD_VOICE_ENABLED ? 'Fully local mode = offline listening + cloud understanding off + device voice. ' : 'Listening, understanding and speech all run on this phone. '}Inventory remains server-authoritative: offline answers need data synced in this login session and are labelled last known.{CLOUD_VOICE_ENABLED ? ' No provider is switched automatically.' : ''}</Text>
        {button(noticesOpen ? 'Hide offline speech licence' : 'Offline speech licence', () => setNoticesOpen(!noticesOpen))}
        {noticesOpen && <Text selectable style={[styles.caption, textStyle]}>{offlineSpeechNotice}</Text>}
        {CLOUD_VOICE_ENABLED && button('Withdraw all cloud consent', () => { void revokeCloud(); }, !!busy || microphoneBusy)}
        {button(CLOUD_VOICE_ENABLED ? 'Recheck device and cloud availability' : 'Recheck device availability', () => {
          const session = captureSession();
          if (CLOUD_VOICE_ENABLED) void assistant.capabilities(session).then(value => { assertSession(session); if (mounted.current) setCaps(value); }).catch(() => { if (mounted.current) setCaps(assistant.unavailable); });
          if (offlineSupported) {
            void offlineVoice.status().then(value => { if (mounted.current) setModel(value); }).catch(() => {});
            void offlineVoice.deviceStatus().then(value => { if (mounted.current) setDeviceVoice(value); }).catch(() => {});
          }
        }, !!busy || microphoneBusy)}
      </View>}
      {!!busy && <View style={styles.row}><ActivityIndicator color={colors.accentBlue} /><Text accessibilityLiveRegion="polite" style={[styles.body, textStyle]}>{busy}</Text></View>}
      {!!error && <Text accessibilityRole="alert" style={[styles.body, { color: colors.statusRed }]}>{error}</Text>}
      {!prefs.enabled ? <Text style={[styles.body, textStyle]}>Enable the assistant above to begin. All normal touch features remain unchanged.</Text> : <>
        <View style={styles.chips}>{(['Summary', 'Low stock', 'Out of stock'] as const).map(label => <View key={label}>{button(label, () => { setQuestion(label); void ask(label); }, !!busy || microphoneBusy)}</View>)}</View>
        <Text style={[styles.label, textStyle]}>Question / editable transcript</Text>
        <TextInput accessibilityLabel="Question or editable transcript" value={question} onChangeText={setQuestion} maxLength={600} multiline
          editable={!busy && !microphoneBusy} placeholder="How many hand gloves are left?" placeholderTextColor={colors.textTertiary}
          style={[styles.input, textStyle, { borderColor: colors.borderPrimary, backgroundColor: colors.bgCard }]} />
        <Text style={[styles.caption, { color: colors.textSecondary }]}>Review the transcript, then Send. “Close” dismisses this screen. Nothing is sent while you type.</Text>
        {button(helpOpen ? 'Hide command examples' : 'What can I ask?', () => setHelpOpen(!helpOpen))}
        {helpOpen && <View style={[styles.card, { backgroundColor: colors.bgCard }]}>{commandExamples.map(example => <Text key={example} style={[styles.body, textStyle]}>• {example}</Text>)}<Text style={[styles.caption, { color: colors.textSecondary }]}>Examples, not a guarantee for every phrasing. Use your inventory item names; ambiguous matches ask for a choice. Record again for follow-ups. No wake word or always-listening mode.</Text></View>}
        <View style={styles.chips}>
          {button('Send', () => { void ask(); }, !question.trim() || !!busy || microphoneBusy)}
          {button(capturePhase === 'recording' ? 'Finish recording' : 'Record', () => { void (capture.phase === 'recording' ? stopRecording() : startRecording()); }, !!busy || (microphoneBusy && capturePhase !== 'recording') || !prefs.microphone || !canListen)}
          {button('Cancel / Stop speech', cancel)}
        </View>
        {capturePhase === 'recording' && <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
          <Text accessibilityLiveRegion="polite" style={[styles.label, textStyle]}>Listening now · {Math.round(recordState.durationMillis / 1000)}s / 28s</Text>
          <View accessibilityRole="progressbar" accessibilityLabel="Microphone level, not recognition confidence" accessibilityValue={{ min: 0, max: 100, now: level.percent }} style={[styles.meter, { backgroundColor: colors.borderPrimary }]}>
            <View style={{ width: `${level.percent}%`, height: '100%', backgroundColor: colors.accentBlue }} />
          </View>
          <Text style={[styles.caption, textStyle]}>{level.message}</Text>
          <Text style={[styles.caption, { color: colors.textSecondary }]}>This shows sound level, not whether words were understood. Speak after “Listening now”; finish before 28 seconds. No automatic silence cut-off.</Text>
        </View>}
        {answer && <View style={[styles.card, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.heading, textStyle]}>{answer.title}</Text>
          <Text accessibilityLiveRegion="polite" style={[styles.answer, textStyle]}>{answer.text}</Text>
          {pendingIntent.current && ['read_item', 'summary', 'low_stock', 'out_of_stock'].includes(pendingIntent.current.intent) && <Text style={[styles.caption, { color: colors.textSecondary }]}>{answer.stale ? 'LAST KNOWN — offline or refresh unavailable' : 'Last successful refresh'} · {new Date(answer.timestamp).toLocaleString()}</Text>}
          {answer.choices.map(item => <View key={item.id}>{button(item.name + ' · ' + item.unit + ' · ' + item.id.slice(-6), () => {
            const intent = pendingIntent.current || command('clarify');
            previousItem.current = item.id;
            void ask(answeredQuestion.current, { ...intent, reference: 'previous', item_query: null });
          }, !!busy || microphoneBusy)}</View>)}
          {answer.items.map(item => <View key={item.id} style={[styles.item, { borderColor: colors.borderPrimary }]}>
            <Text style={[styles.label, textStyle]}>{item.name}</Text><Text style={[styles.body, textStyle]}>{Number.isFinite(item.quantity) ? `${item.quantity} ${item.unit || 'units'}` : 'Quantity not available'}</Text>
            <Text style={[styles.caption, { color: colors.textSecondary }]}>Supplier: {item.supplierName?.trim() || 'Not recorded'}</Text>
          </View>)}
          {button('Refresh this answer', () => { void ask(answeredQuestion.current, pendingIntent.current, true); }, !!busy || microphoneBusy)}
        </View>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  content: { padding: 20, gap: 18, paddingBottom: 50 }, heading: { fontSize: 24, fontWeight: '700' }, body: { fontSize: 16, lineHeight: 24 },
  caption: { fontSize: 14, lineHeight: 21 }, label: { fontSize: 17, fontWeight: '600' }, answer: { fontSize: 21, lineHeight: 31 },
  card: { padding: 20, borderRadius: 20, gap: 16 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, input: { minHeight: 110, borderWidth: 1, borderRadius: 14, padding: 16, fontSize: 18, textAlignVertical: 'top' },
  button: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' }, item: { paddingVertical: 12, borderTopWidth: 1, gap: 5 },
  meter: { height: 10, borderRadius: 5, overflow: 'hidden' },
});
