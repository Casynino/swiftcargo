/* One address for the whole run, so the per-address limit behaves the way it
   does for one visitor rather than for a crowd. */
exports.headers = async () => new Map([["x-forwarded-for", "203.0.113.9"]]);
exports.cookies = async () => new Map();
