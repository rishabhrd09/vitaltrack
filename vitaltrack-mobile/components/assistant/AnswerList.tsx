import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import type { Item } from '@/types';
import { stockLabel } from '@/features/assistant/queries';
import type { CartItem } from '@/features/assistant/drafts';

/** Top-level virtualized results; no nested vertical ScrollView or truncated list. */
export default function AnswerList({ items, header, draftRows }: { items: Item[]; header: ReactNode; draftRows?: CartItem[] }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const draftById = useMemo(() => new Map(draftRows?.map(row => [row.item.id, row])), [draftRows]);
  return <FlatList data={items} keyExtractor={i => i.id} keyboardShouldPersistTaps="handled"
    initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
    contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 30 }}
    ListHeaderComponent={<View style={{ gap: 16 }}>{header}{!!items.length && <Text style={{ color: colors.textSecondary, fontSize: 14 }}># · Item · Quantity and unit · Status</Text>}</View>}
    renderItem={({ item, index }) => {
      const row = draftById.get(item.id);
      const status = stockLabel(item);
      const tone = status === 'Out of stock' ? colors.statusRed : status === 'Low stock' ? colors.statusOrange : colors.statusGreen;
      return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${index + 1}. ${item.name}. ${item.quantity} ${item.unit}. ${status}. ${row ? `Order ${row.quantity} ${item.unit}, ${row.source}.` : ''} Show recorded details.`}
        accessibilityState={{ expanded: expanded.has(item.id) }} onPress={() => setExpanded(old => { const next = new Set(old); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}
        style={{ padding: 16, borderRadius: 16, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderPrimary, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Text style={{ color: colors.textTertiary, fontSize: 14 }}>{index + 1}</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '600', flex: 1, minWidth: 120 }}>{item.name}</Text>
          <View style={{ alignItems: 'flex-end', maxWidth: '48%' }}>
            <Text style={{ color: colors.accentBlue, fontSize: 19, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{item.quantity} {item.unit}</Text>
            <Text style={{ color: tone, fontSize: 13, fontWeight: '600' }}>{status}</Text>
          </View>
        </View>
        {row && <Text style={{ color: colors.textPrimary, fontSize: 16 }}>Order: {row.quantity} {item.unit} · {row.source === 'spoken' ? 'Spoken quantity' : row.source === 'suggested' ? 'Suggested from minimum stock' : 'Manually reviewed'}</Text>}
        {expanded.has(item.id) && <View style={{ gap: 6 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Brand: {item.brand?.trim() || 'Not recorded'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Supplier: {item.supplierName?.trim() || 'Not recorded'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Minimum stock: {item.minimumStock} {item.unit}</Text>
        </View>}
      </TouchableOpacity>;
    }} />;
}
