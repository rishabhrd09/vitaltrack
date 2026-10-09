import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeContext';
import type { Item } from '@/types';
import { stockLabel } from '@/features/assistant/queries';
import type { CartItem } from '@/features/assistant/drafts';

/** Full virtualized table. Large accessibility text switches to stacked rows. */
export default function AnswerList({ items, header, draftRows }: { items: Item[]; header: ReactNode; draftRows?: CartItem[] }) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.35 || width < 330;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const draftById = useMemo(() => new Map(draftRows?.map(row => [row.item.id, row])), [draftRows]);
  return <FlatList data={items} keyExtractor={i => i.id} keyboardShouldPersistTaps="handled"
    initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<View style={{ gap: 14 }}>{header}{!!items.length && <View style={[styles.tableHead, { borderColor: colors.borderPrimary }]}>
      <Text style={[styles.column, { color: colors.textTertiary, flex: 1 }]}>ITEM · {items.length}</Text>
      <Text style={[styles.column, { color: colors.textTertiary }]}>{draftRows ? 'STOCK / ORDER' : 'QTY / STATUS'}</Text>
    </View>}</View>}
    renderItem={({ item, index }) => {
      const row = draftById.get(item.id);
      const status = stockLabel(item);
      const tone = status === 'Out of stock' ? colors.statusRed : status === 'Low stock' ? colors.statusOrange : colors.statusGreen;
      return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${index + 1}. ${item.name}. ${item.quantity} ${item.unit}. ${status}. ${row ? `Order ${row.quantity} ${item.unit}, ${row.source}.` : ''} Show recorded details.`}
        accessibilityState={{ expanded: expanded.has(item.id) }} onPress={() => setExpanded(old => { const next = new Set(old); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}
        style={[styles.item, { borderColor: colors.borderPrimary }]}>
        <View style={[styles.line, stacked && { flexDirection: 'column' }]}>
          <View style={styles.nameGroup}>
            <Text style={[styles.index, { color: colors.textTertiary }]}>{String(index + 1).padStart(2, '0')}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.name, { color: colors.textPrimary }]}>{item.name}</Text>
              {expanded.has(item.id) && <Text style={[styles.detail, { color: colors.textTertiary }]}>{item.brand?.trim() || 'Brand not recorded'}</Text>}
            </View>
            <Ionicons name={expanded.has(item.id) ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textTertiary} />
          </View>
          <View style={[styles.quantity, stacked && { alignItems: 'flex-start', marginLeft: 28, maxWidth: '100%' }]}>
            <Text style={[styles.number, { color: colors.textPrimary }]}>{item.quantity} <Text style={[styles.unit, { color: colors.textSecondary }]}>{item.unit}</Text></Text>
            <Text style={[styles.status, { color: tone }]}>{status}</Text>
          </View>
        </View>
        {row && <View style={[styles.order, { backgroundColor: colors.accentBlueBg }]}>
          <Text style={[styles.detail, { color: colors.accentBlue, flex: 1 }]}>Order {row.quantity} {item.unit}</Text>
          <Text style={[styles.detail, { color: colors.textSecondary }]}>{row.source === 'spoken' ? 'Spoken' : row.source === 'suggested' ? 'Suggested' : 'Reviewed'}</Text>
        </View>}
        {expanded.has(item.id) && <View style={styles.details}>
          <Text style={[styles.detail, { color: colors.textSecondary }]}>Supplier · {item.supplierName?.trim() || 'Not recorded'}</Text>
          <Text style={[styles.detail, { color: colors.textSecondary }]}>Minimum stock · {item.minimumStock} {item.unit}</Text>
        </View>}
      </TouchableOpacity>;
    }} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 24 },
  tableHead: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  column: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, flexShrink: 1 },
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8, minHeight: 64 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nameGroup: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, minWidth: 0, gap: 8 },
  index: { fontSize: 11, fontVariant: ['tabular-nums'], minWidth: 20, paddingTop: 3 },
  name: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  quantity: { alignItems: 'flex-end', maxWidth: '42%', gap: 3 },
  number: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, fontWeight: '400' }, status: { fontSize: 11, fontWeight: '500' },
  detail: { fontSize: 12, lineHeight: 18 }, details: { marginLeft: 28, gap: 3 },
  order: { marginLeft: 28, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
