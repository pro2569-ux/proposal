import { generateJsonCompletion, type TokenUsage } from '../openai'
import type { ProposalOutline, OutlineSection } from './generate-outline'
import type { BidAnalysis } from './analyze-bid'

const SYSTEM_PROMPT = `너는 IT 제안서 작성 전문가다.
공공기관 IT 사업 제안서의 특정 섹션 본문을 작성한다.
평가위원이 높은 점수를 줄 수 있도록 구체적이고 설득력 있게 작성해야 한다.

작성 원칙:
- 구체적 수치와 사례를 포함
- 핵심 키워드는 **강조** 처리
- 발주처의 요구사항에 직접 대응하는 내용 포함 (요구사항 목록이 제공되면 ID 단위로 추적)
- 표(table)에는 반드시 실제 데이터를 채워서 작성할 것. 비워두거나 placeholder로 남기지 말 것.
- 비교표, 요약표, 일정표, 인력표, 비용표 등 표를 적극 활용할 것

요구사항 추적:
- 사용자가 요구사항 목록(coreRequirements)을 제공하면 본문은 그중 자연스럽게 다룰 수 있는 항목을 직접 다룬다.
- 응답의 "coveredRequirementIds" 필드에 이 섹션이 직접 다루는 요구사항 ID(R-001 형식) 배열을 반환한다.
- 다루지 않는 요구사항은 포함하지 말 것 (다른 섹션이 다룰 수 있음).
- 강제 커버 ID(mustCover)가 지정되면 본문에서 반드시 해당 요구사항을 명시적으로 언급/대응할 것.
- **중요**: "R-001", "R-002" 같은 요구사항 ID는 내부 추적용이다. content의 heading/paragraph/bullet_list/table 텍스트에 절대 노출하지 말 것. 본문에서는 요구사항을 자연어로 풀어 쓴다 (예: "R-003 대응" ❌ → "통합 모니터링 체계 구축" ✅). ID는 오직 "coveredRequirementIds" 필드에만 적는다.

반드시 아래 JSON 형식으로 응답하라:
{
  "sectionId": "섹션 ID",
  "sectionTitle": "섹션 제목",
  "coveredRequirementIds": ["R-001", "R-005"],
  "content": [
    {
      "type": "heading",
      "level": 2,
      "text": "소제목"
    },
    {
      "type": "paragraph",
      "text": "본문 텍스트..."
    },
    {
      "type": "bullet_list",
      "items": ["항목1", "항목2"]
    },
    {
      "type": "table",
      "title": "표 제목",
      "columns": ["컬럼1", "컬럼2", "컬럼3"],
      "rows": [
        ["데이터1", "데이터2", "데이터3"],
        ["데이터4", "데이터5", "데이터6"]
      ]
    },
    {
      "type": "diagram_placeholder",
      "description": "다이어그램 설명"
    }
  ],
  "pageEstimate": 3
}`

export type SectionContentBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet_list'; items: string[] }
  | { type: 'table'; title?: string; columns: string[]; rows: string[][] }
  | { type: 'table_placeholder'; description: string; columns: string[]; suggestedRows: number }
  | { type: 'diagram_placeholder'; description: string }
  | { type: 'diagram_image'; url: string; description: string }

export interface GeneratedSection {
  sectionId: string
  sectionTitle: string
  content: SectionContentBlock[]
  pageEstimate: number
  /** 이 섹션이 다루는 요구사항 ID 목록 (LLM 응답). 추적 매트릭스 생성에 사용. */
  coveredRequirementIds?: string[]
}

export interface GenerateSectionOptions {
  /** 분석에서 추출된 요구사항 목록 (요구사항 추적 매트릭스용) */
  requirements?: BidAnalysis['coreRequirements']
  /** 이 섹션이 반드시 커버해야 하는 요구사항 ID 목록 (보강 재생성에서 사용) */
  mustCoverIds?: string[]
}

export async function generateSection(
  outline: ProposalOutline,
  section: OutlineSection,
  options: GenerateSectionOptions = {}
): Promise<{ section: GeneratedSection; usage: TokenUsage }> {
  const { requirements, mustCoverIds } = options
  const parts = [
    `제안서 전체 목차:\n${JSON.stringify(outline, null, 2)}`,
    `아래 섹션의 본문을 작성해줘:\n${JSON.stringify(section, null, 2)}`,
  ]

  if (requirements && requirements.length > 0) {
    parts.push(
      `=== 발주처 요구사항 목록 (coreRequirements) ===\n${JSON.stringify(
        requirements,
        null,
        2
      )}\n\n위 목록 중 이 섹션에서 자연스럽게 다룰 수 있는 항목만 골라 본문에 직접 대응하고, 응답의 "coveredRequirementIds"에 해당 ID를 나열할 것.`
    )
  }

  if (mustCoverIds && mustCoverIds.length > 0) {
    parts.push(
      `=== 반드시 커버해야 하는 요구사항 ID (mustCover) ===\n${mustCoverIds.join(
        ', '
      )}\n\n위 ID에 해당하는 요구사항은 본문에서 명시적으로 언급/대응해야 하며, "coveredRequirementIds"에 반드시 포함시킬 것.`
    )
  }

  const userPrompt = parts.join('\n\n')

  const { data, usage } = await generateJsonCompletion<GeneratedSection>(
    SYSTEM_PROMPT,
    userPrompt,
    { temperature: 0.7, maxTokens: 4096 }
  )

  return { section: data, usage }
}
