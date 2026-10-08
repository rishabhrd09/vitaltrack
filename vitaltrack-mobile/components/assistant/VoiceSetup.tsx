import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import type { Preferences } from '@/features/assistant/preferences';
import { commandExamples } from '@/features/assistant/core';
import { offlineSpeechNotice } from '@/features/assistant/notices';

type Props = {
  prefs: Preferences; loaded: boolean; supported: boolean; busy: string;
  model: { ready: boolean; bytes: number }; modelChecked: boolean; progress: number;
  deviceVoice: { ready: boolean; name: string };
  update: (next: Preferences) => void; enableMicrophone: () => void;
  manageModel: () => void; previewVoice: () => void; recheck: () => void;
  openAssistant: () => void; cloudControls?: ReactNode;
};

export function VoiceButton({ label, onPress, disabled = false, secondary = false }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  const { colors } = useTheme();
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, { backgroundColor: secondary ? colors.accentBlueBg : colors.accentBlue, opacity: disabled ? 0.45 : 1 }]}>
    <Text style={{ color: secondary ? colors.accentBlue : colors.white, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{label}</Text>
  </TouchableOpacity>;
}

export default function VoiceSetup(p: Props) {
  const { colors } = useTheme();
  const [help, setHelp] = useState(false);
  const [licence, setLicence] = useState(false);
  const locked = !!p.busy || !p.loaded;
  const online = p.prefs.audioOptIn && p.prefs.inputProvider === 'groq';
  const ready = (online || p.model.ready) && p.prefs.enabled && p.prefs.microphone;
  const body = { color: colors.textSecondary, fontSize: 14, lineHeight: 21 };
  const card = [styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }];
  const step = (number: string, title: string, complete: boolean) => <View style={styles.row}>
    <View style={[styles.step, { backgroundColor: complete ? colors.statusGreenBg : colors.accentBlueBg }]}>
      {complete ? <Ionicons name="checkmark" size={19} color={colors.statusGreen} /> : <Text style={{ color: colors.accentBlue, fontWeight: '700' }}>{number}</Text>}
    </View><Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
  </View>;
  const toggle = (title: string, description: string, value: boolean, onValueChange: (v: boolean) => void, disabled = false) =>
    <View style={styles.row}><View style={{ flex: 1, gap: 4 }}><Text style={[styles.label, { color: colors.textPrimary }]}>{title}</Text><Text style={body}>{description}</Text></View>
      <Switch accessibilityLabel={title} value={value} onValueChange={onValueChange} disabled={locked || disabled} trackColor={{ true: colors.accentBlue }} /></View>;
  return <>
    <View style={[styles.hero, { backgroundColor: colors.accentBlueBg }]}>
      <Ionicons name="mic-outline" size={32} color={colors.accentBlue} />
      <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Your stock, a question away.</Text>
      <Text style={body}>Set up voice here once. Then tap the microphone above the main tabs whenever you want to ask about your stock.</Text>
      <Text style={body}>The speech pack stays on this phone; your preferences are saved for this account. Setup is needed again if you reinstall or clear app data.</Text>
      <Text style={{ color: colors.accentBlue, fontSize: 12, fontWeight: '700' }}>ENGLISH · REVIEW YOUR WORDS · TOUCH TO SAVE</Text>
    </View>
    <View style={card}>
      {step('1', 'Download English speech', p.model.ready)}
      <Text style={body}>{!p.supported ? 'Recording is available in the Android APK. Expo Go, web and iOS can still use typed questions.' : online ? 'You selected Groq online listening below. The offline pack is optional for this mode; download it to use listening without internet.' : !p.modelChecked ? 'Checking the speech pack on this phone…' : p.model.ready ? 'The speech pack is verified and ready. Offline listening recognizes recordings on your phone.' : `One download is needed for offline recording. ${p.model.bytes ? Math.ceil(p.model.bytes / 1_000_000) + ' MB' : 'Up to 300 MB'} · Wi-Fi recommended.`}</Text>
      {p.busy.includes('speech pack') && <View style={{ gap: 8 }}><View style={styles.row}><ActivityIndicator color={colors.accentBlue} /><Text style={body}>{p.busy} {p.progress > 0 ? `${p.progress}%` : ''}</Text></View><View style={[styles.progress, { backgroundColor: colors.borderPrimary }]}><View style={{ height: 5, width: `${p.progress}%`, backgroundColor: colors.accentBlue }} /></View></View>}
      <VoiceButton label={p.model.ready ? 'Remove speech pack' : 'Download speech pack'} secondary={p.model.ready} onPress={p.manageModel} disabled={locked || !p.supported || !p.modelChecked} />
    </View>
    <View style={card}>
      {step('2', 'Enable tap-to-talk', p.prefs.enabled && p.prefs.microphone)}
      {toggle('Assistant', 'Read inventory and prepare unsaved order drafts. Only a touch confirmation saves an order.', p.prefs.enabled, v => p.update({ ...p.prefs, enabled: v }))}
      {toggle('Microphone', 'Only records when you tap. Tap again to finish.', p.prefs.microphone, v => { if (v) p.enableMicrophone(); else p.update({ ...p.prefs, microphone: false }); }, !p.supported)}
      {(!p.prefs.enabled || !p.prefs.microphone) && <VoiceButton label="Enable assistant & microphone" onPress={p.enableMicrophone} disabled={locked || !p.supported} />}
      <Text style={body}>Allow microphone access when Android asks. If recording is silent, check Android’s microphone privacy switch and close other recording apps.</Text>
    </View>
    <View style={card}>
      {step('3', 'Choose spoken replies', p.prefs.spokenReplies && p.deviceVoice.ready)}
      {toggle('Read answers aloud', 'Optional. The full answer also appears on screen.', p.prefs.spokenReplies, v => p.update({ ...p.prefs, spokenReplies: v }), !p.deviceVoice.ready && !p.prefs.spokenReplies)}
      <Text style={body}>{p.deviceVoice.ready ? 'An offline English voice is available on this phone.' : 'To hear replies, install an English voice in Android Settings → Text-to-speech, then recheck below. You can still read answers.'}</Text>
      <VoiceButton label="Preview voice" secondary onPress={p.previewVoice} disabled={locked || !p.deviceVoice.ready} />
    </View>
    <VoiceButton label={ready ? 'Practice a command here' : 'Try a typed question here'} onPress={p.openAssistant} disabled={locked || !p.prefs.enabled} />
    <View style={card}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>How to use it</Text>
      <Text style={body}>1. Tap the microphone on a main screen; stay there.{ '\n' }2. Speak after “Listening”, then tap the same button to stop.{ '\n' }3. Review the transcript below, then tap “Send question”.</Text>
      <Text style={body}>Answers stay open for 10 seconds after any spoken reply finishes. Choose “Keep open” to read longer. If an item name is unclear, choose the correct item first.</Text>
      <Text style={body}>The assistant can prepare unsaved drafts. It cannot change stock, save orders by voice, or send purchases. Unsaved drafts clear on logout or app restart. Offline answers use stock synced during this login and are marked “Last known”.</Text>
      <Text style={body}>Ask about current quantities, suppliers, brands, stock status or a stock summary. You can combine supported category, supplier and stock filters or prepare an unsaved draft with named items and quantities. Enable Groq understanding below for natural paraphrases. Historical trends, forecasts and arbitrary calculations are not supported.</Text>
      <VoiceButton label={help ? 'Hide example questions' : 'See example questions'} secondary onPress={() => setHelp(!help)} />
      {help && commandExamples.map(example => <Text key={example} style={body}>• {example}</Text>)}
    </View>
    {p.cloudControls}
    <VoiceButton label="Recheck voice & online understanding" secondary onPress={p.recheck} disabled={locked} />
    <VoiceButton label={licence ? 'Hide speech licence' : 'Offline speech licence'} secondary onPress={() => setLicence(!licence)} />
    {licence && <Text selectable style={body}>{offlineSpeechNotice}</Text>}
  </>;
}

const styles = StyleSheet.create({
  hero: { padding: 22, borderRadius: 24, gap: 12 }, heroTitle: { fontSize: 25, lineHeight: 32, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 16 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '600', flexShrink: 1 }, label: { fontSize: 16, fontWeight: '600' },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 14, justifyContent: 'center' },
  progress: { height: 5, overflow: 'hidden', borderRadius: 5 },
});
