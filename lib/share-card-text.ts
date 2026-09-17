/**
 * THE WORDS ON THE LINK.
 *
 * What WhatsApp prints under the picture when somebody pastes a Swift Cargo
 * link into a chat, and what the picture itself says. One file, because a card
 * whose headline and whose preview text disagree reads as two companies.
 *
 * IT SELLS THE SERVICE, NOT THE FORM. Most of the people who ever see this are
 * not tracking anything — they are everybody else in the group the link landed
 * in. So it leads with what the business does rather than with an instruction
 * to type a reference into a box.
 *
 * NOTHING ABOUT ANY CONSIGNMENT IS IN IT. The same words go out for every
 * reference: no name, no amount, no date, no reference. There is nothing here
 * to leak because there is nothing here.
 *
 * The lengths are set by the preview card, which clips a title around 55
 * characters and a description around 110.
 *
 * Its own module rather than a constant in lib/track-share-card.tsx: that file
 * pulls in the image renderer, and a page that only needs three strings should
 * not drag a rasteriser into its bundle to get them.
 */
export const SHARE_CARD_TEXT = {
  title: "Swift Cargo — Shipping from China to Tanzania",
  description:
    "Fast sea freight and China sourcing to Dar es Salaam. Track your cargo any time — On time, Every time.",
  headline: "Shipping from China to Tanzania",
  /** The company's own line, printed under the mark. */
  tagline: "On time, Every time",
} as const;
