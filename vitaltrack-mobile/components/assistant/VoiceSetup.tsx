import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import type { Capabilities } from '@/services/assistant';
import type { AlbaVoice, KokoroVoice, OfflineFallbackVoice, Preferences } from '@/features/assistant/preferences';
import { commandExamples } from '@/features/assistant/core';
import { kokoroSpeechNotice, offlineSpeechNotice, pocketSpeechNotice, whistleSpeechNotice } from '@/features/assistant/notices';
import type { KokoroVoiceStatus, PocketPlacementName, PocketVoiceStatus, WhistleStatus } from '@/features/assistant/offlineVoice';
import { fallbackVoiceLabel } from '@/features/assistant/narration';
import { ALBA_SELECTION_ENABLED, SARVAM_SPEECH_ENABLED } from '@/features/assistant/policy';
import { choicesFrom, inUse, interpreters, listeners, READINESS_LABEL, speakers, type InterpreterId, type ListenerId, type Provider, type Readiness, type ServerStatus } from '@/features/assistant/providers';

type Props = {
  prefs: Preferences; loaded: boolean; supported: boolean; busy: string;
  model: { ready: boolean; bytes: number }; modelChecked: boolean; progress: number;
  deviceVoice: { ready: boolean; name: string; checked?: boolean };
  alba: PocketVoiceStatus; albaChecked: boolean; albaProgress: number;
  /** A pack download in progress; it continues while the screen is locked and has its own Cancel. */
  downloading: 'speech' | 'alba' | 'kokoro' | 'whistle' | null;
  whistle?: WhistleStatus; whistleChecked?: boolean; whistleProgress?: number; manageWhistle?: () => void;
  chooseAlbaVoice: (voice: AlbaVoice) => void;
  /** Kokoro test voice, diagnostics builds only; undefined = not offered. */
  kokoro?: KokoroVoiceStatus; kokoroChecked: boolean; kokoroProgress: number;
  manageKokoro: () => void; chooseKokoroVoice: (voice: KokoroVoice) => void; runKokoroDiagnostic: (play: boolean) => void;
  /** Server capabilities and consented scopes; readiness is derived from these, never stored. */
  caps: Capabilities;
  /** Whether the capability request itself succeeded, is running or failed. */
  server: ServerStatus;
  manageAlba: () => void; cancelSetup: () => void; exportLicences: () => void;
  update: (next: Preferences) => void; enableMicrophone: () => void;
  manageModel: () => void; previewVoice: () => void; recheck: () => void;
  openAssistant: () => void;
  /** Online choices show their consent disclosure first; offline choices save directly. */
  chooseListening: (id: ListenerId) => void; chooseUnderstanding: (id: InterpreterId) => void; withdrawCloud: () => void;
  selectSarvam: () => void;
  sarvamKeyControls?: ReactNode;
  speechStatus: string; stopSpeech: () => void;
  outputCheckSupported: boolean; checkAudioOutput: () => void;
  speechFeedback: { message: string; details: string; failed: boolean } | null;
  /** Previews then saves the offline voice used only when online speech fails; null turns it off. */
  chooseFallback: (voice: OfflineFallbackVoice | null) => void;
  diagnosticsEnabled: boolean; runAlbaDiagnostic: (play: boolean, placement: PocketPlacementName) => void;
};

export function VoiceButton({ label, onPress, disabled = false, secondary = false }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  const { colors } = useTheme();
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, { backgroundColor: secondary ? colors.accentBlueBg : colors.accentBlue, opacity: disabled ? 0.45 : 1 }]}>
    <Text style={{ color: secondary ? colors.accentBlue : colors.white, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>{({ 'Only low stock': 'Low stock', 'Only out of stock': 'Out of stock', 'Sort alphabetically': 'A–Z', 'Ask another question': 'Another question' } as Record<string, string>)[label] || label}</Text>
  </TouchableOpacity>;
}

/** Three independent stages: Listening, Understanding and Spoken replies. Each shows what is chosen and whether it can run now. */
export default function VoiceSetup(p: Props) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const compactProviders = width < 380 || fontScale > 1.15;
  const [help, setHelp] = useState(false);
  const [licence, setLicence] = useState(false);
  const [audioDetails, setAudioDetails] = useState(false);
  const [choosingFallback, setChoosingFallback] = useState(false);
  const locked = !!p.busy || !!p.downloading || !!p.speechStatus || !p.loaded;
  const albaVoices = p.alba.readyVoices ?? (p.alba.ready ? ['alba'] : []);
  const albaInstalled = albaVoices.length > 0;
  const albaReady = albaVoices.includes(p.prefs.albaVoice ?? 'alba');
  const kokoroVoice = p.prefs.kokoroVoice ?? 'af_heart';
  const kokoroInstalled = (p.kokoro?.readyVoices.length ?? 0) > 0;
  const env = { supported: p.supported, model: { checked: p.modelChecked, ready: p.model.ready }, deviceVoice: p.deviceVoice,
    alba: { checked: p.albaChecked, ready: albaReady, supported: p.alba.supported },
    kokoro: p.kokoro && { checked: p.kokoroChecked, ready: p.kokoro.readyVoices.includes(kokoroVoice), supported: p.kokoro.supported },
    whistle: p.whistle && { ...p.whistle, checked: p.whistleChecked === true },
    caps: p.caps, server: p.server };
  const choices = choicesFrom(p.prefs);
  const listening = listeners(env), understanding = interpreters(env), speaking = speakers(env, p.prefs);
  const heard = inUse(choices.listening, listening), understood = inUse(choices.understanding, understanding), spoken = inUse(choices.speaking, speaking);
  const find = <Id extends string>(list: Provider<Id>[], id: Id) => list.find(provider => provider.id === id);
  const ready = p.loaded && p.supported && heard.ready && p.prefs.enabled && p.prefs.microphone;
  const body = { color: colors.textSecondary, fontSize: 14, lineHeight: 21 };
  const card = [styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }];
  const tone = (readiness: Readiness) => readiness === 'ready' ? colors.statusGreen : readiness === 'checking' ? colors.textSecondary : readiness === 'paused' || readiness === 'unavailable' ? colors.textTertiary : colors.statusOrange;
  const step = (number: string, title: string, complete: boolean, optional = false) => <View style={styles.row}>
    <View style={[styles.step, { backgroundColor: complete ? colors.statusGreenBg : colors.accentBlueBg }]}>
      {complete ? <Ionicons name="checkmark" size={19} color={colors.statusGreen} /> : <Text style={{ color: colors.accentBlue, fontWeight: '700' }}>{number}</Text>}
    </View><Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary, flex: 1 }]}>{title}</Text>
    {optional && <Text style={[styles.optional, { color: colors.textSecondary }]}>Optional</Text>}
  </View>;
  // The saved choice and whether it can run now. A blocked choice says why; nothing is swapped silently.
  const selected = (label: string, state: { ready: boolean; reason: string }, configuredOnly = false) => <Text accessibilityLiveRegion="polite" style={[body, { color: state.ready ? colors.textSecondary : colors.statusOrange }]}>
    Selected: {label}{state.ready ? configuredOnly ? ' · Configured · preview to verify' : ' · Ready' : ` · ${state.reason}`}</Text>;
  const readinessText = (provider: Provider<string>) => provider.id === 'sarvam' && provider.readiness === 'ready' ? 'Configured' : READINESS_LABEL[provider.readiness];
  const row = (provider: Provider<string> | undefined, chosen: boolean, actions?: ReactNode) => provider && <View key={provider.id}
    style={[styles.provider, { borderColor: chosen ? colors.accentBlue : colors.borderPrimary }]}>
    <View accessible accessibilityLabel={`${provider.label}. ${chosen ? 'Selected. ' : ''}${readinessText(provider)}. ${provider.detail}`} style={styles.row}>
      <Ionicons name={provider.online ? 'cloud-outline' : 'phone-portrait-outline'} size={18} color={colors.textSecondary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>{provider.label}</Text>
        <Text style={body}>{provider.detail}</Text>
      </View>
      {!compactProviders && <Text style={[styles.chip, { color: tone(provider.readiness) }]}>{chosen ? 'Selected · ' : ''}{readinessText(provider)}</Text>}
    </View>
    {compactProviders && <Text importantForAccessibility="no" style={[styles.chip, { color: tone(provider.readiness), maxWidth: '100%', textAlign: 'left' }]}>{chosen ? 'Selected · ' : ''}{readinessText(provider)}</Text>}
    {actions}
  </View>;
  const toggle = (title: string, description: string, value: boolean, onValueChange: (v: boolean) => void, disabled = false) =>
    <View style={styles.row}><View style={{ flex: 1, gap: 4 }}><Text style={[styles.label, { color: colors.textPrimary }]}>{title}</Text><Text style={body}>{description}</Text></View>
      <Switch accessibilityLabel={title} value={value} onValueChange={onValueChange} disabled={locked || disabled} trackColor={{ true: colors.accentBlue }} /></View>;
  const groqListener = find(listening, 'groq'), groqInterpreter = find(understanding, 'groq'), sarvam = find(speaking, 'sarvam');
  const paceControl = (note?: string) => <View style={{ gap: 8 }}>
    <Text style={body}>Speaking pace · {(p.prefs.speechPace ?? 1) === 0.9 ? 'Relaxed' : (p.prefs.speechPace ?? 1) === 1.1 ? 'Brisk' : 'Natural'}{note ? `. ${note}` : ''}</Text>
    <View style={styles.paceRow}>{([['Relaxed', 0.9], ['Natural', 1], ['Brisk', 1.1]] as const).map(([label, pace]) => <View key={label} style={styles.paceOption}>
      <VoiceButton label={`${label} pace`} secondary disabled={locked || (p.prefs.speechPace ?? 1) === pace} onPress={() => p.update({ ...p.prefs, speechPace: pace })} /></View>)}</View>
  </View>;
  const downloadProgress = (label: string, percent: number, cancelLabel: string) => <View style={{ gap: 8 }}>
    <View style={styles.row}><ActivityIndicator color={colors.accentBlue} /><Text accessibilityLiveRegion="polite" style={[body, { flex: 1 }]}>{label} {percent > 0 ? `${percent}%` : ''}</Text></View>
    <View style={[styles.progress, { backgroundColor: colors.borderPrimary }]}><View style={{ height: 5, width: `${percent}%`, backgroundColor: colors.accentBlue }} /></View>
    <Text style={body}>Locking the screen does not stop the download; finished parts are kept if it is interrupted.</Text>
    <VoiceButton label={cancelLabel} secondary onPress={p.cancelSetup} />
  </View>;
  const fallbackReady = p.prefs.speechFallback === 'device' ? p.deviceVoice.ready : p.prefs.speechFallback === 'pocket' ? ALBA_SELECTION_ENABLED && albaReady : true;
  const blocked = (provider?: Provider<string>) => provider?.readiness === 'unavailable' || provider?.readiness === 'checking';
  return <>
    <View style={styles.hero}>
      <View style={styles.row}><View style={[styles.step, { backgroundColor: colors.accentBlueBg }]}><Ionicons name="mic-outline" size={21} color={colors.accentBlue} /></View>
        <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Voice, ready when you are.</Text></View>
      <Text style={body}>Choose how you are heard, how requests are understood and how answers are spoken. Each choice works on its own; you review your words before sending.</Text>
      <View style={[styles.badge, { backgroundColor: ready ? colors.statusGreenBg : colors.accentBlueBg }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ready ? colors.statusGreen : colors.accentBlue }} /><Text style={{ color: colors.textSecondary, fontSize: 12 }}>{ready ? 'Ready to talk' : 'Complete setup below'} · English</Text></View>
    </View>
    <View style={card}>
      <View style={styles.row}><Ionicons name="sparkles-outline" size={20} color={colors.accentBlue} /><Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary, flex: 1 }]}>Assistant</Text></View>
      {toggle('Assistant', 'Read inventory and prepare unsaved order drafts. Only a touch confirmation saves an order.', p.prefs.enabled, v => p.update({ ...p.prefs, enabled: v }))}
      {(!p.prefs.enabled || !p.prefs.microphone) && <VoiceButton label="Enable assistant & microphone" onPress={p.enableMicrophone} disabled={locked || !p.supported} />}
      {p.server.state === 'failed' && <View style={{ gap: 8 }}>
        <Text accessibilityRole="alert" style={[body, { color: colors.statusOrange }]}>Online services could not be checked{p.server.reason ? ` (${p.server.reason})` : ''}. Offline listening, on-phone understanding and the device voice still work.</Text>
        <VoiceButton label="Recheck online services" secondary onPress={p.recheck} disabled={locked} />
      </View>}
    </View>
    <View style={card}>
      {step('1', 'Listening · speech to text', p.supported && heard.ready && p.prefs.microphone)}
      {toggle('Microphone', 'Tap the glowing microphone to stop and review your words.', p.prefs.microphone, v => { if (v) p.enableMicrophone(); else p.update({ ...p.prefs, microphone: false }); }, !p.supported)}
      <Text style={body}>Allow microphone access when Android asks. If recording is silent, check Android’s microphone privacy switch and close other recording apps.</Text>
      {selected(find(listening, choices.listening)?.label || 'Offline', heard)}
      {row(find(listening, 'offline'), choices.listening === 'offline', <>
        <Text style={body}>{!p.supported ? '' : p.model.ready ? 'English speech pack downloaded and verified.' : `${p.model.bytes ? Math.ceil(p.model.bytes / 1_000_000) + ' MB' : 'Up to 300 MB'} · Wi-Fi recommended.`}{choices.listening === 'groq' && p.model.ready ? ' It also shows live words while Groq makes the final transcript.' : ''}</Text>
        {p.downloading === 'speech' && downloadProgress('Downloading and verifying the speech pack…', p.progress, 'Cancel speech download')}
        <VoiceButton label={p.model.ready ? 'Remove speech pack' : 'Download speech pack'} secondary={p.model.ready} onPress={p.manageModel} disabled={locked || !p.supported || !p.modelChecked} />
        {listening.length > 1 && <VoiceButton label="Use offline listening" secondary onPress={() => p.chooseListening('offline')} disabled={locked || choices.listening === 'offline'} />}
      </>)}
      {p.whistle && row(find(listening, 'whistle'), choices.listening === 'whistle', <>
        <Text style={body}>English only in CareKosh. This experiment does not support Hindi or Hinglish. Transcription starts after you stop recording; there are no live words. Audio stays on this phone, telemetry is disabled, and no online listener is used instead.</Text>
        <Text style={body}>{p.whistle.ready ? 'Whistle files downloaded and verified.' : `${p.whistle.bytes ? Math.ceil(p.whistle.bytes / 1_000_000) + ' MB' : 'Whistle model'} · download once over Wi-Fi.`} Listening does not change understanding or the answer voice.</Text>
        {p.downloading === 'whistle' && downloadProgress('Downloading and verifying Whistle…', p.whistleProgress ?? 0, 'Cancel Whistle download')}
        <VoiceButton label={p.whistle.ready ? 'Remove Whistle listener' : 'Download Whistle listener'} secondary onPress={() => p.manageWhistle?.()}
          disabled={locked || !p.whistle.supported || !p.whistle.telemetryDisabled || !p.whistleChecked} />
        <VoiceButton label="Use Whistle offline listening" secondary onPress={() => p.chooseListening('whistle')}
          disabled={locked || !p.whistle.ready || !p.whistle.telemetryDisabled || choices.listening === 'whistle'} />
      </>)}
      {row(groqListener, choices.listening === 'groq', <VoiceButton label="Enable Groq online listening" secondary onPress={() => p.chooseListening('groq')}
        disabled={locked || blocked(groqListener) || choices.listening === 'groq' && heard.ready} />)}
    </View>
    <View style={card}>
      {step('2', 'Understanding · text to task', understood.ready, true)}
      <Text style={body}>Requests are understood on this phone first. Online understanding is used only for wording the phone cannot follow, after you tap Send. Either way, stock changes and order saving are not possible by voice.</Text>
      {selected(choices.understanding === 'groq' ? 'On this phone, then Groq online' : 'On this phone only', understood)}
      {row(find(understanding, 'local'), choices.understanding === 'local', groqInterpreter && <VoiceButton label="Use on-phone understanding only" secondary onPress={() => p.chooseUnderstanding('local')} disabled={locked || choices.understanding === 'local'} />)}
      {row(groqInterpreter, choices.understanding === 'groq', <VoiceButton label="Enable Groq understanding" secondary onPress={() => p.chooseUnderstanding('groq')}
        disabled={locked || blocked(groqInterpreter) || choices.understanding === 'groq' && understood.ready} />)}
      {(groqListener || groqInterpreter || sarvam) && <View style={[styles.divider, { borderTopColor: colors.borderPrimary }]}>
        <VoiceButton label="Withdraw all cloud consent" secondary onPress={p.withdrawCloud} disabled={locked} />
        <Text style={[styles.caption, { color: colors.textSecondary }]}>Withdrawal turns off online understanding, online listening and Sarvam speech for this account. Device voice and on-phone understanding remain.</Text>
      </View>}
    </View>
    <View style={card}>
      {step('3', 'Spoken replies', p.prefs.spokenReplies && spoken.ready, true)}
      {toggle('Read answers aloud', 'Optional. Preview voice and Hear answer also work when automatic reading is off.', p.prefs.spokenReplies, v => p.update({ ...p.prefs, spokenReplies: v }), !spoken.ready && !p.prefs.spokenReplies)}
      {selected(find(speaking, choices.speaking)?.label || 'Device voice', spoken, choices.speaking === 'sarvam')}
      {row(find(speaking, 'device'), choices.speaking === 'device', <>
        <Text style={body}>{p.deviceVoice.checked === false ? 'Checking Android text-to-speech…' : p.deviceVoice.ready ? `Available · ${p.deviceVoice.name}` : 'An English device voice is unavailable on this phone.'}</Text>
        <VoiceButton label="Use device voice" secondary onPress={() => p.update({ ...p.prefs, speechProvider: 'device' })} disabled={locked || !p.deviceVoice.ready || choices.speaking === 'device'} />
      </>)}
      {row(find(speaking, 'pocket'), choices.speaking === 'pocket', ALBA_SELECTION_ENABLED ? <>
        {p.downloading === 'alba' && downloadProgress('Downloading and verifying Alba…', p.albaProgress, 'Cancel Alba download')}
        <VoiceButton label={albaInstalled ? 'Remove Alba voice pack' : 'Download Alba voice pack'} secondary onPress={p.manageAlba} disabled={locked || !p.alba.supported || !p.albaChecked} />
        <VoiceButton label="Use Alba voice" secondary onPress={() => p.update({ ...p.prefs, speechProvider: 'pocket' })} disabled={locked || !albaReady} />
        {albaInstalled && (p.alba.voices?.length ?? 0) > 1 && <View style={{ gap: 8 }}>
          <Text style={body}>Voice · {p.alba.voices?.find(v => v.id === (p.prefs.albaVoice ?? 'alba'))?.label ?? 'Alba'}. Other voices download 3–6 MB once; use Preview voice to compare.</Text>
          <View style={styles.paceRow}>{p.alba.voices?.map(v => <View key={v.id} style={styles.paceOption}>
            <VoiceButton label={`${v.label} voice`} secondary onPress={() => p.chooseAlbaVoice(v.id as AlbaVoice)}
              disabled={locked || (p.prefs.albaVoice ?? 'alba') === v.id && choices.speaking === 'pocket'} />
          </View>)}</View>
        </View>}
        {choices.speaking === 'pocket' && paceControl('Alba changes the pauses between sentences, not the speed of the voice.')}
      </> : <>
        <Text style={body}>Selection and new downloads are disabled while its Android speech problem is investigated. Previous Alba selections use device voice. Microphone listening is unchanged.</Text>
        {p.albaChecked && albaInstalled && <VoiceButton label="Remove Alba voice pack" secondary onPress={p.manageAlba} disabled={locked} />}
      </>)}
      {p.kokoro && row(find(speaking, 'kokoro_offline'), choices.speaking === 'kokoro_offline', <>
        <Text style={body}>A calmer offline voice to compare with Alba: Kokoro-82M, generated inside CareKosh. Test build only; it is not offered in the released app.</Text>
        {p.downloading === 'kokoro' && downloadProgress('Downloading and verifying Kokoro…', p.kokoroProgress, 'Cancel Kokoro download')}
        <VoiceButton label={kokoroInstalled ? 'Remove Kokoro test voice' : 'Download Kokoro test voice'} secondary onPress={p.manageKokoro} disabled={locked || !p.kokoro.supported || !p.kokoroChecked} />
        <VoiceButton label="Use Kokoro voice" secondary onPress={() => p.update({ ...p.prefs, speechProvider: 'kokoro_offline' })}
          disabled={locked || !p.kokoro.readyVoices.includes(kokoroVoice) || choices.speaking === 'kokoro_offline'} />
        {kokoroInstalled && p.kokoro.voices.length > 1 && <View style={{ gap: 8 }}>
          <Text style={body}>Kokoro voice · {p.kokoro.voices.find(v => v.id === kokoroVoice)?.label ?? 'Heart'}. Other voices download about 0.5 MB once; use Preview voice to compare.</Text>
          <View style={styles.paceRow}>{p.kokoro.voices.map(v => <View key={v.id} style={styles.paceOption}>
            <VoiceButton label={`Kokoro ${v.label}`} secondary onPress={() => p.chooseKokoroVoice(v.id as KokoroVoice)}
              disabled={locked || kokoroVoice === v.id && choices.speaking === 'kokoro_offline'} />
          </View>)}</View>
        </View>}
        {choices.speaking === 'kokoro_offline' && paceControl('Kokoro changes its speaking speed.')}
      </>)}
      {SARVAM_SPEECH_ENABLED && row(sarvam, choices.speaking === 'sarvam', <>
        <Text style={body}>Natural English speech over the internet. Only the short answer text is sent. API credits are required; listening and understanding keep their own settings.</Text>
        <VoiceButton label="Use Sarvam English voice" secondary onPress={p.selectSarvam} disabled={locked || blocked(sarvam) || sarvam?.readiness === 'needs_key' || choices.speaking === 'sarvam' && spoken.ready} />
        {p.sarvamKeyControls}
        {choices.speaking === 'sarvam' && paceControl()}
        {choices.speaking === 'sarvam' && <View style={[styles.divider, { borderTopColor: colors.borderPrimary }]}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>If Sarvam is unavailable</Text>
          {/* The switch shows only the saved choice; choosing a voice is a separate, previewed step. */}
          {p.prefs.speechFallback ? <>
            {toggle('Use an offline voice when online speech is unavailable', `On · ${fallbackVoiceLabel(p.prefs.speechFallback)}. Used only after a Sarvam failure, before any Sarvam audio played. It reads the same answer once on this phone and never retries Sarvam or switches billing.`,
              true, v => { if (!v) { setChoosingFallback(false); p.chooseFallback(null); } })}
            {!fallbackReady && <Text accessibilityLiveRegion="polite" style={[body, { color: colors.statusOrange }]}>{p.prefs.speechFallback === 'pocket'
              ? 'Alba is not downloaded on this phone, so nothing will be read after a Sarvam failure. Download Alba or choose the device voice.'
              : 'No English device voice is installed, so nothing will be read after a Sarvam failure. Install one in Android Text-to-speech settings.'}</Text>}
          </> : <>
            <Text style={body}>Off · a failed Sarvam reply keeps the answer on screen without speaking it.</Text>
            <VoiceButton label={choosingFallback ? 'Hide offline fallback choices' : 'Choose an offline fallback voice'} secondary onPress={() => setChoosingFallback(!choosingFallback)} disabled={locked} />
          </>}
          {choosingFallback && !p.prefs.speechFallback && <View style={{ gap: 8 }}>
            <Text style={body}>Choose a voice. It is previewed first and saved only if the preview plays.</Text>
            <VoiceButton label="Preview & use device voice" secondary disabled={locked || !p.deviceVoice.ready} onPress={() => p.chooseFallback('device')} />
            {ALBA_SELECTION_ENABLED && <VoiceButton label="Preview & use Alba" secondary disabled={locked || !albaReady} onPress={() => p.chooseFallback('pocket')} />}
            {!p.deviceVoice.ready && !(ALBA_SELECTION_ENABLED && albaReady) && <Text style={body}>No offline voice is ready on this phone, so the fallback cannot be turned on.</Text>}
          </View>}
        </View>}
      </>)}
      <VoiceButton label="Preview voice" secondary onPress={p.previewVoice} disabled={locked || !spoken.ready} />
      {!!p.speechStatus && <><Text accessibilityLiveRegion="polite" style={body}>{p.speechStatus}</Text><VoiceButton label="Stop voice preview" secondary onPress={p.stopSpeech} /></>}
      {p.speechFeedback && <View style={{ gap: 8 }}>
        <Text selectable accessibilityLiveRegion="polite" style={[body, p.speechFeedback.failed && { color: colors.statusRed }]}>{p.speechFeedback.message}</Text>
        {!!p.speechFeedback.details && <><TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: audioDetails }}
          onPress={() => setAudioDetails(!audioDetails)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.accentBlue, fontSize: 14 }}>Audio check details {audioDetails ? '−' : '+'}</Text></TouchableOpacity>
          {audioDetails && <Text selectable style={[body, { fontSize: 12 }]}>{p.speechFeedback.details}</Text>}</>}
      </View>}
      {p.outputCheckSupported && <><VoiceButton label="Check audio output" secondary onPress={p.checkAudioOutput} disabled={locked} />
        <Text style={body}>Plays a short native test tone to check media volume and the phone’s audio route. Sarvam uses a separate audio player; this tone does not test its API or generated speech.</Text></>}
    </View>
    {p.diagnosticsEnabled && <View style={card}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>Offline voice diagnostics · test build</Text>
      <Text style={body}>Device testing only. Run the steps in order and note what you hear. Results appear under “Audio check details” above; they contain timings, counts and levels, never answer text or inventory, and nothing is uploaded.</Text>
      <VoiceButton label="1 · Play native test tone" secondary onPress={p.checkAudioOutput} disabled={locked || !p.outputCheckSupported} />
      <VoiceButton label="2 · Generate Alba without playing" secondary onPress={() => p.runAlbaDiagnostic(false, 'default')} disabled={locked || !albaReady} />
      <VoiceButton label="3 · Generate and play Alba" secondary onPress={() => p.runAlbaDiagnostic(true, 'default')} disabled={locked || !albaReady} />
      <Text style={body}>Experiments (compare with step 3): the language model on the graphics processor, or the audio decoder at full FP32 precision.</Text>
      <VoiceButton label="Experiment · language model on GPU" secondary onPress={() => p.runAlbaDiagnostic(true, 'lm_gpu')} disabled={locked || !albaReady} />
      <VoiceButton label="Experiment · FP32 audio decoder" secondary onPress={() => p.runAlbaDiagnostic(true, 'vocoder_fp32')} disabled={locked || !albaReady} />
      {p.kokoro && <>
        <Text style={body}>Kokoro test voice (download it under Spoken replies first): note the time to first audio and the real-time factor in the details.</Text>
        <VoiceButton label="Generate Kokoro without playing" secondary onPress={() => p.runKokoroDiagnostic(false)} disabled={locked || !p.kokoro.readyVoices.includes(kokoroVoice)} />
        <VoiceButton label="Generate and play Kokoro" secondary onPress={() => p.runKokoroDiagnostic(true)} disabled={locked || !p.kokoro.readyVoices.includes(kokoroVoice)} />
      </>}
    </View>}
    <VoiceButton label={ready ? 'Practice a command here' : 'Try a typed question here'} onPress={p.openAssistant} disabled={locked || !p.prefs.enabled} />
    <View style={card}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="How voice works" accessibilityState={{ expanded: help }} onPress={() => setHelp(!help)} style={[styles.row, { minHeight: 44 }]}>
        <Text style={[styles.title, { color: colors.textPrimary, flex: 1 }]}>How it works</Text><Ionicons name={help ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
      </TouchableOpacity>
      {help && <>

      <Text style={body}>1. Tap the microphone on a main screen; stay there.{ '\n' }Live words appear beside it when the speech pack is ready.{ '\n' }Check or edit your words, then tap the send arrow.</Text>
      <Text style={body}>Tables and order drafts stay open until you dismiss them. Brief answers close 10 seconds after a spoken reply finishes; choose “Keep open” to read longer. If an item name is unclear, choose the correct item first.</Text>
      <Text style={body}>The assistant can prepare unsaved drafts. It cannot change stock, save orders by voice, or send purchases. Unsaved drafts clear on logout or app restart. Offline answers use stock synced during this login and are marked “Last known”.</Text>
      <Text style={body}>Ask about current quantities, suppliers, brands, stock status or a stock summary. Combine stock states, quantity comparisons (less than, at most, exactly, more than), critical equipment, category, supplier and brand, add “excluding …” and “sorted …”, then follow up with “only the critical ones” or “create a draft from those”. Every answer shows the filters it applied and why each row is listed. Historical trends, forecasts and arbitrary calculations are not supported.</Text>
      <Text style={body}>Try: “Two units of Ambu Bag, plus the other low-stock and out-of-stock items; prepare an order draft.” Saying “saved draft” still prepares an unsaved local draft. Review quantities and use touch to save.</Text>
      {commandExamples.map(example => <Text key={example} style={body}>• {example}</Text>)}
      <Text style={body}>Preferences belong to this account. Reinstalling or clearing app data requires setup again.</Text></>}
    </View>
    <VoiceButton label="Recheck voice & online understanding" secondary onPress={p.recheck} disabled={locked} />
    <VoiceButton label={licence ? 'Hide speech licence' : 'Offline speech licence'} secondary onPress={() => setLicence(!licence)} />
    {licence && <><Text selectable style={body}>{offlineSpeechNotice}{'\n\n'}{pocketSpeechNotice}{p.kokoro ? `\n\n${kokoroSpeechNotice}` : ''}{p.whistle ? `\n\n${whistleSpeechNotice}` : ''}</Text><VoiceButton label={p.whistle ? 'Export complete offline voice notices' : 'Export complete Alba licence notices'} secondary onPress={p.exportLicences} disabled={locked || !p.alba.supported} /></>}
  </>;
}

const styles = StyleSheet.create({
  hero: { paddingVertical: 8, gap: 12 }, heroTitle: { fontSize: 22, lineHeight: 28, fontWeight: '600', flex: 1 }, badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', gap: 7, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  provider: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  chip: { fontSize: 12, fontWeight: '600', maxWidth: 120, textAlign: 'right' },
  title: { fontSize: 16, fontWeight: '600', flexShrink: 1 }, label: { fontSize: 16, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 20 },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, justifyContent: 'center' },
  progress: { height: 5, overflow: 'hidden', borderRadius: 5 },
  optional: { fontSize: 12, flexShrink: 1 }, divider: { borderTopWidth: 1, paddingTop: 16, gap: 12 },
  paceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, paceOption: { flexGrow: 1, flexBasis: 90 },
});
