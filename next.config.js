/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
  },
  // Enable experimental features for Next.js 14
  experimental: {
    // Remove appDir as it's now default in Next.js 14
  },
}

module.exports = nextConfig