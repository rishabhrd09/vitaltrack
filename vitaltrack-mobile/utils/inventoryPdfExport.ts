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

/**
 * Status badge reflects STOCK STATE only (OUT OF STOCK / LOW / OK), not
 * equipment criticality. Previously isCritical short-circuited above the OK
 * branch so every critical-equipment row showed a "CRITICAL" badge regardless
 * of its actual stock level — which buried the more actionable information
 * (whether the item needs reorder right now). Critical-equipment status is
 * still surfaced in the report via the small star marker next to the item
 * name (criticalMarkerHtml below) and the dedicated Critical Equipment count
 * in the summary card.
 */
function statusBadgeHtml(item: Item): string {
  if (isOutOfStock(item)) return '<span class="status-badge sb-oos">OUT OF STOCK</span>';
  if (isLowStock(item)) return '<span class="status-badge sb-low">LOW</span>';
  return '<span class="status-badge sb-ok">OK</span>';
}

function criticalMarkerHtml(item: Item): string {
  if (!item.isCritical) return '';
  // Inline gold star + small label, sits next to the item name. Doesn't
  // compete with the status badge for the row's primary color signal.
  return ' <span class="critical-marker" title="Critical equipment">★</span>';
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
      (g, idx) => `
      ${idx > 0 ? '<tr class="category-spacer"><td colspan="5"></td></tr>' : ''}
      <tr class="category-row">
        <td colspan="5">${escapeHtml(g.name)} · ${g.items.length} ${g.items.length === 1 ? 'item' : 'items'}</td>
      </tr>
      ${g.items
        .map(
          (item) => `
        <tr>
          <td><span class="item-name">${escapeHtml(item.name)}${criticalMarkerHtml(item)}</span>${
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

        /* Summary card — sits at the TOP, muted two-column layout
           mirroring the subtle info-card style used in the order PDF. */
        .summary-card {
            padding: 18px 22px;
            background: #fafbfc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            margin-bottom: 22px;
        }
        .summary-card h3 {
            font-size: 12px;
            color: #1e3a5f;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-bottom: 12px;
            padding-bottom: 6px;
            border-bottom: 1px solid #edf2f7;
        }
        .summary-card .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            column-gap: 40px;
            row-gap: 12px;
        }
        .summary-card .row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            font-size: 14px;
        }
        .summary-card .label { color: #6b6b6b; font-size: 14px; }
        .summary-card .value { color: #1e3a5f; font-weight: 700; font-size: 17px; }
        .summary-card .value.accent { color: #B85450; }

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
            table-layout: fixed;
            /* fixed layout makes the print engine honor <col> widths
               instead of auto-sizing columns from content. Without this
               the Item column dominated the page and the right-side
               columns were squeezed against the edge. */
        }
        /* Header band uses navy #1e3a5f, the same blue that anchors the
           rest of the report (header underline, summary-card title, "Inventory
           by Category" section title). Switching back from the warm-black
           we tried briefly because it read as too heavy and disconnected
           from the report's existing blue accent palette. */
        th {
            background: #1e3a5f;
            color: #FAF9F7;
            padding: 16px 14px;
            text-align: left;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
        }
        th.col-status { text-align: center; }
        th.col-stock { text-align: center; }
        th.col-unit { text-align: center; }
        th.col-min { text-align: center; padding-right: 14px; }

        td {
            padding: 14px 14px;
            border-bottom: 1px solid #E8E5E0;
            font-size: 14px;
            vertical-align: middle;
            color: #57534E;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        /* Subtle warm-off-white zebra striping (matches app bgPrimary). */
        tbody tr:nth-child(even):not(.category-row):not(.category-spacer) td { background: #FAF9F7; }

        /* A blank spacer row injected between category groups (after the
           first) so each category section reads as its own block instead
           of bleeding directly into the next. Adds breathing room without
           introducing a heavy divider. */
        tr.category-spacer td {
            height: 16px;
            padding: 0;
            border: none;
            background: #FFFFFF;
        }

        /* Category subheader is a slightly bolder version of the same navy
           used in the header band — light blue tint background with navy
           text, plus a darker blue top-border for a clear "new section
           starts here" visual cue. Pairs with the 16px spacer-row above
           it so each category reads as its own block. */
        tr.category-row { page-break-inside: avoid; }
        tr.category-row td {
            background: #e8eef5;
            color: #1e3a5f;
            font-weight: 700;
            font-size: 13px;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            padding: 12px 14px;
            border-bottom: none;
            border-top: 2px solid #5a7a9e;
        }

        .item-name { font-weight: 600; color: #1C1917; font-size: 15px; }
        .item-sub { color: #A8A29E; font-size: 12px; margin-top: 3px; }

        /* Inline gold-star marker for critical equipment. Sits next to the
           item name without taking a separate column. The Critical Equipment
           total in the summary card + this per-row marker gives critical
           equipment two visible signals without competing with the stock-
           state status badge for the column's primary semantic. */
        .critical-marker {
            color: #B8860B;
            font-size: 14px;
            margin-left: 4px;
            vertical-align: middle;
        }

        /* Stock-number colors mirror the in-app status palette exactly:
           statusRed / statusOrange / statusGreen from theme/ThemeContext. */
        .stock-num { font-weight: 700; text-align: center; font-size: 16px; }
        .stock-zero { color: #B85450; }
        .stock-low { color: #B8860B; }
        .stock-ok { color: #4A9668; }
        td.col-unit { color: #57534E; font-size: 13px; text-align: center; }
        td.col-min { text-align: center; color: #57534E; font-size: 14px; font-weight: 600; }

        .status-badge {
            font-size: 11px;
            font-weight: 700;
            padding: 6px 12px;
            border-radius: 5px;
            display: inline-block;
            letter-spacing: 0.05em;
            min-width: 72px;
            text-align: center;
        }
        /* Status badge palette mirrors the in-app statusRed / statusOrange /
           statusGreen tokens (theme/ThemeContext.tsx). bg uses the matching
           ~8% tint, border the matching ~12% tint, text the full color.
           No more standalone colorful left-borders on rows — the badge
           itself carries the urgency signal. */
        .sb-oos { background: rgba(184, 84, 80, 0.06);  color: #B85450; border: 1px solid rgba(184, 84, 80, 0.18); }
        .sb-low { background: rgba(184, 134, 11, 0.08); color: #B8860B; border: 1px solid rgba(184, 134, 11, 0.18); }
        .sb-ok  { background: rgba(74, 150, 104, 0.08); color: #4A9668; border: 1px solid rgba(74, 150, 104, 0.18); }

        .table-legend {
            margin-top: 14px;
            font-size: 11px;
            color: #78716C;
            text-align: right;
            font-style: italic;
        }
        .table-legend .marker { color: #B8860B; font-style: normal; }

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
            padding: 32px 0 24px;
            border-bottom: 1px solid #e2e8f0;
            margin-bottom: 32px;
        }
        .gallery-header h2 { color: #1e3a5f; font-size: 22px; margin-bottom: 8px; }
        .gallery-header p { color: #718096; font-size: 13px; }
        .gallery-item {
            page-break-inside: avoid;
            text-align: center;
            margin-bottom: 40px;
            padding: 20px 0;
        }
        .gallery-item h3 {
            color: #1e3a5f;
            font-size: 17px;
            margin-bottom: 6px;
            font-weight: 700;
        }
        .gallery-item p { color: #718096; font-size: 12px; margin-bottom: 16px; }
        .gallery-item img {
            max-width: 92%;
            max-height: 480px;
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

    <div class="summary-card">
        <h3>Summary</h3>
        <div class="grid">
            <div class="row"><span class="label">Total Items</span><span class="value">${activeItems.length}</span></div>
            <div class="row"><span class="label">Categories</span><span class="value">${groups.length}</span></div>
            <div class="row"><span class="label">Out of Stock</span><span class="value ${outOfStock.length > 0 ? 'accent' : ''}">${outOfStock.length}</span></div>
            <div class="row"><span class="label">Critical Equipment</span><span class="value">${criticalCount}</span></div>
            <div class="row"><span class="label">Low Stock</span><span class="value">${lowStock.length}</span></div>
            <div class="row"><span class="label">Fully Stocked</span><span class="value">${fullyStocked.length}</span></div>
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
        <colgroup>
            <col style="width: 34%">
            <col style="width: 22%">
            <col style="width: 13%">
            <col style="width: 15%">
            <col style="width: 16%">
        </colgroup>
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
    ${criticalCount > 0 ? `
        <div class="table-legend">
            <span class="marker">★</span> marks critical equipment (${criticalCount} ${criticalCount === 1 ? 'item' : 'items'})
        </div>
    ` : ''}

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
