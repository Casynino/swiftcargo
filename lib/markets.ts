/**
 * The shape of a market entry's body.
 *
 * `MarketInformation` has one free-text `body`, but the desk reads a market out
 * on a phone call in a fixed order — what it is, where, when it is open, what it
 * sells, what to warn the customer about. The admin form edits those as separate
 * fields and they are written into the body under fixed headings, so the
 * directory can lay them out again without a column per section.
 *
 * Parsing is tolerant: a body with no headings is all description, which is what
 * a body typed any other way will look like.
 */

export type MarketBody = {
  description: string;
  district: string;
  hours: string;
  products: string[];
  tips: string[];
  verify: string;
};

const HEADINGS = {
  district: "Where",
  hours: "Hours",
  products: "What they sell",
  tips: "Tell the customer",
  verify: "Confirm before travelling",
} as const;

type Section = keyof typeof HEADINGS;

const BY_HEADING = new Map<string, Section>(
  (Object.entries(HEADINGS) as [Section, string][]).map(([key, heading]) => [
    heading.toLowerCase(),
    key,
  ])
);

export function composeMarketBody(input: MarketBody): string {
  const parts: string[] = [];
  if (input.description.trim()) parts.push(input.description.trim());
  if (input.district.trim()) parts.push(`## ${HEADINGS.district}\n${input.district.trim()}`);
  if (input.hours.trim()) parts.push(`## ${HEADINGS.hours}\n${input.hours.trim()}`);
  if (input.products.length > 0) {
    parts.push(`## ${HEADINGS.products}\n${input.products.map((p) => `- ${p}`).join("\n")}`);
  }
  if (input.tips.length > 0) {
    parts.push(`## ${HEADINGS.tips}\n${input.tips.map((p) => `- ${p}`).join("\n")}`);
  }
  if (input.verify.trim()) parts.push(`## ${HEADINGS.verify}\n${input.verify.trim()}`);
  return parts.join("\n\n");
}

export function parseMarketBody(body: string | null | undefined): MarketBody {
  const out: Record<Section | "description", string[]> = {
    description: [],
    district: [],
    hours: [],
    products: [],
    tips: [],
    verify: [],
  };
  let current: Section | "description" = "description";

  for (const raw of (body ?? "").split("\n")) {
    const line = raw.trimEnd();
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      current = BY_HEADING.get(heading[1].trim().toLowerCase()) ?? "description";
      continue;
    }
    out[current].push(line);
  }

  const text = (lines: string[]) => lines.join("\n").trim();
  const list = (lines: string[]) =>
    lines
      .map((l) => l.replace(/^\s*[-•]\s*/, "").trim())
      .filter((l) => l.length > 0);

  return {
    description: text(out.description),
    district: text(out.district),
    hours: text(out.hours),
    products: list(out.products),
    tips: list(out.tips),
    verify: text(out.verify),
  };
}

/** Turns one-per-line textarea input into a clean ordered list. */
export function splitLines(value: string | null | undefined, max = 30): string[] {
  return (value ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, max);
}

/** URL-safe slug from the market's name. Minted once, so shared links keep working. */
export function slugifyMarket(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}
