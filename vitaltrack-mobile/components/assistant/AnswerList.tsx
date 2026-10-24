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
    ListHeaderComponent={<View style={styles.intro}>{header}{!!items.length && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.tableHead}>
      <Text style={[styles.column, { flex: 1, color: colors.textSecondary }]}>ITEMS · {items.length}</Text>
      {!stacked && <Text style={[styles.column, styles.quantityColumn, { color: colors.textSecondary }]}>{draftRows ? 'IN STOCK' : 'QUANTITY'}</Text>}
      {!stacked && draftRows && <Text style={[styles.column, styles.quantityColumn, { color: colors.textSecondary }]}>TO ORDER</Text>}
      {!stacked && <View style={{ width: 14 }} />}
    </View>}</View>}
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
      const quantity = (value: number, order = false) => <View style={[styles.quantityColumn, stacked && styles.stackedQuantity]}>
        {stacked && <Text style={[styles.column, { color: colors.textSecondary }]}>{order ? 'TO ORDER' : 'IN STOCK'}</Text>}
        <Text style={[styles.number, { color: order ? colors.accentBlue : colors.textPrimary }]}>{value}</Text>
        <Text style={[styles.unit, { color: colors.textSecondary }]}>{item.unit}</Text>
      </View>;
      return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }}
        onPress={() => {
          if (!open) AccessibilityInfo.announceForAccessibility(`${item.name}. ${details.join('. ')}`);
          setExpanded(old => { const next = new Set(old); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; });
        }}
        style={[styles.item, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
        <View style={styles.line}>
          <Text style={[styles.index, { color: colors.textTertiary }]}>{String(index + 1).padStart(2, '0')}</Text>
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
          {!stacked && quantity(item.quantity)}
          {!stacked && row && quantity(row.quantity, true)}
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textTertiary} />
        </View>
        {stacked && <View style={[styles.facts, { backgroundColor: colors.bgPrimary, borderColor: colors.borderPrimary }]}>
          {quantity(item.quantity)}
          {row && <View style={[styles.orderFact, { borderColor: colors.borderPrimary }]}>{quantity(row.quantity, true)}</View>}
        </View>}
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
  content: { paddingHorizontal: 16, paddingBottom: 20, gap: 10 }, intro: { gap: 12 },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2 },
  column: { fontSize: 10, lineHeight: 15, fontWeight: '600', letterSpacing: 0.5, flexShrink: 1 },
  item: { padding: 14, borderWidth: 1, borderRadius: 16, gap: 10 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  nameColumn: { flex: 1, minWidth: 0, gap: 8 },
  index: { fontSize: 10, fontVariant: ['tabular-nums'], minWidth: 18, paddingTop: 3 },
  name: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  badge: { fontSize: 10, lineHeight: 16, fontWeight: '600' },
  quantityColumn: { width: 62, textAlign: 'right', alignItems: 'flex-end' },
  stackedQuantity: { flex: 1, width: 'auto', alignItems: 'flex-start', gap: 1 },
  facts: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10, gap: 12 },
  orderFact: { flex: 1, borderLeftWidth: 1, paddingLeft: 12 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, flexShrink: 1 },
  number: { fontSize: 19, lineHeight: 25, fontWeight: '700', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, lineHeight: 17 }, status: { fontSize: 10, lineHeight: 15, fontWeight: '600', flexShrink: 1 },
  detail: { fontSize: 12, lineHeight: 18 }, details: { gap: 4 },
  context: { paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  provenance: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
});
