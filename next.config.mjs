/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const supabaseWs = supabaseUrl.replace(/^http/, "ws");

    const csp = [
      "default-src 'self'",
      // Next.js needs 'unsafe-inline' for its own bootstrap scripts and
      // 'unsafe-eval' in dev for HMR/Fast Refresh; swagger-ui-react (used
      // only on /api-docs) also injects inline scripts.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Tailwind/Leaflet/swagger-ui rely on inline styles.
      "style-src 'self' 'unsafe-inline'",
      // Supabase Storage serves rider profile photos.
      `img-src 'self' data: blob: https://*.tile.openstreetmap.org ${supabaseUrl}`,
      "font-src 'self' data:",
      `connect-src 'self' ${supabaseUrl} ${supabaseWs}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      { key: "Content-Security-Policy", value: csp },
    ];

    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
