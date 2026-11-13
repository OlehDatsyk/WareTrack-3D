// Fictional demo catalogue. All companies, people and products are invented.

export const SUPPLIERS = [
  { name: "Brightline Safety Co.", contactName: "Dana Whitfield", contactEmail: "orders@brightline-safety.example", country: "USA", leadTimeDays: 5 },
  { name: "Volta Components", contactName: "Ken Ishida", contactEmail: "supply@volta-components.example", country: "Japan", leadTimeDays: 21 },
  { name: "PackRight Materials", contactName: "Laura Mendes", contactEmail: "sales@packright.example", country: "USA", leadTimeDays: 4 },
  { name: "Green Valley Foods", contactName: "Tomás Ortega", contactEmail: "trade@greenvalley.example", country: "USA", leadTimeDays: 3 },
  { name: "Homestead Goods", contactName: "Priya Raman", contactEmail: "b2b@homestead-goods.example", country: "Canada", leadTimeDays: 9 },
  { name: "Ironbridge Auto Parts", contactName: "Marek Nowak", contactEmail: "dealers@ironbridge.example", country: "Germany", leadTimeDays: 18 },
  { name: "Fulcrum Tools", contactName: "Grace Okafor", contactEmail: "orders@fulcrumtools.example", country: "USA", leadTimeDays: 7 },
  { name: "Paperfield Office", contactName: "Ellis Byrne", contactEmail: "wholesale@paperfield.example", country: "Ireland", leadTimeDays: 10 },
] as const;

export type ProductSeed = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  weight: number;
  cost: number;
  reorder: number;
  perPallet: number;
  supplier: number;
  chilled?: boolean;
  fastMover?: boolean;
  lowStock?: boolean;
};

export const PRODUCTS: ProductSeed[] = [
  // PPE & Safety
  { sku: "PPE-HLM-Y", name: "Safety Helmet — Yellow", category: "PPE & Safety", unit: "ea", weight: 0.45, cost: 11.4, reorder: 120, perPallet: 96, supplier: 0, fastMover: true },
  { sku: "PPE-HLM-W", name: "Safety Helmet — White", category: "PPE & Safety", unit: "ea", weight: 0.45, cost: 11.4, reorder: 80, perPallet: 96, supplier: 0 },
  { sku: "PPE-VST-L", name: "Hi-Vis Vest — Large", category: "PPE & Safety", unit: "ea", weight: 0.18, cost: 4.2, reorder: 200, perPallet: 400, supplier: 0, fastMover: true },
  { sku: "PPE-GLV-M", name: "Cut-Resistant Gloves — M", category: "PPE & Safety", unit: "pair", weight: 0.1, cost: 6.8, reorder: 300, perPallet: 600, supplier: 0, fastMover: true },
  { sku: "PPE-GOG-C", name: "Safety Goggles — Clear", category: "PPE & Safety", unit: "ea", weight: 0.08, cost: 3.9, reorder: 150, perPallet: 500, supplier: 0 },
  { sku: "PPE-EAR-D", name: "Ear Defenders", category: "PPE & Safety", unit: "ea", weight: 0.25, cost: 9.5, reorder: 90, perPallet: 240, supplier: 0, lowStock: true },
  { sku: "PPE-BOT-42", name: "Steel-Toe Boots — EU 42", category: "PPE & Safety", unit: "pair", weight: 1.6, cost: 38, reorder: 40, perPallet: 60, supplier: 0 },
  { sku: "PPE-MSK-FF", name: "FFP2 Respirator Mask (20)", category: "PPE & Safety", unit: "box", weight: 0.3, cost: 14.5, reorder: 120, perPallet: 320, supplier: 0 },
  // Electronics
  { sku: "ELC-SCN-2D", name: "2D Barcode Scanner", category: "Electronics", unit: "ea", weight: 0.4, cost: 89, reorder: 30, perPallet: 80, supplier: 1 },
  { sku: "ELC-LED-60", name: "LED Panel 60×60", category: "Electronics", unit: "ea", weight: 2.4, cost: 27, reorder: 60, perPallet: 70, supplier: 1 },
  { sku: "ELC-PBK-20", name: "Power Bank 20,000 mAh", category: "Electronics", unit: "ea", weight: 0.42, cost: 18.5, reorder: 150, perPallet: 360, supplier: 1, fastMover: true },
  { sku: "ELC-CBL-C2", name: "USB-C Cable 2 m", category: "Electronics", unit: "ea", weight: 0.06, cost: 2.6, reorder: 400, perPallet: 1200, supplier: 1, fastMover: true },
  { sku: "ELC-TAB-10", name: "Rugged Tablet 10\"", category: "Electronics", unit: "ea", weight: 0.9, cost: 310, reorder: 20, perPallet: 48, supplier: 1, lowStock: true },
  { sku: "ELC-LBL-4X6", name: "Thermal Label Printer 4×6", category: "Electronics", unit: "ea", weight: 1.8, cost: 145, reorder: 15, perPallet: 40, supplier: 1 },
  { sku: "ELC-HDS-BT", name: "Bluetooth Headset", category: "Electronics", unit: "ea", weight: 0.2, cost: 42, reorder: 50, perPallet: 200, supplier: 1 },
  { sku: "ELC-SMK-01", name: "Smart Smoke Detector", category: "Electronics", unit: "ea", weight: 0.3, cost: 24, reorder: 80, perPallet: 240, supplier: 1 },
  // Packaging
  { sku: "PKG-FLM-23", name: "Stretch Film 23 µm", category: "Packaging", unit: "roll", weight: 2.2, cost: 9.8, reorder: 100, perPallet: 120, supplier: 2, fastMover: true },
  { sku: "PKG-BOX-M", name: "Corrugated Box — Medium", category: "Packaging", unit: "bundle", weight: 4.5, cost: 12, reorder: 150, perPallet: 80, supplier: 2, fastMover: true },
  { sku: "PKG-BOX-L", name: "Corrugated Box — Large", category: "Packaging", unit: "bundle", weight: 6.2, cost: 15.5, reorder: 100, perPallet: 60, supplier: 2 },
  { sku: "PKG-TPE-48", name: "Packing Tape 48 mm", category: "Packaging", unit: "roll", weight: 0.3, cost: 1.9, reorder: 500, perPallet: 1440, supplier: 2, fastMover: true },
  { sku: "PKG-VDF-1", name: "Void Fill Paper Roll", category: "Packaging", unit: "roll", weight: 8, cost: 21, reorder: 40, perPallet: 48, supplier: 2 },
  { sku: "PKG-LBL-A6", name: "Shipping Labels A6 (500)", category: "Packaging", unit: "pack", weight: 0.9, cost: 7.4, reorder: 200, perPallet: 400, supplier: 2 },
  { sku: "PKG-PAL-EU", name: "Wooden Pallet 1200×800", category: "Packaging", unit: "ea", weight: 22, cost: 14, reorder: 60, perPallet: 20, supplier: 2 },
  { sku: "PKG-STR-12", name: "PET Strapping 12 mm", category: "Packaging", unit: "coil", weight: 9.5, cost: 34, reorder: 30, perPallet: 36, supplier: 2, lowStock: true },
  // Food & Beverage (chilled)
  { sku: "FNB-WAT-15", name: "Spring Water 1.5 L ×6", category: "Food & Beverage", unit: "case", weight: 9.2, cost: 3.1, reorder: 300, perPallet: 84, supplier: 3, chilled: true, fastMover: true },
  { sku: "FNB-COF-1K", name: "Coffee Beans 1 kg", category: "Food & Beverage", unit: "bag", weight: 1.05, cost: 13.2, reorder: 150, perPallet: 360, supplier: 3, chilled: true },
  { sku: "FNB-TOM-CN", name: "Chopped Tomatoes ×12", category: "Food & Beverage", unit: "case", weight: 5.1, cost: 7.8, reorder: 200, perPallet: 120, supplier: 3, chilled: true },
  { sku: "FNB-YOG-GR", name: "Greek Yogurt 500 g ×8", category: "Food & Beverage", unit: "case", weight: 4.2, cost: 11.6, reorder: 120, perPallet: 140, supplier: 3, chilled: true },
  { sku: "FNB-CHS-CH", name: "Aged Cheddar 2 kg", category: "Food & Beverage", unit: "block", weight: 2.05, cost: 16.4, reorder: 90, perPallet: 200, supplier: 3, chilled: true },
  { sku: "FNB-JCE-OR", name: "Orange Juice 1 L ×12", category: "Food & Beverage", unit: "case", weight: 12.6, cost: 14.2, reorder: 140, perPallet: 60, supplier: 3, chilled: true, fastMover: true },
  { sku: "FNB-OAT-MK", name: "Oat Drink 1 L ×6", category: "Food & Beverage", unit: "case", weight: 6.3, cost: 9.4, reorder: 160, perPallet: 90, supplier: 3, chilled: true },
  { sku: "FNB-SPK-LM", name: "Sparkling Lemonade ×24", category: "Food & Beverage", unit: "case", weight: 8.4, cost: 10.8, reorder: 140, perPallet: 80, supplier: 3, chilled: true },
  { sku: "FNB-BTR-UN", name: "Unsalted Butter 250 g ×20", category: "Food & Beverage", unit: "case", weight: 5.2, cost: 22.5, reorder: 80, perPallet: 120, supplier: 3, chilled: true, lowStock: true },
  // Household
  { sku: "HH-DET-5L", name: "Laundry Detergent 5 L", category: "Household", unit: "ea", weight: 5.4, cost: 8.9, reorder: 120, perPallet: 120, supplier: 4, fastMover: true },
  { sku: "HH-TWL-PP", name: "Paper Towels ×12", category: "Household", unit: "pack", weight: 2.1, cost: 7.2, reorder: 200, perPallet: 96, supplier: 4 },
  { sku: "HH-SPG-10", name: "Kitchen Sponges ×10", category: "Household", unit: "pack", weight: 0.2, cost: 2.4, reorder: 250, perPallet: 720, supplier: 4 },
  { sku: "HH-BIN-40", name: "Pedal Bin 40 L", category: "Household", unit: "ea", weight: 3.6, cost: 19, reorder: 40, perPallet: 48, supplier: 4 },
  { sku: "HH-MOP-SP", name: "Spin Mop Set", category: "Household", unit: "ea", weight: 2.8, cost: 16.5, reorder: 50, perPallet: 64, supplier: 4 },
  { sku: "HH-STR-BX", name: "Storage Box 45 L", category: "Household", unit: "ea", weight: 1.9, cost: 9.2, reorder: 80, perPallet: 90, supplier: 4 },
  { sku: "HH-LB-E27", name: "LED Bulb E27 ×4", category: "Household", unit: "pack", weight: 0.25, cost: 6.6, reorder: 180, perPallet: 600, supplier: 4 },
  // Automotive
  { sku: "AUT-OIL-5W", name: "Engine Oil 5W-30 5 L", category: "Automotive", unit: "ea", weight: 4.6, cost: 24, reorder: 90, perPallet: 120, supplier: 5, fastMover: true },
  { sku: "AUT-BRK-PD", name: "Brake Pad Set — Front", category: "Automotive", unit: "set", weight: 1.9, cost: 31, reorder: 60, perPallet: 200, supplier: 5 },
  { sku: "AUT-WPR-60", name: "Wiper Blade 60 cm", category: "Automotive", unit: "ea", weight: 0.3, cost: 8.4, reorder: 120, perPallet: 500, supplier: 5 },
  { sku: "AUT-BAT-70", name: "Car Battery 70 Ah", category: "Automotive", unit: "ea", weight: 17.5, cost: 86, reorder: 25, perPallet: 40, supplier: 5, lowStock: true },
  { sku: "AUT-TYR-17", name: "All-Season Tyre 17\"", category: "Automotive", unit: "ea", weight: 10.4, cost: 74, reorder: 40, perPallet: 32, supplier: 5 },
  { sku: "AUT-CLN-WS", name: "Screenwash Concentrate 5 L", category: "Automotive", unit: "ea", weight: 5.2, cost: 5.9, reorder: 100, perPallet: 120, supplier: 5 },
  // Tools & Hardware
  { sku: "TLS-DRL-18", name: "Cordless Drill 18 V", category: "Tools & Hardware", unit: "ea", weight: 1.9, cost: 64, reorder: 30, perPallet: 72, supplier: 6 },
  { sku: "TLS-SCR-SET", name: "Screwdriver Set ×12", category: "Tools & Hardware", unit: "set", weight: 0.9, cost: 15, reorder: 60, perPallet: 240, supplier: 6 },
  { sku: "TLS-LDR-3S", name: "Step Ladder 3-Step", category: "Tools & Hardware", unit: "ea", weight: 6.5, cost: 39, reorder: 20, perPallet: 30, supplier: 6 },
  { sku: "TLS-TPM-8M", name: "Tape Measure 8 m", category: "Tools & Hardware", unit: "ea", weight: 0.35, cost: 7.5, reorder: 100, perPallet: 600, supplier: 6, fastMover: true },
  { sku: "TLS-ANC-M8", name: "Wall Anchors M8 (100)", category: "Tools & Hardware", unit: "box", weight: 0.8, cost: 9.9, reorder: 140, perPallet: 480, supplier: 6 },
  { sku: "TLS-WRK-LT", name: "LED Work Light 30 W", category: "Tools & Hardware", unit: "ea", weight: 1.2, cost: 22, reorder: 50, perPallet: 120, supplier: 6 },
  // Office
  { sku: "OFC-PPR-A4", name: "Copy Paper A4 (5 reams)", category: "Office Supplies", unit: "box", weight: 12.5, cost: 21, reorder: 120, perPallet: 80, supplier: 7, fastMover: true },
  { sku: "OFC-PEN-BL", name: "Ballpoint Pens Blue ×50", category: "Office Supplies", unit: "box", weight: 0.6, cost: 8.5, reorder: 100, perPallet: 600, supplier: 7 },
  { sku: "OFC-BND-A4", name: "Lever Arch Binder", category: "Office Supplies", unit: "ea", weight: 0.5, cost: 2.8, reorder: 200, perPallet: 500, supplier: 7 },
  { sku: "OFC-STK-NT", name: "Sticky Notes ×12", category: "Office Supplies", unit: "pack", weight: 0.4, cost: 5.4, reorder: 150, perPallet: 800, supplier: 7 },
  { sku: "OFC-CHR-ER", name: "Ergonomic Office Chair", category: "Office Supplies", unit: "ea", weight: 15, cost: 129, reorder: 10, perPallet: 12, supplier: 7 },
  { sku: "OFC-WBD-90", name: "Whiteboard 90×60", category: "Office Supplies", unit: "ea", weight: 4.1, cost: 28, reorder: 15, perPallet: 40, supplier: 7 },
];

export const CUSTOMERS = [
  { name: "Harborview Retail Group", city: "Philadelphia, PA" },
  { name: "Summit Outfitters", city: "Pittsburgh, PA" },
  { name: "Northwind Hardware", city: "Newark, NJ" },
  { name: "Cobalt Café Collective", city: "Baltimore, MD" },
  { name: "Lakeside Medical Supply", city: "Cleveland, OH" },
  { name: "Maple & Main Stores", city: "Hartford, CT" },
  { name: "Pioneer Auto Centers", city: "Richmond, VA" },
  { name: "Brightway Office Solutions", city: "New York, NY" },
  { name: "Evergreen Grocers", city: "Allentown, PA" },
  { name: "Atlas Construction Supply", city: "Wilmington, DE" },
  { name: "Riverbend Home & Garden", city: "Trenton, NJ" },
  { name: "Keystone Facilities Mgmt", city: "Harrisburg, PA" },
  { name: "Silverline Electronics", city: "Boston, MA" },
  { name: "Copperfield Restaurants", city: "Washington, DC" },
  { name: "Granite State Logistics", city: "Manchester, NH" },
  { name: "Bayshore Pharmacies", city: "Atlantic City, NJ" },
];

/** Schematic map positions (0..1, not GPS) for destinations on the route map. */
export const CITY_MAP: Record<string, { x: number; y: number }> = {
  "Camden, NJ": { x: 0.52, y: 0.56 },
  "Columbus, OH": { x: 0.18, y: 0.6 },
  "Philadelphia, PA": { x: 0.5, y: 0.55 },
  "Pittsburgh, PA": { x: 0.28, y: 0.55 },
  "Newark, NJ": { x: 0.58, y: 0.45 },
  "Baltimore, MD": { x: 0.44, y: 0.68 },
  "Cleveland, OH": { x: 0.24, y: 0.42 },
  "Hartford, CT": { x: 0.68, y: 0.34 },
  "Richmond, VA": { x: 0.42, y: 0.86 },
  "New York, NY": { x: 0.61, y: 0.43 },
  "Allentown, PA": { x: 0.52, y: 0.47 },
  "Wilmington, DE": { x: 0.49, y: 0.61 },
  "Trenton, NJ": { x: 0.55, y: 0.5 },
  "Harrisburg, PA": { x: 0.42, y: 0.54 },
  "Boston, MA": { x: 0.8, y: 0.24 },
  "Washington, DC": { x: 0.41, y: 0.74 },
  "Manchester, NH": { x: 0.78, y: 0.14 },
  "Atlantic City, NJ": { x: 0.58, y: 0.64 },
};

export const CARRIERS = ["WareTrack Freight", "Bluepeak Logistics", "Northline Carriers", "Meridian Express", "Harborline Haulage"];

export const FIRST_NAMES = [
  "Alex", "Sam", "Jordan", "Morgan", "Riley", "Casey", "Avery", "Quinn", "Jamie", "Taylor",
  "Priya", "Mateo", "Aisha", "Kenji", "Sofia", "Darnell", "Mei", "Lukas", "Fatima", "Diego",
  "Hannah", "Oluwaseun", "Elena", "Rahul", "Grace", "Tomasz", "Nadia", "Marcus", "Ingrid", "Yusuf",
  "Chloe", "Andre", "Leila", "Kofi", "Valentina", "Ethan",
];

export const LAST_NAMES = [
  "Chen", "Patel", "Lee", "Reyes", "Okafor", "Nguyen", "García", "Kowalski", "Haddad", "Johnson",
  "Silva", "Müller", "Tanaka", "O'Brien", "Rossi", "Mensah", "Ivanova", "Kim", "Fischer", "Morales",
  "Adeyemi", "Larsen", "Hassan", "Novak", "Brooks", "Santos", "Dubois", "Park", "Walsh", "Costa",
];
