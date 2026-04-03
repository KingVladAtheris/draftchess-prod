import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  rewrites: async () => [
    {
      source: '/socket.io/:path*',
      destination: `${process.env.SOCKET_SERVER_URL ?? 'http://localhost:3001'}/socket.io/:path*`,
    },
  ],
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg', 'pg', 'pino'],
}

export default nextConfig