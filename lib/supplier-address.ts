import "server-only";

import { prisma } from "@/lib/prisma";

export type SupplierAddress = {
  /** The whole message, in Chinese, ready to paste to a supplier. */
  text: string;
  lines: { label: string; value: string }[];
  english: string | null;
};

/**
 * THE GUANGZHOU ADDRESS AS A SUPPLIER NEEDS TO RECEIVE IT.
 *
 * In Chinese, laid out the way a factory's dispatch clerk and a driver in
 * Baiyun expect a delivery address: where, who receives it, the phone to ring
 * first, and the customer's mark (唛头) that has to be on every carton. Read
 * from the China warehouse's own record, so changing the door in the admin
 * screen changes what every customer sends.
 */
export async function supplierAddress(mark?: string | null): Promise<SupplierAddress | null> {
  const warehouse = await prisma.warehouse.findFirst({
    where: { kind: "CHINA", active: true },
    orderBy: { createdAt: "asc" },
    select: { addressLocal: true, addressEnglish: true, phone: true, contactName: true },
  });
  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { chinaAddress: true },
  });
  const address = warehouse?.addressLocal || company?.chinaAddress;
  if (!address) return null;

  const lines = [
    { label: "仓库地址", value: address },
    ...(warehouse?.contactName ? [{ label: "联系人", value: warehouse.contactName }] : []),
    ...(warehouse?.phone ? [{ label: "联系电话号码", value: warehouse.phone }] : []),
    { label: "唛头", value: mark?.trim() || "（请写上客户唛头）" },
  ];
  const text = [
    "【Swift Cargo 广州仓库】",
    ...lines.map((line) => `${line.label}：${line.value}`),
    "",
    "温馨提示：请在每一箱货物的外箱上写清楚唛头，送货前请先电话联系仓库。谢谢！",
  ].join("\n");

  return { text, lines, english: warehouse?.addressEnglish ?? company?.chinaAddress ?? null };
}
