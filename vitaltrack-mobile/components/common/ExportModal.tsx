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
        setIsExporting(true);
        try {
            // Filter active items only (matching dashboard logic)
            const activeItems = items.filter(i => i.isActive);

            // Calculate stats using the same helper functions as dashboard
            const outOfStockItems = activeItems.filter(i => isOutOfStock(i));
            const lowStockItems = activeItems.filter(i => isLowStock(i));

            // Process images
            const itemsWithImages = await Promise.all(activeItems.map(async (item) => {
                const imageBase64 = await getBase64Image(item.imageUri || '');
                return { ...item, imageBase64 };
            }));

            const currentDate = formatDate(now());
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        * { box-sizing: border-box; margin: 0; padding: 0; }
                        body { 
                            font-family: 'Segoe UI', -apple-system, sans-serif; 
                            padding: 30px; 
                            color: #1a1a1a; 
                            background: #fff;
                            line-height: 1.4;
                        }
                        .header { 
                            text-align: center; 
                            margin-bottom: 30px; 
                            padding-bottom: 20px; 
                            border-bottom: 3px solid #1e3a5f; 
                        }
                        h1 { 
                            font-size: 28px; 
                            color: #1e3a5f; 
                            font-weight: 700;
                            margin-bottom: 8px;
                        }
                        .meta { color: #666; font-size: 14px; }
                        .summary-bar {
                            display: flex;
                            justify-content: center;
                            gap: 30px;
                            background: linear-gradient(135deg, #1e3a5f 0%, #2d5a7b 100%);
                            color: white;
                            padding: 15px 25px;
                            border-radius: 10px;
                            margin-bottom: 25px;
                        }
                        .summary-item { text-align: center; }
                        .summary-value { font-size: 24px; font-weight: 700; }
                        .summary-label { font-size: 12px; opacity: 0.9; }
                        
                        /* Redesigned Card for Large Images */
                        .item-card { 
                            display: flex; 
                            flex-direction: row;
                            margin-bottom: 25px; 
                            border: 1px solid #e0e0e0; 
                            border-radius: 12px; 
                            overflow: hidden; 
                            background: #fafafa;
                            page-break-inside: avoid;
                            min-height: 220px; /* Enforced height */
                        }
                        .item-main { 
                            flex: 1; /* Takes remaining space */
                            padding: 20px; 
                            display: flex;
                            flex-direction: column;
                            justify-content: space-between;
                        }
                        .item-image { 
                            width: 200px; /* Fixed large width */
                            min-height: 220px;
                            background: #fff; 
                            border-left: 1px solid #eee;
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            padding: 10px;
                        }
                        .item-image img { 
                            width: 100%; 
                            height: 100%; 
                            object-fit: contain; 
                            max-height: 200px;
                        }

                        .item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
                        .item-name { font-size: 20px; font-weight: 700; color: #1a1a1a; }
                        .critical-badge { background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; border: 1px solid #fecaca; }
                        
                        .stock-section { margin-bottom: 15px; }
                        .stock-badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 13px; margin-right: 8px; }
                        .stock-min { background: #f1f5f9; color: #64748b; }
                        
                        .details-grid { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
                        .detail-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
                        .detail-value { font-size: 14px; font-weight: 600; color: #334155; }
                        
                        .link-btn { display: inline-block; margin-top: 15px; background: #1e3a5f; color: white; padding: 8px 16px; border-radius: 6px; font-size: 12px; text-decoration: none; font-weight: 500; text-align: center; }
                        
                        .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #888; padding-top: 20px; border-top: 2px solid #e8e8e8; }
                        .footer-brand { font-weight: 600; color: #1e3a5f; }
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

                    <!-- Out of Stock Alerts -->
                    ${outOfStockItems.length > 0 ? `
                        <div style="background: #fef2f2; border: 1px solid #fee2e2; border-radius: 10px; padding: 15px; margin-bottom: 20px;">
                            <div style="color: #991b1b; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                                ⚠️ Out of Stock Items (${outOfStockItems.length})
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                ${outOfStockItems.map(i => `
                                    <span style="background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                                        ${escapeHtml(i.name)}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Low Stock Alerts -->
                    ${lowStockItems.length > 0 ? `
                        <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 10px; padding: 15px; margin-bottom: 30px;">
                            <div style="color: #92400e; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                                ⚡ Low Stock Items (${lowStockItems.length})
                            </div>
                            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                ${lowStockItems.map(i => `
                                    <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                                        ${escapeHtml(i.name)} (${i.quantity})
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <h3 style="margin-bottom: 20px; color: #1e3a5f; display: flex; align-items: center; gap: 10px; font-size: 18px;">
                        📦 Complete Inventory
                    </h3>

                    ${itemsWithImages.map((item, index) => `
                        <div class="item-card">
                            <div class="item-main">
                                <div>
                                    <div class="item-header">
                                        <div class="item-name"><span style="color: #cbd5e1; font-weight: 400; font-size: 16px;">#${index + 1}</span> ${escapeHtml(item.name)}</div>
                                        ${item.isCritical ? '<span class="critical-badge">CRITICAL</span>' : ''}
                                    </div>
                                    <div class="stock-section">
                                        <span class="stock-badge">📦 Stock: ${item.quantity} ${escapeHtml(item.unit)}</span>
                                        <span class="stock-badge stock-min">Min: ${item.minimumStock}</span>
                                    </div>
                                </div>
                                
                                <div>
                                    <div class="details-grid">
                                        <div>
                                            <div class="detail-label">Brand</div>
                                            <div class="detail-value">${escapeHtml(item.brand) || '—'}</div>
                                        </div>
                                        <div>
                                            <div class="detail-label">Supplier</div>
                                            <div class="detail-value">${escapeHtml(item.supplierName) || '—'}</div>
                                        </div>
                                    </div>
                                    ${item.purchaseLink ? `<a href="${encodeURI(item.purchaseLink)}" class="link-btn">🛒 Purchase Link</a>` : ''}
                                </div>
                            </div>
                            ${item.imageBase64 ? `<div class="item-image"><img src="${item.imageBase64}" /></div>` : ''}
                        </div>
                    `).join('')}

                    <div class="footer">Generated by <span class="footer-brand">VitalTrack</span> • Home ICU Inventory Management</div>
                </body>
                </html>
            `;

            const { uri } = await Print.printToFileAsync({ html });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                    UTI: 'com.adobe.pdf',
                    mimeType: 'application/pdf',
                    dialogTitle: 'Export VitalTrack Inventory'
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
