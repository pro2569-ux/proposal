import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ReactQueryProvider } from '@/src/lib/react-query'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '나라장터 AI 제안서 자동생성',
  description: '나라장터 입찰공고를 선택하면 AI가 자동으로 제안서 PPT를 생성합니다',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <ReactQueryProvider>{children}</ReactQueryProvider>
      </body>
    </html>
  )
}
