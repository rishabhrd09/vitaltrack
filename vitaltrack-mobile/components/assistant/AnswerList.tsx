import { useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { isCriticalEquipment, type Item } from '@/types';
import { stockLabel } from '@/features/assistant/queries';
import type { CartItem } from '@/features/assistant/drafts';

const PROVENANCE = { spoken: 'Explicit', suggested: 'Suggested', manual: 'Edited' } as const;
const STATUS_ICON = { 'Out of stock': 'close-circle', 'Low stock': 'alert-circle', 'In stock': 'checkmark-circle' } as const;

/** Virtualized, responsive results. Stock and requested order quantities always have distinct labels. */
export default function AnswerList({ items, header, draftRows, reasons }: { items: Item[]; header: ReactNode; draftRows?: CartItem[]; reasons?: Record<string, string[]> }) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.15 || width < 380;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const draftById = useMemo(() => new Map(draftRows?.map(row => [row.item.id, row])), [draftRows]);
  return <FlatList data={items} keyExtractor={i => i.id} keyboardShouldPersistTaps="handled"
    initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<View style={styles.intro}>{header}{!!items.length &&
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        {draftRows ? 'Draft items' : 'Matching items'} ({items.length})
      </Text>}
    </View>}
    renderItem={({ item, index }) => {
      const row = draftById.get(item.id);
      const status = stockLabel(item);
      const tone = status === 'Out of stock' ? colors.statusRed : status === 'Low stock' ? colors.statusOrange : colors.statusGreen;
      const tint = status === 'Out of stock' ? colors.statusRedBg : status === 'Low stock' ? colors.statusOrangeBg : colors.statusGreenBg;
      const critical = isCriticalEquipment(item);
      const why = (reasons?.[item.id] || []).join(' · ');
      const provenance = row && `${PROVENANCE[row.source]}${row.source !== 'manual' && row.basis ? ` · ${row.basis.replace(/^Suggested · /, '')}` : ''}`;
      const open = expanded.has(item.id);
      const details = [`Supplier · ${item.supplierName?.trim() || 'Not recorded'}`, `Brand · ${item.brand?.trim() || 'Not recorded'}`, `Minimum stock · ${item.minimumStock} ${item.unit}`,
        ...(critical ? [`Critical equipment · ${item.isCritical ? 'marked on the item' : 'by name rule'}`] : []),
        ...(row ? [`Order quantity · ${provenance}`] : [])];
      const label = [`${index + 1}. ${item.name}`, `${item.quantity} ${item.unit}`, status, critical && 'Critical equipment', why && `Why: ${why}`,
        row && `Order ${row.quantity} ${item.unit}, ${provenance}`, open && details.join('. '), open ? 'Hide recorded details' : 'Show recorded details'].filter(Boolean).join('. ');
      const quantity = (value: number, order = false) => <View style={[styles.fact, { backgroundColor: order ? colors.accentBlueBg : colors.bgTertiary }]}>
        <Text style={[styles.factLabel, { color: colors.textSecondary }]}>{order ? 'To order' : 'In stock'}</Text>
        <Text style={[styles.unit, { color: colors.textPrimary }]}>
          <Text style={[styles.number, order && { color: colors.accentBlue }]}>{value}</Text> {item.unit}
        </Text>
      </View>;
      return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }}
        onPress={() => {
          if (!open) AccessibilityInfo.announceForAccessibility(`${item.name}. ${details.join('. ')}`);
          setExpanded(old => { const next = new Set(old); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; });
        }}
        style={[styles.item, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
        <View style={styles.line}>
          <View style={styles.nameColumn}>
            <Text style={[styles.name, { color: colors.textPrimary }]}>{item.name}</Text>
            <View style={styles.badges}>
              <View style={[styles.statusLine, { backgroundColor: tint }]}>
                <Ionicons name={STATUS_ICON[status]} size={12} color={tone} />
                <Text style={[styles.status, { color: tone }]}>{status}</Text>
              </View>
              {critical && <Text style={[styles.badge, { color: colors.statusOrange }]}>★ Critical</Text>}
            </View>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
        </View>
        <View style={[styles.facts, stacked && styles.stackedFacts]}>
          {quantity(item.quantity)}
          {row && quantity(row.quantity, true)}
        </View>
        {(!!why || !!row) && <View style={[styles.context, { borderColor: colors.borderPrimary }]}>
          {!!why && <Text style={[styles.detail, { color: colors.textSecondary }]}>Why: {why}</Text>}
          {row && <View style={styles.provenance}>
            <Ionicons name={row.source === 'spoken' ? 'mic-outline' : row.source === 'manual' ? 'create-outline' : 'sparkles-outline'} size={12} color={colors.accentBlue} />
            <Text style={[styles.detail, { color: colors.accentBlue }]}>{provenance}</Text>
          </View>}
        </View>}
        {open && <View style={styles.details}>
          {details.map(line => <Text key={line} style={[styles.detail, { color: colors.textSecondary }]}>{line}</Text>)}
        </View>}
      </TouchableOpacity>;
    }} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
  intro: { gap: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  item: { padding: 16, borderWidth: 1, borderRadius: 18, gap: 14 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nameColumn: { flex: 1, minWidth: 0, gap: 8 },
  name: { fontSize: 17, fontWeight: '600', lineHeight: 23 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  badge: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  facts: { flexDirection: 'row', gap: 8 },
  stackedFacts: { flexDirection: 'column' },
  fact: { flexGrow: 1, flexBasis: 'auto', flexShrink: 1, minWidth: 0, paddingVertical: 9, paddingHorizontal: 12, gap: 4, borderRadius: 10 },
  factLabel: { fontSize: 12, fontWeight: '600' },
  number: { fontSize: 19, fontWeight: '700', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 14, lineHeight: 25 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 1 },
  status: { fontSize: 12, lineHeight: 18, fontWeight: '600', flexShrink: 1 },
  detail: { fontSize: 14, lineHeight: 21 }, details: { gap: 6 },
  context: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  provenance: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
