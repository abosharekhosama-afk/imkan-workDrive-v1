import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Univer ships ESM packages that need transpilation under Next.js
  transpilePackages: [
    "@univerjs/core",
    "@univerjs/design",
    "@univerjs/docs",
    "@univerjs/docs-ui",
    "@univerjs/engine-formula",
    "@univerjs/engine-render",
    "@univerjs/sheets",
    "@univerjs/sheets-formula",
    "@univerjs/sheets-numfmt",
    "@univerjs/sheets-ui",
    "@univerjs/ui",
  ],
  async redirects() {
    return [
      {
        source: '/',
        destination: '/auth/login',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;