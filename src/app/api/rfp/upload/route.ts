import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'
import { createServerSupabaseClient } from '@/src/lib/supabase-server'
import { generateJsonCompletion } from '@/src/lib/openai'

const ALLOWED_EXTENSIONS = ['.pdf', '.hwp', '.hwpx', '.docx', '.doc']

const RFP_ANALYSIS_PROMPT = `너는 한국 공공기관 제안요청서(RFP) 분석 전문가다.
제안요청서에서 추출된 텍스트를 분석하여 제안서 작성에 필요한 핵심 정보를 구조화하라.

반드시 아래 JSON 형식으로 응답하라:
{
  "projectName": "사업명",
  "projectBackground": "사업 배경 및 목적 (3~5문장)",
  "scope": "사업 범위 요약",
  "functionalRequirements": [
    { "id": "FR-01", "category": "분류", "description": "상세 설명", "priority": "필수/선택" }
  ],
  "nonFunctionalRequirements": [
    { "id": "NFR-01", "category": "성능/보안/가용성 등", "description": "상세 설명" }
  ],
  "evaluationCriteria": [
    { "category": "평가 영역", "item": "평가 항목", "score": "배점", "keyPoint": "핵심 포인트" }
  ],
  "deliverables": ["산출물 목록"],
  "schedule": {
    "totalDuration": "전체 사업 기간",
    "phases": [
      { "name": "단계명", "duration": "기간", "tasks": ["주요 과업"] }
    ]
  },
  "manpowerRequirements": [
    { "role": "역할", "grade": "등급", "count": "인원", "qualifications": "자격 요건" }
  ],
  "technicalRequirements": ["기술 요구사항 목록"],
  "specialConditions": ["특수 조건 또는 유의사항"]
}`

export interface RfpAnalysis {
  projectName: string
  projectBackground: string
  scope: string
  functionalRequirements: {
    id: string
    category: string
    description: string
    priority: string
  }[]
  nonFunctionalRequirements: {
    id: string
    category: string
    description: string
  }[]
  evaluationCriteria: {
    category: string
    item: string
    score: string
    keyPoint: string
  }[]
  deliverables: string[]
  schedule: {
    totalDuration: string
    phases: {
      name: string
      duration: string
      tasks: string[]
    }[]
  }
  manpowerRequirements: {
    role: string
    grade: string
    count: string
    qualifications: string
  }[]
  technicalRequirements: string[]
  specialConditions: string[]
}

/**
 * POST /api/rfp/upload
 *
 * multipart/form-data로 파일 수신 (PDF, HWP, DOCX)
 * → 텍스트 추출 → GPT-4o 분석 → proposals.rfp_data에 저장
 */
export async function POST(request: NextRequest) {
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

    // 2. FormData 파싱
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const proposalId = formData.get('proposalId') as string | null

    if (!file) {
      return NextResponse.json(
        { success: false, error: '파일이 필요합니다.' },
        { status: 400 }
      )
    }

    if (!proposalId) {
      return NextResponse.json(
        { success: false, error: 'proposalId가 필요합니다.' },
        { status: 400 }
      )
    }

    // 파일 확장자 검증
    const fileName = file.name.toLowerCase()
    const ext = ALLOWED_EXTENSIONS.find((e) => fileName.endsWith(e))
    if (!ext) {
      return NextResponse.json(
        { success: false, error: 'PDF, HWP, DOCX 파일만 업로드 가능합니다.' },
        { status: 400 }
      )
    }

    const MAX_SIZE = 20 * 1024 * 1024 // 20MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: '파일 크기는 20MB 이하만 가능합니다.' },
        { status: 400 }
      )
    }

    // 3. 제안서 소유권 확인
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('id, user_id')
      .eq('id', proposalId)
      .eq('user_id', user.id)
      .single()

    if (proposalError || !proposal) {
      return NextResponse.json(
        { success: false, error: '제안서를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 4. 파일에서 텍스트 추출
    const arrayBuffer = await file.arrayBuffer()
    let extractedText: string

    try {
      if (ext === '.pdf') {
        extractedText = await extractFromPdf(arrayBuffer)
      } else if (ext === '.docx' || ext === '.doc') {
        extractedText = await extractFromDocx(arrayBuffer)
      } else if (ext === '.hwpx') {
        extractedText = await extractFromHwpx(arrayBuffer)
      } else {
        // .hwp
        extractedText = await extractFromHwp(arrayBuffer)
      }
    } catch (err: any) {
      console.error('[RFP] 텍스트 추출 실패:', err.message)
      return NextResponse.json(
        { success: false, error: `파일을 읽을 수 없습니다: ${err.message}` },
        { status: 400 }
      )
    }

    if (!extractedText || extractedText.trim().length < 100) {
      return NextResponse.json(
        { success: false, error: '파일에서 충분한 텍스트를 추출하지 못했습니다.' },
        { status: 400 }
      )
    }

    // 텍스트가 너무 길면 잘라냄 (GPT-4o 컨텍스트 제한)
    const MAX_CHARS = 80_000
    const trimmedText = extractedText.length > MAX_CHARS
      ? extractedText.slice(0, MAX_CHARS) + '\n\n[... 이하 생략 ...]'
      : extractedText

    // 5. GPT-4o로 RFP 분석
    const { data: rfpAnalysis, usage } = await generateJsonCompletion<RfpAnalysis>(
      RFP_ANALYSIS_PROMPT,
      `다음은 제안요청서(RFP) 파일에서 추출한 텍스트입니다. 분석해주세요:\n\n${trimmedText}`,
      { temperature: 0.2, maxTokens: 8192 }
    )

    // 6. Supabase에 저장 (service role로 RLS 우회)
    const adminSupabase = createServerSupabaseClient()
    const { error: updateError } = await adminSupabase
      .from('proposals')
      .update({ rfp_data: rfpAnalysis })
      .eq('id', proposalId)

    if (updateError) {
      console.error('[RFP] DB 업데이트 실패:', updateError)
      return NextResponse.json(
        { success: false, error: 'RFP 데이터 저장에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        rfpAnalysis,
        textLength: extractedText.length,
        tokensUsed: usage.totalTokens,
      },
    })
  } catch (error: any) {
    console.error('[RFP] 업로드 처리 오류:', error?.message, error?.stack)
    return NextResponse.json(
      { success: false, error: `RFP 분석 중 오류가 발생했습니다: ${error?.message || '알 수 없는 오류'}` },
      { status: 500 }
    )
  }
}

// ──────────── 텍스트 추출 함수 ────────────

async function extractFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  // pdf-parse v1: default export는 함수, Buffer를 받아 { text } 반환
  const pdfParse = (await import('pdf-parse')).default
  const buffer = Buffer.from(arrayBuffer)
  const result = await pdfParse(buffer)
  return result.text
}

async function extractFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const buffer = Buffer.from(arrayBuffer)
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

async function extractFromHwpx(arrayBuffer: ArrayBuffer): Promise<string> {
  // .hwpx는 ZIP 안에 XML(OWPML) 형식
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(arrayBuffer)

  // 방법 1: Preview/PrvText.txt (미리보기 텍스트, 가장 깔끔)
  const prvFile = zip.file('Preview/PrvText.txt')
  if (prvFile) {
    const text = await prvFile.async('string')
    // <> 마커 제거
    const cleaned = text.replace(/<>/g, '').trim()
    if (cleaned.length >= 100) return cleaned
  }

  // 방법 2: Contents/section*.xml에서 <hp:t> 태그 텍스트 추출
  const sectionFiles = Object.keys(zip.files)
    .filter((name) => name.startsWith('Contents/section') && name.endsWith('.xml'))
    .sort()

  const texts: string[] = []
  for (const name of sectionFiles) {
    const xml = await zip.file(name)!.async('string')
    const matches = xml.match(/<(?:hp:)?t[^>]*>([^<]+)<\/(?:hp:)?t>/g) || []
    for (const match of matches) {
      const inner = match.replace(/<[^>]+>/g, '').trim()
      if (inner) texts.push(inner)
    }
  }

  const result = texts.join('\n')
  if (!result.trim()) {
    throw new Error('HWPX 파일에서 텍스트를 추출할 수 없습니다.')
  }
  return result
}

async function extractFromHwp(arrayBuffer: ArrayBuffer): Promise<string> {
  // hwp.js의 parse는 동기 함수, Buffer를 입력으로 받음
  const { parse } = await import('hwp.js')
  const buffer = Buffer.from(arrayBuffer)
  const doc = parse(buffer, { type: 'buffer' })

  // HWPDocument → sections → paragraphs에서 텍스트 수집
  const texts: string[] = []
  if (doc?.sections) {
    for (const section of doc.sections) {
      collectTextFromNode(section, texts)
    }
  }

  const result = texts.join('\n')
  if (!result.trim()) {
    throw new Error('HWP 파일에서 텍스트를 추출할 수 없습니다. 파일이 손상되었거나 이미지 기반일 수 있습니다.')
  }
  return result
}

/**
 * hwp.js 파싱 결과에서 재귀적으로 텍스트를 수집한다.
 * 구조: section.content[] → paragraph.content[] → char.content (string)
 */
function collectTextFromNode(node: any, texts: string[]): void {
  if (!node) return

  // 문자열이면 바로 추가
  if (typeof node === 'string') {
    const trimmed = node.trim()
    if (trimmed) texts.push(trimmed)
    return
  }

  // content 속성이 문자열
  if (typeof node.content === 'string') {
    const trimmed = node.content.trim()
    if (trimmed) texts.push(trimmed)
    return
  }

  // content 배열이면 재귀
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      collectTextFromNode(child, texts)
    }
    return
  }

  // children 배열이면 재귀
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectTextFromNode(child, texts)
    }
    return
  }

  // 배열 자체
  if (Array.isArray(node)) {
    for (const child of node) {
      collectTextFromNode(child, texts)
    }
  }
}
