/** @type {import('next').NextConfig} */
const nextConfig = {
  // 서버리스 환경(Vercel)에서 네이티브 모듈이 포함된 패키지를 올바르게 번들링
  serverExternalPackages: ['pdf-parse'],

  // API Route 타임아웃 — Vercel Pro 플랜 기준 최대 60초
  // (무료 플랜은 10초 제한이므로 Pro 이상 권장)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig
