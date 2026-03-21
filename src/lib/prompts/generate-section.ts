import { generateJsonCompletion, type TokenUsage } from '../openai'
import type { ProposalOutline, OutlineSection } from './generate-outline'

const SYSTEM_PROMPT = `너는 IT 제안서 작성 전문가다.
공공기관 IT 사업 제안서의 특정 섹션 본문을 작성한다.
평가위원이 높은 점수를 줄 수 있도록 구체적이고 설득력 있게 작성해야 한다.

작성 원칙:
- 구체적 수치와 사례를 포함
- 핵심 키워드는 **강조** 처리
- 발주처의 요구사항에 직접 대응하는 내용 포함
- 표(table)에는 반드시 실제 데이터를 채워서 작성할 것. 비워두거나 placeholder로 남기지 말 것.
- 비교표, 요약표, 일정표, 인력표, 비용표 등 표를 적극 활용할 것

반드시 아래 JSON 형식으로 응답하라:
{
  "sectionId": "섹션 ID",
  "sectionTitle": "섹션 제목",
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
}

export async function generateSection(
  outline: ProposalOutline,
  section: OutlineSection
): Promise<{ section: GeneratedSection; usage: TokenUsage }> {
  const userPrompt = `제안서 전체 목차:\n${JSON.stringify(outline, null, 2)}\n\n아래 섹션의 본문을 작성해줘:\n${JSON.stringify(section, null, 2)}`

  const { data, usage } = await generateJsonCompletion<GeneratedSection>(
    SYSTEM_PROMPT,
    userPrompt,
    { temperature: 0.7, maxTokens: 4096 }
  )

  return { section: data, usage }
}
