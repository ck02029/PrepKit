import path from "node:path";

const publicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const internalBackendUrl = process.env.BACKEND_INTERNAL_URL?.trim()
  || (process.env.NODE_ENV === "development" ? "http://localhost:8000" : undefined);

function upstreamOrigin(value) {
  const normalized = /^(https?:)?\/\//i.test(value) ? value : `http://${value}`;
  return normalized.replace(/\/+$/, "");
}

if (process.env.NODE_ENV === "production") {
  if (publicApiBaseUrl === undefined) {
    throw new Error("Set NEXT_PUBLIC_API_BASE_URL when building the production frontend. Use an empty value for the same-origin /api proxy.");
  }
  if (!publicApiBaseUrl.trim() && !internalBackendUrl) {
    throw new Error("Set BACKEND_INTERNAL_URL when building the production frontend with same-origin /api proxying.");
  }
}

const nextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
  experimental: { externalDir: true },
  async rewrites() {
    if (publicApiBaseUrl?.trim() || !internalBackendUrl) return [];
    return [{ source: "/api/:path*", destination: `${upstreamOrigin(internalBackendUrl)}/api/:path*` }];
  },
};

export default nextConfig;
