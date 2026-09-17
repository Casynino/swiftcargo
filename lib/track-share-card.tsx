import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { CHART_LAND_PATH, CHART_W, chartPoint } from "@/lib/sea-chart";
import { SHARE_CARD_TEXT } from "@/lib/share-card-text";
import {
  BRIDGE_PATH,
  DECK_PATH,
  HULL_PATH,
  LANE_PATH,
  lanePoint,
} from "@/lib/sea-lane";

/**
 * THE CARD WHATSAPP DRAWS.
 *
 * Almost every customer meets this business through a link pasted into a chat,
 * and until this file existed that link arrived as a grey rectangle with a
 * tracking number in it. What arrives now is the company's name, what it does
 * and the lane the goods are on.
 *
 * IT SELLS THE SERVICE, NOT THE FORM. The card is seen mostly by people who are
 * not tracking anything — everybody else in the group the link landed in — so
 * the headline is the route the business runs rather than an instruction to
 * type a reference into a box.
 *
 * NOTHING ABOUT THE CONSIGNMENT IS ON IT. This one image is inherited by
 * /track and by every /track/<reference>, and WhatsApp renders it on their
 * servers and shows it to everybody in the group the link was pasted into. So
 * it is the same picture for every reference — no name, no amount, no date and
 * no reference. There is nothing here to leak because there is nothing here.
 *
 * Drawn rather than shipped: the chart is the same geometry the page itself
 * uses, turned into one SVG, so a 1200×630 card costs a few kilobytes of path
 * data instead of a photograph in the repository.
 */
export const alt = "Swift Cargo — shipping from China to Tanzania";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const DAR = chartPoint(39.45, -6.82);
const GZ = chartPoint(113.26, 23.13);
/* Mid-crossing, which is where a customer reading this card most often is. */
const SHIP = lanePoint(0.52);

/**
 * The chart as a standalone SVG.
 *
 * No <text> in it: the card is rasterised by resvg, which has no fonts of its
 * own, so every word on this image is laid out by the renderer above instead.
 */
const CHART_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 40 ${CHART_W} 340" width="1200" height="567">
  <defs>
    <linearGradient id="lane" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#29b6e8" stop-opacity="0.95"/>
      <stop offset="55%" stop-color="#29b6e8" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#f4611f" stop-opacity="0.95"/>
    </linearGradient>
    <radialGradient id="dar">
      <stop offset="0%" stop-color="#f4611f" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="#f4611f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path d="${CHART_LAND_PATH}" fill="#29b6e8" fill-opacity="0.3"/>
  <circle cx="${DAR[0]}" cy="${DAR[1]}" r="86" fill="url(#dar)"/>
  <path d="${LANE_PATH}" fill="none" stroke="url(#lane)" stroke-width="1.3" stroke-opacity="0.3"/>
  <path d="${LANE_PATH}" fill="none" stroke="url(#lane)" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 9"/>
  <g transform="translate(${SHIP.x.toFixed(1)} ${SHIP.y.toFixed(1)}) rotate(${SHIP.angle.toFixed(1)}) scale(1.5)">
    <path d="${HULL_PATH}" fill="#ffffff" fill-opacity="0.94"/>
    <path d="${DECK_PATH}" fill="#29b6e8"/>
    <path d="${BRIDGE_PATH}" fill="#f4611f"/>
  </g>
  <circle cx="${GZ[0]}" cy="${GZ[1]}" r="4" fill="#29b6e8"/>
  <circle cx="${DAR[0]}" cy="${DAR[1]}" r="5.5" fill="#f4611f"/>
  <circle cx="${DAR[0]}" cy="${DAR[1]}" r="11" fill="none" stroke="#f4611f" stroke-opacity="0.55" stroke-width="1.4"/>
</svg>`;

const CHART_URL = `data:image/svg+xml;base64,${Buffer.from(CHART_SVG).toString("base64")}`;

/**
 * The mark, if the build traced it into this function.
 *
 * A serverless function only carries the files the build knows it reads, and a
 * path assembled from process.cwd() is not one of them — see
 * outputFileTracingIncludes in next.config.mjs. If it is missing anyway the
 * card falls back to the name set in type, because a share card that renders
 * without its logo is better than a link that previews as nothing at all.
 */
function markUrl(): string | null {
  try {
    const file = readFileSync(join(process.cwd(), "public/brand/icon.png"));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function TrackShareCard() {
  const mark = markUrl();

  /*
    EVERYTHING THAT MATTERS SITS IN THE MIDDLE THIRD.

    WhatsApp does not show this card at 1200×630. In a chat list and in most
    previews it is a small SQUARE cropped from the CENTRE, so a mark in the
    top-left corner is cropped away and what survives is half a sentence. So
    the mark, the name, the tagline and the headline are stacked down the
    centre column — roughly x 285 to 915, the square the crop keeps — and
    nothing is placed where a crop would slice it in half.

    The lane is background here, not the subject: dimmed under a scrim, so the
    picture still says sea freight without competing with the logo.
  */
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a1720",
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CHART_URL}
          alt=""
          width={1200}
          height={567}
          style={{ position: "absolute", top: 32, left: 0, opacity: 0.4 }}
        />
        {/* The scrim, so the words and the mark never land on a coastline. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 50%, rgba(10,23,32,0.94) 0%, rgba(10,23,32,0.9) 42%, rgba(10,23,32,0.6) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 640,
            textAlign: "center",
          }}
        >
          {mark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mark} alt="" width={168} height={168} />
          ) : null}

          <div
            style={{
              display: "flex",
              marginTop: 10,
              fontSize: 56,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "0.06em",
            }}
          >
            SWIFT CARGO
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 6,
              fontSize: 27,
              color: "#4fc9f0",
              letterSpacing: "0.04em",
            }}
          >
            {SHARE_CARD_TEXT.tagline}
          </div>

          <div
            style={{ display: "flex", width: 120, height: 3, marginTop: 26, background: "#f4611f" }}
          />

          <div
            style={{
              display: "flex",
              marginTop: 26,
              /* Sized to sit inside the square crop with air either side: at
                 40 the headline ran edge to edge of the 630 the crop keeps. */
              fontSize: 36,
              fontWeight: 600,
              color: "#ffffff",
              lineHeight: 1.2,
            }}
          >
            {SHARE_CARD_TEXT.headline}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 16,
              fontSize: 23,
              color: "rgba(255,255,255,0.62)",
              letterSpacing: "0.16em",
            }}
          >
            GUANGZHOU → DAR ES SALAAM
          </div>
        </div>
      </div>
    ),
    size
  );
}
