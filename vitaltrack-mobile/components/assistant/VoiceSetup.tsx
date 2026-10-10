import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import type { Preferences } from '@/features/assistant/preferences';
import { commandExamples } from '@/features/assistant/core';
import { offlineSpeechNotice, pocketSpeechNotice } from '@/features/assistant/notices';
import type { PocketVoiceStatus } from '@/features/assistant/offlineVoice';

type Props = {
  prefs: Preferences; loaded: boolean; supported: boolean; busy: string;
  model: { ready: boolean; bytes: number }; modelChecked: boolean; progress: number;
  deviceVoice: { ready: boolean; name: string };
  alba: PocketVoiceStatus; albaChecked: boolean; albaProgress: number;
  manageAlba: () => void; cancelSetup: () => void; exportLicences: () => void;
  update: (next: Preferences) => void; enableMicrophone: () => void;
  manageModel: () => void; previewVoice: () => void; recheck: () => void;
  openAssistant: () => void; listeningControls?: ReactNode; cloudControls?: ReactNode; understandingReady?: boolean;
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

export default function VoiceSetup(p: Props) {
  const { colors } = useTheme();
  const [help, setHelp] = useState(false);
  const [licence, setLicence] = useState(false);
  const locked = !!p.busy || !p.loaded;
  const online = p.prefs.audioOptIn && p.prefs.inputProvider === 'groq';
  const ready = p.loaded && p.supported && (online || p.modelChecked && p.model.ready) && p.prefs.enabled && p.prefs.microphone;
  const selectedReady = p.prefs.speechProvider === 'pocket' ? p.alba.ready : p.deviceVoice.ready;
  const body = { color: colors.textSecondary, fontSize: 14, lineHeight: 21 };
  const card = [styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }];
  const step = (number: string, title: string, complete: boolean, optional = false) => <View style={styles.row}>
    <View style={[styles.step, { backgroundColor: complete ? colors.statusGreenBg : colors.accentBlueBg }]}>
      {complete ? <Ionicons name="checkmark" size={19} color={colors.statusGreen} /> : <Text style={{ color: colors.accentBlue, fontWeight: '700' }}>{number}</Text>}
    </View><Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary, flex: 1 }]}>{title}</Text>
    {optional && <Text style={[styles.optional, { color: colors.textSecondary }]}>Optional</Text>}
  </View>;
  const toggle = (title: string, description: string, value: boolean, onValueChange: (v: boolean) => void, disabled = false) =>
    <View style={styles.row}><View style={{ flex: 1, gap: 4 }}><Text style={[styles.label, { color: colors.textPrimary }]}>{title}</Text><Text style={body}>{description}</Text></View>
      <Switch accessibilityLabel={title} value={value} onValueChange={onValueChange} disabled={locked || disabled} trackColor={{ true: colors.accentBlue }} /></View>;
  return <>
    <View style={styles.hero}>
      <View style={styles.row}><View style={[styles.step, { backgroundColor: colors.accentBlueBg }]}><Ionicons name="mic-outline" size={21} color={colors.accentBlue} /></View>
        <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Voice, ready when you are.</Text></View>
      <Text style={body}>Set up listening, choose how requests are understood, then pick a speaking voice. You review your words before sending.</Text>
      <View style={[styles.badge, { backgroundColor: ready ? colors.statusGreenBg : colors.accentBlueBg }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ready ? colors.statusGreen : colors.accentBlue }} /><Text style={{ color: colors.textSecondary, fontSize: 12 }}>{ready ? 'Ready to talk' : 'Complete setup below'} · English</Text></View>
    </View>
    <View style={card}>
      {step('1', 'Tap to talk', p.prefs.enabled && p.prefs.microphone)}
      {toggle('Assistant', 'Read inventory and prepare unsaved order drafts. Only a touch confirmation saves an order.', p.prefs.enabled, v => p.update({ ...p.prefs, enabled: v }))}
      {toggle('Microphone', 'Tap the glowing microphone to stop and review your words.', p.prefs.microphone, v => { if (v) p.enableMicrophone(); else p.update({ ...p.prefs, microphone: false }); }, !p.supported)}
      {(!p.prefs.enabled || !p.prefs.microphone) && <VoiceButton label="Enable assistant & microphone" onPress={p.enableMicrophone} disabled={locked || !p.supported} />}
      <Text style={body}>Allow microphone access when Android asks. If recording is silent, check Android’s microphone privacy switch and close other recording apps.</Text>
    </View>
    <View style={card}>
      {step('2', 'Listening · speech to text', p.supported && (online || p.model.ready))}
      <Text style={[styles.label, { color: colors.textPrimary }]}>Offline English speech pack</Text>
      <Text style={body}>{!p.supported ? 'Recording is available in the Android APK. Expo Go, web and iOS can still use typed questions.' : online ? 'Groq is selected for the final transcript. This pack adds live words while speaking and lets you switch to offline listening.' : !p.modelChecked ? 'Checking the speech pack on this phone…' : p.model.ready ? 'Downloaded and verified. Moonshine recognizes your speech on this phone and supplies live words.' : `Download once for offline listening. ${p.model.bytes ? Math.ceil(p.model.bytes / 1_000_000) + ' MB' : 'Up to 300 MB'} · Wi-Fi recommended.`}</Text>
      {p.busy.includes('speech pack') && <View style={{ gap: 8 }}><View style={styles.row}><ActivityIndicator color={colors.accentBlue} /><Text style={[body, { flex: 1 }]}>{p.busy} {p.progress > 0 ? `${p.progress}%` : ''}</Text></View><View style={[styles.progress, { backgroundColor: colors.borderPrimary }]}><View style={{ height: 5, width: `${p.progress}%`, backgroundColor: colors.accentBlue }} /></View><VoiceButton label="Cancel speech download" secondary onPress={p.cancelSetup} /></View>}
      <VoiceButton label={p.model.ready ? 'Remove speech pack' : 'Download speech pack'} secondary={p.model.ready} onPress={p.manageModel} disabled={locked || !p.supported || !p.modelChecked} />
      {p.listeningControls && <View style={[styles.divider, { borderTopColor: colors.borderPrimary }]}>{p.listeningControls}</View>}
    </View>
    {p.cloudControls && <View style={card}>
      {step('3', 'Understanding · text to task', !!p.understandingReady, true)}
      {p.cloudControls}
    </View>}
    <View style={card}>
      {step(p.cloudControls ? '4' : '3', 'Spoken replies', p.prefs.spokenReplies && selectedReady, true)}
      <View style={styles.row}><View style={[styles.step, { backgroundColor: colors.accentBlueBg }]}><Ionicons name="volume-medium-outline" size={20} color={colors.accentBlue} /></View><View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.textPrimary }]}>Alba · English</Text><Text style={body}>Pocket TTS · generated on this phone</Text></View></View>
      <Text style={body}>{!p.alba.supported ? 'Alba needs the new Android APK and a 64-bit phone. Typed and spoken questions are unaffected.' : !p.albaChecked ? 'Checking Alba on this phone…' : p.alba.ready ? 'Downloaded and verified. No extra app or speech API is needed.' : `One download · ${p.alba.bytes ? Math.ceil(p.alba.bytes / 1_000_000) + ' MB' : 'Checking size'} · Wi-Fi recommended. No text or audio is uploaded for this voice.`}</Text>
      {p.busy.includes('Alba voice pack') && <><Text accessibilityLiveRegion="polite" style={body}>{p.busy} {p.albaProgress > 0 ? `${p.albaProgress}%` : ''}</Text><View style={[styles.progress, { backgroundColor: colors.borderPrimary }]}><View style={{ height: 5, width: `${p.albaProgress}%`, backgroundColor: colors.accentBlue }} /></View><VoiceButton label="Cancel voice download" secondary onPress={p.cancelSetup} /></>}
      <VoiceButton label={p.alba.ready ? 'Remove Alba voice pack' : 'Download Alba voice pack'} secondary={p.alba.ready} onPress={p.manageAlba} disabled={locked || !p.alba.supported || !p.albaChecked} />
      <Text style={[styles.label, { color: colors.textPrimary }]}>Selected: {p.prefs.speechProvider === 'pocket' ? 'Alba · offline' : 'Device voice'}</Text>
      <View style={{ gap: 8 }}>
        <VoiceButton label="Use Alba voice" secondary onPress={() => p.update({ ...p.prefs, speechProvider: 'pocket' })} disabled={locked || !p.alba.ready || p.prefs.speechProvider === 'pocket'} />
        <VoiceButton label="Use device voice" secondary onPress={() => p.update({ ...p.prefs, speechProvider: 'device' })} disabled={locked || !p.deviceVoice.ready || p.prefs.speechProvider === 'device'} />
      </View>
      {toggle('Read answers aloud', 'Optional. The full answer also appears on screen.', p.prefs.spokenReplies, v => p.update({ ...p.prefs, spokenReplies: v }), !selectedReady && !p.prefs.spokenReplies)}
      {p.prefs.speechProvider === 'pocket' && <View style={{ gap: 8 }}><Text style={body}>Speaking pace · {(p.prefs.speechPace ?? 1) === 0.9 ? 'Relaxed' : (p.prefs.speechPace ?? 1) === 1.1 ? 'Brisk' : 'Natural'}</Text><View style={styles.paceRow}>{([['Relaxed', 0.9], ['Natural', 1], ['Brisk', 1.1]] as const).map(([label, pace]) => <View key={label} style={styles.paceOption}><VoiceButton label={`${label} pace`} secondary disabled={locked || (p.prefs.speechPace ?? 1) === pace} onPress={() => p.update({ ...p.prefs, speechPace: pace })} /></View>)}</View></View>}
      {!selectedReady && <Text style={body}>{p.prefs.speechProvider === 'pocket' ? 'Download Alba to hear this voice, or select an available device voice.' : 'No device voice is available. Download Alba above to hear replies entirely inside CareKosh.'}</Text>}
      <VoiceButton label="Preview voice" secondary onPress={p.previewVoice} disabled={locked || !selectedReady} />
    </View>
    <VoiceButton label={ready ? 'Practice a command here' : 'Try a typed question here'} onPress={p.openAssistant} disabled={locked || !p.prefs.enabled} />
    <View style={card}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="How voice works" accessibilityState={{ expanded: help }} onPress={() => setHelp(!help)} style={[styles.row, { minHeight: 44 }]}>
        <Text style={[styles.title, { color: colors.textPrimary, flex: 1 }]}>How it works</Text><Ionicons name={help ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
      </TouchableOpacity>
      {help && <>

      <Text style={body}>1. Tap the microphone on a main screen; stay there.{ '\n' }Live words appear beside it when the speech pack is ready.{ '\n' }Check or edit your words, then tap the send arrow.</Text>
      <Text style={body}>Tables and order drafts stay open until you dismiss them. Brief answers close 10 seconds after a spoken reply finishes; choose “Keep open” to read longer. If an item name is unclear, choose the correct item first.</Text>
      <Text style={body}>The assistant can prepare unsaved drafts. It cannot change stock, save orders by voice, or send purchases. Unsaved drafts clear on logout or app restart. Offline answers use stock synced during this login and are marked “Last known”.</Text>
      <Text style={body}>Ask about current quantities, suppliers, brands, stock status or a stock summary. You can combine supported category, supplier and stock filters or prepare an unsaved draft with named items and quantities. Choose Groq understanding when available for natural paraphrases. Historical trends, forecasts and arbitrary calculations are not supported.</Text>
      <Text style={body}>Try: “Prepare a draft for two units of Ambu bag and everything low in stock or out of stock.” Saying “saved draft” still prepares an unsaved local draft. Review quantities and use touch to save.</Text>
      {commandExamples.map(example => <Text key={example} style={body}>• {example}</Text>)}
      <Text style={body}>Preferences belong to this account. Reinstalling or clearing app data requires setup again.</Text></>}
    </View>
    <VoiceButton label="Recheck voice & online understanding" secondary onPress={p.recheck} disabled={locked} />
    <VoiceButton label={licence ? 'Hide speech licence' : 'Offline speech licence'} secondary onPress={() => setLicence(!licence)} />
    {licence && <><Text selectable style={body}>{offlineSpeechNotice}{'\n\n'}{pocketSpeechNotice}</Text><VoiceButton label="Export complete Alba licence notices" secondary onPress={p.exportLicences} disabled={locked || !p.alba.supported} /></>}
  </>;
}

const styles = StyleSheet.create({
  hero: { paddingVertical: 8, gap: 12 }, heroTitle: { fontSize: 22, lineHeight: 28, fontWeight: '600', flex: 1 }, badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', gap: 7, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '600', flexShrink: 1 }, label: { fontSize: 16, fontWeight: '600' },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, justifyContent: 'center' },
  progress: { height: 5, overflow: 'hidden', borderRadius: 5 },
  optional: { fontSize: 12, flexShrink: 1 }, divider: { borderTopWidth: 1, paddingTop: 16, gap: 12 },
  paceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, paceOption: { flexGrow: 1, flexBasis: 90 },
});
