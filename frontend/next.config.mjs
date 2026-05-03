/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Prevents presigned S3 URLs from leaking via Referer header
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'geolocation=(), camera=(), microphone=(), payment=()' },
          {
            key: 'Content-Security-Policy',
            // unsafe-inline required: Next.js injects inline scripts for hydration and __NEXT_DATA__
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              // unsafe-inline for styles: Next.js injects critical CSS inline; googleapis for Material Symbols
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "connect-src 'self'",
              // Allow S3 presigned URLs to load in the PDF iframe
              "frame-src 'self' https://triageai-test-referrals.s3.amazonaws.com https://triageai-test-referrals.s3.us-east-1.amazonaws.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
