/**
 * VitalTrack - Export Modal Component
 * Allows exporting inventory data as PDF or JSON
 */

import { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import { now } from '@/utils/helpers';
import { showInventoryPdfDialog } from '@/utils/inventoryPdfExport';
import { useItems, useCategories } from '@/hooks/useServerData';

interface ExportModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function ExportModal({ visible, onClose }: ExportModalProps) {
    const { colors } = useTheme();
    const [isExporting, setIsExporting] = useState(false);

    const { data: items = [] } = useItems();
    const { data: categories = [] } = useCategories();

    const handleExportPDF = () => {
        // The dialog handles the Table-Only / With-Photos choice, generates
        // the PDF, and shares it. We just close the modal so the share sheet
        // becomes the foreground UI.
        showInventoryPdfDialog({
            items,
            categories,
            onDone: () => onClose(),
        });
    };


    const handleExportJSON = async () => {
        setIsExporting(true);
        try {
            const exportData = {
                exportDate: now(),
                version: '2.0.0',
                categories: categories.map(cat => ({
                    id: cat.id,
                    name: cat.name,
                    description: cat.description,
                })),
                items: items.map(item => ({
                    id: item.id,
                    categoryId: item.categoryId,
                    name: item.name,
                    description: item.description,
                    quantity: item.quantity,
                    minimumStock: item.minimumStock,
                    unit: item.unit,
                    brand: item.brand,
                    supplierName: item.supplierName,
                    supplierContact: item.supplierContact,
                    purchaseLink: item.purchaseLink,
                    isCritical: item.isCritical,
                    notes: item.notes,
                })),
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            await Clipboard.setStringAsync(jsonString);

            onClose();
            Alert.alert(
                '✓ Copied to Clipboard',
                `Inventory data with ${items.length} items copied as JSON. Paste it in any text editor or share via messaging app.`,
                [{ text: 'OK' }]
            );
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to export JSON');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <View style={[styles.sheet, { backgroundColor: colors.bgCard }]}>
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.textPrimary }]}>Export Inventory</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.subtitle, { color: colors.textTertiary }]}>
                        Choose export format for your inventory data
                    </Text>

                    {/* PDF Export Option */}
                    <TouchableOpacity
                        style={[styles.exportOption, { backgroundColor: colors.statusRedBg, borderColor: colors.statusRed }]}
                        onPress={handleExportPDF}
                        disabled={isExporting}
                    >
                        <View style={[styles.optionIcon, { backgroundColor: colors.statusRed }]}>
                            <Ionicons name="document-text" size={24} color="#fff" />
                        </View>
                        <View style={styles.optionContent}>
                            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>Export as PDF</Text>
                            <Text style={[styles.optionDesc, { color: colors.textTertiary }]}>
                                Professional report with images and details
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                    </TouchableOpacity>

                    {/* JSON Export Option */}
                    <TouchableOpacity
                        style={[styles.exportOption, { backgroundColor: colors.accentBlueBg, borderColor: colors.accentBlue }]}
                        onPress={handleExportJSON}
                        disabled={isExporting}
                    >
                        <View style={[styles.optionIcon, { backgroundColor: colors.accentBlue }]}>
                            <Ionicons name="code-slash" size={24} color="#fff" />
                        </View>
                        <View style={styles.optionContent}>
                            <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>Export as JSON</Text>
                            <Text style={[styles.optionDesc, { color: colors.textTertiary }]}>
                                Raw data for backup or import
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                    </TouchableOpacity>

                    {isExporting && (
                        <Text style={[styles.exportingText, { color: colors.accentBlue }]}>
                            Preparing export...
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        padding: spacing.xl,
        paddingBottom: spacing.xxl,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    title: {
        fontSize: fontSize.xl,
        fontWeight: fontWeight.semibold,
    },
    subtitle: {
        fontSize: fontSize.sm,
        marginBottom: spacing.lg,
    },
    exportOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        marginBottom: spacing.md,
        gap: spacing.md,
    },
    optionIcon: {
        width: 48,
        height: 48,
        borderRadius: borderRadius.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionContent: {
        flex: 1,
    },
    optionTitle: {
        fontSize: fontSize.md,
        fontWeight: fontWeight.semibold,
    },
    optionDesc: {
        fontSize: fontSize.sm,
        marginTop: 2,
    },
    exportingText: {
        textAlign: 'center',
        fontSize: fontSize.sm,
        marginTop: spacing.md,
    },
});
