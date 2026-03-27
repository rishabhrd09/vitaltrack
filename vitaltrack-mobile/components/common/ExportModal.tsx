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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import { useAppStore } from '@/store/useAppStore';
import { formatDate, now } from '@/utils/helpers';
import { escapeHtml, validateImageUri } from '@/utils/sanitize';
import { isLowStock, isOutOfStock } from '@/types';

interface ExportModalProps {
    visible: boolean;
    onClose: () => void;
}

export default function ExportModal({ visible, onClose }: ExportModalProps) {
    const { colors } = useTheme();
    const [isExporting, setIsExporting] = useState(false);

    const items = useAppStore((state) => state.items);
    const categories = useAppStore((state) => state.categories);

    const getBase64Image = async (uri: string): Promise<string> => {
        try {
            // Validate URI for security
            const validUri = validateImageUri(uri);
            if (!validUri) return '';

            // Skip if already a data URI
            if (validUri.startsWith('data:')) return validUri;

            let fileUri = validUri;
            if (!validUri.startsWith('file://') && !validUri.startsWith('content://')) {
                fileUri = validUri.startsWith('/') ? `file://${validUri}` : validUri;
            }

            const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
            const ext = validUri.split('.').pop()?.toLowerCase() || 'jpeg';
            const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
            return `data:${mimeType};base64,${base64}`;
        } catch (error) {
            console.log('Export Image conversion failed:', error);
            return '';
        }
    };

    const handleExportPDF = async () => {
        const activeItems = items.filter(i => i.isActive);
        const hasImages = activeItems.some(i => i.imageUri);
        if (hasImages) {
            Alert.alert(
                'Export PDF',
                'Include item photos in the PDF?',
                [
                    { text: 'Table Only', onPress: () => doExportPDF(false) },
                    { text: 'With Photos', onPress: () => doExportPDF(true) },
                ]
            );
        } else {
            doExportPDF(false);
        }
    };

    const doExportPDF = async (includePhotos: boolean) => {
        setIsExporting(true);
        try {
            // Filter active items only (matching dashboard logic)
            const activeItems = items.filter(i => i.isActive);

            // Calculate stats using the same helper functions as dashboard
            const outOfStockItems = activeItems.filter(i => isOutOfStock(i));
            const lowStockItems = activeItems.filter(i => isLowStock(i));

            // Only process images if user wants photos
            const itemsWithImages = includePhotos
                ? await Promise.all(activeItems.map(async (item) => {
                    const imageBase64 = await getBase64Image(item.imageUri || '');
                    return { ...item, imageBase64 };
                }))
                : activeItems.map(item => ({ ...item, imageBase64: '' }));

            const currentDate = formatDate(now());
            const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', -apple-system, sans-serif;
            padding: 28px;
            color: #2d3748;
            background: #fff;
            line-height: 1.5;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 3px solid #1e3a5f;
        }
        h1 {
            font-size: 26px;
            color: #1e3a5f;
            font-weight: 700;
            margin-bottom: 6px;
        }
        .meta { color: #718096; font-size: 13px; }

        .summary-bar {
            display: flex;
            justify-content: center;
            gap: 28px;
            background: linear-gradient(135deg, #1e3a5f 0%, #2d5a7b 100%);
            color: white;
            padding: 14px 24px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .summary-item { text-align: center; }
        .summary-value { font-size: 24px; font-weight: 700; }
        .summary-label { font-size: 11px; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.03em; }

        .alert-box {
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 14px;
        }
        .alert-oos {
            background: #fdf2f2;
            border-left: 3px solid #c9a0a0;
        }
        .alert-low {
            background: #fdf8f0;
            border-left: 3px solid #c4a76c;
        }
        .alert-title {
            font-size: 13px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .alert-oos .alert-title { color: #8b5e5e; }
        .alert-low .alert-title { color: #8b7240; }
        .badge-list { display: flex; flex-wrap: wrap; gap: 5px; }
        .badge {
            font-size: 11px;
            padding: 3px 9px;
            border-radius: 10px;
            font-weight: 500;
        }
        .badge-oos { background: #f5e1e1; color: #7a4a4a; }
        .badge-low { background: #f5edd8; color: #7a6330; }

        .section-title {
            font-size: 16px;
            font-weight: 700;
            color: #1e3a5f;
            margin: 20px 0 12px;
            padding-bottom: 6px;
            border-bottom: 1px solid #e2e8f0;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background: #1e3a5f;
            color: #fff;
            padding: 10px 8px;
            text-align: left;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }
        th:first-child { width: 30px; text-align: center; }
        th.col-stock { text-align: center; width: 60px; }
        th.col-min { text-align: center; width: 45px; }
        th.col-status { text-align: center; width: 70px; }

        td {
            padding: 8px 8px;
            border-bottom: 1px solid #edf2f7;
            font-size: 13px;
            vertical-align: middle;
            color: #4a5568;
        }
        tr:nth-child(even) { background: #fafbfc; }
        td:first-child { text-align: center; color: #a0aec0; font-size: 11px; }

        .item-name {
            font-weight: 600;
            color: #2d3748;
            font-size: 14px;
        }

        .stock-num { font-weight: 700; text-align: center; font-size: 14px; }
        .stock-zero { color: #a06060; }
        .stock-low { color: #a08040; }
        .stock-ok { color: #5a8a6a; }
        td.col-min { text-align: center; color: #a0aec0; font-size: 12px; }

        .status-badge {
            font-size: 9px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 3px;
            display: inline-block;
            letter-spacing: 0.03em;
        }
        .sb-critical { background: #f0dede; color: #8b5050; }
        .sb-oos { background: #f0dede; color: #8b5050; }
        .sb-low { background: #f0e8d0; color: #7a6330; }
        .sb-ok { background: #ddeee4; color: #4a7a5a; }

        .dim { color: #c0c8d0; font-style: italic; font-size: 12px; }

        .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 11px;
            color: #a0aec0;
            padding-top: 14px;
            border-top: 1px solid #edf2f7;
        }
        .footer b { color: #1e3a5f; }

        .gallery-header {
            page-break-before: always;
            text-align: center;
            padding: 30px 0 20px;
        }
        .gallery-header h2 { color: #1e3a5f; font-size: 20px; margin-bottom: 6px; }
        .gallery-header p { color: #a0aec0; font-size: 12px; }
        .gallery-item {
            page-break-inside: avoid;
            text-align: center;
            margin-bottom: 36px;
            padding: 16px;
        }
        .gallery-item h3 { color: #1e3a5f; font-size: 16px; margin-bottom: 6px; }
        .gallery-item p { color: #a0aec0; font-size: 11px; margin-bottom: 12px; }
        .gallery-item img {
            max-width: 85%;
            max-height: 400px;
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 VitalTrack Inventory Report</h1>
        <div class="meta">Generated on ${currentDate}</div>
    </div>

    <div class="summary-bar">
        <div class="summary-item">
            <div class="summary-value">${activeItems.length}</div>
            <div class="summary-label">Total Items</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${categories.length}</div>
            <div class="summary-label">Categories</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${outOfStockItems.length}</div>
            <div class="summary-label">Out of Stock</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${lowStockItems.length}</div>
            <div class="summary-label">Low Stock</div>
        </div>
    </div>

    ${outOfStockItems.length > 0 ? `
        <div class="alert-box alert-oos">
            <div class="alert-title">⚠️ Out of Stock Items (${outOfStockItems.length})</div>
            <div class="badge-list">
                ${outOfStockItems.map(i => `<span class="badge badge-oos">${escapeHtml(i.name)}</span>`).join('')}
            </div>
        </div>
    ` : ''}

    ${lowStockItems.length > 0 ? `
        <div class="alert-box alert-low">
            <div class="alert-title">⚡ Low Stock Items (${lowStockItems.length})</div>
            <div class="badge-list">
                ${lowStockItems.map(i => `<span class="badge badge-low">${escapeHtml(i.name)} (${i.quantity})</span>`).join('')}
            </div>
        </div>
    ` : ''}

    <div class="section-title">📦 Complete Inventory</div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Item Name</th>
                <th class="col-status" style="text-align:center">Status</th>
                <th class="col-stock" style="text-align:center">Stock</th>
                <th class="col-min" style="text-align:center">Min</th>
                <th>Brand</th>
                <th>Supplier</th>
            </tr>
        </thead>
        <tbody>
            ${itemsWithImages.map((item, idx) => {
                const isOOS = item.quantity <= 0;
                const isLow = !isOOS && item.quantity <= item.minimumStock;
                const isCrit = item.isCritical;
                let statusBadge = '<span class="status-badge sb-ok">OK</span>';
                if (isOOS) statusBadge = '<span class="status-badge sb-oos">OUT</span>';
                else if (isLow) statusBadge = '<span class="status-badge sb-low">LOW</span>';
                if (isCrit && !isOOS && !isLow) statusBadge = '<span class="status-badge sb-critical">CRITICAL</span>';
                else if (isCrit && isOOS) statusBadge = '<span class="status-badge sb-oos">OUT</span>';

                let stockClass = 'stock-ok';
                if (isOOS) stockClass = 'stock-zero';
                else if (isLow) stockClass = 'stock-low';

                return '<tr>'
                    + '<td>' + (idx + 1) + '</td>'
                    + '<td><span class="item-name">' + escapeHtml(item.name) + '</span></td>'
                    + '<td style="text-align:center">' + statusBadge + '</td>'
                    + '<td class="stock-num ' + stockClass + '">' + item.quantity + ' ' + escapeHtml(item.unit) + '</td>'
                    + '<td class="col-min">' + item.minimumStock + '</td>'
                    + '<td>' + (escapeHtml(item.brand) || '<span class="dim">—</span>') + '</td>'
                    + '<td>' + (escapeHtml(item.supplierName) || '<span class="dim">—</span>') + '</td>'
                    + '</tr>';
            }).join('')}
        </tbody>
    </table>

    <div class="footer">Generated by <b>VitalTrack</b> • Home ICU Inventory Management</div>

    ${itemsWithImages.filter(i => i.imageBase64).length > 0 ? `
        <div class="gallery-header">
            <h2>📸 Item Photo Reference</h2>
            <p>Full-size images for items with photos (${itemsWithImages.filter(i => i.imageBase64).length} items)</p>
        </div>
        ${itemsWithImages.filter(i => i.imageBase64).map(item => `
            <div class="gallery-item">
                <h3>${escapeHtml(item.name)}</h3>
                <p>Stock: ${item.quantity} ${escapeHtml(item.unit)} • Min: ${item.minimumStock}</p>
                <img src="${item.imageBase64}" />
            </div>
        `).join('')}
    ` : ''}
</body>
</html>`;

            const { uri } = await Print.printToFileAsync({ html });
            const FileSystem = await import('expo-file-system/legacy');
            const pdfDir = FileSystem.documentDirectory || '';
            const dateStr = new Date().toISOString().slice(0, 10);
            const newUri = `${pdfDir}VitalTrack-Inventory-${dateStr}.pdf`;
            await FileSystem.copyAsync({ from: uri, to: newUri });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(newUri, {
                    UTI: 'com.adobe.pdf',
                    mimeType: 'application/pdf',
                    dialogTitle: 'VitalTrack Inventory Report'
                });
            }
            onClose();
            Alert.alert('✓ Exported', 'Inventory exported as PDF successfully.');
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to export PDF');
        } finally {
            setIsExporting(false);
        }
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
