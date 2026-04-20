/**
 * VitalTrack - Build Inventory Screen
 * Premium Groww/Claude-inspired UI with comprehensive data management
 */

import { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Modal,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTheme } from '@/theme/ThemeContext';
import { spacing, fontSize, fontWeight, borderRadius } from '@/theme/spacing';
import { formatDate, now } from '@/utils/helpers';
import { escapeHtml } from '@/utils/sanitize';
import { isOutOfStock, isLowStock, type Category } from '@/types';
import { useItems, useCategories } from '@/hooks/useServerData';
import { useDeleteItem, useDeleteCategory, useCreateCategory, useToggleItemCritical, useCreateItem } from '@/hooks/useServerMutations';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useDelayedPending } from '@/hooks/useDelayedPending';
import { handleMutationError } from '@/utils/serverErrors';
import {
    useSeedInventory,
    useStartFresh,
    createAutoBackup,
    deleteAllInventory,
    isProtectedCategory,
    getSuggestedItemsForCategory,
} from '@/hooks/useSeedInventory';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/useServerData';

export default function BuildInventoryScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const scrollRef = useRef<ScrollView>(null);
    const { isOnline } = useNetworkStatus();

    const { data: categories = [], isLoading: categoriesLoading } = useCategories();
    const { data: items = [], isLoading: itemsLoading } = useItems();
    const deleteItemMutation = useDeleteItem();
    const deleteCategoryMutation = useDeleteCategory();
    const createCategoryMutation = useCreateCategory();
    const createItemMutation = useCreateItem();
    const toggleItemCriticalMutation = useToggleItemCritical();
    const { seed, isSeeding, progress: seedProgress } = useSeedInventory();
    const { startFresh } = useStartFresh();
    const queryClient = useQueryClient();
    const showCreateCategoryPending = useDelayedPending(createCategoryMutation.isPending);

    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
        categories.length > 0 ? categories[0].id : null
    );
    const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryDesc, setNewCategoryDesc] = useState('');
    // Use a ref so the prompt fires exactly once per mount, even if state updates
    // re-trigger the effect before Alert is dismissed.
    const seedPromptFiredRef = useRef(false);

    // Keep selectedCategoryId in sync when categories load or change
    useEffect(() => {
        if (!selectedCategoryId && categories.length > 0) {
            setSelectedCategoryId(categories[0].id);
        }
    }, [categories, selectedCategoryId]);

    // Auto-prompt new users (empty inventory) to seed 32 default items.
    // Fires exactly once per screen mount.
    useEffect(() => {
        if (categoriesLoading || itemsLoading) return;
        if (seedPromptFiredRef.current) return;
        if (categories.length === 0 && items.length === 0) {
            seedPromptFiredRef.current = true;
            Alert.alert(
                'Welcome to CareKosh',
                'Your inventory is empty. Would you like to add the default Home ICU inventory (10 categories, 32 items)?',
                [
                    { text: 'No, start empty', style: 'cancel' },
                    { text: 'Yes, add defaults', onPress: () => handleSeed() },
                ]
            );
        }
    }, [categoriesLoading, itemsLoading, categories.length, items.length]);

    const categoryItems = items.filter((item) => item.categoryId === selectedCategoryId);
    const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
    // Suggestions: seed items that belong to this category but aren't yet in inventory
    const suggestedItems = selectedCategory
        ? getSuggestedItemsForCategory(selectedCategory.name, categoryItems)
        : [];

    // ========== DATA MANAGEMENT HANDLERS ==========

    // Actually run the seed (called after confirmation)
    const runSeed = async () => {
        if (!isOnline) {
            Alert.alert('Offline', 'Connect to WiFi to add default inventory.');
            return;
        }
        try {
            const result = await seed();
            if (result.status === 'already-seeded') {
                Alert.alert(
                    'Already set up',
                    'Your inventory already has the default Home ICU items. Nothing to add.'
                );
                return;
            }
            if (result.trueFailures.length > 0) {
                Alert.alert(
                    "Some items couldn't be added",
                    `${result.trueFailures.length} failed:\n${result.trueFailures.slice(0, 3).join('\n')}${result.trueFailures.length > 3 ? '\n…' : ''}`
                );
                return;
            }
            if (result.skippedExisting === 0) {
                Alert.alert(
                    'Default inventory added',
                    '10 categories and 32 items are ready.'
                );
                return;
            }
            // Some or all already existed — name only the items (skipped categories
            // share the same count but their names belong to a different sentence).
            const itemNames = result.skippedItemNames;
            let alreadyLine = '';
            if (itemNames.length === 0) {
                alreadyLine = '';
            } else if (itemNames.length <= 6) {
                alreadyLine = `\n\nAlready had: ${itemNames.join(', ')}`;
            } else {
                alreadyLine = `\n\nAlready had: ${itemNames.slice(0, 3).join(', ')}, and ${itemNames.length - 3} more`;
            }
            Alert.alert(
                'Default inventory added',
                `${result.createdItems} new items added, ${result.skippedExisting} already in your inventory were kept unchanged.${alreadyLine}`
            );
        } catch (err) {
            handleMutationError(err, 'Seed Inventory');
        }
    };

    // Replace-all flow: auto-backup, wipe everything, re-seed defaults.
    const confirmReplaceAll = () => {
        Alert.alert(
            'Replace all inventory?',
            'This will:\n\n• Auto-backup your current inventory to a JSON file\n• Delete all your current items and categories\n• Replace them with the 10 default categories and 32 default items\n\nStock quantities and any custom items will be lost. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Backup & Replace',
                    style: 'destructive',
                    onPress: async () => {
                        if (!isOnline) {
                            Alert.alert('Offline', 'Connect to WiFi to replace inventory.');
                            return;
                        }
                        let backupPath = '';
                        try {
                            backupPath = await createAutoBackup(categories, items);
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            Alert.alert('Backup Failed', `Could not create auto-backup: ${msg}\n\nReplace aborted to protect your data.`);
                            return;
                        }
                        // Wrap delete+seed so the cache is reconciled whether
                        // either step throws. seed()'s own finally also resets,
                        // but if delete throws before seed ever runs, we still
                        // need UI reconciliation against the server's partial state.
                        let deleteFailed = false;
                        try {
                            try {
                                await deleteAllInventory(items, categories);
                            } catch (err) {
                                deleteFailed = true;
                                handleMutationError(err, 'Delete Inventory');
                                return;
                            }
                            try {
                                await seed();
                                showBackupDoneAlert(
                                    'Done',
                                    'Your previous inventory was backed up and replaced with defaults.',
                                    backupPath,
                                );
                            } catch (err) {
                                handleMutationError(err, 'Seed Inventory');
                            }
                        } finally {
                            // If delete threw, seed never ran and its reconcile
                            // never fired — do it here so drifted cache is refreshed.
                            if (deleteFailed) {
                                try {
                                    await Promise.all([
                                        queryClient.resetQueries({ queryKey: queryKeys.items }),
                                        queryClient.resetQueries({ queryKey: queryKeys.categories }),
                                        queryClient.resetQueries({ queryKey: queryKeys.activities }),
                                    ]);
                                    await Promise.all([
                                        queryClient.refetchQueries({ queryKey: queryKeys.items }),
                                        queryClient.refetchQueries({ queryKey: queryKeys.categories }),
                                    ]);
                                } catch (reconcileErr) {
                                    console.warn('[ReplaceAll] Cache reconciliation failed:', reconcileErr);
                                }
                            }
                        }
                    },
                },
            ]
        );
    };

    // Show confirmation, then seed. Used by both manual button and auto-prompt.
    const handleSeed = () => {
        const hasExisting = items.length > 0 || categories.length > 0;
        if (!hasExisting) {
            Alert.alert(
                'Add Default Inventory',
                'This will add the default Home ICU items (10 categories, 32 items).',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Add Defaults', onPress: () => runSeed() },
                ]
            );
            return;
        }
        Alert.alert(
            'Add Default Inventory',
            'You already have items in your inventory. How would you like to add the default Home ICU items?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Merge', onPress: () => runSeed() },
                { text: 'Replace all', style: 'destructive', onPress: () => confirmReplaceAll() },
            ]
        );
    };

    // Actually export the JSON backup (called after confirmation)
    const runBackup = async () => {
        try {
            const backup = {
                version: 1,
                exportedAt: new Date().toISOString(),
                categories,
                items,
            };
            const json = JSON.stringify(backup, null, 2);
            const FileSystem = await import('expo-file-system/legacy');
            const dir = FileSystem.documentDirectory || '';
            const dateStr = new Date().toISOString().slice(0, 10);
            const fileUri = `${dir}CareKosh-Backup-${dateStr}.json`;
            await FileSystem.writeAsStringAsync(fileUri, json);
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'application/json',
                    dialogTitle: 'CareKosh Backup',
                });
            } else {
                Alert.alert('Saved', `Backup written to ${fileUri}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            Alert.alert('Backup Failed', msg);
        }
    };

    const handleBackup = () => {
        if (items.length === 0 && categories.length === 0) {
            Alert.alert('Nothing to back up', 'Add some items first.');
            return;
        }
        Alert.alert(
            'Export Backup',
            'This will create a JSON backup of your entire inventory (categories, items, quantities). You can share or save the file.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Export', onPress: () => runBackup() },
            ]
        );
    };

    // After a destructive flow finishes, surface the auto-backup through the
    // system share sheet so the user can move it off the app's sandboxed dir
    // (Drive, WhatsApp, email). Showing a raw file:// URI in an Alert is
    // useless — the user can't navigate to it, can't recover it if they wipe
    // the app, and arguably defeats the point of "backup before destructive".
    const showBackupDoneAlert = (title: string, body: string, backupPath: string) => {
        const filename = backupPath.split('/').pop() || backupPath;
        Alert.alert(
            title,
            `${body}\n\nBackup saved: ${filename}`,
            [
                {
                    text: 'Share backup',
                    onPress: async () => {
                        try {
                            if (await Sharing.isAvailableAsync()) {
                                await Sharing.shareAsync(backupPath, {
                                    mimeType: 'application/json',
                                    dialogTitle: 'CareKosh Backup',
                                });
                            }
                        } catch {
                            // Sharing cancellation isn't an error worth surfacing.
                        }
                    },
                },
                { text: 'OK', style: 'cancel' },
            ]
        );
    };

    const handleStartFresh = () => {
        if (!isOnline) {
            Alert.alert('Offline', 'Connect to WiFi to reset inventory.');
            return;
        }
        if (items.length === 0) {
            Alert.alert('Nothing to reset', 'Your inventory is already empty.');
            return;
        }
        Alert.alert(
            'Start Fresh — Are you sure?',
            'This will:\n\n• Auto-backup your current inventory to a JSON file\n• Delete all non-essential items from the server\n• Keep life-support equipment (ventilator, oxygen, suction, nebulizer, ambu bag, BiPAP)\n\nThis action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Backup & Start Fresh',
                    style: 'destructive',
                    onPress: async () => {
                        let backupPath = '';
                        try {
                            // Step 1: Auto-backup silently
                            backupPath = await createAutoBackup(categories, items);
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            Alert.alert('Backup Failed', `Could not create auto-backup: ${msg}\n\nStart Fresh aborted to protect your data.`);
                            return;
                        }
                        try {
                            // Step 2: Delete non-essential items
                            const result = await startFresh(items);
                            showBackupDoneAlert(
                                'Done',
                                `Deleted ${result.deleted} items. Kept ${result.kept} essential items.${result.errors.length > 0 ? `\n\n${result.errors.length} failed.` : ''}`,
                                backupPath,
                            );
                        } catch (err) {
                            handleMutationError(err, 'Start Fresh');
                        }
                    },
                },
            ]
        );
    };

    // Internal: actually generate and share the PDF.
    const runExportPDF = async () => {
        // Filter to only active items (matching ExportModal logic)
        const activeItems = items.filter(i => i.isActive);

        // Use the SAME helper functions as ExportModal (Dashboard export)
        const outOfStockItems = activeItems.filter(i => isOutOfStock(i));
        const lowStockItems = activeItems.filter(i => isLowStock(i));

        const currentDate = formatDate(now());
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { 
                        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; 
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
                    .meta { 
                        color: #666; 
                        font-size: 14px; 
                    }
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
                    .summary-item {
                        text-align: center;
                    }
                    .summary-value {
                        font-size: 24px;
                        font-weight: 700;
                    }
                    .summary-label {
                        font-size: 12px;
                        opacity: 0.9;
                    }
                    .item-card { 
                        display: flex; 
                        margin-bottom: 20px; 
                        border: 1px solid #e0e0e0; 
                        border-radius: 12px; 
                        overflow: hidden; 
                        background: #fafafa;
                        page-break-inside: avoid;
                    }
                    .item-main { 
                        flex: 1; 
                        padding: 18px;
                    }
                    .item-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        margin-bottom: 12px;
                    }
                    .item-name { 
                        font-size: 18px; 
                        font-weight: 700; 
                        color: #1a1a1a;
                        max-width: 300px;
                    }
                    .critical-badge {
                        background: #64748b;
                        color: white;
                        padding: 3px 8px;
                        border-radius: 4px;
                        font-size: 10px;
                        font-weight: 600;
                    }
                    .stock-row {
                        display: flex;
                        gap: 12px;
                        margin-bottom: 14px;
                    }
                    .stock-badge { 
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        padding: 6px 14px; 
                        border-radius: 20px; 
                        font-weight: 600; 
                        font-size: 13px;
                    }
                    .stock-current {
                        background: #1e3a5f;
                        color: white;
                    }
                    .stock-min {
                        background: #f0f4f8;
                        color: #64748b;
                        border: 1px solid #e2e8f0;
                    }
                    .details-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 10px;
                        margin-bottom: 12px;
                    }
                    .detail-box {
                        background: white;
                        border: 1px solid #e8e8e8;
                        border-radius: 8px;
                        padding: 10px 12px;
                    }
                    .detail-label { 
                        color: #888; 
                        font-size: 11px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        margin-bottom: 3px;
                    }
                    .detail-value { 
                        color: #1a1a1a; 
                        font-weight: 600;
                        font-size: 14px;
                        word-wrap: break-word;
                    }
                    .link-btn { 
                        display: inline-block; 
                        background: #1e3a5f; 
                        color: white; 
                        padding: 8px 16px; 
                        border-radius: 6px; 
                        font-size: 12px; 
                        text-decoration: none;
                        font-weight: 500;
                    }
                    .item-image { 
                        width: 130px; 
                        min-height: 130px;
                        background: #e8e8e8; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                    }
                    .item-image img { 
                        width: 100%; 
                        height: 100%; 
                        object-fit: cover; 
                    }
                    .item-image .no-img { 
                        color: #999; 
                        font-size: 11px; 
                        text-align: center; 
                    }
                    .footer { 
                        margin-top: 40px; 
                        text-align: center; 
                        font-size: 12px; 
                        color: #888; 
                        padding-top: 20px; 
                        border-top: 2px solid #e8e8e8; 
                    }
                    .footer-brand {
                        font-weight: 600;
                        color: #1e3a5f;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📋 Inventory Report</h1>
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
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
                    <h3 style="color: #991b1b; font-size: 16px; margin: 0 0 10px 0;">⚠️ Out of Stock Items (${outOfStockItems.length})</h3>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${outOfStockItems.map(i => `<span style="background: #fee2e2; color: #991b1b; padding: 4px 12px; border-radius: 15px; font-size: 13px;">${escapeHtml(i.name)}</span>`).join('')}
                    </div>
                </div>
                ` : ''}

                ${lowStockItems.length > 0 ? `
                <div style="background: #fffbeb; border: 1px solid #fed7aa; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
                    <h3 style="color: #92400e; font-size: 16px; margin: 0 0 10px 0;">⚡ Low Stock Items (${lowStockItems.length})</h3>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${lowStockItems.map(i => `<span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 15px; font-size: 13px;">${escapeHtml(i.name)} (${i.quantity})</span>`).join('')}
                    </div>
                </div>
                ` : ''}

                <h2 style="font-size: 18px; color: #1e3a5f; margin: 25px 0 15px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">📦 Complete Inventory</h2>

                ${activeItems.map((item, index) => `
                    <div class="item-card">
                        <div class="item-main">
                            <div class="item-header">
                                <div class="item-name"><span style="color: #64748b; font-weight: 400;">${index + 1}.</span> ${escapeHtml(item.name)}</div>
                                ${item.isCritical ? '<span class="critical-badge">CRITICAL</span>' : ''}
                            </div>
                            <div class="stock-row">
                                <div class="stock-badge stock-current">
                                    <span>📦</span> Current: ${item.quantity} ${escapeHtml(item.unit)}
                                </div>
                                <div class="stock-badge stock-min">
                                    Min Required: ${item.minimumStock} ${escapeHtml(item.unit)}
                                </div>
                            </div>
                            <div class="details-grid">
                                <div class="detail-box">
                                    <div class="detail-label">Brand</div>
                                    <div class="detail-value">${escapeHtml(item.brand) || '—'}</div>
                                </div>
                                <div class="detail-box">
                                    <div class="detail-label">Supplier</div>
                                    <div class="detail-value">${escapeHtml(item.supplierName) || '—'}</div>
                                </div>
                            </div>
                            ${item.purchaseLink ? `<a href="${encodeURI(item.purchaseLink)}" class="link-btn">🛒 Purchase Link</a>` : ''}
                        </div>
                        ${item.imageUri ? `<div class="item-image"><img src="${item.imageUri}" alt="${escapeHtml(item.name)}"/></div>` : ''}
                    </div>
                `).join('')}

                <div class="footer">
                    Generated by <span class="footer-brand">CareKosh</span> • Home ICU Inventory Management
                </div>
            </body>
            </html>
        `;

        try {
            const { uri } = await Print.printToFileAsync({ html });
            const FileSystem = await import('expo-file-system/legacy');
            const pdfDir = FileSystem.documentDirectory || '';
            const dateStr = new Date().toISOString().slice(0, 10);
            const newUri = `${pdfDir}CareKosh-Inventory-${dateStr}.pdf`;
            await FileSystem.copyAsync({ from: uri, to: newUri });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(newUri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'CareKosh Inventory Report' });
            }
        } catch {
            Alert.alert('Error', 'Failed to export PDF');
        }
    };

    const handleExportPDF = () => {
        if (items.length === 0 && categories.length === 0) {
            Alert.alert('Nothing to export', 'Add some items first.');
            return;
        }
        Alert.alert(
            'Export PDF',
            'This will generate a PDF report of your full inventory with stock levels, suppliers, and critical-equipment flags. You can share or save the file.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Generate PDF', onPress: () => runExportPDF() },
            ]
        );
    };

    const handleDeleteItem = (itemId: string, itemName: string) => {
        if (!isOnline) { Alert.alert('Offline', 'Connect to WiFi to delete items.'); return; }
        Alert.alert('Delete Item', `Remove "${itemName}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    try { await deleteItemMutation.mutateAsync(itemId); }
                    catch (error) { handleMutationError(error, 'Delete Item'); }
                },
            },
        ]);
    };

    const handleDeleteCategory = (categoryToDelete: Category | undefined = selectedCategory) => {
        if (!categoryToDelete) return;
        if (!isOnline) { Alert.alert('Offline', 'Connect to WiFi to delete categories.'); return; }
        const itemsInCategory = items.filter((item) => item.categoryId === categoryToDelete.id);

        // Protect the 10 default medical-domain categories — they represent the
        // structural backbone of a Home ICU and cannot be deleted.
        if (isProtectedCategory(categoryToDelete.name)) {
            Alert.alert(
                'Default Category',
                `"${categoryToDelete.name}" is a default medical category and cannot be deleted. You can remove individual items from it instead.`
            );
            return;
        }

        if (itemsInCategory.length > 0) {
            Alert.alert('Cannot Delete', `"${categoryToDelete.name}" has ${itemsInCategory.length} items. Remove items first.`);
            return;
        }
        Alert.alert(
            'Delete Category',
            `Delete category "${categoryToDelete.name}"? This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteCategoryMutation.mutateAsync(categoryToDelete.id);
                            setSelectedCategoryId(categories.find((c) => c.id !== categoryToDelete.id)?.id ?? null);
                        } catch (error) { handleMutationError(error, 'Delete Category'); }
                    },
                },
            ]
        );
    };

    // Add a single suggested item from the seed catalog (one tap → POST /items)
    const handleAddSuggested = async (
        suggestion: { name: string; unit: string; minimumStock: number; description?: string; isCritical: boolean }
    ) => {
        if (!isOnline) { Alert.alert('Offline', 'Connect to WiFi to add items.'); return; }
        if (!selectedCategoryId) return;
        try {
            await createItemMutation.mutateAsync({
                categoryId: selectedCategoryId,
                name: suggestion.name,
                description: suggestion.description,
                quantity: 0,
                unit: suggestion.unit,
                minimumStock: suggestion.minimumStock,
                isCritical: suggestion.isCritical,
            });
        } catch (err) {
            handleMutationError(err, 'Add Suggested Item');
        }
    };

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) {
            Alert.alert('Error', 'Please enter a category name.');
            return;
        }
        if (!isOnline) { Alert.alert('Offline', 'Connect to WiFi to create categories.'); return; }
        try {
            await createCategoryMutation.mutateAsync({
                name: newCategoryName.trim(),
                description: newCategoryDesc.trim() || undefined,
            });
            setNewCategoryName('');
            setNewCategoryDesc('');
            setShowAddCategoryModal(false);
            Alert.alert('Created', `Category "${newCategoryName}" added.`);
        } catch (error) { handleMutationError(error, 'Create Category'); }
    };

    const mutedRed = '#A65D5D';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
            {/* Header */}
            <View style={[styles.header, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderPrimary }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
                    <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Build Inventory</Text>
                    {!isSeeding && (
                        <Text style={[styles.headerSubtitle, { color: colors.textTertiary }]}>
                            {items.length} items · {categories.length} categories
                        </Text>
                    )}
                </View>
                <TouchableOpacity onPress={handleExportPDF} style={styles.headerButton}>
                    <Ionicons name="share-outline" size={22} color={colors.accentBlue} />
                </TouchableOpacity>
            </View>

            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
                {/* Seeding progress banner */}
                {isSeeding && seedProgress && (
                    <View style={[styles.seedingBanner, { backgroundColor: colors.accentBlueBg, borderColor: colors.accentBlue }]}>
                        <Ionicons name="cloud-upload-outline" size={18} color={colors.accentBlue} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.seedingTitle, { color: colors.accentBlue }]}>
                                {seedProgress.phase === 'categories'
                                    ? `Setting up categories (${seedProgress.phaseCompleted}/${seedProgress.phaseTotal})`
                                    : `Adding items (${seedProgress.phaseCompleted}/${seedProgress.phaseTotal})`}
                            </Text>
                            <Text style={[styles.seedingSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                                {seedProgress.currentAction}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Data Management Cards */}
                <View style={styles.cardsContainer}>
                    <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>DATA MANAGEMENT</Text>
                    <View style={styles.cardsRow}>
                        <ActionCard
                            icon="cloud-upload-outline"
                            label="Backup"
                            subtitle="Export as JSON"
                            onPress={handleBackup}
                            color={colors.accentBlue}
                        />
                        <ActionCard
                            icon="document-text-outline"
                            label="Export PDF"
                            subtitle="Share inventory report"
                            onPress={handleExportPDF}
                            color={colors.statusYellow}
                        />
                    </View>
                    <View style={styles.cardsRow}>
                        <ActionCard
                            icon="sparkles-outline"
                            label={items.length === 0 && categories.length === 0 ? 'Seed Defaults' : 'Add Defaults'}
                            subtitle="10 categories · 32 items"
                            onPress={handleSeed}
                            color={colors.statusGreen}
                        />
                        <ActionCard
                            icon="flash-outline"
                            label="Start Fresh"
                            subtitle="Keep essentials only"
                            onPress={handleStartFresh}
                            color={mutedRed}
                        />
                    </View>
                </View>

                {/* Category Horizontal Scroll */}
                <View style={styles.categorySection}>
                    <View style={styles.categoryHeader}>
                        <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>CATEGORIES</Text>
                        <TouchableOpacity onPress={() => setShowAddCategoryModal(true)}>
                            <Text style={[styles.addCategoryLink, { color: colors.accentBlue }]}>+ Add New Category</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryChipsContainer}
                    >
                        {categories.map((cat) => {
                            const isSelected = cat.id === selectedCategoryId;
                            const count = items.filter(i => i.categoryId === cat.id).length;
                            return (
                                <TouchableOpacity
                                    key={cat.id}
                                    style={[
                                        styles.categoryChip,
                                        {
                                            backgroundColor: isSelected ? colors.accentBlue : colors.bgCard,
                                            borderColor: isSelected ? colors.accentBlue : colors.borderPrimary,
                                        }
                                    ]}
                                    onPress={() => setSelectedCategoryId(cat.id)}
                                    onLongPress={() => {
                                        setSelectedCategoryId(cat.id);
                                        handleDeleteCategory(cat);
                                    }}
                                >
                                    <Text style={[
                                        styles.categoryChipText,
                                        { color: isSelected ? colors.white : colors.textPrimary }
                                    ]}>
                                        {cat.name}
                                    </Text>
                                    <Text style={[
                                        styles.categoryChipCount,
                                        { color: isSelected ? 'rgba(255,255,255,0.7)' : colors.textTertiary }
                                    ]}>
                                        {count}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Items List */}
                <View style={[styles.listContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}>
                    {selectedCategory && (
                        <View style={[styles.listHeader, { borderBottomColor: colors.borderPrimary }]}>
                            <Text style={[styles.listTitle, { color: colors.textPrimary }]}>{selectedCategory.name}</Text>
                            <TouchableOpacity onPress={() => handleDeleteCategory()}>
                                <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {categoryItems.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
                            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No items yet</Text>
                            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
                                Add items to this category
                            </Text>
                        </View>
                    ) : (
                        categoryItems.map((item, index) => (
                            <View key={item.id}>
                                {index > 0 && <View style={[styles.separator, { backgroundColor: colors.borderPrimary }]} />}
                                <View style={styles.itemRow}>
                                    <TouchableOpacity
                                        style={styles.itemInfo}
                                        onPress={() => router.push(`/item/${item.id}` as any)}
                                    >
                                        <Text style={[styles.itemName, { color: colors.textPrimary }]} numberOfLines={1}>
                                            {item.name}
                                        </Text>
                                        <View style={styles.itemMeta}>
                                            <Text style={[styles.itemStock, { color: colors.textTertiary }]}>
                                                {item.quantity} {item.unit}
                                            </Text>
                                            <Text style={[styles.itemDot, { color: colors.textMuted }]}>·</Text>
                                            <Text style={[styles.itemMin, { color: colors.textTertiary }]}>Min: {item.minimumStock}</Text>
                                            {item.brand && (
                                                <>
                                                    <Text style={[styles.itemDot, { color: colors.textMuted }]}>·</Text>
                                                    <Text style={[styles.itemBrand, { color: colors.textTertiary }]}>{item.brand}</Text>
                                                </>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                    <View style={styles.itemActions}>
                                        <TouchableOpacity
                                            style={[styles.iconButton, { backgroundColor: item.isCritical ? '#FFD70020' : 'transparent' }]}
                                            onPress={async () => {
                                                if (!isOnline) { Alert.alert('Offline', 'Connect to WiFi.'); return; }
                                                try { await toggleItemCriticalMutation.mutateAsync({ id: item.id, isCritical: !item.isCritical, version: item.version }); }
                                                catch (error) { handleMutationError(error, 'Toggle Critical'); }
                                            }}
                                        >
                                            <Ionicons
                                                name={item.isCritical ? "star" : "star-outline"}
                                                size={20}
                                                color={item.isCritical ? "#FAB005" : colors.textTertiary}
                                            />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.iconButton, { backgroundColor: `${mutedRed}15` }]}
                                            onPress={() => handleDeleteItem(item.id, item.name)}
                                        >
                                            <Ionicons name="trash-outline" size={18} color={mutedRed} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        ))
                    )}

                    {/* Suggested items from the seed catalog (for this category) */}
                    {suggestedItems.length > 0 && (
                        <>
                            <View style={[styles.suggestedHeader, { borderTopColor: colors.borderPrimary }]}>
                                <Ionicons name="bulb-outline" size={14} color={colors.textTertiary} />
                                <Text style={[styles.suggestedHeaderText, { color: colors.textTertiary }]}>
                                    SUGGESTED ITEMS
                                </Text>
                            </View>
                            {suggestedItems.map((sugg, idx) => (
                                <View
                                    key={`sugg-${sugg.name}`}
                                    style={[
                                        styles.suggestedRow,
                                        idx > 0 && { borderTopWidth: 1, borderTopColor: colors.borderPrimary },
                                    ]}
                                >
                                    <View style={styles.itemInfo}>
                                        <Text
                                            style={[styles.itemName, styles.suggestedName, { color: colors.textSecondary }]}
                                            numberOfLines={1}
                                        >
                                            {sugg.name}
                                        </Text>
                                        <View style={styles.itemMeta}>
                                            <Text style={[styles.itemStock, { color: colors.textMuted }]}>
                                                {sugg.unit}
                                            </Text>
                                            <Text style={[styles.itemDot, { color: colors.textMuted }]}>·</Text>
                                            <Text style={[styles.itemMin, { color: colors.textMuted }]}>
                                                Min: {sugg.minimumStock}
                                            </Text>
                                            {sugg.isCritical && (
                                                <>
                                                    <Text style={[styles.itemDot, { color: colors.textMuted }]}>·</Text>
                                                    <Text style={[styles.itemMin, { color: '#FAB005' }]}>critical</Text>
                                                </>
                                            )}
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={[styles.suggestedAddBtn, { borderColor: colors.accentBlue }]}
                                        onPress={() => handleAddSuggested(sugg)}
                                        disabled={createItemMutation.isPending}
                                    >
                                        <Ionicons name="add" size={14} color={colors.accentBlue} />
                                        <Text style={[styles.suggestedAddText, { color: colors.accentBlue }]}>Add</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </>
                    )}
                </View>

                {/* Bottom space for FAB */}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Floating Add Button with Label */}
            <TouchableOpacity
                style={[styles.fab, { backgroundColor: colors.accentBlue }]}
                onPress={() => router.push(`/item/new?categoryId=${selectedCategoryId}` as any)}
                activeOpacity={0.8}
            >
                <Ionicons name="add" size={24} color={colors.white} />
                <Text style={styles.fabText}>Add Item</Text>
            </TouchableOpacity>

            {/* Add Category Modal */}
            <Modal visible={showAddCategoryModal} transparent animationType="fade" onRequestClose={() => setShowAddCategoryModal(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={[styles.modalSheet, { backgroundColor: colors.bgCard }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>New Category</Text>
                            <TouchableOpacity onPress={() => setShowAddCategoryModal(false)}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.borderPrimary }]}
                            placeholder="Category Name"
                            placeholderTextColor={colors.textTertiary}
                            value={newCategoryName}
                            onChangeText={setNewCategoryName}
                            autoFocus
                        />
                        <TextInput
                            style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.borderPrimary }]}
                            placeholder="Description (optional)"
                            placeholderTextColor={colors.textTertiary}
                            value={newCategoryDesc}
                            onChangeText={setNewCategoryDesc}
                        />
                        <TouchableOpacity
                            style={[styles.modalButton, { backgroundColor: colors.accentBlue }]}
                            onPress={handleAddCategory}
                            disabled={createCategoryMutation.isPending}
                        >
                            {showCreateCategoryPending ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                                <Text style={styles.modalButtonText}>Create Category</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

// Action Card Component
function ActionCard({ icon, label, subtitle, onPress, color }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    subtitle: string;
    onPress: () => void;
    color: string;
}) {
    const { colors } = useTheme();
    return (
        <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.bgCard, borderColor: colors.borderPrimary }]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={[styles.actionCardIcon, { backgroundColor: `${color}15` }]}>
                <Ionicons name={icon} size={20} color={color} />
            </View>
            <Text style={[styles.actionCardLabel, { color: colors.textPrimary }]}>{label}</Text>
            <Text style={[styles.actionCardSubtitle, { color: colors.textTertiary }]}>{subtitle}</Text>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
    },
    headerButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
    headerSubtitle: { fontSize: fontSize.xs, marginTop: 2 },

    suggestedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.sm,
        marginTop: spacing.sm,
        borderTopWidth: 1,
    },
    suggestedHeaderText: {
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
        letterSpacing: 0.5,
    },
    suggestedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
    },
    suggestedName: {
        fontStyle: 'italic',
    },
    suggestedAddBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderWidth: 1,
        borderRadius: borderRadius.full,
    },
    suggestedAddText: {
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
    },
    seedingBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginHorizontal: spacing.md,
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: borderRadius.md,
        borderWidth: 1,
    },
    seedingTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    seedingSubtitle: { fontSize: fontSize.xs, marginTop: 2 },
    cardsContainer: { padding: spacing.md },
    sectionLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, marginBottom: spacing.sm, marginLeft: spacing.xs },
    cardsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    actionCard: {
        flex: 1,
        padding: spacing.md,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        alignItems: 'center',
    },
    actionCardIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    actionCardLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    actionCardSubtitle: { fontSize: fontSize.xs, marginTop: 2 },

    categorySection: { paddingHorizontal: spacing.md, marginBottom: spacing.md },
    categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    addCategoryLink: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
    categoryChipsContainer: { gap: spacing.sm, paddingBottom: spacing.xs },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        gap: spacing.xs,
    },
    categoryChipText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
    categoryChipCount: { fontSize: fontSize.xs },

    listContainer: {
        marginHorizontal: spacing.md,
        marginBottom: spacing.xxl,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        overflow: 'hidden',
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
    },
    listTitle: { fontSize: fontSize.md, fontWeight: fontWeight.semibold },
    separator: { height: 1, marginHorizontal: spacing.lg },
    itemRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    itemInfo: { flex: 1, marginRight: spacing.md },
    itemName: { fontSize: fontSize.md, fontWeight: fontWeight.medium },
    itemMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
    itemStock: { fontSize: fontSize.sm },
    itemDot: { paddingHorizontal: spacing.xs },
    itemMin: { fontSize: fontSize.sm },
    itemBrand: { fontSize: fontSize.sm },
    itemActions: { flexDirection: 'row', gap: spacing.xs },
    iconButton: { width: 36, height: 36, borderRadius: borderRadius.md, justifyContent: 'center', alignItems: 'center' },
    emptyState: { paddingVertical: spacing.xxl, alignItems: 'center' },
    emptyTitle: { fontSize: fontSize.md, fontWeight: fontWeight.medium, marginTop: spacing.md },
    emptySubtitle: { fontSize: fontSize.sm, marginTop: spacing.xs },

    fab: {
        position: 'absolute',
        bottom: spacing.xl,
        right: spacing.lg,
        flexDirection: 'row',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.full,
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacing.sm,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    fabText: {
        fontSize: fontSize.sm,
        fontWeight: fontWeight.semibold,
        color: '#FFFFFF',
    },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: spacing.lg },
    modalSheet: { borderRadius: borderRadius.xl, padding: spacing.xl },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
    modalTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
    modalInput: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        fontSize: fontSize.md,
        marginBottom: spacing.md,
    },
    modalButton: { paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center', marginTop: spacing.sm },
    modalButtonText: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: '#FFFFFF' },
});
