import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // O player do VLibras (vlibras.gov.br) baixa o estilo da LIA (cores da roupa) deste site.
  async headers() {
    return [
      {
        source: "/vlibras/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Private-Network", value: "true" },
        ],
      },
    ];
  },
};

export default nextConfig;
