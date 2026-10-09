import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';

type Props = {
  recording: boolean; disabled: boolean; busy: string; live: string;
  question: string; review: boolean; canSend: boolean; standalone?: boolean;
  onMic: () => void; onType: () => void; onEdit: (text: string) => void;
  onSend: () => void; onClose: () => void;
};

/** Small permanent entry; actual recognition updates replace the provisional text. */
export default function AssistantDock(p: Props) {
  const { colors } = useTheme();
  const glow = useRef(new Animated.Value(0.35)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  const liveScroll = useRef<ScrollView>(null);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReduceMotion(value); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; sub.remove(); };
  }, []);
  useEffect(() => {
    if (!p.recording || reduceMotion) { glow.setValue(p.recording ? 0.65 : 0); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 0.7, duration: 800, useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.25, duration: 800, useNativeDriver: true }),
    ]));
    animation.start(); return () => animation.stop();
  }, [p.recording, reduceMotion, glow]);
  const operation = p.busy.toLowerCase();
  const status = p.busy ? (operation.includes('microphone') ? 'Getting ready…' : operation.includes('record') || operation.includes('recognizing') || operation.includes('transcribing') ? 'Finishing your words…' : 'Thinking…') : 'Listening…';
  return <View style={[styles.dock, { borderColor: colors.borderPrimary }]}>
    {p.review && !p.recording && !p.busy && <View style={[styles.composer, { backgroundColor: colors.bgPrimary, borderColor: colors.borderPrimary }]}>
      <TextInput accessibilityLabel={p.standalone ? 'Question or editable transcript' : 'Review voice transcript'} value={p.question} onChangeText={p.onEdit}
        placeholder="Your question…" placeholderTextColor={colors.textTertiary} multiline maxLength={600} editable={!p.disabled}
        style={[styles.input, { color: colors.textPrimary }]} />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={p.standalone ? 'Show answer' : 'Send question'} disabled={!p.canSend}
        accessibilityState={{ disabled: !p.canSend }} onPress={p.onSend} style={[styles.send, { backgroundColor: colors.accentBlue, opacity: p.canSend ? 1 : 0.4 }]}>
        <Ionicons name="arrow-up" size={22} color={colors.white} />
      </TouchableOpacity>
    </View>}
    <View style={styles.row}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={p.recording ? (p.standalone ? 'Finish recording' : 'Stop recording and review transcript') : (p.standalone ? 'Start recording' : 'Start voice recording')}
        accessibilityHint="Tap to start; tap again to finish and review."
        accessibilityState={{ disabled: p.disabled, selected: p.recording }} disabled={p.disabled} onPress={p.onMic} style={styles.entry}>
        <View style={styles.micWrap}>
          {p.recording && <Animated.View pointerEvents="none" style={[styles.halo, { backgroundColor: colors.accentBlue, opacity: glow }]} />}
          <View style={[styles.mic, { backgroundColor: p.recording ? colors.accentBlue : colors.accentBlueBg, borderColor: colors.accentBlueBorder }]}>
            <Ionicons name="mic" size={22} color={p.recording ? colors.white : colors.accentBlue} />
          </View>
        </View>
        <Text style={[styles.name, { color: colors.textSecondary }]}>Ask Care Coach</Text>
      </TouchableOpacity>
      {(p.recording || !!p.busy) ? <View style={styles.live}>
        {!!p.busy && <ActivityIndicator size="small" color={colors.accentBlue} />}
        <ScrollView ref={liveScroll} style={{ maxHeight: 100 }} onContentSizeChange={() => liveScroll.current?.scrollToEnd({ animated: !reduceMotion })}>
          <Text accessibilityLiveRegion="polite" style={[styles.words, { color: p.live && p.recording ? colors.textPrimary : colors.textSecondary }]}>{p.recording && p.live ? p.live : status}</Text>
        </ScrollView>
      </View> : <View style={{ flex: 1 }} />}
      {!p.recording && !p.busy && !p.review && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Type a question here" onPress={p.onType} style={styles.smallButton}>
        <Ionicons name="create-outline" size={20} color={colors.textTertiary} />
      </TouchableOpacity>}
      {(p.recording || !!p.busy || p.review) && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss voice input" onPress={p.onClose} style={styles.smallButton}>
        <Ionicons name="close" size={19} color={colors.textSecondary} />
      </TouchableOpacity>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  dock: { paddingHorizontal: 14, paddingVertical: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  entry: { alignItems: 'center', justifyContent: 'center', minWidth: 72, gap: 2 },
  micWrap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  mic: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 48, height: 48, borderRadius: 24 },
  name: { fontSize: 10, fontWeight: '500' }, live: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 8, alignItems: 'center' },
  words: { fontSize: 15, lineHeight: 22 }, smallButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: 18, padding: 8, gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 40, maxHeight: 132, fontSize: 16, lineHeight: 23, paddingHorizontal: 5, paddingVertical: 8, textAlignVertical: 'top' },
  send: { minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
