/**
 * VitalTrack Mobile — Inventory PDF Export Utility
 *
 * Companion to orderPdfExport.ts. Renders the full inventory as a
 * professional PDF using the same visual language as the order PDF:
 *   - Navy CareKosh header with wordmark + metadata row
 *   - Gradient summary bar of key stats
 *   - Items table, but grouped by category (single-row group header
 *     spans all columns). This is an enhancement over the flat order
 *     PDF table since inventory has natural grouping.
 *   - "Summary" block after the table with the inventory breakdown.
 *   - Shared footer line.
 *
 * Typography and color scale mirror orderPdfExport.ts so both PDFs
 * feel designed by the same person.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { readAsStringAsync, documentDirectory, copyAsync } from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import { escapeHtml, validateImageUri } from '@/utils/sanitize';
import { formatDate, now } from '@/utils/helpers';
import { isLowStock, isOutOfStock, type Item, type Category } from '@/types';

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

interface GeneratedItem extends Item {
  imageBase64: string;
}

interface CategoryGroup {
  id: string | null;
  name: string;
  items: GeneratedItem[];
}

/**
 * Group items by category, in the same order categories appear in the
 * categories list. Items without a category fall into "Uncategorized".
 */
function groupByCategory(items: GeneratedItem[], categories: Category[]): CategoryGroup[] {
  const byCategory = new Map<string, GeneratedItem[]>();
  const uncategorized: GeneratedItem[] = [];

  for (const item of items) {
    if (item.categoryId) {
      const bucket = byCategory.get(item.categoryId) || [];
      bucket.push(item);
      byCategory.set(item.categoryId, bucket);
    } else {
      uncategorized.push(item);
    }
  }

  const groups: CategoryGroup[] = [];
  for (const cat of categories) {
    const list = byCategory.get(cat.id);
    if (list && list.length > 0) {
      groups.push({ id: cat.id, name: cat.name, items: list });
    }
  }
  if (uncategorized.length > 0) {
    groups.push({ id: null, name: 'Uncategorized', items: uncategorized });
  }
  return groups;
}

function statusBadgeHtml(item: Item): string {
  if (isOutOfStock(item)) return '<span class="status-badge sb-oos">OUT</span>';
  if (isLowStock(item)) return '<span class="status-badge sb-low">LOW</span>';
  if (item.isCritical) return '<span class="status-badge sb-critical">CRITICAL</span>';
  return '<span class="status-badge sb-ok">OK</span>';
}

function stockClass(item: Item): string {
  if (isOutOfStock(item)) return 'stock-zero';
  if (isLowStock(item)) return 'stock-low';
  return 'stock-ok';
}

function buildHtml(opts: {
  activeItems: GeneratedItem[];
  categories: Category[];
  includePhotos: boolean;
}): string {
  const { activeItems, categories, includePhotos } = opts;
  const generatedAt = formatDate(now());
  const outOfStock = activeItems.filter(isOutOfStock);
  const lowStock = activeItems.filter((i) => !isOutOfStock(i) && isLowStock(i));
  const fullyStocked = activeItems.filter((i) => !isOutOfStock(i) && !isLowStock(i));
  const criticalCount = activeItems.filter((i) => i.isCritical).length;
  const groups = groupByCategory(activeItems, categories);

  const itemsWithPhotos = includePhotos
    ? activeItems.filter((i) => i.imageBase64)
    : [];

  // Empty state
  if (activeItems.length === 0) {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; padding: 48px 40px; color: #2d3748; }
  .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #1e3a5f; }
  h1 { font-size: 26px; color: #1e3a5f; font-weight: 700; }
  .meta { color: #718096; font-size: 13px; margin-top: 6px; }
  .empty { text-align: center; color: #718096; font-size: 15px; margin-top: 80px; }
</style></head><body>
  <div class="header">
    <h1>CareKosh Inventory Report</h1>
    <div class="meta">Generated ${escapeHtml(generatedAt)}</div>
  </div>
  <div class="empty">No items in inventory yet. Add items from the Build Inventory screen to generate a report.</div>
</body></html>`;
  }

  const groupsHtml = groups
    .map(
      (g) => `
      <tr class="category-row">
        <td colspan="5">${escapeHtml(g.name)} · ${g.items.length} ${g.items.length === 1 ? 'item' : 'items'}</td>
      </tr>
      ${g.items
        .map(
          (item) => `
        <tr>
          <td><span class="item-name">${escapeHtml(item.name)}</span>${
            item.brand ? `<div class="item-sub">${escapeHtml(item.brand)}</div>` : ''
          }</td>
          <td style="text-align:center">${statusBadgeHtml(item)}</td>
          <td class="stock-num ${stockClass(item)}">${item.quantity}</td>
          <td class="col-unit">${escapeHtml(item.unit)}</td>
          <td class="col-min">${item.minimumStock}</td>
        </tr>`,
        )
        .join('')}`,
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
            padding: 48px 40px;
            color: #2d3748;
            background: #fff;
            line-height: 1.5;
            font-size: 14px;
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 3px solid #1e3a5f;
        }
        h1 {
            font-size: 26px;
            color: #1e3a5f;
            font-weight: 700;
            margin-bottom: 6px;
        }
        .meta-row {
            color: #718096;
            font-size: 13px;
            margin-top: 4px;
        }

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
        .alert-oos { background: #fdf2f2; border-left: 3px solid #c9a0a0; }
        .alert-low { background: #fdf8f0; border-left: 3px solid #c4a76c; }
        .alert-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
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
        th.col-status { text-align: center; width: 70px; }
        th.col-stock { text-align: right; width: 60px; }
        th.col-unit { text-align: left; width: 70px; }
        th.col-min { text-align: right; width: 45px; }

        td {
            padding: 8px 8px;
            border-bottom: 1px solid #edf2f7;
            font-size: 13px;
            vertical-align: middle;
            color: #4a5568;
        }
        tr.category-row { page-break-inside: avoid; }
        tr.category-row td {
            background: #f5f0e8;
            color: #1e3a5f;
            font-weight: 700;
            font-size: 13px;
            letter-spacing: 0.02em;
            padding: 10px 10px;
            border-bottom: none;
        }

        .item-name { font-weight: 600; color: #2d3748; font-size: 14px; }
        .item-sub { color: #a0aec0; font-size: 11px; margin-top: 2px; }

        .stock-num { font-weight: 700; text-align: right; font-size: 14px; }
        .stock-zero { color: #a06060; }
        .stock-low { color: #a08040; }
        .stock-ok { color: #5a8a6a; }
        td.col-unit { color: #6b6b6b; font-size: 12px; }
        td.col-min { text-align: right; color: #a0aec0; font-size: 12px; }

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

        .summary-block {
            margin-top: 24px;
            padding: 16px 20px;
            background: #fafbfc;
            border: 1px solid #edf2f7;
            border-radius: 10px;
        }
        .summary-block h3 {
            font-size: 13px;
            color: #1e3a5f;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 10px;
        }
        .summary-block dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 20px; font-size: 13px; }
        .summary-block dt { color: #6b6b6b; }
        .summary-block dd { color: #2d3748; font-weight: 600; text-align: right; }
        .summary-block dd.accent { color: #a06060; }

        .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 11px;
            color: #a0aec0;
            padding-top: 14px;
            border-top: 1px solid #edf2f7;
        }
        .footer b { color: #1e3a5f; }

        .gallery-header { page-break-before: always; text-align: center; padding: 30px 0 20px; }
        .gallery-header h2 { color: #1e3a5f; font-size: 20px; margin-bottom: 6px; }
        .gallery-header p { color: #a0aec0; font-size: 12px; }
        .gallery-item { page-break-inside: avoid; text-align: center; margin-bottom: 36px; padding: 16px; }
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
        <h1>CareKosh Inventory Report</h1>
        <div class="meta-row">Generated ${escapeHtml(generatedAt)} · ${activeItems.length} ${activeItems.length === 1 ? 'item' : 'items'} · ${groups.length} ${groups.length === 1 ? 'category' : 'categories'}</div>
    </div>

    <div class="summary-bar">
        <div class="summary-item">
            <div class="summary-value">${activeItems.length}</div>
            <div class="summary-label">Total Items</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${groups.length}</div>
            <div class="summary-label">Categories</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${outOfStock.length}</div>
            <div class="summary-label">Out of Stock</div>
        </div>
        <div class="summary-item">
            <div class="summary-value">${lowStock.length}</div>
            <div class="summary-label">Low Stock</div>
        </div>
    </div>

    ${outOfStock.length > 0 ? `
        <div class="alert-box alert-oos">
            <div class="alert-title">Out of Stock Items (${outOfStock.length})</div>
            <div class="badge-list">
                ${outOfStock.map((i) => `<span class="badge badge-oos">${escapeHtml(i.name)}</span>`).join('')}
            </div>
        </div>
    ` : ''}

    ${lowStock.length > 0 ? `
        <div class="alert-box alert-low">
            <div class="alert-title">Low Stock Items (${lowStock.length})</div>
            <div class="badge-list">
                ${lowStock.map((i) => `<span class="badge badge-low">${escapeHtml(i.name)} (${i.quantity})</span>`).join('')}
            </div>
        </div>
    ` : ''}

    <div class="section-title">Inventory by Category</div>

    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th class="col-status">Status</th>
                <th class="col-stock">Qty</th>
                <th class="col-unit">Unit</th>
                <th class="col-min">Min</th>
            </tr>
        </thead>
        <tbody>
            ${groupsHtml}
        </tbody>
    </table>

    <div class="summary-block">
        <h3>Summary</h3>
        <dl>
            <dt>Total Items</dt><dd>${activeItems.length}</dd>
            <dt>Out of Stock</dt><dd class="${outOfStock.length > 0 ? 'accent' : ''}">${outOfStock.length}</dd>
            <dt>Low Stock</dt><dd>${lowStock.length}</dd>
            <dt>Fully Stocked</dt><dd>${fullyStocked.length}</dd>
            <dt>Categories</dt><dd>${groups.length}</dd>
            <dt>Critical Equipment</dt><dd>${criticalCount}</dd>
        </dl>
    </div>

    <div class="footer">Generated by <b>CareKosh</b> · Home ICU Inventory Management</div>

    ${itemsWithPhotos.length > 0 ? `
        <div class="gallery-header">
            <h2>Item Photo Reference</h2>
            <p>Full-size images for items with photos (${itemsWithPhotos.length} ${itemsWithPhotos.length === 1 ? 'item' : 'items'})</p>
        </div>
        ${itemsWithPhotos.map((item) => `
            <div class="gallery-item">
                <h3>${escapeHtml(item.name)}</h3>
                <p>Stock: ${item.quantity} ${escapeHtml(item.unit)} · Min: ${item.minimumStock}</p>
                <img src="${item.imageBase64}" />
            </div>
        `).join('')}
    ` : ''}
</body>
</html>`;
}

export async function exportInventoryPdf(opts: {
  items: Item[];
  categories: Category[];
  includePhotos: boolean;
}): Promise<void> {
  const { items, categories, includePhotos } = opts;
  const activeItems = items.filter((i) => i.isActive);

  const withPhotos: GeneratedItem[] = includePhotos
    ? await Promise.all(
        activeItems.map(async (item) => ({
          ...item,
          imageBase64: item.imageUri ? await getBase64Image(item.imageUri) : '',
        })),
      )
    : activeItems.map((item) => ({ ...item, imageBase64: '' }));

  const html = buildHtml({ activeItems: withPhotos, categories, includePhotos });
  const { uri } = await Print.printToFileAsync({ html });

  // Rename to a human-friendly filename before sharing
  const dateStr = new Date().toISOString().slice(0, 10);
  const dest = `${documentDirectory || ''}CareKosh-Inventory-${dateStr}.pdf`;
  try {
    await copyAsync({ from: uri, to: dest });
  } catch {
    // If copy fails for any reason, fall back to the original temp uri.
  }

  const shareUri = dest || uri;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(shareUri, {
      UTI: 'com.adobe.pdf',
      mimeType: 'application/pdf',
      dialogTitle: 'CareKosh Inventory Report',
    });
  }
}

export function showInventoryPdfDialog(opts: {
  items: Item[];
  categories: Category[];
  onDone?: () => void;
}): void {
  const { items, categories, onDone } = opts;
  const activeItems = items.filter((i) => i.isActive);

  if (activeItems.length === 0) {
    Alert.alert('No Items', 'Add items to your inventory before exporting.');
    return;
  }

  const run = (includePhotos: boolean) => {
    exportInventoryPdf({ items, categories, includePhotos })
      .then(() => onDone?.())
      .catch((err) => {
        console.error(err);
        Alert.alert('Error', 'Failed to export PDF');
      });
  };

  const hasImages = activeItems.some((i) => i.imageUri);
  if (hasImages) {
    Alert.alert('Export PDF', 'Include item photos in the PDF?', [
      { text: 'Table Only', onPress: () => run(false) },
      { text: 'With Photos', onPress: () => run(true) },
    ]);
  } else {
    run(false);
  }
}
