/** @type {import('next').NextConfig} */
const nextConfig = {
  // L'API FastAPI tourne sur le port 8000 en local
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: process.env.NEXT_PUBLIC_API_URL
          ? `${process.env.NEXT_PUBLIC_API_URL}/:path*`
          : "http://localhost:8000/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
