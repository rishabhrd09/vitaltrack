/**
 * VitalTrack Seed Data
 * Default categories and items - MATCHES Kotlin Android App
 * 
 * Unit Guidelines:
 * - Machines/devices: "unit" (singular)
 * - Gloves: "pairs" or "packets" (for boxes)
 * - Gauze/Cotton/Underpads: "packets" (for bundles)
 * - Bottles (Dettol, Betadine): "bottles"
 * - Tubes/Catheters: "pieces"
 * - Circuits/Sets: "sets"
 * - Filters: "pieces"
 * - Cylinders: "cylinders"
 */

export interface SeedCategory {
  name: string;
  description?: string;
  items: SeedItem[];
}

export interface SeedItem {
  name: string;
  unit: string;
  minimumStock: number;
  description?: string;
}

/**
 * Seed data matching exactly with Kotlin VitalTrack Android App
 * https://github.com/rishabhrd09/vitaltrackandroid-frontend
 */
export const SEED_DATA: SeedCategory[] = [
  {
    name: 'Ventilator & Respiratory',
    description: 'Breathing support equipment and supplies',
    items: [
      { name: 'BiPAP/Ventilator Machine', unit: 'unit', minimumStock: 1 },
      { name: 'Catheter Mount', unit: 'piece', minimumStock: 2 },
      { name: 'HME Filter', unit: 'pieces', minimumStock: 5 },
      { name: 'Bacteria Filter', unit: 'pieces', minimumStock: 5 },
      { name: 'Ventilator Circuit', unit: 'set', minimumStock: 2 },
      { name: 'Ambu Bag', unit: 'unit', minimumStock: 1 },
      { name: 'Oxygen Concentrator', unit: 'unit', minimumStock: 1 },
      { name: 'Oxygen Cylinder', unit: 'cylinder', minimumStock: 1 },
    ],
  },
  {
    name: 'Suction Equipment',
    description: 'Airway clearance supplies',
    items: [
      { name: 'Suction Machine', unit: 'unit', minimumStock: 1 },
      { name: 'Suction Catheter', unit: 'pieces', minimumStock: 15 },
      { name: 'Suction Jar/Container', unit: 'pieces', minimumStock: 2 },
      { name: 'Suction Filter', unit: 'pieces', minimumStock: 3 },
      { name: 'Vacuum Set', unit: 'set', minimumStock: 1 },
    ],
  },
  {
    name: 'Tracheostomy Care',
    description: 'Trach tube maintenance and cleaning',
    items: [
      { name: 'TT Tube', unit: 'piece', minimumStock: 2 },
      { name: 'Gauze Swabs', unit: 'packets', minimumStock: 3 },
      { name: 'Betadine Solution', unit: 'bottle', minimumStock: 1 },
      { name: 'Sterile Gloves', unit: 'packets', minimumStock: 20 },
    ],
  },
  {
    name: 'Nebulization',
    description: 'Medication delivery via mist',
    items: [
      { name: 'Nebulizer Machine', unit: 'unit', minimumStock: 1 },
      { name: 'Nebulizer Mask/Tube', unit: 'pieces', minimumStock: 2 },
      { name: 'Normal Saline (NS)', unit: 'bottles', minimumStock: 5 },
    ],
  },
  {
    name: 'Vitals Monitoring',
    description: 'Health monitoring devices',
    items: [
      { name: 'Pulse Oximeter', unit: 'unit', minimumStock: 1 },
      { name: 'BP Monitor', unit: 'unit', minimumStock: 1 },
      { name: 'Thermometer', unit: 'unit', minimumStock: 1 },
    ],
  },
  {
    name: 'Feeding Supplies',
    description: 'Enteral feeding equipment',
    items: [
      { name: 'Feeding Tube (Ryles)', unit: 'pieces', minimumStock: 2 },
      { name: 'Feeding Syringe 50ml', unit: 'pieces', minimumStock: 3 },
      { name: 'Extension Set', unit: 'set', minimumStock: 2 },
    ],
  },
  {
    name: 'Daily Care',
    description: 'Hygiene and comfort supplies',
    items: [
      { name: 'Cotton Roll', unit: 'packets', minimumStock: 2 },
      { name: 'Underpads', unit: 'packets', minimumStock: 5 },
      { name: 'Bed Sheets', unit: 'pieces', minimumStock: 4 },
      { name: 'Wet Wipes', unit: 'packets', minimumStock: 3 },
      { name: 'Dettol/Antiseptic', unit: 'bottle', minimumStock: 1 },
      { name: 'Hand Sanitizer', unit: 'bottle', minimumStock: 2 },
    ],
  },
  {
    name: 'Medicines',
    description: 'Prescribed medications',
    items: [],
  },
  {
    name: 'Backup Equipment',
    description: 'Emergency backup devices',
    items: [],
  },
  {
    name: 'Other',
    description: 'Miscellaneous supplies',
    items: [],
  },
];

// Essential items that remain visible after "Start Fresh"
export const ESSENTIAL_ITEM_KEYWORDS = [
  'bipap', 'ventilator', 'suction machine',
  'ambu bag', 'nebulizer', 'nebuliser',
  'oxygen cylinder', 'oxygen concentrator'
];
