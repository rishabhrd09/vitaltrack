import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useTheme } from '@/theme/ThemeContext';
import { useAuthStore } from '@/store/useAuthStore';
import { captureSession, assertSession } from '@/services/assistantSession';
import { supplyReview } from '@/services/supplyReview';
import { canConfirm, type SupplyRun, type SupplyRunSummary } from '@/features/supplyReview/contracts';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { queryClient } from '@/providers/QueryProvider';
import { safeBack } from '@/utils/navigation';
import ProposalReview from './ProposalReview';

export default function SupplyReviewExperience() {
  const owner = useAuthStore(s => s.isAuthenticated ? s.user?.id : undefined);
  // Keying the session view clears old account rows during reconciliation,
  // before effects run; a logout/account switch cannot paint the old proposal.
  return <OwnedReviewExperience key={owner ?? 'signed-out'} owner={owner} />;
}

function OwnedReviewExperience({ owner }: { owner: string | undefined }) {
  const { colors } = useTheme(), router = useRouter();
  const params = useLocalSearchParams<{ run?: string }>();
  const { isOnline } = useNetworkStatus();
  const [run, setRun] = useState<SupplyRun | null>(null), [recent, setRecent] = useState<SupplyRunSummary[]>([]);
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [answers, setAnswers] = useState<Record<string, { target: string; exclude: boolean }>>({});
  const [now, setNow] = useState(Date.now());
  const turn = useRef(0), active = useRef(true), lock = useRef(false), controller = useRef<AbortController | null>(null);
  const current = useRef(run); current.current = run;
  const confirmKey = useRef<{ proposal: string; key: string } | null>(null);
  const startKey = useRef(Crypto.randomUUID());
  const stop = useCallback(() => { turn.current++; active.current = false; controller.current?.abort(); lock.current = false; setBusy(''); }, []);
  const work = useCallback(async (label: string, action: (session: ReturnType<typeof captureSession>, signal: AbortSignal) => Promise<SupplyRun | void>, affected?: SupplyRun, mutation = false) => {
    // Android may initially report null. Safe reads may recover then, while
    // every write still needs a confirmed foreground touch.
    if (!active.current || lock.current || (mutation && AppState.currentState !== 'active') || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
    let session; try { session = captureSession(); } catch { return; }
    lock.current = true; setBusy(label); setError(''); setNotice('');
    const generation = ++turn.current, abort = new AbortController(); controller.current?.abort(); controller.current = abort;
    const valid = () => { assertSession(session); return active.current && generation === turn.current && !abort.signal.aborted; };
    try {
      const result = await action(session, abort.signal);
      if (!valid()) return;
      if (result) {
        setRun(result); setAnswers({});
        router.setParams({ run: result.id });
        if (result.status === 'completed') {
          void queryClient.invalidateQueries({ queryKey: ['orders'] });
          void queryClient.invalidateQueries({ queryKey: ['activities'] });
        }
      }
    } catch (failure) {
      try {
        if (!valid()) return;
        setError(failure instanceof Error ? failure.message : 'Supply review could not finish.');
        if (affected) {
          // A failed POST may have committed. Reading status is safe; never replay a write here.
          try {
            const recovered = await supplyReview.get(session, affected.id, abort.signal);
            if (valid()) { setRun(recovered); setAnswers({}); setNotice(recovered.status === 'completed'
              ? 'The original order was saved. Open Recent Orders to view or export it.'
              : 'Latest saved review loaded. Check it before explicitly retrying; an interrupted request may still finish.'); }
          } catch { if (valid()) setNotice('Outcome is uncertain. Tap Check saved status before trying again.'); }
        } else if (label === 'Starting review…' && valid()) {
          setNotice('The review may already exist. Check recent reviews before starting again; the same request ID is retained.');
        }
      } catch { /* A late result never touches another account. */ }
    } finally {
      if (generation === turn.current) { lock.current = false; setBusy(''); }
    }
  }, [router]);
  const load = useCallback(() => work('Checking saved reviews…', async (session, signal) => {
    if (session.owner !== owner) throw new Error('Session changed.');
    const caps = await supplyReview.capabilities(session, signal); assertSession(session);
    if (signal.aborted || !active.current) return;
    setEnabled(caps.enabled);
    if (caps.supported === false) { setRecent([]); return; }
    let rows: SupplyRunSummary[] = [];
    try { rows = await supplyReview.list(session, signal); }
    catch (failure) { if (caps.enabled) throw failure; }
    assertSession(session); if (signal.aborted || !active.current) return;
    setRecent(rows);
    if (params.run) return supplyReview.get(session, params.run, signal);
  }), [owner, params.run, work]);
  useEffect(() => { stop(); setRun(null); setRecent([]); setAnswers({}); setEnabled(false); confirmKey.current = null; startKey.current = Crypto.randomUUID(); }, [owner, stop]);
  useFocusEffect(useCallback(() => { active.current = true; void load(); return stop; }, [load, stop]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') stop();
      else { active.current = true; void load(); }
    });
    return () => sub.remove();
  }, [load, stop]);
  useEffect(() => { const timer = setInterval(() => { if (active.current) setNow(Date.now()); }, 1000); return () => clearInterval(timer); }, []);
  const body = { fontSize: 15, lineHeight: 23, color: colors.textSecondary };
  const button = (label: string, press: () => void, disabled = false, primary = false) => <TouchableOpacity key={label} accessibilityRole="button"
    accessibilityLabel={label} accessibilityState={{ disabled: disabled || !!busy }} disabled={disabled || !!busy} onPress={press}
    style={{ minHeight: 48, padding: 13, borderRadius: 14, justifyContent: 'center', alignItems: 'center', opacity: disabled || busy ? 0.45 : 1, backgroundColor: primary ? colors.accentBlue : colors.accentBlueBg }}>
    <Text style={{ color: primary ? colors.white : colors.accentBlue, fontSize: 15, lineHeight: 22, fontWeight: '600', textAlign: 'center' }}>{label}</Text></TouchableOpacity>;
  const confirm = () => {
    if (!run || !canConfirm(run) || !enabled || !isOnline || busy) return;
    const reviewed = run;
    let session; try { session = captureSession(); } catch { return; }
    Alert.alert('Confirm pending order?', 'Save exactly the quantities in this proposal. This does not update stock, purchase supplies or contact suppliers.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Confirm order', onPress: () => {
        try { assertSession(session); } catch { return; }
        if (!active.current || AppState.currentState !== 'active' || current.current !== reviewed || !canConfirm(reviewed)) return;
        if (confirmKey.current?.proposal !== reviewed.proposal!.id) confirmKey.current = { proposal: reviewed.proposal!.id, key: Crypto.randomUUID() };
        void work('Checking and saving…', (s, signal) => supplyReview.confirm(s, reviewed, confirmKey.current!.key, signal), reviewed, true);
      } },
    ]);
  };
  const submitAnswers = () => {
    if (!run) return;
    const checked = run.questions.map(q => {
      const a = answers[q.item_id];
      if (a?.exclude) return { item_id: q.item_id, exclude: true };
      if (!a || !/^(0|[1-9]\d*)$/.test(a.target) || Number(a.target) > 999999) throw new Error(`Enter a target for ${q.name}, or leave the item out.`);
      return { item_id: q.item_id, target_quantity: Number(a.target) };
    });
    void work('Updating your review…', (s, signal) => supplyReview.answer(s, run, checked, signal), run, true);
  };
  const canWrite = enabled && isOnline && !busy;
  const canAnswer = canWrite && run?.status === 'needs_input' && Date.parse(run.expires_at) > now;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }} edges={['top', 'bottom']}>
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderColor: colors.borderPrimary }}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={safeBack} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}><Text style={{ color: colors.accentBlue, fontSize: 22 }}>←</Text></TouchableOpacity>
      <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 23, lineHeight: 30, fontWeight: '700', flex: 1 }}>Supply review</Text>
    </View>
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
      <Text style={body}>Review low, out-of-stock and recorded backup-attention supplies using current account data. Existing pending or received orders need clarification. No cloud model is called.</Text>
      {!!busy && <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10 }}><ActivityIndicator color={colors.accentBlue} /><Text style={body}>{busy}</Text></View>}
      {!!error && <Text accessibilityRole="alert" style={{ ...body, color: colors.statusRed }}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={body}>{notice}</Text>}
      {!isOnline && <Text style={body}>Offline. Reconnect to check current records and confirm. No changes are queued.</Text>}
      {!enabled && !busy && <Text style={body}>New supply reviews are unavailable on this backend. Your normal inventory and order screens remain available.</Text>}
      {button('Check saved status and recent reviews', () => { void load(); }, !isOnline)}
      {!run && button('Review to recorded minimum', () => { void work('Starting review…', (s, signal) => supplyReview.start(s, startKey.current, signal), undefined, true); }, !canWrite, true)}
      {!run && recent.map(row => button(`${row.status.replaceAll('_', ' ')} · ${new Date(row.created_at).toLocaleString()}`, () => { void work('Opening review…', (s, signal) => supplyReview.get(s, row.id, signal)); }, !isOnline))}
      {run && <>
        <Text accessibilityLiveRegion="polite" style={{ ...body, fontWeight: '600' }}>Status · {run.status.replaceAll('_', ' ')} · revision {run.version}</Text>
        {run.status === 'completed' ? <>
          <Text style={{ ...body, color: colors.accentBlue }}>Order {run.order_id} is saved as a pending request. Stock is unchanged.</Text>
          {button('Open Recent Orders', () => router.push('/(tabs)/orders'))}
        </> : <>
          <ProposalReview run={run} />
          {!!run.questions.length && <View style={{ gap: 14 }}>
            <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '600' }}>A few details are needed</Text>
            {run.questions.map(q => <View key={q.item_id} style={{ gap: 10, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.borderPrimary }}>
              <Text style={{ ...body, color: colors.textPrimary, fontWeight: '600' }}>{q.name}</Text><Text style={body}>{q.message}</Text>
              {['missing_target', 'backup_target'].includes(q.code) && !answers[q.item_id]?.exclude && <TextInput accessibilityLabel={`Target quantity for ${q.name}`} keyboardType="number-pad" maxLength={6}
                editable={canAnswer} value={answers[q.item_id]?.target || ''} onChangeText={target => setAnswers(old => ({ ...old, [q.item_id]: { target, exclude: false } }))}
                placeholder={`Target in ${q.unit}`} placeholderTextColor={colors.textTertiary} style={{ borderWidth: 1, borderColor: colors.borderPrimary, padding: 12, borderRadius: 10, color: colors.textPrimary, minHeight: 48, fontSize: 16 }} />}
              {button(answers[q.item_id]?.exclude ? `Include ${q.name}` : `Leave ${q.name} out`, () => setAnswers(old => ({ ...old, [q.item_id]: { target: old[q.item_id]?.target || '', exclude: !old[q.item_id]?.exclude } })), !canAnswer)}
            </View>)}
            {button('Review these answers', () => { try { submitAnswers(); } catch (e) { setError(e instanceof Error ? e.message : 'Check your answers.'); } }, !canAnswer, true)}
          </View>}
          {run.proposal && <Text style={body}>Proposal {run.proposal.version} expires {new Date(run.proposal.expires_at).toLocaleTimeString()}. {['expired', 'cancelled'].includes(run.status) ? 'Return to saved reviews and start a new review.' : canConfirm(run, now) ? 'Review every quantity before confirming.' : 'Refresh for a current review before confirming.'}</Text>}
          {button('Confirm reviewed order', confirm, !canWrite || !canConfirm(run, now), true)}
          {button('Refresh and review current stock', () => { void work('Refreshing current stock…', (s, signal) => supplyReview.refresh(s, run, signal), run, true); }, !canWrite || ['cancelled', 'expired'].includes(run.status))}
          {button('Cancel this review', () => { void work('Cancelling review…', (s, signal) => supplyReview.cancel(s, run, signal), run, true); }, !isOnline || !!busy || ['cancelled', 'expired'].includes(run.status))}
        </>}
        {button('Back to saved reviews', () => { setRun(null); setAnswers({}); startKey.current = Crypto.randomUUID(); router.setParams({ run: undefined }); })}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
