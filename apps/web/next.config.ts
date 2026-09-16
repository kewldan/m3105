import path from "node:path";
import type { NextConfig } from "next";

// Заголовки безопасности. `unsafe-inline` для скриптов — сознательный компромисс:
// Next вставляет инлайновые скрипты гидрации, а nonce потребовал бы middleware
// на каждый запрос. Остальное закручено: чужие фреймы, формы и объекты запрещены,
// скрипты — только свои и виджет входа Telegram.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://telegram.org https://oauth.telegram.org",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://oauth.telegram.org",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  serverExternalPackages: ["shiki"],
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    const api = process.env.API_URL;
    if (!api) return [];
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
