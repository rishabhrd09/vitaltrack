import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import type { OpenAIKeyStatus, OpenAILimits, OpenAIModel } from '@/services/assistant';
import { VoiceButton } from './VoiceSetup';

type Props = { status?: OpenAIKeyStatus; model?: OpenAIModel | null; limits?: OpenAILimits; locked: boolean; active: boolean;
  saveKey: (key: string) => Promise<void>; removeKey: () => Promise<void>;
  checkKey: () => Promise<{ available: boolean; model: string }> };

/** The only plaintext copy is unsaved field memory, cleared on every exit. */
export default function OpenAIKeySettings(p: Props) {
  const { colors } = useTheme();
  const [keyText, setKeyText] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const input = useRef(''), mounted = useRef(true), active = useRef(p.active), locked = useRef(false);
  active.current = p.active;
  locked.current = p.locked || submitting;
  const clear = () => { input.current = ''; if (mounted.current) setKeyText(''); };
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') clear(); });
    return () => { mounted.current = false; input.current = ''; sub.remove(); };
  }, []);
  useEffect(() => { if (!p.active) { input.current = ''; setKeyText(''); setNotice(''); } }, [p.active]);
  useEffect(() => { setNotice(''); }, [p.status?.updated_at]);
  const canAct = () => mounted.current && active.current && !locked.current && AppState.currentState === 'active';
  const busy = p.locked || submitting;
  const body = { fontSize: 14, lineHeight: 21, color: colors.textSecondary };
  const allowance = p.limits && Number.isFinite(p.limits.daily_budget_microusd)
    ? (p.limits.daily_budget_microusd / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '';
  const save = () => Alert.alert('Store your OpenAI API key?',
    'CareKosh will store your key encrypted on its backend for this account. It is not stored in phone settings. Saving does not test the key, choose OpenAI, or grant question-text consent. OpenAI requests use your API billing or credits.', [
      { text: 'Cancel', style: 'cancel', onPress: clear },
      { text: 'Store encrypted', onPress: () => {
        if (!canAct() || !input.current) return;
        locked.current = true; setSubmitting(true); setError(''); setNotice('');
        void p.saveKey(input.current).catch(() => {
          if (mounted.current && active.current) setError('The key change could not be confirmed. Recheck before trying again; it may already be saved.');
        }).finally(() => { clear(); if (mounted.current) setSubmitting(false); });
      } },
    ]);
  const check = async () => {
    if (!canAct()) return;
    locked.current = true; setSubmitting(true); setError(''); setNotice(''); clear();
    try {
      const result = await p.checkKey();
      if (mounted.current && active.current && AppState.currentState === 'active') setNotice(result.available
        ? 'Key and configured model access checked. This does not prove available credits or query accuracy.'
        : 'This key cannot access the configured model. Replace the key or contact support.');
    } catch (e) {
      if (mounted.current && active.current && AppState.currentState === 'active') setError(
        e instanceof Error ? e.message : 'The key and model check could not finish. Recheck online services and try again.');
    } finally { if (mounted.current) setSubmitting(false); }
  };
  const remove = () => Alert.alert('Remove your saved OpenAI key?',
    'This removes the key from CareKosh. It does not revoke the key at OpenAI, cancel work already sent, or erase encrypted copies in retained database backups. The selected understanding provider stays visible as needing a key; no other account is charged.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        if (!canAct()) return;
        locked.current = true; setSubmitting(true); setError(''); setNotice(''); clear();
        void p.removeKey().catch(() => { if (mounted.current && active.current) setError('Removal could not be confirmed. Recheck your voice setup.'); })
          .finally(() => { if (mounted.current) setSubmitting(false); });
      } },
    ]);
  return <View style={{ gap: 12 }}>
    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>Your OpenAI account</Text>
    <Text style={body}>Only your personal key is used. A failed request never switches to Groq or an application key.</Text>
    {p.model && <Text style={body}>Configured model · {p.model.label}. CareKosh currently offers this evaluated model; the key must have access to it.</Text>}
    {!!allowance && p.limits && <Text style={body}>CareKosh daily guard · {p.limits.daily_requests} shared AI requests and ${allowance} estimated allowance for this account. A request can be blocked if its reserved allowance will not fit. This is not your OpenAI balance or a provider spending cap.</Text>}
    <Text accessibilityLiveRegion="polite" style={body}>{p.status?.configured
      ? p.status.usable ? 'Personal key stored encrypted. Check access below, then select OpenAI understanding and accept text consent.' : 'A key is stored but unavailable. Recheck server setup or replace/remove it.'
      : 'No personal OpenAI key saved.'}</Text>
    {!p.status?.setup_available && <Text style={body}>Personal OpenAI setup needs the updated backend and its encryption configuration. Your listening and speaking choices still work.</Text>}
    {!!error && <Text accessibilityRole="alert" style={body}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={body}>{notice}</Text>}
    {p.status?.setup_available && <>
      <TextInput accessibilityLabel="Personal OpenAI API key" secureTextEntry value={keyText} maxLength={512} editable={!busy}
        onChangeText={value => { input.current = value; setKeyText(value); }} autoCapitalize="none" autoCorrect={false}
        autoComplete="off" textContentType="none" placeholder={p.status.configured ? 'Paste a replacement API key' : 'Paste your OpenAI API key'}
        placeholderTextColor={colors.textTertiary} style={{ minHeight: 48, borderWidth: 1, borderColor: colors.borderPrimary, borderRadius: 12, padding: 12, fontSize: 14, color: colors.textPrimary }} />
      <VoiceButton label={p.status.configured ? 'Replace OpenAI key' : 'Save OpenAI key'} secondary onPress={save}
        disabled={busy || keyText.length < 8 || /[^\x21-\x7e]/.test(keyText)} />
      <Text style={body}>Create a key in your own OpenAI API dashboard. Its API billing is separate from a ChatGPT subscription. The field clears after saving, leaving this page or backgrounding.</Text>
    </>}
    {p.status?.configured && <>
      <VoiceButton label="Check OpenAI key & model" secondary onPress={() => { void check(); }} disabled={busy || !p.status.usable} />
      <Text style={body}>This explicit check sends no question, recording or inventory. No answer is generated. Credit errors are checked when you send a question.</Text>
      <VoiceButton label="Remove OpenAI key" secondary onPress={remove} disabled={busy} />
    </>}
  </View>;
}
