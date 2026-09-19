"use client";

import { useT } from "@/components/app/locale-provider";

/**
 * One string in the reader's language, from anywhere in the tree.
 *
 * For shared pieces — an empty state, a badge — that are drawn by server pages
 * and client tables alike, so they can neither call the server's T() nor
 * assume they sit inside a component that already has useT().
 */
export function Tx({ children }: { children: string }) {
  const t = useT();
  /* Titles are built with their count in them — "3 payments to verify". The
     dictionary holds those with {n} where the figure goes, so one entry
     covers every count; see translateMessage. */
  return <>{translateMessage(children, t)}</>;
}

/**
 * A message from the server, in the reader's language.
 *
 * Action errors are English sentences, some with a figure in them — "Item 3:
 * the receipt number is needed." The dictionary holds them with {n} where the
 * figures go, so one entry covers every item number; a sentence nobody has
 * translated yet is shown as it came.
 */
export function Tm({ children }: { children: string }) {
  const t = useT();
  return <>{translateMessage(children, t)}</>;
}

export function translateMessage(message: string, t: (text: string) => string) {
  const direct = t(message);
  if (direct !== message) return direct;
  const figures = message.match(/\d+(?:[.,]\d+)*/g);
  if (!figures) return message;
  const key = message.replace(/\d+(?:[.,]\d+)*/g, "{n}");
  const found = t(key);
  if (found === key) return message;
  let i = 0;
  return found.replace(/\{n\}/g, () => figures[i++] ?? "");
}
