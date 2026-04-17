/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // API rewrite to FastAPI removed — all /api/* routes are now handled by
  // Next.js Route Handlers in app/api/. FastAPI will be decommissioned in Phase 6.
}

export default nextConfig
