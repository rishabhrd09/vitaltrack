/**
 * VitalTrack Mobile - Order PDF Export Utility
 * Shared between order creation and order list screens.
 * Combined Table + Image Reference in a single PDF.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import { escapeHtml, validateImageUri } from '@/utils/sanitize';
import { formatDate, now } from '@/utils/helpers';
import type { OrderItem } from '@/types';

interface ExportableOrder {
  id: string;
  items: OrderItem[];
  createdAt?: string;
}

/**
 * Convert local image URI to base64 data URL for PDF embedding
 */
async function getBase64Image(uri: string): Promise<string> {
  try {
    const validUri = validateImageUri(uri);
    if (!validUri) return '';
    if (validUri.startsWith('data:')) return validUri;

    let fileUri = validUri;
    if (!validUri.startsWith('file://') && !validUri.startsWith('content://')) {
      fileUri = validUri.startsWith('/') ? `file://${validUri}` : validUri;
    }

    const base64 = await readAsStringAsync(fileUri, { encoding: 'base64' });
    const ext = validUri.split('.').pop()?.toLowerCase() || 'jpeg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  } catch {
    return '';
  }
}

/**
 * Generate combined Table + Image Reference PDF and share
 */
async function generateCombinedPDF(order: ExportableOrder, includePhotos: boolean): Promise<void> {
  const { id: orderId, items } = order;
  const currentDate = order.createdAt || formatDate(now());
  const totalItems = items.length;
  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);

  // Only process images if user wants photos
  const itemsWithImages = includePhotos
    ? await Promise.all(
        items.map(async (item) => ({
          ...item,
          imageBase64: item.imageUri ? await getBase64Image(item.imageUri) : '',
        }))
      )
    : items.map(item => ({ ...item, imageBase64: '' }));

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
            font-size: 15px;
            line-height: 1.5;
        }
        .header {
            text-align: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 3px solid #1e3a5f;
        }
        h1 { font-size: 28px; color: #1e3a5f; font-weight: 700; margin-bottom: 6px; }
        .order-id { font-size: 16px; color: #718096; }
        .meta { color: #a0aec0; font-size: 14px; }

        .summary-bar {
            display: flex;
            justify-content: center;
            gap: 40px;
            background: linear-gradient(135deg, #1e3a5f 0%, #2d5a7b 100%);
            color: white;
            padding: 16px 28px;
            border-radius: 10px;
            margin-bottom: 24px;
        }
        .summary-item { text-align: center; }
        .summary-value { font-size: 26px; font-weight: 700; }
        .summary-label { font-size: 11px; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.03em; }

        .section-title {
            font-size: 16px;
            font-weight: 700;
            color: #1e3a5f;
            margin: 20px 0 12px;
            padding-bottom: 6px;
            border-bottom: 1px solid #e2e8f0;
        }

        table { width: 100%; border-collapse: collapse; }
        th {
            background: #1e3a5f;
            color: #fff;
            padding: 12px 10px;
            text-align: left;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }
        th:first-child { width: 35px; text-align: center; }
        th.col-qty { text-align: center; width: 90px; }
        th.col-link { text-align: center; width: 50px; }
        td {
            padding: 12px 10px;
            border-bottom: 1px solid #edf2f7;
            font-size: 14px;
            vertical-align: middle;
            color: #4a5568;
        }
        tr:nth-child(even) { background: #fafbfc; }
        td:first-child { text-align: center; color: #a0aec0; font-size: 12px; }
        .item-name { font-weight: 600; color: #2d3748; font-size: 16px; }
        .qty { font-weight: 700; text-align: center; color: #1e3a5f; font-size: 15px; }
        .dim { color: #c0c8d0; font-style: italic; font-size: 13px; }
        .link-btn { color: #1e3a5f; text-decoration: none; font-size: 13px; font-weight: 600; }

        .footer {
            margin-top: 28px;
            text-align: center;
            font-size: 11px;
            color: #a0aec0;
            padding-top: 14px;
            border-top: 1px solid #edf2f7;
        }
        .footer b { color: #1e3a5f; }

        .img-section { page-break-before: always; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🛒 Purchase Order</h1>
        <div class="order-id">Order #${escapeHtml(orderId)}</div>
        <div class="meta">${escapeHtml(currentDate)}</div>
    </div>

    <div class="summary-bar">
        <div class="summary-item">
            <div class="summary-value">${totalItems}</div>
            <div class="summary-label">Items to Order</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${totalUnits}</div>
            <div class="summary-label">Total Units</div>
        </div>
    </div>

    <div class="section-title">📋 Order Summary</div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Item Name</th>
                <th>Brand</th>
                <th class="col-qty">Qty</th>
                <th>Supplier</th>
                <th class="col-link">Link</th>
            </tr>
        </thead>
        <tbody>
            ${items.map((item, idx) => `
                <tr>
                    <td>${idx + 1}</td>
                    <td><span class="item-name">${escapeHtml(item.name)}</span></td>
                    <td>${escapeHtml(item.brand || '') || '<span class="dim">—</span>'}</td>
                    <td class="qty">${item.quantity} ${escapeHtml(item.unit)}</td>
                    <td>${escapeHtml(item.supplierName || '') || '<span class="dim">—</span>'}</td>
                    <td style="text-align:center">${item.purchaseLink ? '<a href="' + encodeURI(item.purchaseLink) + '" class="link-btn">🔗</a>' : '<span class="dim">—</span>'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="footer">Generated by <b>CareKosh</b> • Home ICU Inventory Management</div>

    ${itemsWithImages.filter(i => i.imageBase64).length > 0 ? `
    <div class="img-section">
        <div class="section-title">📸 Product Photos</div>
        <p style="color: #a0aec0; font-size: 12px; margin-bottom: 20px;">
            ${itemsWithImages.filter(i => i.imageBase64).length} items with photos
        </p>
        ${itemsWithImages.filter(i => i.imageBase64).map((item, idx) => `
            <div style="page-break-inside: avoid; text-align: center; margin-bottom: 44px; padding: 16px;">
                <div style="margin-bottom: 6px;">
                    <span style="color: #a0aec0; font-size: 14px;">${idx + 1}.</span>
                    <span style="color: #1e3a5f; font-size: 22px; font-weight: 700;">${escapeHtml(item.name)}</span>
                </div>
                <p style="color: #1e3a5f; font-size: 17px; font-weight: 600; margin-bottom: 14px;">
                    Order: ${item.quantity} ${escapeHtml(item.unit)}${item.brand ? ' · ' + escapeHtml(item.brand) : ''}
                </p>
                <img src="${item.imageBase64}" style="max-width: 95%; max-height: 550px; object-fit: contain; border-radius: 8px; box-shadow: 0 2px 16px rgba(0,0,0,0.08);" />
            </div>
        `).join('')}
    </div>
    ` : ''}
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: `Order ${orderId}` });
  }
}

/**
 * Export order PDF — asks user if they want photos included
 */
export function showPdfExportDialog(order: ExportableOrder): void {
  if (order.items.length === 0) {
    Alert.alert('No Items', 'This order has no items to export.');
    return;
  }
  const hasImages = order.items.some(i => i.imageUri);
  if (hasImages) {
    Alert.alert(
      'Export PDF',
      'Include product photos in the PDF?',
      [
        { text: 'Table Only', onPress: () => doExport(order, false) },
        { text: 'With Photos', onPress: () => doExport(order, true) },
      ]
    );
  } else {
    doExport(order, false);
  }
}

function doExport(order: ExportableOrder, includePhotos: boolean): void {
  generateCombinedPDF(order, includePhotos).catch((e) => {
    console.error(e);
    Alert.alert('Error', 'Failed to generate PDF');
  });
}
