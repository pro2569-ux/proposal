/**
 * PPT Worker 클라이언트
 * Railway에 배포된 FastAPI PPT 생성 서버와 통신한다.
 */

const PPT_WORKER_URL = process.env.PPT_WORKER_URL
const PPT_WORKER_SECRET = process.env.PPT_WORKER_SECRET

// ──────────── 타입 ────────────

interface CoverSection {
  type: 'cover'
  subtitle?: string
}

interface TocItem {
  number: string
  title: string
  page?: number
}

interface TocSection {
  type: 'toc'
  items: TocItem[]
}

interface ContentSection {
  type: 'content'
  title: string
  body: string[]
  image_path?: string | null
  image_position?: 'right' | 'bottom' | 'full'
}

interface ScheduleItem {
  phase: string
  task: string
  duration?: string
  months: number[]
}

interface ScheduleSection {
  type: 'schedule'
  title?: string
  total_months?: number
  items: ScheduleItem[]
}

interface TeamMember {
  role: string
  name: string
  career_years: number
  certification?: string
  tasks?: string
}

interface TeamSection {
  type: 'team'
  title?: string
  members: TeamMember[]
}

interface DataTableSection {
  type: 'data_table'
  title: string
  table_title?: string
  columns: string[]
  rows: string[][]
}

type PPTSection =
  | CoverSection
  | TocSection
  | ContentSection
  | ScheduleSection
  | TeamSection
  | DataTableSection

export interface PPTProposalData {
  title: string
  company: string
  bid_org?: string
  date?: string
  template?: string | null
  sections: PPTSection[]
}

export type {
  CoverSection,
  TocSection,
  TocItem,
  ContentSection,
  ScheduleSection,
  ScheduleItem,
  TeamSection,
  TeamMember,
  DataTableSection,
  PPTSection,
}

// ──────────── API 호출 ────────────

/**
 * PPT Worker에 제안서 데이터를 전송하고 PPT 바이트를 반환한다.
 * @throws 서버 미설정, 인증 실패, 생성 실패 시 Error
 */
export async function generatePPT(proposalData: PPTProposalData): Promise<Buffer> {
  if (!PPT_WORKER_URL || !PPT_WORKER_SECRET) {
    throw new Error('PPT Worker 환경변수가 설정되지 않았습니다 (PPT_WORKER_URL, PPT_WORKER_SECRET)')
  }

  const res = await fetch(`${PPT_WORKER_URL}/generate-ppt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PPT_WORKER_SECRET}`,
    },
    body: JSON.stringify(proposalData),
  })

  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail || body)
    } catch {
      detail = await res.text()
    }
    throw new Error(`PPT 생성 실패 (${res.status}): ${detail}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
