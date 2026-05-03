import { generateJsonCompletion, type TokenUsage } from '../openai'
import { generateClaudeJsonCompletion } from '../anthropic'
import type { BidAnalysis } from './analyze-bid'
import type { GeneratedSection } from './generate-section'

/**
 * 검수 패스를 Claude로 분리하면 생성(OpenAI)과 다른 모델이 cross-check를 해
 * 같은 모델 특유의 반복 문구·맹점을 잡아낼 수 있다.
 * ANTHROPIC_API_KEY가 설정되어 있으면 Claude를, 없으면 OpenAI로 폴백한다.
 */
const USE_CLAUDE_FOR_REVIEW = !!process.env.ANTHROPIC_API_KEY

async function reviewJsonCompletion<T>(
  systemPrompt: string,
  userPrompt: string,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<{ data: T; usage: TokenUsage }> {
  if (USE_CLAUDE_FOR_REVIEW) {
    return generateClaudeJsonCompletion<T>(systemPrompt, userPrompt, options)
  }
  return generateJsonCompletion<T>(systemPrompt, userPrompt, options)
}

// ─── 타입 정의 ───

export interface SectionIssue {
  type: 'completeness' | 'specificity' | 'consistency' | 'tone' | 'differentiation'
  description: string
  suggestion: string
}

export interface SectionReviewItem {
  sectionId: string
  score: number
  issues: SectionIssue[]
  needsRevision: boolean
}

export interface ReviewResult {
  overallScore: number
  overallFeedback: string
  crossSectionIssues: string[]
  sectionReviews: SectionReviewItem[]
  missingRequirements: string[]
}

// ─── Pass 1: 전체 평가 프롬프트 ───

const REVIEW_SYSTEM_PROMPT = `너는 한국 공공기관 IT 사업 제안서 품질 검수 전문가다.
작성된 제안서 섹션들을 입찰공고 분석 결과 대비 검토하여 품질을 평가한다.

검토 기준:
1. 요구사항 반영 완전성: 입찰공고의 핵심 요구사항이 각 섹션에 빠짐없이 반영되었는가
2. 평가항목 대응: 평가기준의 각 항목에 대한 내용이 충분하고 설득력 있는가
3. 구체성: 추상적 표현 대신 구체적 수치, 방법론, 사례가 포함되었는가
4. 일관성: 섹션 간 용어, 기술스택, 일정, 인력 정보가 모순 없이 일치하는가
5. 문체 통일: 공공기관 제안서에 적합한 격식체(~합니다/~입니다)가 일관되게 사용되었는가
6. 차별화: 경쟁사 대비 차별점이 명확하게 드러나는가

score가 75 미만인 섹션만 needsRevision: true로 설정하라.
issues가 없는 양호한 섹션은 빈 배열([])로 두어라.

반드시 아래 JSON 형식으로 응답하라:
{
  "overallScore": 85,
  "overallFeedback": "전체 제안서에 대한 종합 피드백 (2~3문장)",
  "crossSectionIssues": [
    "섹션 간 모순/불일치 사항 (없으면 빈 배열)"
  ],
  "sectionReviews": [
    {
      "sectionId": "섹션 ID",
      "score": 80,
      "issues": [
        {
          "type": "completeness|specificity|consistency|tone|differentiation",
          "description": "구체적 문제 설명",
          "suggestion": "개선 방향"
        }
      ],
      "needsRevision": false
    }
  ],
  "missingRequirements": [
    "입찰공고에는 있지만 제안서에 누락된 요구사항 (없으면 빈 배열)"
  ]
}`

// ─── Pass 2: 개선 프롬프트 ───

const IMPROVE_SYSTEM_PROMPT = `너는 IT 제안서 작성 전문가다.
검수 피드백을 반영하여 제안서 섹션을 개선한다.
기존 내용의 구조와 형식(JSON 블록 배열)을 유지하면서 내용 품질만 개선하라.

개선 원칙:
- 지적된 문제점을 직접 해결
- 추상적 내용을 구체적 수치/사례로 보강
- 누락된 요구사항 내용 추가
- 문체를 공공기관 격식체(~합니다/~입니다)로 통일
- 표(table)의 데이터를 구체화
- 기존 content 배열의 JSON 블록 형식을 그대로 유지할 것

반드시 아래 JSON 형식으로 응답하라:
{
  "sectionId": "섹션 ID",
  "sectionTitle": "섹션 제목",
  "content": [
    { "type": "heading", "level": 2, "text": "소제목" },
    { "type": "paragraph", "text": "본문..." },
    { "type": "bullet_list", "items": ["항목1", "항목2"] },
    { "type": "table", "title": "표 제목", "columns": ["컬럼1"], "rows": [["데이터"]] },
    { "type": "diagram_placeholder", "description": "다이어그램 설명" }
  ],
  "pageEstimate": 3
}`

// ─── 유틸: 섹션 텍스트 압축 ───

function compressSection(section: GeneratedSection): string {
  const lines: string[] = [`[${section.sectionId}] ${section.sectionTitle}`]

  for (const block of section.content) {
    switch (block.type) {
      case 'heading':
        lines.push(`  ## ${block.text}`)
        break
      case 'paragraph':
        lines.push(`  ${block.text.slice(0, 200)}`)
        break
      case 'bullet_list':
        for (const item of block.items.slice(0, 5)) {
          lines.push(`  • ${item.slice(0, 100)}`)
        }
        break
      case 'table':
        lines.push(`  [표: ${block.title || ''}] ${block.columns.join(', ')} (${block.rows.length}행)`)
        break
      default:
        break
    }
  }

  return lines.join('\n')
}

// ─── Pass 1: 전체 평가 ───

export async function reviewSections(
  analysis: BidAnalysis,
  sections: GeneratedSection[]
): Promise<{ review: ReviewResult; usage: TokenUsage }> {
  const sectionsText = sections.map(compressSection).join('\n\n')

  const userPrompt = `## 입찰공고 분석 결과
- 사업목적: ${analysis.projectPurpose || ''}
- 핵심 요구사항: ${(analysis.coreRequirements || []).map((r) => r.description).join(', ')}
- 평가기준: ${(analysis.evaluationPoints || []).map((e) => `${e.criteria}(${e.weight})`).join(', ')}
- 리스크: ${(analysis.riskFactors || []).join(', ')}

## 작성된 제안서 섹션 (${sections.length}개)
${sectionsText}

위 제안서를 입찰공고 요구사항 대비 검토해주세요.`

  const { data, usage } = await reviewJsonCompletion<ReviewResult>(
    REVIEW_SYSTEM_PROMPT,
    userPrompt,
    { temperature: 0.3, maxTokens: 4096 }
  )

  return { review: data, usage }
}

// ─── Pass 2: 개별 섹션 개선 ───

export async function improveSection(
  section: GeneratedSection,
  feedback: SectionReviewItem,
  crossSectionIssues: string[]
): Promise<{ section: GeneratedSection; usage: TokenUsage }> {
  const issuesText = feedback.issues
    .map((i) => `- [${i.type}] ${i.description} → ${i.suggestion}`)
    .join('\n')

  const crossText = crossSectionIssues.length > 0
    ? `\n\n## 섹션 간 불일치 사항\n${crossSectionIssues.map((i) => `- ${i}`).join('\n')}`
    : ''

  const userPrompt = `## 개선 대상 섹션
${JSON.stringify(section, null, 2)}

## 검수 피드백 (점수: ${feedback.score}/100)
${issuesText}${crossText}

위 피드백을 반영하여 섹션을 개선해주세요.`

  const { data, usage } = await reviewJsonCompletion<GeneratedSection>(
    IMPROVE_SYSTEM_PROMPT,
    userPrompt,
    { temperature: 0.5, maxTokens: 4096 }
  )

  return { section: data, usage }
}
