import { PrismaClient } from "@prisma/client";
import { refuseProductionDatabase } from "./guard";

refuseProductionDatabase("prisma/dev/set-entities.ts");
const prisma = new PrismaClient();

/** The real legal entities, off the receipt book and the packing list. */
async function main() {
  await prisma.companySetting.update({
    where: { id: "singleton" },
    data: {
      chinaEntity: "GUANGZHOU SENDERUI IMPORT AND EXPORT TRADING CO., LTD",
      darEntity: "REDSUN TZ COMPANY LIMITED",
      darPostal: "P.O. Box 3087, Dar es Salaam",
      chinaAddress:
        "C1-01, No. 188 Qinglong Middle Road, Shijing Street, Baiyun District, Guangzhou, Guangdong",
    },
  });
  const c = await prisma.companySetting.findUniqueOrThrow({ where: { id: "singleton" } });
  console.log("China entity:", c.chinaEntity);
  console.log("Dar entity:  ", c.darEntity, "·", c.darPostal);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
