import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-8">
      <div className="w-full max-w-4xl text-center">
        {/* Logo/Icon */}
        <div className="mb-8 flex justify-center">
          <div className="rounded-full bg-gradient-to-br from-blue-600 to-purple-600 p-6 shadow-xl">
            <svg
              className="h-16 w-16 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-4 text-5xl font-bold text-gray-900">
          나라장터 AI 제안서
          <br />
          <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            자동생성 서비스
          </span>
        </h1>

        {/* Description */}
        <p className="mb-12 text-xl text-gray-600">
          입찰공고를 선택하면 AI가 자동으로
          <br />
          전문적인 제안서 PPT를 생성해드립니다
        </p>

        {/* Features */}
        <div className="mb-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-lg bg-white p-6 shadow-md">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-blue-100 p-3">
                <svg
                  className="h-6 w-6 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>
            <h3 className="mb-2 font-semibold text-gray-900">
              나라장터 공고 검색
            </h3>
            <p className="text-sm text-gray-600">
              실시간으로 나라장터 입찰공고를 검색하고 확인할 수 있습니다
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-md">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-purple-100 p-3">
                <svg
                  className="h-6 w-6 text-purple-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
            </div>
            <h3 className="mb-2 font-semibold text-gray-900">AI 자동 생성</h3>
            <p className="text-sm text-gray-600">
              GPT-4를 활용해 공고 내용을 분석하고 맞춤형 제안서를 작성합니다
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-md">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-green-100 p-3">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                  />
                </svg>
              </div>
            </div>
            <h3 className="mb-2 font-semibold text-gray-900">PPT 다운로드</h3>
            <p className="text-sm text-gray-600">
              완성된 제안서를 PowerPoint 파일로 바로 다운로드할 수 있습니다
            </p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/login?mode=signup"
            className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:from-blue-500 hover:to-purple-500 hover:shadow-xl"
          >
            무료로 시작하기
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-white px-8 py-4 text-lg font-semibold text-gray-700 shadow-md transition-all hover:bg-gray-50 hover:shadow-lg"
          >
            로그인
          </Link>
        </div>

        {/* Footer Note */}
        <p className="mt-12 text-sm text-gray-500">
          OpenAI GPT-4 기반 AI 제안서 자동생성 시스템
        </p>
      </div>
    </main>
  )
}
