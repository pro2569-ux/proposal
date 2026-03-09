// Database types
export type ProposalStatus = 'pending' | 'generating' | 'completed' | 'failed'

export interface Profile {
  id: string
  email: string
  company_name: string | null
  created_at: string
}

export interface Proposal {
  id: string
  user_id: string
  bid_number: string
  bid_title: string
  bid_org: string
  budget: number | null
  status: ProposalStatus
  result_url: string | null
  ai_cost: number
  created_at: string
  completed_at: string | null
}

export interface ProposalSection {
  id: string
  proposal_id: string
  section_type: string
  title: string
  content: string | null
  order_index: number
  created_at: string
}

// API response types
export interface ApiResponse<T> {
  data?: T
  error?: string
  success: boolean
}

export interface ProposalWithSections extends Proposal {
  sections: ProposalSection[]
}

// Form types
export interface CreateProposalInput {
  bid_number: string
  bid_title: string
  bid_org: string
  budget?: number
}

// Common section types
export type SectionType =
  | 'overview'
  | 'approach'
  | 'schedule'
  | 'team'
  | 'budget'
  | 'tech_stack'
  | 'risk_management'
  | 'conclusion'

// 나라장터 API types (re-export from nara-api.ts for convenience)
export type {
  BidSearchParams,
  BidInfo,
  BidDetailInfo,
  NaraApiResponse,
} from '@/src/lib/nara-api'
