import { NextRequest, NextResponse } from 'next/server'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'
import { createServerSupabaseClient } from '@/src/lib/supabase-server'
import { generatePPT, type PPTProposalData, type PPTSection } from '@/src/lib/ppt-client'

/**
 * GET /api/proposals/[id]/download
 * 제안서 PPT를 생성하여 다운로드 URL을 반환한다.
 *
 * 1. Supabase에서 제안서 + 섹션 조회
 * 2. DB 섹션 → PPT Worker 형식 변환
 * 3. PPT Worker 호출 → 바이트 수신
 * 4. Supabase Storage에 업로드
 * 5. 다운로드 URL 반환
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. 사용자 인증
    const supabase = createApiSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const proposalId = params.id

    // 2. 제안서 + 섹션 조회
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .eq('user_id', user.id)
      .single()

    if (proposalError || !proposal) {
      return NextResponse.json(
        { success: false, error: '제안서를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if (proposal.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: '완료된 제안서만 다운로드할 수 있습니다.' },
        { status: 400 }
      )
    }

    const { data: sections, error: sectionsError } = await supabase
      .from('proposal_sections')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('order_index', { ascending: true })

    if (sectionsError || !sections?.length) {
      return NextResponse.json(
        { success: false, error: '제안서 섹션이 없습니다.' },
        { status: 400 }
      )
    }

    // 3. DB 섹션 → PPT Worker 형식 변환
    const pptData = buildPPTData(proposal, sections)

    // 4. PPT Worker 호출
    let pptBuffer: Buffer
    try {
      pptBuffer = await generatePPT(pptData)
    } catch (err) {
      console.error('[Download] PPT 생성 실패:', err)
      return NextResponse.json(
        { success: false, error: 'PPT 파일 생성에 실패했습니다.' },
        { status: 502 }
      )
    }

    // 5. Supabase Storage에 업로드
    const adminSupabase = createServerSupabaseClient()
    const storagePath = `proposals/${user.id}/${proposalId}.pptx`

    const { error: uploadError } = await adminSupabase.storage
      .from('proposal-files')
      .upload(storagePath, pptBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        upsert: true,
      })

    if (uploadError) {
      console.error('[Download] Storage 업로드 실패:', uploadError)
      // 업로드 실패해도 직접 다운로드는 제공
    }

    // 다운로드 URL 생성 (1시간 유효)
    let downloadUrl: string | null = null
    if (!uploadError) {
      const { data: signedUrlData } = await adminSupabase.storage
        .from('proposal-files')
        .createSignedUrl(storagePath, 3600)

      downloadUrl = signedUrlData?.signedUrl ?? null

      // proposals 테이블에 result_url 업데이트
      await adminSupabase
        .from('proposals')
        .update({ result_url: storagePath })
        .eq('id', proposalId)
    }

    // Storage 실패 시 직접 바이너리 반환
    if (!downloadUrl) {
      return new NextResponse(new Uint8Array(pptBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(proposal.bid_title)}_제안서.pptx"`,
          'Content-Length': String(pptBuffer.length),
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: { downloadUrl },
    })
  } catch (error) {
    console.error('[Download] 오류:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// ──────────── DB 섹션 → PPT 데이터 변환 ────────────

interface DBProposal {
  bid_title: string
  bid_org: string
  bid_number: string
  created_at: string
}

interface DBSection {
  section_type: string
  title: string
  content: string
  order_index: number
}

function buildPPTData(proposal: DBProposal, sections: DBSection[]): PPTProposalData {
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const pptSections: PPTSection[] = []

  // 표지
  pptSections.push({
    type: 'cover',
    subtitle: '기술 제안서',
  })

  // 목차
  pptSections.push({
    type: 'toc',
    items: sections.map((s, i) => ({
      number: String(i + 1).padStart(2, '0'),
      title: s.title,
      page: i + 3, // 표지(1) + 목차(2) 이후
    })),
  })

  // 본문 섹션들
  for (const section of sections) {
    const { lines: body, imageUrl } = parseSectionContent(section.content)

    // schedule 타입이면 일정 슬라이드로 변환
    if (section.section_type === 'schedule') {
      const scheduleItems = parseScheduleFromContent(body)
      if (scheduleItems.length > 0) {
        pptSections.push({
          type: 'schedule',
          title: section.title,
          total_months: 6,
          items: scheduleItems,
        })
        // 일정 다이어그램이 있으면 별도 슬라이드로 추가
        if (imageUrl) {
          pptSections.push({
            type: 'content',
            title: `${section.title} (다이어그램)`,
            body: [],
            image_path: imageUrl,
            image_position: 'full',
          })
        }
        continue
      }
    }

    // team 타입이면 인력 슬라이드로 변환
    if (section.section_type === 'team') {
      const members = parseTeamFromContent(body)
      if (members.length > 0) {
        pptSections.push({
          type: 'team',
          title: section.title,
          members,
        })
        continue
      }
    }

    // 기본: 본문 슬라이드 (이미지가 있으면 우측에 배치)
    pptSections.push({
      type: 'content',
      title: section.title,
      body,
      ...(imageUrl ? { image_path: imageUrl, image_position: 'right' as const } : {}),
    })
  }

  return {
    title: proposal.bid_title,
    company: proposal.bid_org || '제안사',
    bid_org: proposal.bid_org,
    date: today,
    sections: pptSections,
  }
}

interface ParsedContent {
  lines: string[]
  imageUrl: string | null
}

/**
 * JSON 블록 형태의 섹션 content → 문자열 배열 + 이미지 URL 추출
 */
function parseSectionContent(raw: string): ParsedContent {
  try {
    const blocks = JSON.parse(raw)
    if (!Array.isArray(blocks)) return { lines: [raw], imageUrl: null }

    const lines: string[] = []
    let imageUrl: string | null = null

    for (const block of blocks) {
      switch (block.type) {
        case 'heading':
          lines.push(`■ ${block.text}`)
          break
        case 'paragraph':
          lines.push(block.text)
          break
        case 'bullet_list':
          if (Array.isArray(block.items)) {
            for (const item of block.items) {
              lines.push(`  • ${item}`)
            }
          }
          break
        case 'table_placeholder':
          lines.push(`● ${block.description || '표'}`)
          break
        case 'diagram_placeholder':
          lines.push(`● ${block.description || '그림'}`)
          break
        case 'diagram_image':
          // Gemini가 생성한 다이어그램 이미지 URL
          if (block.url) {
            imageUrl = block.url
          }
          break
        default:
          if (block.text) lines.push(block.text)
      }
    }
    return { lines, imageUrl }
  } catch {
    return { lines: raw.split('\n').filter(Boolean), imageUrl: null }
  }
}

/**
 * 본문 텍스트에서 일정 정보 추출 시도
 */
function parseScheduleFromContent(lines: string[]): Array<{
  phase: string
  task: string
  duration: string
  months: number[]
}> {
  const items: Array<{ phase: string; task: string; duration: string; months: number[] }> = []

  // "1단계", "Phase 1" 등의 패턴 매칭
  let currentPhase = ''
  for (const line of lines) {
    const phaseMatch = line.match(/(\d+단계|Phase\s*\d+)/i)
    if (phaseMatch) {
      currentPhase = phaseMatch[1]
    }

    const monthMatch = line.match(/(\d+)[-~](\d+)\s*월/)
    if (monthMatch && currentPhase) {
      const start = parseInt(monthMatch[1])
      const end = parseInt(monthMatch[2])
      const months = Array.from({ length: end - start + 1 }, (_, i) => start + i)
      items.push({
        phase: currentPhase,
        task: line.replace(/^[■●\s-]+/, '').trim(),
        duration: `${end - start + 1}개월`,
        months,
      })
    }
  }

  return items
}

/**
 * 본문 텍스트에서 인력 정보 추출 시도
 */
function parseTeamFromContent(lines: string[]): Array<{
  role: string
  name: string
  career_years: number
  certification: string
  tasks: string
}> {
  const members: Array<{
    role: string; name: string; career_years: number
    certification: string; tasks: string
  }> = []

  for (const line of lines) {
    // "PM - 홍길동 (15년)" 같은 패턴
    const match = line.match(/(PM|PL|개발자|DBA|디자이너|QA|아키텍트|분석가)\s*[-:]\s*(\S+)\s*\((\d+)년?\)/)
    if (match) {
      members.push({
        role: match[1],
        name: match[2],
        career_years: parseInt(match[3]),
        certification: '',
        tasks: line.replace(match[0], '').replace(/^[\s,-]+/, '').trim(),
      })
    }
  }

  return members
}
