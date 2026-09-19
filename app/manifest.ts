import type { MetadataRoute } from "next";

/**
 * SWIFT CARGO AS AN APP ON THE PHONE.
 *
 * "Add to Home Screen" gives staff and customers an icon that opens full
 * screen, without the browser's address bar — the way a warehouse phone is
 * actually used all day. It starts at the sign-in page, which sends somebody
 * already signed in straight to their own desk or their portal, so one icon
 * serves every department and every customer.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Swift Cargo",
    short_name: "Swift Cargo",
    description: "Sea freight from Guangzhou to Dar es Salaam — track, book, pay and run the warehouse.",
    id: "/",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b2742",
    theme_color: "#0b2742",
    categories: ["business", "productivity", "logistics"],
    icons: [
      { src: "/brand/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    /* A long press on the icon. Each one lands on a page that sends anybody
       who may not use it somewhere sensible. */
    shortcuts: [
      { name: "Track cargo", url: "/track", icons: [{ src: "/brand/app-192.png", sizes: "192x192" }] },
      { name: "Price calculator", url: "/calculator", icons: [{ src: "/brand/app-192.png", sizes: "192x192" }] },
      { name: "My desk", url: "/app/dashboard", icons: [{ src: "/brand/app-192.png", sizes: "192x192" }] },
    ],
  };
}
