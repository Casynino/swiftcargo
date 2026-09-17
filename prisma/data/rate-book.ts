/**
 * Swift Cargo's real rate book, as it stands in the current system.
 *
 * Per cubic metre, by cargo type — a cubic metre of iron coil is not a cubic
 * metre of shoes. Bolt & Nuts is billed by weight because it is dense: a
 * quarter of a cubic metre of bolts weighs more than a container of clothing
 * and would be charged almost nothing on volume.
 */
export const RATE_BOOK: [name: string, basis: "PER_CBM" | "PER_KG", rate: number][] = [
  ["Aluminium Foils", "PER_CBM", 400],
  ["Artificial Flowers", "PER_CBM", 350],
  ["Bags", "PER_CBM", 380],
  ["Bicycles", "PER_CBM", 450],
  ["Bolt & Nuts", "PER_KG", 450],
  ["Books & Stationary", "PER_CBM", 380],
  ["Caps & Socks", "PER_CBM", 380],
  ["Car Accessories", "PER_CBM", 380],
  ["Car Filters", "PER_CBM", 380],
  ["Car paint", "PER_CBM", 400],
  ["Car Spare Parts", "PER_CBM", 400],
  ["Car Tyres", "PER_CBM", 400],
  ["Clothing", "PER_CBM", 400],
  ["Cosmetics", "PER_CBM", 400],
  ["Electronic", "PER_CBM", 400],
  ["Engine Oil", "PER_CBM", 450],
  ["Flowers & Decorations", "PER_CBM", 380],
  ["Furniture", "PER_CBM", 400],
  ["Gym Tools", "PER_CBM", 400],
  ["Hand Bags", "PER_CBM", 380],
  ["Hardware", "PER_CBM", 380],
  ["Heavy Electronics", "PER_CBM", 450],
  ["Iron coil", "PER_CBM", 550],
  ["Kitchen Items", "PER_CBM", 380],
  ["Machinery", "PER_CBM", 500],
  ["Machines & Heavy Goods", "PER_CBM", 500],
  ["Medals", "PER_CBM", 400],
  ["Mobile Accessories", "PER_CBM", 350],
  ["Packages", "PER_CBM", 380],
  ["Phone Accessories", "PER_CBM", 380],
  ["Roofing Sheets", "PER_CBM", 450],
  ["Sanitary", "PER_CBM", 400],
  ["Shoes", "PER_CBM", 350],
  ["Solar Items", "PER_CBM", 400],
  ["Television", "PER_CBM", 400],
  ["Tiles", "PER_CBM", 450],
  ["Toys", "PER_CBM", 380],
  /* The catch-all. Four rows exist in the old system at 340/350/380/400; the
     highest is kept, because under-charging an unclassified consignment is the
     mistake that costs money and the clerk can always pick a real type. */
  ["Other", "PER_CBM", 400],
];
