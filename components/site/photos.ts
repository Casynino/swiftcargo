import type { StaticImageData } from "next/image";

import cnShenzhen from "@/public/photos/cn-shenzhen.jpg";
import cnCantonTower from "@/public/photos/cn-canton-tower.jpg";
import cnWholesaleHall from "@/public/photos/cn-wholesale-hall.jpg";
import cnDongguan from "@/public/photos/cn-dongguan.jpg";
import cnFactoryLine from "@/public/photos/cn-factory-line.jpg";
import cnTextileFactory from "@/public/photos/cn-textile-factory.jpg";
import cnFurniture from "@/public/photos/cn-furniture.jpg";
import cnTiles from "@/public/photos/cn-tiles.jpg";
import cnLighting from "@/public/photos/cn-lighting.jpg";
import cnToys from "@/public/photos/cn-toys.jpg";
import cnShoes from "@/public/photos/cn-shoes.jpg";
import cnClothing from "@/public/photos/cn-clothing.jpg";
import cnBags from "@/public/photos/cn-bags.jpg";
import cnCosmetics from "@/public/photos/cn-cosmetics.jpg";
import cnAutoParts from "@/public/photos/cn-auto-parts.jpg";
import cnElectronics from "@/public/photos/cn-electronics.jpg";
import cnTradeFair from "@/public/photos/cn-trade-fair.jpg";
import cnMarketStreet from "@/public/photos/cn-market-street.jpg";
import cnShantou from "@/public/photos/cn-shantou.jpg";
import containerStack from "@/public/photos/container-stack.jpg";
import craneLift from "@/public/photos/crane-lift.jpg";
import guangzhouDusk from "@/public/photos/guangzhou-dusk.jpg";
import guangzhouNight from "@/public/photos/guangzhou-night.jpg";
import parcels from "@/public/photos/parcels.jpg";
import portCranes from "@/public/photos/port-cranes.jpg";
import portSunset from "@/public/photos/port-sunset.jpg";
import portYard from "@/public/photos/port-yard.jpg";
import shipAerial from "@/public/photos/ship-aerial.jpg";
import shipBow from "@/public/photos/ship-bow.jpg";
import shipSea from "@/public/photos/ship-sea.jpg";
import shipWake from "@/public/photos/ship-wake.jpg";
import traderDoor from "@/public/photos/trader-door.jpg";
import traderPhone from "@/public/photos/trader-phone.jpg";
import traderShop from "@/public/photos/trader-shop.jpg";
import warehouseForklift from "@/public/photos/warehouse-forklift.jpg";
import warehouseRacks from "@/public/photos/warehouse-racks.jpg";
import warehouseTeam from "@/public/photos/warehouse-team.jpg";

/**
 * THE PHOTOGRAPHS ON THE PUBLIC SITE.
 *
 * Stock pictures under the Unsplash licence (free for commercial use, no
 * attribution required — the photographer is named here anyway), standing in
 * until the company has its own. None of them is our warehouse, our container
 * or our customer, so none is captioned as if it were: they illustrate the
 * trade, and the words beside them say only what is true of us.
 *
 * To put a real photograph in: drop the file into public/photos/ and point the
 * entry at it. Every page reads from this table, so nothing else moves.
 * Imported rather than referenced by path so next/image knows each one's size
 * and draws a blurred placeholder while it loads.
 */
export type Photo = { src: StaticImageData; alt: string; credit: string };

export const PHOTOS = {
  shipBow: { src: shipBow, alt: "A loaded container ship under way", credit: "Ian Taylor" },
  shipSea: { src: shipSea, alt: "A container ship at sea", credit: "Chris Linnett" },
  shipAerial: { src: shipAerial, alt: "A container ship seen from above", credit: "Venti Views" },
  shipWake: { src: shipWake, alt: "A container ship leaving a white wake", credit: "Venti Views" },
  portYard: { src: portYard, alt: "Stacked containers and cranes at a port", credit: "Ali Mkumbwa" },
  portCranes: { src: portCranes, alt: "Ship-to-shore cranes over a container terminal", credit: "Barrett Ward" },
  portSunset: { src: portSunset, alt: "A container truck between stacks at sunset", credit: "Haris Illahi" },
  containerStack: { src: containerStack, alt: "A crane above stacked containers", credit: "taro ohtani" },
  craneLift: { src: craneLift, alt: "A crane lifting a container", credit: "Bernd Dittrich" },
  warehouseForklift: { src: warehouseForklift, alt: "A forklift between warehouse racks", credit: "Bernd Dittrich" },
  warehouseTeam: { src: warehouseTeam, alt: "Warehouse staff walking an aisle", credit: "Adrian Sulyok" },
  warehouseRacks: { src: warehouseRacks, alt: "Boxed goods on warehouse racks", credit: "CHUTTERSNAP" },
  guangzhouNight: { src: guangzhouNight, alt: "Guangzhou's skyline and river at night", credit: "Wally Yang" },
  guangzhouDusk: { src: guangzhouDusk, alt: "Guangzhou at dusk", credit: "Qingbao Meng" },
  traderShop: { src: traderShop, alt: "A shopkeeper at the counter of her shop", credit: "Ali Mkumbwa" },
  traderPhone: { src: traderPhone, alt: "A trader checking his phone", credit: "Ali Mkumbwa" },
  traderDoor: { src: traderDoor, alt: "A shop owner at his door", credit: "Ali Mkumbwa" },
  parcels: { src: parcels, alt: "Boxes stacked for delivery", credit: "Claudio Schwarz" },
  cnShenzhen: { src: cnShenzhen, alt: "Shenzhen's skyline", credit: "Robert Bye" },
  cnCantonTower: { src: cnCantonTower, alt: "Canton Tower over the Pearl River, Guangzhou", credit: "Yue WU" },
  cnWholesaleHall: { src: cnWholesaleHall, alt: "Stalls in a Chinese wholesale market hall", credit: "wang xuesong" },
  cnDongguan: { src: cnDongguan, alt: "Dongguan at dusk", credit: "Jason Yuen" },
  cnFactoryLine: { src: cnFactoryLine, alt: "A production line inside a factory", credit: "Bing Zhang" },
  cnTextileFactory: { src: cnTextileFactory, alt: "Workers at machines in a textile factory", credit: "Annie Spratt" },
  cnFurniture: { src: cnFurniture, alt: "A furniture showroom", credit: "Albero Furniture Bratislava" },
  cnTiles: { src: cnTiles, alt: "Patterned ceramic tiles", credit: "Richard Bell" },
  cnLighting: { src: cnLighting, alt: "Lamps hanging in a lighting shop", credit: "Anastasiya D" },
  cnToys: { src: cnToys, alt: "Toys on display in a shop", credit: "Mirna Wabi-Sabi" },
  cnShoes: { src: cnShoes, alt: "New sneakers with price tags", credit: "H&CO" },
  cnClothing: { src: cnClothing, alt: "Racks of clothes", credit: "Burgess Milner" },
  cnBags: { src: cnBags, alt: "A shop full of leather bags", credit: "Sam Burke" },
  cnCosmetics: { src: cnCosmetics, alt: "Bottles of cosmetics on a table", credit: "Aknazar Arysbek" },
  cnAutoParts: { src: cnAutoParts, alt: "A pile of spark plugs", credit: "shraga kopstein" },
  cnElectronics: { src: cnElectronics, alt: "A crowded electronics and parts stall", credit: "Cai Fang" },
  cnTradeFair: { src: cnTradeFair, alt: "A busy exhibition hall at a trade fair", credit: "Euronewsweek Media" },
  cnMarketStreet: { src: cnMarketStreet, alt: "A crowded market street in China", credit: "Sergio Kian" },
  cnShantou: { src: cnShantou, alt: "A bridge over the sea near Shantou", credit: "Mingfang" },
} satisfies Record<string, Photo>;

export type PhotoName = keyof typeof PHOTOS;
