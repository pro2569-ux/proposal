import type { TokenUsage } from '@/src/lib/openai'
import type { BidAnalysis } from '@/src/lib/prompts/analyze-bid'
import type { ProposalOutline, OutlineSection } from '@/src/lib/prompts/generate-outline'
import type { GeneratedSection } from '@/src/lib/prompts/generate-section'

// Re-export for convenience
export type { BidAnalysis, ProposalOutline, OutlineSection, GeneratedSection }

/**
 * 파이프라인 입력 데이터
 */
export interface BidData {
  bidNtceNo: string
  bidNtceOrd: string
  bidNtceNm: string
  ntceInsttNm: string
  dminsttNm: string
  bidNtceDt: string
  bidClseDt: string
  presmptPrce: string
  /** 공고 상세 정보 (선택) */
  detail?: Record<string, any>
}

/**
 * 파이프라인 단계
 */
export type PipelineStep =
  | 'analyzing'
  | 'outlining'
  | 'generating_sections'
  | 'assembling'
  | 'completed'
  | 'failed'

/**
 * 파이프라인 진행 상태
 */
export interface PipelineProgress {
  step: PipelineStep
  message: string
  /** 0~100 */
  percentage: number
  /** 현재 단계 세부 진행 (예: "3/8 섹션 생성 중") */
  detail?: string
}

/**
 * 누적 토큰 사용량
 */
export interface AccumulatedUsage {
  analyze: TokenUsage
  outline: TokenUsage
  sections: TokenUsage
  total: TokenUsage
}

/**
 * 다이어그램 이미지 결과
 */
export interface DiagramImage {
  diagramType: 'system_architecture' | 'process_flow' | 'org_chart' | 'schedule'
  url: string
  storagePath: string
  isPlaceholder: boolean
}

/**
 * 파이프라인 최종 결과
 */
export interface ProposalResult {
  proposalId: string
  title: string
  analysis: BidAnalysis
  outline: ProposalOutline
  sections: GeneratedSection[]
  images: DiagramImage[]
  usage: AccumulatedUsage
}

/**
 * DB 저장용 섹션 데이터
 */
export interface ProposalSectionRow {
  proposal_id: string
  section_type: string
  title: string
  content: string
  order_index: number
}
