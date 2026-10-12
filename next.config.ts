import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://rpc.moderato.tempo.xyz https://rpc.tempo.xyz https://wallet.tempo.xyz; frame-src https://wallet.tempo.xyz; child-src https://wallet.tempo.xyz; form-action 'self' https://wallet.tempo.xyz" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

export default nextConfig
