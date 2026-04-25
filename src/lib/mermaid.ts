/**
 * Mermaid 다이어그램 — GPT 가 코드 생성 → PPT 워커가 PNG 렌더링.
 *
 * Gemini 직접 이미지 생성 대비 장점:
 * - 한글 텍스트가 폰트로 렌더링되어 100% 정확
 * - 코드 기반이라 추후 사용자 편집 가능
 * - 같은 입력에 대해 결과 재현성 보장
 * - 이미지 API 비용 제거 (텍스트 토큰만 소모)
 */

import { generateCompletion } from './openai'

const PPT_WORKER_URL = process.env.PPT_WORKER_URL
const PPT_WORKER_SECRET = process.env.PPT_WORKER_SECRET

// ──────────── 타입 ────────────

export type DiagramType =
  | 'system_architecture'
  | 'process_flow'
  | 'org_chart'
  | 'schedule'

export interface DiagramResult {
  imageBuffer: Buffer
  mimeType: string
  /** 생성/렌더 실패로 1x1 placeholder 가 반환된 경우 true */
  isPlaceholder: boolean
  /** 디버깅 및 추후 사용자 편집을 위한 Mermaid 원본 코드 */
  mermaidCode?: string
}

// ──────────── 다이어그램 타입별 시스템 프롬프트 ────────────

const SYSTEM_PROMPTS: Record<DiagramType, string> = {
  system_architecture: `너는 IT 아키텍트다. 입력된 시스템 정보를 Mermaid \`flowchart LR\` 코드로 변환한다.

규칙:
- 반드시 첫 줄은 \`flowchart LR\`
- 클라이언트, 웹서버, WAS, DB, 외부연계 등 주요 컴포넌트를 노드로 표현
- DMZ / 내부망 / 외부망 등 네트워크 구간은 \`subgraph 이름 ... end\` 로 묶기
- 모든 노드 라벨(텍스트)은 한국어
- 노드 라벨에 줄바꿈 필요시 \`<br/>\` 사용 (예: \`WAS<br/>Tomcat\`)
- 응답에는 Mermaid 코드만 포함 (설명 문장이나 \`\`\` 마크다운 펜스 절대 금지)`,

  process_flow: `너는 업무 프로세스 분석가다. 입력된 프로세스 정보를 Mermaid \`flowchart TD\` 코드로 변환한다.

규칙:
- 반드시 첫 줄은 \`flowchart TD\`
- 시작/종료는 \`([텍스트])\`(스타디움), 처리는 \`[텍스트]\`(직사각형), 판단은 \`{텍스트}\`(마름모)
- 단계마다 한국어 번호 또는 단계명을 라벨에 포함
- 분기점은 \`-->|예| Step3\`, \`-->|아니오| Step1\` 형태로 라벨링
- 응답에는 Mermaid 코드만 포함 (설명 문장이나 \`\`\` 마크다운 펜스 절대 금지)`,

  org_chart: `너는 PM이다. 입력된 조직 정보를 Mermaid \`flowchart TD\` 코드로 변환한다.

규칙:
- 반드시 첫 줄은 \`flowchart TD\`
- PM을 최상위, 그 아래 PL(개발/QA/PMO 등), 그 아래 팀원
- 노드 라벨은 \`역할<br/>이름\` 형식 (이름이 없으면 역할만)
- 모든 텍스트는 한국어
- 응답에는 Mermaid 코드만 포함 (설명 문장이나 \`\`\` 마크다운 펜스 절대 금지)`,

  schedule: `너는 PM이다. 입력된 일정 정보를 Mermaid \`gantt\` 코드로 변환한다.

규칙:
- 반드시 첫 줄은 \`gantt\`
- 둘째 줄부터 \`title 추진 일정\`, \`dateFormat YYYY-MM-DD\`, \`axisFormat %m월\` 포함
- \`section 단계명\` 으로 단계 구분
- 작업 라인 형식: \`작업명 :id1, 2026-05-01, 30d\` 또는 \`작업명 :id2, after id1, 30d\`
- 모든 텍스트는 한국어
- 응답에는 Mermaid 코드만 포함 (설명 문장이나 \`\`\` 마크다운 펜스 절대 금지)`,
}

// ──────────── Public API ────────────

/**
 * 다이어그램 타입과 맥락 텍스트를 받아 PNG 이미지를 반환한다.
 *
 * 흐름:
 *   1) GPT 에게 Mermaid 코드 생성 요청
 *   2) 워커(/render-mermaid) 로 PNG 변환
 *   3) 렌더 실패 시 GPT 에게 오류 메시지 전달 → 코드 자가수정 1회 재시도
 *   4) 모두 실패하면 1x1 placeholder 반환 (호출자가 무시 가능하도록)
 */
export async function generateDiagram(
  diagramType: DiagramType,
  context: string
): Promise<DiagramResult> {
  let mermaidCode = ''

  try {
    mermaidCode = await generateMermaidCode(diagramType, context)
  } catch (err: any) {
    console.error(`[Mermaid] 코드 생성 실패 (${diagramType}):`, err.message)
    return createPlaceholder()
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const imageBuffer = await renderMermaidToPng(mermaidCode)
      console.log(
        `[Mermaid] 다이어그램 생성 완료: ${diagramType} (${imageBuffer.length} bytes)`
      )
      return {
        imageBuffer,
        mimeType: 'image/png',
        isPlaceholder: false,
        mermaidCode,
      }
    } catch (err: any) {
      lastError = err
      console.warn(
        `[Mermaid] 렌더링 실패 (${diagramType}, ${attempt + 1}/2): ${err.message}`
      )

      if (attempt === 0) {
        try {
          mermaidCode = await fixMermaidCode(mermaidCode, err.message)
        } catch (fixErr: any) {
          console.warn(`[Mermaid] 자가수정 실패: ${fixErr.message}`)
          break
        }
      }
    }
  }

  console.error(
    `[Mermaid] 최종 실패 (${diagramType}), placeholder 반환:`,
    lastError?.message
  )
  return createPlaceholder()
}

// ──────────── 내부: GPT 호출 ────────────

async function generateMermaidCode(
  diagramType: DiagramType,
  context: string
): Promise<string> {
  const { content } = await generateCompletion(
    SYSTEM_PROMPTS[diagramType],
    `다음 내용을 Mermaid 코드로 변환해줘:\n\n${context}`,
    { temperature: 0.2, maxTokens: 1024 }
  )

  const code = cleanMermaidCode(content)
  if (!code) throw new Error('GPT 응답이 비어있습니다.')
  return code
}

async function fixMermaidCode(
  brokenCode: string,
  errorMessage: string
): Promise<string> {
  const { content } = await generateCompletion(
    '너는 Mermaid 문법 전문가다. 주어진 Mermaid 코드의 문법 오류를 수정한다. ' +
      '응답에는 수정된 Mermaid 코드만 포함하고, 설명 문장이나 ``` 마크다운 펜스는 절대 포함하지 않는다.',
    `다음 Mermaid 코드를 렌더링했더니 오류가 발생했어. 문법 오류를 수정해줘.\n\n` +
      `=== 코드 ===\n${brokenCode}\n\n=== 오류 ===\n${errorMessage}`,
    { temperature: 0, maxTokens: 1024 }
  )

  const code = cleanMermaidCode(content)
  if (!code) throw new Error('자가수정 응답이 비어있습니다.')
  return code
}

/** GPT 가 가끔 ```mermaid ... ``` 펜스를 붙이는 경우 제거한다. */
function cleanMermaidCode(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^```(?:mermaid)?\s*\n?/, '')
  s = s.replace(/\n?```\s*$/, '')
  return s.trim()
}

// ──────────── 내부: 워커 호출 ────────────

async function renderMermaidToPng(code: string): Promise<Buffer> {
  if (!PPT_WORKER_URL || !PPT_WORKER_SECRET) {
    throw new Error(
      'PPT Worker 환경변수가 설정되지 않았습니다 (PPT_WORKER_URL, PPT_WORKER_SECRET)'
    )
  }

  const res = await fetch(`${PPT_WORKER_URL}/render-mermaid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PPT_WORKER_SECRET}`,
    },
    body: JSON.stringify({ code }),
  })

  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail =
        typeof body.detail === 'string' ? body.detail : JSON.stringify(body)
    } catch {
      detail = await res.text()
    }
    throw new Error(`Mermaid 렌더 실패 (${res.status}): ${detail}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ──────────── 내부: 플레이스홀더 ────────────

/** 생성/렌더 모두 실패한 경우 반환할 1x1 흰색 PNG. */
function createPlaceholder(): DiagramResult {
  const MINIMAL_PNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
  ])

  return {
    imageBuffer: MINIMAL_PNG,
    mimeType: 'image/png',
    isPlaceholder: true,
  }
}
