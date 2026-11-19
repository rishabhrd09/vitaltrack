import { useEffect, useRef, useState } from 'react';
import { AppState, Alert, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import type { SarvamKeySource, SarvamKeyStatus } from '@/services/assistant';
import { VoiceButton } from './VoiceSetup';

type Props = { status?: SarvamKeyStatus; source: SarvamKeySource; applicationAvailable: boolean; consented: boolean; locked: boolean;
  saveKey: (key: string) => Promise<void>; removeKey: () => Promise<void>; testKey: () => void; chooseSource: (source: SarvamKeySource) => void };

/** Unsaved input is memory-only. Never copy provider credentials into preferences. */
export default function SarvamKeySettings(p: Props) {
  const { colors } = useTheme();
  const [keyText, setKeyText] = useState('');
  const input = useRef('');
  const mounted = useRef(true);
  const [submitting, setSubmitting] = useState(false);
  const lockedRef = useRef(false);
  lockedRef.current = p.locked || submitting;
  const [error, setError] = useState('');
  const clear = () => { input.current = ''; if (mounted.current) setKeyText(''); };
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') clear(); });
    return () => { mounted.current = false; input.current = ''; sub.remove(); };
  }, []);
  const locked = p.locked || submitting;
  const body = { fontSize: 14, lineHeight: 21, color: colors.textSecondary };
  const save = () => Alert.alert('Store your personal Sarvam key?', 'CareKosh will store this credential encrypted on its backend for this account. It is not saved in phone settings. Saving does not test the key or enable narration consent. A voice test and each narrated answer use your Sarvam credits.', [
    { text: 'Cancel', style: 'cancel', onPress: clear },
    { text: 'Store encrypted', onPress: () => {
      if (!mounted.current || lockedRef.current || !input.current) return;
      lockedRef.current = true;
      setError('');
      setSubmitting(true);
      void p.saveKey(input.current).catch(() => { if (mounted.current) setError('The key change could not be confirmed. Recheck your voice setup.'); }).finally(() => { clear(); if (mounted.current) setSubmitting(false); });
    } },
  ]);
  return <View style={{ gap: 12 }}>
    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>Sarvam account</Text>
    {!!error && <Text accessibilityRole="alert" style={body}>{error}</Text>}
    <Text style={body}>Selected: {p.source === 'personal' ? 'Your personal key · your credits' : 'Application account · shared credits'}. Personal-key failures never use shared credits.</Text>
    <View style={{ gap: 8 }}>
      <VoiceButton label="Use my personal Sarvam key" secondary disabled={locked || !p.status?.usable || p.source === 'personal'} onPress={() => p.chooseSource('personal')} />
      <VoiceButton label="Use application Sarvam account" secondary disabled={locked || !p.applicationAvailable || p.source === 'application'} onPress={() => p.chooseSource('application')} />
    </View>
    <Text accessibilityLiveRegion="polite" style={body}>{p.status?.configured ? p.status.usable ? 'Personal key stored encrypted. Its validity and credits are checked only when speech is requested.' : 'A personal key is stored but unavailable. Recheck the backend or replace/remove it.' : 'No personal key saved.'}</Text>
    {!p.status?.setup_available && <Text style={body}>Personal key setup requires the updated backend and its encryption configuration. Your other voice settings still work.</Text>}
    {p.status?.setup_available && <>
      <TextInput accessibilityLabel="Personal Sarvam API key" value={keyText} secureTextEntry maxLength={512} editable={!locked}
        onChangeText={value => { input.current = value; setKeyText(value); }}
        autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none"
        placeholder={p.status.configured ? 'Paste a replacement API key' : 'Paste your Sarvam API key'} placeholderTextColor={colors.textTertiary}
        style={{ minHeight: 48, borderWidth: 1, borderColor: colors.borderPrimary, borderRadius: 12, padding: 12, fontSize: 14, color: colors.textPrimary }} />
      <VoiceButton label={p.status.configured ? 'Replace personal key' : 'Save personal key'} secondary disabled={locked || keyText.length < 8 || /\s/.test(keyText)} onPress={save} />
      <Text style={body}>Create a key in your Sarvam dashboard. Saving selects personal billing but does not enable voice or automatic reading. The key field clears after saving, leaving this page or backgrounding.</Text>
    </>}
    {p.status?.configured && <>
      <VoiceButton label="Test personal key & voice" secondary disabled={locked || !p.status.usable || !p.consented} onPress={p.testKey} />
      {!p.consented && <Text style={body}>Choose Use Sarvam English voice above and accept answer-text consent before testing. The test plays one short sentence and consumes credits.</Text>}
      <VoiceButton label="Remove personal key" secondary disabled={locked} onPress={() => Alert.alert('Remove your saved Sarvam key?', 'This removes it from CareKosh. It does not revoke it in Sarvam or erase encrypted copies in retained database backups. Select device voice or explicitly choose application billing afterward.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => {
          if (!mounted.current || lockedRef.current) return;
          lockedRef.current = true;
          clear(); setError(''); setSubmitting(true);
          void p.removeKey().catch(() => { if (mounted.current) setError('Removal could not be confirmed. Recheck your voice setup.'); }).finally(() => { if (mounted.current) setSubmitting(false); });
        } },
      ])} />
    </>}
  </View>;
}
