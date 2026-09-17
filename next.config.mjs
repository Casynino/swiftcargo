/**
 * Headers every response carries.
 *
 * Not a full Content-Security-Policy: Next's own inline bootstrap scripts need
 * a nonce pipeline to lock script-src down, and a half-done one breaks pages
 * silently. What is here costs nothing and closes real doors — the app cannot
 * be framed by another site (a payment button clicked through an invisible
 * frame), a stored file cannot be sniffed into a script, a link out does not
 * carry an invoice id in the Referer, and only this site may ask for the camera,
 * which the warehouse photo capture needs.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  experimental: {
    // Cargo photos and payment proofs are uploaded straight through a server
    // action; the default 1 MB body cap rejects a phone camera photo. One file
    // may be 12 MB (lib/storage-drivers.ts), so the body must carry that plus
    // the rest of the form. On Vercel the platform caps a request at 4.5 MB
    // regardless; components/upload-budget.tsx keeps a form under that.
    serverActions: { bodySizeLimit: "16mb" },
  },
  // The invoice, report and payslip PDFs read the logo from public/ on disk
  // (lib/invoice-pdf-data.ts). A serverless function only carries the files the
  // build traced into it, and a path built from process.cwd() is not traced, so
  // without this every bill on Vercel prints without its mark.
  outputFileTracingIncludes: {
    "/app/**/*": ["./public/brand/swift-cargo.png"],
  },
  images: {
    // Every <Image> in the app is a local file or a data URL. A wildcard here
    // turned /_next/image into a proxy that fetched any address on the internet
    // on request, from our server and on our bandwidth.
    remotePatterns: [],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
