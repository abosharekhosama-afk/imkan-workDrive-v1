import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
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
        source: "/",
        destination: "/auth/login",
        permanent: false,
      },
      // Deactivate IMKAN Office as primary editor — all traffic → Univer
      {
        source: "/office/writer/:fileId",
        destination: "/office/univer/:fileId?kind=writer",
        permanent: false,
      },
      {
        source: "/office/sheet/:fileId",
        destination: "/office/univer/:fileId?kind=sheet",
        permanent: false,
      },
      {
        source: "/office/show/:fileId",
        destination: "/office/univer/:fileId?kind=show",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
