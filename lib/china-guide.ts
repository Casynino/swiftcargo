import type { PhotoName } from "@/components/site/photos";

/**
 * A VISITOR'S GUIDE TO WHERE THINGS ARE MADE AND SOLD IN SOUTH CHINA.
 *
 * General knowledge a trader would find in any guide — which city is known for
 * what, which Guangzhou markets sell which goods, when the Canton Fair runs —
 * written so it stays true: no stall counts, no prices, no opening hours, and
 * nothing that says Swift Cargo owns, runs or vouches for any of it. What we
 * do is the last line of every entry, and it is only what the company does:
 * collect from the supplier, receive in Guangzhou, and ship.
 *
 * The markets Support recommends by name are a separate list, edited in the
 * app (MarketInformation) and shown under this guide.
 */

export type Place = {
  slug: string;
  name: string;
  /** The province, or the city a market is in. */
  where: string;
  photo: PhotoName;
  /** One line under the name on the card. */
  tagline: string;
  about: string;
  /** What a buyer goes there for. */
  goods: string[];
  /** Hours from Guangzhou, roughly, for the cities. */
  distance?: string;
};

export const CITIES: Place[] = [
  {
    slug: "guangzhou",
    name: "Guangzhou",
    where: "Guangdong",
    photo: "cnCantonTower",
    tagline: "The trading capital of the south",
    about:
      "Home of the Canton Fair and of wholesale markets for almost everything a shop in Tanzania sells. Our receiving warehouse is here, so whatever you buy in the city can come straight to us.",
    goods: ["Clothing and fabric", "Leather goods", "Beauty products", "Auto parts", "Toys and stationery"],
    distance: "Our warehouse is here",
  },
  {
    slug: "yiwu",
    name: "Yiwu",
    where: "Zhejiang",
    photo: "cnWholesaleHall",
    tagline: "The world's small-goods market",
    about:
      "Yiwu International Trade City is one of the largest wholesale markets anywhere — floor after floor of small commodities sold by the carton, from hair accessories to kitchenware.",
    goods: ["Household goods", "Jewellery and accessories", "Stationery", "Toys", "Festival goods"],
    distance: "About 7 hours by fast train",
  },
  {
    slug: "shenzhen",
    name: "Shenzhen",
    where: "Guangdong",
    photo: "cnShenzhen",
    tagline: "Electronics, from parts to phones",
    about:
      "China's electronics city. The Huaqiangbei district sells components, phones, accessories, LED and solar products, and the factories that make them are a short drive away.",
    goods: ["Phones and accessories", "Components", "LED and solar", "Small appliances"],
    distance: "About 1 hour by train",
  },
  {
    slug: "foshan",
    name: "Foshan",
    where: "Guangdong",
    photo: "cnFurniture",
    tagline: "Furniture and building materials",
    about:
      "Next door to Guangzhou. Lecong is known for its furniture showrooms that run for kilometres, and the city is a centre for ceramic tiles, sanitary ware and aluminium.",
    goods: ["Furniture", "Tiles and ceramics", "Sanitary ware", "Aluminium and steel"],
    distance: "Under 1 hour",
  },
  {
    slug: "dongguan",
    name: "Dongguan",
    where: "Guangdong",
    photo: "cnFactoryLine",
    tagline: "The factory city",
    about:
      "Between Guangzhou and Shenzhen, and full of factories — shoes, garments, bags, toys, furniture and electronics are all made here, which makes it the place to meet a manufacturer rather than a trader.",
    goods: ["Shoes", "Garments", "Bags", "Electronics", "Furniture"],
    distance: "About 1 hour",
  },
  {
    slug: "zhongshan",
    name: "Zhongshan",
    where: "Guangdong",
    photo: "cnLighting",
    tagline: "The lighting town",
    about:
      "Guzhen, in Zhongshan, is known across the trade as China's lighting capital: chandeliers, LED fittings, street lights and lamps, sold from showrooms and straight from factories.",
    goods: ["Lamps and chandeliers", "LED fittings", "Outdoor and street lighting"],
    distance: "About 1½ hours",
  },
  {
    slug: "shantou",
    name: "Shantou",
    where: "Guangdong",
    photo: "cnToys",
    tagline: "Toys by the container",
    about:
      "Chenghai, in Shantou, is one of the biggest toy-making districts in the world — plastic toys, remote-control cars, dolls and educational toys, made and sold in bulk.",
    goods: ["Toys", "Remote-control toys", "Educational toys", "Party goods"],
    distance: "About 5 hours",
  },
  {
    slug: "jinjiang",
    name: "Jinjiang",
    where: "Fujian",
    photo: "cnShoes",
    tagline: "Shoes and sportswear",
    about:
      "Jinjiang and neighbouring Quanzhou make a large share of the world's sports shoes and sportswear, from famous brands' factories to thousands of smaller makers.",
    goods: ["Sports shoes", "Sportswear", "Sandals and slippers"],
    distance: "About 5 hours by train",
  },
];

export const MARKETS: Place[] = [
  {
    slug: "canton-fair",
    name: "Canton Fair",
    where: "Pazhou, Guangzhou",
    photo: "cnTradeFair",
    tagline: "China's biggest trade fair, twice a year",
    about:
      "The China Import and Export Fair fills the Pazhou exhibition halls every spring (April to May) and autumn (October to November), in three phases by industry. Thousands of manufacturers show their goods in one place.",
    goods: ["Machinery", "Electronics", "Building materials", "Home goods", "Textiles", "Gifts"],
  },
  {
    slug: "clothing",
    name: "Shahe and Baima clothing markets",
    where: "Guangzhou",
    photo: "cnClothing",
    tagline: "Clothing wholesale, from dawn",
    about:
      "Guangzhou's clothing trade is spread across several big market areas — Shahe, Baima by the railway station, and Shisanhang (the Thirteen Hongs). Shahe opens very early; go in the morning.",
    goods: ["Men's and women's clothing", "Children's clothing", "Jeans", "Fabric"],
  },
  {
    slug: "leather",
    name: "Guihua Road leather markets",
    where: "Baiyun, Guangzhou",
    photo: "cnBags",
    tagline: "Handbags, belts and luggage",
    about:
      "The streets around Guihua Road and the Baiyun World Leather Trading Centre are lined with leather-goods wholesalers: handbags, wallets, belts, luggage and the materials to make them.",
    goods: ["Handbags", "Luggage", "Belts and wallets", "Leather and hardware"],
  },
  {
    slug: "beauty",
    name: "Meibo City beauty market",
    where: "Baiyun, Guangzhou",
    photo: "cnCosmetics",
    tagline: "Cosmetics and salon supplies",
    about:
      "A wholesale centre for beauty: cosmetics, hair products, salon equipment and packaging, much of it from factories in the Baiyun district around it.",
    goods: ["Cosmetics", "Hair products", "Salon equipment", "Packaging"],
  },
  {
    slug: "yide-road",
    name: "Yide Road",
    where: "Yuexiu, Guangzhou",
    photo: "cnMarketStreet",
    tagline: "Toys, stationery and festival goods",
    about:
      "An old trading street near the river with wholesale buildings for toys, stationery, decorations and dried foods — a good place to fill a mixed order in a day.",
    goods: ["Toys", "Stationery", "Decorations", "Dried foods"],
  },
  {
    slug: "auto-parts",
    name: "Yongfu Road auto parts",
    where: "Yuexiu, Guangzhou",
    photo: "cnAutoParts",
    tagline: "Spares for every car on the road",
    about:
      "Street after street of auto-parts dealers: engine and body parts, accessories, tyres and car electronics, for Japanese, European and Chinese makes.",
    goods: ["Engine parts", "Body parts", "Accessories", "Car electronics"],
  },
  {
    slug: "electronics",
    name: "Huaqiangbei",
    where: "Futian, Shenzhen",
    photo: "cnElectronics",
    tagline: "The electronics market",
    about:
      "Towers of stalls selling phones, accessories, components, chargers, cameras and gadgets, from single samples to factory quantities.",
    goods: ["Phones and accessories", "Components", "Chargers and cables", "Gadgets"],
  },
  {
    slug: "tiles",
    name: "Foshan ceramics and tiles",
    where: "Foshan",
    photo: "cnTiles",
    tagline: "Tiles, sanitary ware and stone",
    about:
      "Showroom districts for floor and wall tiles, bathroom fittings and stone, with the factories behind them. Heavy goods — ask us about packing before you order.",
    goods: ["Floor and wall tiles", "Sanitary ware", "Stone"],
  },
];

/** What we do for somebody buying in any of these places. */
export const HOW_WE_HELP = [
  {
    title: "Your supplier delivers to us",
    body: "Give them our Guangzhou warehouse address and your shipping mark. We receive, count, measure and photograph what arrives.",
  },
  {
    title: "Or we collect it",
    body: "Bought from a factory or market that does not deliver? Ask us to pick it up and bring it to our warehouse.",
  },
  {
    title: "Many suppliers, one shipment",
    body: "Everything with your mark waits in our warehouse until it sails, so goods bought in several cities travel together.",
  },
  {
    title: "It sails every week",
    body: "Cargo in by Friday goes on the Monday sailing to Dar es Salaam.",
  },
];
