/**
 * Mermaid 다이어그램 생성 모듈
 *
 * GPT-4o로 Mermaid 코드를 생성한 뒤, PPT Worker에서 PNG로 변환한다.
 * 기존 Gemini 이미지 직접 생성 방식을 대체한다.
 */

import { generateJsonCompletion, type TokenUsage } from '@/src/lib/openai'

// ──────────── 타입 ────────────

export type DiagramType =
  | 'system_architecture'
  | 'process_flow'
  | 'org_chart'
  | 'schedule'

export interface MermaidDiagramResult {
  /** Mermaid 코드 (flowchart, gantt 등) */
  mermaidCode: string
  /** 다이어그램 종류 */
  diagramType: DiagramType
  /** 토큰 사용량 */
  usage: TokenUsage
}

// ──────────── 다이어그램 타입별 시스템 프롬프트 ────────────

const SYSTEM_PROMPT_BASE = `당신은 Mermaid 다이어그램 전문가입니다.
주어진 맥락을 바탕으로 Mermaid 코드를 생성합니다.

규칙:
- 반드시 유효한 Mermaid 구문을 사용하세요.
- 모든 텍스트는 한국어로 작성하세요.
- 노드 ID에는 한글을 사용하지 말고, 영문+숫��� 조합(예: A1, B2)을 사용하세요.
- 노드 레이블에 한국어를 사용하세요. 예: A1["웹 서버"]
- 간결하고 깔끔하게 작성하세요. 노드 수는 8~15개 사이로 유지하세요.
- 주석이나 설명 없이 순수 Mermaid 코드만 반환하세요.
- JSON 형식으로 응답하세요: { "mermaidCode": "..." }
- mermaidCode 값 내부의 줄바꿈은 \\n으로 이스케이프하세요.`

const DIAGRAM_SYSTEM_PROMPTS: Record<DiagramType, string> = {
  system_architecture: `${SYSTEM_PROMPT_BASE}

다이어그램 유형: 시스템 구성도 (flowchart TD — 위에서 아래로)
- 클라이언트, 웹서버, WAS, DB 서버 등 계층 구조를 표현
- subgraph로 네트워크 구간(DMZ, 내부망 등) 구분
- 화살표로 데이터 흐름 표시
- 적절한 아이콘/이모지 사용 가능

예시 구조:
flowchart TD
  subgraph 외부망
    A1["사용자 PC"]
    A2["모바일"]
  end
  subgraph DMZ
    B1["웹 서버"]
    B2["방화벽"]
  end
  A1 --> B2 --> B1`,

  process_flow: `${SYSTEM_PROMPT_BASE}

다이어그램 유형: 업무 프로세스 플로우차트 (flowchart LR — 왼쪽에서 오른쪽)
- 시작/종료는 원형 노드((...))
- 주요 단계는 사각형 노드["..."]
- 판단은 마름모 노드{{"..."}}
- 순서대로 화살표 연결
- 각 단계에 간단한 설명 포함

예시 구조:
flowchart LR
  S(("시작")) --> A1["요구사항 분석"]
  A1 --> A2["설계"]
  A2 --> A3{{"검토 통과?"}}
  A3 -- 예 --> A4["개발"]
  A3 -- 아니오 --> A2`,

  org_chart: `${SYSTEM_PROMPT_BASE}

다이어그램 유형: 프로젝트 조직도 (flowchart TD — 위에서 아래로)
- PM을 최상단에 배치
- PL, 개발팀, QA팀 등 하위 조직 계층 구조
- 각 노드에 역할명 표시

예시 구조:
flowchart TD
  PM["PM<br/>프로젝트 관리자"]
  PM --> PL1["PL<br/>개발 리더"]
  PM --> PL2["PL<br/>QA 리더"]
  PL1 --> D1["백엔드 개발"]
  PL1 --> D2["프론트엔드 개발"]`,

  schedule: `${SYSTEM_PROMPT_BASE}

다이어그램 유형: 프로젝트 추진 일정표 (gantt)
- Mermaid gantt 차트를 사용
- dateFormat YYYY-MM-DD 사용
- section으로 단계 구분
- 각 작업에 적절한 기간 설정
- axisFormat %m월 사용

예시 구조:
gantt
  title 프로젝트 추진 일정
  dateFormat YYYY-MM-DD
  axisFormat %m월
  section 1단계: 분석
    요구사항 분석    :a1, 2026-01-01, 30d
    현황 조사        :a2, after a1, 14d
  section 2단계: 설계
    시스템 설계      :b1, after a2, 21d`,
}

// ──────────── 메인 함수 ────────────

/**
 * GPT-4o로 Mermaid 다이어그램 코드를 생성한다.
 *
 * @param diagramType 다이어��램 종류
 * @param context 제안서 내용에서 추출한 맥락
 * @returns Mermaid 코드 + 토큰 사용량
 */
export async function generateMermaidDiagram(
  diagramType: DiagramType,
  context: string
): Promise<MermaidDiagramResult> {
  const systemPrompt = DIAGRAM_SYSTEM_PROMPTS[diagramType]
  const userPrompt = `다음 내용을 반영하여 Mermaid 다이어그램을 생성해주세요:\n\n${context}`

  const { data, usage } = await generateJsonCompletion<{ mermaidCode: string }>(
    systemPrompt,
    userPrompt,
    {
      model: 'gpt-4o',
      temperature: 0.3,
      maxTokens: 2048,
    }
  )

  if (!data.mermaidCode || typeof data.mermaidCode !== 'string') {
    throw new Error('GPT 응답에 mermaidCode가 없습니다.')
  }

  // 기본 유효성 검증
  const code = data.mermaidCode.trim()
  const validPrefixes = ['flowchart', 'graph', 'gantt', 'sequenceDiagram', 'classDiagram', 'stateDiagram']
  const hasValidPrefix = validPrefixes.some((p) => code.startsWith(p))

  if (!hasValidPrefix) {
    console.warn('[Mermaid] 유효하지 않은 Mermaid 코드, 재생성 시도:', code.substring(0, 80))
    // 한 번 더 시도
    const retry = await generateJsonCompletion<{ mermaidCode: string }>(
      systemPrompt,
      userPrompt + '\n\n주의: 반드시 flowchart 또는 gantt 등 유효한 Mermaid 구문으로 시작해야 합니다.',
      { model: 'gpt-4o', temperature: 0.2, maxTokens: 2048 }
    )

    if (!retry.data.mermaidCode) {
      throw new Error('Mermaid 코드 재생성 실패')
    }

    return {
      mermaidCode: retry.data.mermaidCode.trim(),
      diagramType,
      usage: {
        promptTokens: usage.promptTokens + retry.usage.promptTokens,
        completionTokens: usage.completionTokens + retry.usage.completionTokens,
        totalTokens: usage.totalTokens + retry.usage.totalTokens,
      },
    }
  }

  console.log(`[Mermaid] 다이어그램 코드 생성 완료: ${diagramType} (${code.length}자)`)

  return {
    mermaidCode: code,
    diagramType,
    usage,
  }
}
