import { generateJsonCompletion, type TokenUsage } from '../openai'
import type { BidAnalysis } from './analyze-bid'

const SYSTEM_PROMPT = `너는 IT 제안서 목차 설계 전문가다.
공공기관 IT 사업 제안서의 목차를 설계한다.
평가 기준에 맞춰 최적의 목차 구조를 만들어야 한다.

반드시 아래 JSON 형식으로 응답하라:
{
  "title": "제안서 제목",
  "sections": [
    {
      "id": "1",
      "title": "섹션 제목",
      "pages": 3,
      "keyMessage": "이 섹션에서 전달할 핵심 메시지",
      "subsections": [
        {
          "id": "1-1",
          "title": "소섹션 제목",
          "pages": 1,
          "keyMessage": "소섹션 핵심 메시지",
          "contentGuide": "작성 시 포함해야 할 내용 가이드"
        }
      ]
    }
  ],
  "totalPages": 30,
  "designNotes": "전체 제안서 디자인/톤앤매너 가이드"
}`

export interface OutlineSection {
  id: string
  title: string
  pages: number
  keyMessage: string
  contentGuide?: string
  subsections?: OutlineSection[]
}

export interface ProposalOutline {
  title: string
  sections: OutlineSection[]
  totalPages: number
  designNotes: string
}

export async function generateOutline(
  analysis: BidAnalysis
): Promise<{ outline: ProposalOutline; usage: TokenUsage }> {
  const userPrompt = `다음 입찰공고 분석 결과를 기반으로 제안서 목차를 설계해줘:\n\n${JSON.stringify(analysis, null, 2)}`

  const { data, usage } = await generateJsonCompletion<ProposalOutline>(
    SYSTEM_PROMPT,
    userPrompt,
    { temperature: 0.5, maxTokens: 4096 }
  )

  return { outline: data, usage }
}
