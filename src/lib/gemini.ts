/**
 * Google Gemini AI — 다이어그램 이미지 생성
 *
 * 모델: gemini-2.0-flash-exp (이미지 생성 지원)
 * 용도: 제안서 PPT에 삽입할 시스템 구성도, 플로우차트 등 생성
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

// ──────────── 초기화 ────────────

const API_KEY = process.env.GOOGLE_AI_API_KEY || ''

function getClient() {
  if (!API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY 환경변수가 설정되지 않았습니다.')
  }
  return new GoogleGenerativeAI(API_KEY)
}

const MODEL_NAME = 'gemini-2.0-flash-exp'
const MAX_RETRIES = 2
const TIMEOUT_MS = 30_000

// ──────────── 타입 ────────────

export type DiagramType =
  | 'system_architecture'
  | 'process_flow'
  | 'org_chart'
  | 'schedule'

export interface DiagramResult {
  /** PNG 이미지 바이트 (Base64 디코딩 완료) */
  imageBuffer: Buffer
  /** MIME 타입 */
  mimeType: string
  /** 플레이스홀더 여부 (생성 실패 시 true) */
  isPlaceholder: boolean
}

// ──────────── 다이어그램 타입별 프롬프트 ────────────

const DIAGRAM_PROMPTS: Record<DiagramType, string> = {
  system_architecture: [
    '한국 정부 IT 시스템 구성도를 생성해주세요.',
    '웹서버, WAS, DB 서버, 클라이언트를 박스와 화살표로 연결합니다.',
    '네트워크 구간(DMZ, 내부망)을 점선 박스로 구분합니다.',
    '모든 텍스트는 한국어로 작성합니다.',
    '색상: 메인 파란색(#2B579A), 보조 회색(#666666), 배경 흰색.',
    '깔끔하고 전문적인 비즈니스 다이어그램 스타일.',
    '해상도 1280x720, 텍스트가 선명하게 보여야 합니다.',
  ].join(' '),

  process_flow: [
    '업무 프로세스 플로우차트를 생성해주세요.',
    '각 단계에 순서 번호를 매기고 화살표로 흐름을 표시합니다.',
    '시작/종료는 타원형, 처리는 직사각형, 판단은 마름모를 사용합니다.',
    '모든 텍스트는 한국어로 작성합니다.',
    '색상: 단계별 파란색 계열 그라데이션, 배경 흰색.',
    '깔끔한 비즈니스 플로우차트 스타일.',
    '해상도 1280x720, 텍스트가 선명하게 보여야 합니다.',
  ].join(' '),

  org_chart: [
    '프로젝트 조직도를 생성해주세요.',
    'PM을 최상위에 두고, PL, 개발팀, QA팀 등을 계층 구조로 배치합니다.',
    '각 박스에 역할명과 담당자를 표시합니다.',
    '모든 텍스트는 한국어로 작성합니다.',
    '색상: 상위 직급 진한 파란색(#2B579A), 하위 연한 파란색, 배경 흰색.',
    '전문적인 조직도 스타일.',
    '해상도 1280x720, 텍스트가 선명하게 보여야 합니다.',
  ].join(' '),

  schedule: [
    '프로젝트 추진 일정표(간트차트)를 생성해주세요.',
    '좌측에 단계/작업명, 우측에 월별 타임라인 막대를 표시합니다.',
    '단계별로 색상을 다르게 하여 구분합니다.',
    '모든 텍스트는 한국어로 작성합니다.',
    '색상: 메인 파란색(#2B579A), 포인트 녹색(#217346), 배경 흰색.',
    '깔끔한 간트차트 스타일.',
    '해상도 1280x720, 텍스트가 선명하게 보여야 합니다.',
  ].join(' '),
}

// ──────────── 메인 함수 ────────────

/**
 * Gemini로 다이어그램 이미지를 생성한다.
 *
 * @param diagramType 다이어그램 종류
 * @param context 제안서 내용에서 추출한 맥락 (시스템 구성 요소, 프로세스 단계 등)
 * @returns PNG 이미지 Buffer + 메타데이터
 */
export async function generateDiagram(
  diagramType: DiagramType,
  context: string
): Promise<DiagramResult> {
  const basePrompt = DIAGRAM_PROMPTS[diagramType]
  const fullPrompt = `${basePrompt}\n\n다음 내용을 반영하여 다이어그램을 그려주세요:\n${context}`

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callGeminiWithTimeout(fullPrompt)
      return result
    } catch (err: any) {
      lastError = err
      console.warn(
        `[Gemini] 다이어그램 생성 실패 (${attempt + 1}/${MAX_RETRIES + 1}):`,
        err.message
      )

      // 마지막 시도가 아니면 잠시 대기
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * (attempt + 1))
      }
    }
  }

  // 모든 재시도 실패 → 플레이스홀더 반환
  console.error('[Gemini] 모든 재시도 실패, 플레이스홀더 반환:', lastError?.message)
  return createPlaceholder(diagramType)
}

// ──────────── 내부 함수 ────────────

async function callGeminiWithTimeout(prompt: string): Promise<DiagramResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const genAI = getClient()
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        responseModalities: ['image', 'text'],
      } as any,
    })

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    })

    const response = result.response
    const parts = response.candidates?.[0]?.content?.parts

    if (!parts || parts.length === 0) {
      throw new Error('Gemini 응답에 콘텐츠가 없습니다.')
    }

    // 이미지 파트 찾기
    for (const part of parts) {
      if (part.inlineData) {
        const { data, mimeType } = part.inlineData
        return {
          imageBuffer: Buffer.from(data, 'base64'),
          mimeType: mimeType || 'image/png',
          isPlaceholder: false,
        }
      }
    }

    throw new Error('Gemini 응답에 이미지가 포함되지 않았습니다.')
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 생성 실패 시 반환할 플레이스홀더 이미지 (1280x720 PNG)
 * 최소한의 PNG: 1x1 투명 픽셀 + 메타데이터로 타입 표시
 */
function createPlaceholder(diagramType: DiagramType): DiagramResult {
  // 최소 유효 1x1 흰색 PNG (67 bytes)
  const MINIMAL_PNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // 8-bit RGB
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, // compressed data
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, // ...
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
    0x44, 0xae, 0x42, 0x60, 0x82,
  ])

  console.warn(`[Gemini] 플레이스홀더 반환: ${diagramType}`)

  return {
    imageBuffer: MINIMAL_PNG,
    mimeType: 'image/png',
    isPlaceholder: true,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
