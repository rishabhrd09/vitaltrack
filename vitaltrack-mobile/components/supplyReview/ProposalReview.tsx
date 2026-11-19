import { Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import type { SupplyRun, SupplyLine } from '@/features/supplyReview/contracts';

/** Display server facts only. Quantity arithmetic and approval remain on the backend. */
export default function ProposalReview({ run }: { run: SupplyRun }) {
  const { colors } = useTheme();
  const groups = new Map<string, SupplyLine[]>();
  for (const line of run.proposal?.lines || []) {
    const label = line.supplier_name || 'Unspecified supplier';
    groups.set(label, [...(groups.get(label) || []), line]);
  }
  const body = { color: colors.textSecondary, fontSize: 14, lineHeight: 21 };
  return <View style={{ gap: 18 }}>
    <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 23, lineHeight: 30, fontWeight: '700' }}>Your replenishment proposal</Text>
    <Text style={body}>Based on stock checked at {new Date(run.snapshot_at).toLocaleString()}. Quantities use recorded minimums or the target you entered.</Text>
    {!run.proposal?.lines.length && !run.questions.length && <Text style={body}>No replenishment is needed for the reviewed supplies. No order has been created.</Text>}
    {[...groups].map(([supplier, lines]) => <View key={supplier} style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: colors.accentBlue, fontSize: 16, lineHeight: 23, fontWeight: '600' }}>{supplier}</Text>
      {lines.map(line => <View key={line.item_id} style={{ padding: 16, gap: 10, borderWidth: 1, borderColor: colors.borderPrimary, borderRadius: 16, backgroundColor: colors.bgCard }}>
        <Text style={{ color: colors.textPrimary, fontSize: 18, lineHeight: 25, fontWeight: '600' }}>{line.name}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {[["On hand", line.on_hand], ["Recorded minimum", line.minimum_stock], ["Known inbound", line.known_inbound], ["Your target", line.target_quantity]].map(([label, quantity]) =>
            <View key={label} style={{ flexBasis: '44%', flexGrow: 1, minWidth: 96 }}><Text style={body}>{label}</Text><Text style={{ color: colors.textPrimary, fontSize: 16, lineHeight: 23 }}>{quantity} {line.unit}</Text></View>)}
        </View>
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.accentBlueBg }}>
          <Text style={{ color: colors.accentBlue, fontSize: 18, lineHeight: 25, fontWeight: '700' }}>Proposed order · {line.order_quantity} {line.unit}</Text>
        </View>
        {line.reasons.map((reason, i) => <Text key={i} style={body}>{reason}</Text>)}
      </View>)}
    </View>)}
    {!!run.excluded.length && <View style={{ gap: 8 }}><Text style={{ ...body, fontWeight: '600' }}>Left out of this review</Text>{run.excluded.map(row => <Text key={row.item_id} style={body}>{row.name}: {row.reason}</Text>)}</View>}
  </View>;
}
