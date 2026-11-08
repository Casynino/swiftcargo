/**
 * TWO CLOCKS, BECAUSE THE COMPANY LIVES IN TWO OF THEM.
 *
 * Guangzhou is five hours ahead of Dar es Salaam. Half of what goes wrong
 * between the two ends is somebody ringing a warehouse that closed three hours
 * ago, or promising a customer a photograph from a floor where it is midnight.
 * Rendered on the server, so it is the time when the page was built — near
 * enough for a warehouse, and honest about being a page.
 */
export function twoClocks(now = new Date()) {
  return [
    { place: "Guangzhou", zone: "Asia/Shanghai" },
    { place: "Dar es Salaam", zone: "Africa/Dar_es_Salaam" },
  ].map((c) => ({
    place: c.place,
    time: new Intl.DateTimeFormat("en-GB", { timeZone: c.zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now),
  }));
}
