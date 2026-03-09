import { generateJsonCompletion, type TokenUsage } from '../openai'

const SYSTEM_PROMPT = `너는 한국 공공기관 입찰 전문 분석가다.
나라장터(G2B) 입찰공고 정보를 분석하여 제안서 작성에 필요한 핵심 정보를 추출한다.

반드시 아래 JSON 형식으로 응답하라:
{
  "projectPurpose": "사업의 목적과 배경 (2~3문장)",
  "coreRequirements": [
    {
      "category": "요구사항 분류 (기능/성능/보안/인력/일정 등)",
      "description": "요구사항 상세 설명",
      "priority": "상/중/하"
    }
  ],
  "evaluationPoints": [
    {
      "criteria": "평가 항목명",
      "weight": "배점 비중 (추정)",
      "keyMessage": "해당 항목에서 강조해야 할 핵심 메시지"
    }
  ],
  "projectScale": {
    "estimatedBudget": "추정 예산 (원)",
    "duration": "사업 기간",
    "manpower": "예상 투입 인력 규모"
  },
  "riskFactors": ["잠재 리스크 요인 목록"],
  "winStrategy": "수주를 위한 핵심 전략 요약 (2~3문장)"
}`

const SYSTEM_PROMPT_WITH_RFP = `너는 한국 공공기관 입찰 전문 분석가다.
나라장터(G2B) 입찰공고 정보와 **제안요청서(RFP) 상세 분석 데이터**를 함께 분석하여
제안서 작성에 필요한 핵심 정보를 추출한다.

RFP 데이터가 제공되므로 다음을 반드시 반영하라:
- RFP의 기능/비기능 요구사항을 모두 coreRequirements에 포함
- RFP의 평가 기준을 evaluationPoints에 정확히 반영 (배점 포함)
- RFP의 일정/인력 요구사항을 projectScale에 반영
- RFP의 특수 조건과 산출물을 riskFactors와 winStrategy에 반영

반드시 아래 JSON 형식으로 응답하라:
{
  "projectPurpose": "사업의 목적과 배경 (2~3문장, RFP 배경 포함)",
  "coreRequirements": [
    {
      "category": "요구사항 분류 (기능/성능/보안/인력/일정 등)",
      "description": "요구사항 상세 설명",
      "priority": "상/중/하"
    }
  ],
  "evaluationPoints": [
    {
      "criteria": "평가 항목명",
      "weight": "배점 비중 (RFP 기준)",
      "keyMessage": "해당 항목에서 강조해야 할 핵심 메시지"
    }
  ],
  "projectScale": {
    "estimatedBudget": "추정 예산 (원)",
    "duration": "사업 기간",
    "manpower": "예상 투입 인력 규모"
  },
  "riskFactors": ["잠재 리스크 요인 목록"],
  "winStrategy": "수주를 위한 핵심 전략 요약 (2~3문장)"
}`

export interface BidAnalysis {
  projectPurpose: string
  coreRequirements: {
    category: string
    description: string
    priority: '상' | '중' | '하'
  }[]
  evaluationPoints: {
    criteria: string
    weight: string
    keyMessage: string
  }[]
  projectScale: {
    estimatedBudget: string
    duration: string
    manpower: string
  }
  riskFactors: string[]
  winStrategy: string
}

export async function analyzeBid(
  bidInfo: Record<string, any>,
  rfpData?: Record<string, any> | null
): Promise<{ analysis: BidAnalysis; usage: TokenUsage }> {
  const hasRfp = rfpData && Object.keys(rfpData).length > 0

  const systemPrompt = hasRfp ? SYSTEM_PROMPT_WITH_RFP : SYSTEM_PROMPT

  let userPrompt = `다음 입찰공고 정보를 분석하여 제안서 작성에 필요한 핵심 정보를 추출해줘:\n\n${JSON.stringify(bidInfo, null, 2)}`

  if (hasRfp) {
    userPrompt += `\n\n=== 제안요청서(RFP) 상세 분석 데이터 ===\n\n${JSON.stringify(rfpData, null, 2)}`
  }

  const { data, usage } = await generateJsonCompletion<BidAnalysis>(
    systemPrompt,
    userPrompt,
    { temperature: 0.3, maxTokens: hasRfp ? 8192 : 4096 }
  )

  return { analysis: data, usage }
}
