import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import { isCriticalEquipment, type Item } from '@/types';
import { stockLabel } from '@/features/assistant/queries';
import type { CartItem } from '@/features/assistant/drafts';

const PROVENANCE = { spoken: 'Explicit', suggested: 'Suggested', manual: 'Edited' } as const;
const STATUS_ICON = { 'Out of stock': 'close-circle', 'Low stock': 'alert-circle', 'In stock': 'checkmark-circle' } as const;

/**
 * Full virtualized table: item, quantity with unit, and status as icon plus text (never colour alone).
 * Each row says why it is listed; draft rows say whether the order quantity was explicit or suggested.
 * Large accessibility text and narrow screens switch to stacked rows.
 */
export default function AnswerList({ items, header, draftRows, reasons }: { items: Item[]; header: ReactNode; draftRows?: CartItem[]; reasons?: Record<string, string[]> }) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  // Keep a useful name column after the sheet padding and the two numeric columns.
  const stacked = fontScale > 1.15 || width < 380;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const draftById = useMemo(() => new Map(draftRows?.map(row => [row.item.id, row])), [draftRows]);
  const column = [styles.column, { color: colors.textTertiary }];
  return <FlatList data={items} keyExtractor={i => i.id} keyboardShouldPersistTaps="handled"
    initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<View style={{ gap: 14 }}>{header}{!!items.length && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.tableHead, { borderColor: colors.borderPrimary }]}>
      <Text style={[column, { flex: 1 }]}>ITEM · {items.length}</Text>
      {!stacked && <Text style={[column, styles.quantityColumn]}>{draftRows ? 'STOCK' : 'QTY'}</Text>}
      {!stacked && <Text style={[column, styles.statusColumn]}>{draftRows ? 'ORDER' : 'STATUS'}</Text>}
    </View>}</View>}
    renderItem={({ item, index }) => {
      const row = draftById.get(item.id);
      const status = stockLabel(item);
      const tone = status === 'Out of stock' ? colors.statusRed : status === 'Low stock' ? colors.statusOrange : colors.statusGreen;
      const critical = isCriticalEquipment(item);
      const why = (reasons?.[item.id] || []).join(' · ');
      const provenance = row && `${PROVENANCE[row.source]}${row.source !== 'manual' && row.basis ? ` · ${row.basis.replace(/^Suggested · /, '')}` : ''}`;
      const open = expanded.has(item.id);
      const label = [`${index + 1}. ${item.name}`, `${item.quantity} ${item.unit}`, status, critical && 'Critical equipment', why && `Why: ${why}`,
        row && `Order ${row.quantity} ${item.unit}, ${provenance}`, open ? 'Hide recorded details' : 'Show recorded details'].filter(Boolean).join('. ');
      const statusView = <View style={styles.statusLine}>
        <Ionicons name={STATUS_ICON[status]} size={13} color={tone} />
        <Text style={[styles.status, { color: tone }]}>{status}</Text>
      </View>;
      return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }}
        onPress={() => setExpanded(old => { const next = new Set(old); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}
        style={[styles.item, { borderColor: colors.borderPrimary }]}>
        <View style={styles.line}>
          <Text style={[styles.index, { color: colors.textTertiary }]}>{String(index + 1).padStart(2, '0')}</Text>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.textPrimary, flexShrink: 1 }]}>{item.name}</Text>
              {critical && <Text style={[styles.badge, { color: colors.statusOrange }]}>★ Critical</Text>}
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textTertiary} />
            </View>
            {stacked && <View style={styles.stackedFacts}>
              <Text style={[styles.number, { color: colors.textPrimary }]}>{item.quantity} <Text style={[styles.unit, { color: colors.textSecondary }]}>{item.unit}</Text></Text>
              {statusView}
            </View>}
            {!!why && <Text style={[styles.detail, { color: colors.textSecondary }]}>Why: {why}</Text>}
          </View>
          {!stacked && <View style={styles.quantityColumn}>
            <Text style={[styles.number, { color: colors.textPrimary }]}>{item.quantity}</Text>
            <Text style={[styles.unit, { color: colors.textSecondary }]}>{item.unit}</Text>
          </View>}
          {!stacked && <View style={styles.statusColumn}>{row
            ? <><Text style={[styles.number, { color: colors.accentBlue }]}>{row.quantity}</Text><Text style={[styles.unit, { color: colors.textSecondary }]}>{item.unit}</Text></>
            : statusView}</View>}
        </View>
        {row && <View style={[styles.order, { backgroundColor: colors.accentBlueBg }]}>
          <Text style={[styles.detail, { color: colors.accentBlue, fontWeight: '600' }]}>Order {row.quantity} {item.unit}</Text>
          <Text style={[styles.detail, { color: colors.textSecondary, flexShrink: 1 }]}>{provenance}</Text>
          {stacked ? null : statusView}
        </View>}
        {open && <View style={styles.details}>
          <Text style={[styles.detail, { color: colors.textSecondary }]}>Supplier · {item.supplierName?.trim() || 'Not recorded'}</Text>
          <Text style={[styles.detail, { color: colors.textSecondary }]}>Brand · {item.brand?.trim() || 'Not recorded'}</Text>
          <Text style={[styles.detail, { color: colors.textSecondary }]}>Minimum stock · {item.minimumStock} {item.unit}</Text>
          {critical && <Text style={[styles.detail, { color: colors.textSecondary }]}>Critical equipment · {item.isCritical ? 'marked on the item' : 'by name rule'}</Text>}
        </View>}
      </TouchableOpacity>;
    }} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 24 },
  tableHead: { flexDirection: 'row', gap: 10, paddingVertical: 12, paddingLeft: 30, borderBottomWidth: 1 },
  column: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, flexShrink: 1 },
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8, minHeight: 64 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  index: { fontSize: 11, fontVariant: ['tabular-nums'], minWidth: 20, paddingTop: 3 },
  name: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  badge: { fontSize: 11, fontWeight: '600' },
  quantityColumn: { width: 64, alignItems: 'flex-end' },
  statusColumn: { width: 96, alignItems: 'flex-end' },
  stackedFacts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  number: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, fontWeight: '400' }, status: { fontSize: 11, fontWeight: '600', flexShrink: 1 },
  detail: { fontSize: 12, lineHeight: 18 }, details: { marginLeft: 30, gap: 3 },
  order: { marginLeft: 30, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
