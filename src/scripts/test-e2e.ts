/**
 * E2E 테스트 스크립트
 *
 * 실행: npx tsx src/scripts/test-e2e.ts
 *
 * 흐름:
 * 1. 나라장터에서 실제 공고 1건 검색
 * 2. 공고 분석 (OpenAI)
 * 3. 목차 생성 (OpenAI)
 * 4. 본문 생성 (OpenAI)
 * 5. PPT 생성 (PPT Worker)
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// .env.local 로드
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') })

// ──────────── 직접 import (Next.js 경로 별칭 우회) ────────────

import { searchBids, formatBidNumber, parseAmount } from '../lib/nara-api'
import { analyzeBid } from '../lib/prompts/analyze-bid'
import { generateOutline } from '../lib/prompts/generate-outline'
import { generateSection } from '../lib/prompts/generate-section'
import type { TokenUsage } from '../lib/openai'
import type { BidData } from '../types/proposal'

// ──────────── 유틸 ────────────

const GPT4O_INPUT_PRICE = 2.5 / 1_000_000   // $2.50 per 1M input tokens
const GPT4O_OUTPUT_PRICE = 10.0 / 1_000_000  // $10.00 per 1M output tokens

function calcCost(usage: TokenUsage): number {
  return (
    usage.promptTokens * GPT4O_INPUT_PRICE +
    usage.completionTokens * GPT4O_OUTPUT_PRICE
  )
}

function fmt(n: number): string {
  return n.toLocaleString()
}

function fmtCost(cost: number): string {
  return `$${cost.toFixed(4)}`
}

function fmtTime(ms: number): string {
  const sec = Math.round(ms / 1000)
  return sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec}초`
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  }
}

const ZERO_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

class StepTimer {
  private start = Date.now()
  elapsed(): number { return Date.now() - this.start }
}

// ──────────── 메인 ────────────

async function main() {
  console.log('')
  console.log('='.repeat(60))
  console.log('  나라장터 AI 제안서 E2E 테스트')
  console.log('='.repeat(60))
  console.log('')

  const totalStart = Date.now()
  let totalUsage = { ...ZERO_USAGE }
  let totalCost = 0

  // ── Step 1: 공고 검색 ──

  process.stdout.write('[1/5] 공고 검색...')
  const t1 = new StepTimer()

  let bidData: BidData

  try {
    const result = await searchBids({
      keyword: '정보시스템',
      numOfRows: 5,
      bidType: 'servc',
    })

    if (result.items.length === 0) {
      // 키워드 검색 결과가 없으면 전체 검색
      const fallback = await searchBids({ numOfRows: 5, bidType: 'servc' })
      if (fallback.items.length === 0) {
        console.log(' ❌ 공고를 찾을 수 없습니다.')
        process.exit(1)
      }
      result.items = fallback.items
      result.totalCount = fallback.totalCount
    }

    const bid = result.items[0]
    bidData = {
      bidNtceNo: bid.bidNtceNo,
      bidNtceOrd: bid.bidNtceOrd,
      bidNtceNm: bid.bidNtceNm,
      ntceInsttNm: bid.ntceInsttNm,
      dminsttNm: bid.dminsttNm,
      bidNtceDt: bid.bidNtceDt,
      bidClseDt: bid.bidClseDt,
      presmptPrce: bid.presmptPrce,
    }

    console.log(` ✅ (${fmtTime(t1.elapsed())})`)
    console.log(`     공고: ${bid.bidNtceNm}`)
    console.log(`     기관: ${bid.ntceInsttNm}`)
    console.log(`     번호: ${formatBidNumber(bid.bidNtceNo, bid.bidNtceOrd)}`)
    const budget = parseAmount(bid.presmptPrce)
    if (budget > 0) {
      console.log(`     예산: ${fmt(budget)}원`)
    }
    console.log('')
  } catch (err: any) {
    console.log(` ❌ 실패: ${err.message}`)
    process.exit(1)
  }

  // ── Step 2: 공고 분석 ──

  process.stdout.write('[2/5] 공고 분석...')
  const t2 = new StepTimer()

  let analysis: Awaited<ReturnType<typeof analyzeBid>>['analysis']

  try {
    const result = await analyzeBid(bidData)
    analysis = result.analysis
    const cost = calcCost(result.usage)
    totalUsage = addUsage(totalUsage, result.usage)
    totalCost += cost

    console.log(` ✅ (${fmtTime(t2.elapsed())}, ${fmt(result.usage.totalTokens)} tokens, ${fmtCost(cost)})`)
    console.log(`     핵심요구: ${analysis.coreRequirements?.slice(0, 3).join(', ') || '-'}`)
    console.log('')
  } catch (err: any) {
    console.log(` ❌ 실패: ${err.message}`)
    process.exit(1)
  }

  // ── Step 3: 목차 생성 ──

  process.stdout.write('[3/5] 목차 생성...')
  const t3 = new StepTimer()

  let outline: Awaited<ReturnType<typeof generateOutline>>['outline']

  try {
    const result = await generateOutline(analysis)
    outline = result.outline
    const cost = calcCost(result.usage)
    totalUsage = addUsage(totalUsage, result.usage)
    totalCost += cost

    console.log(` ✅ (${fmtTime(t3.elapsed())}, ${fmt(result.usage.totalTokens)} tokens, ${fmtCost(cost)})`)
    console.log(`     제목: ${outline.title}`)
    console.log(`     섹션: ${outline.sections.map((s) => s.title).join(' | ')}`)
    console.log('')
  } catch (err: any) {
    console.log(` ❌ 실패: ${err.message}`)
    process.exit(1)
  }

  // ── Step 4: 본문 생성 ──

  process.stdout.write('[4/5] 본문 생성...')
  const t4 = new StepTimer()

  const allSections = outline.sections.flatMap((s) =>
    s.subsections && s.subsections.length > 0 ? s.subsections : [s]
  )

  interface GeneratedResult {
    sectionId: string
    sectionTitle: string
    content: any[]
  }

  const generatedSections: GeneratedResult[] = []
  let sectionsUsage = { ...ZERO_USAGE }

  try {
    // 3개씩 병렬 처리
    for (let i = 0; i < allSections.length; i += 3) {
      const batch = allSections.slice(i, i + 3)
      const results = await Promise.all(
        batch.map((sec) => generateSection(outline, sec))
      )
      for (const { section, usage } of results) {
        generatedSections.push(section)
        sectionsUsage = addUsage(sectionsUsage, usage)
      }
      const done = Math.min(i + 3, allSections.length)
      process.stdout.write(`\r[4/5] 본문 생성... ${done}/${allSections.length}`)
    }

    const cost = calcCost(sectionsUsage)
    totalUsage = addUsage(totalUsage, sectionsUsage)
    totalCost += cost

    console.log(` ✅ (${fmtTime(t4.elapsed())}, ${fmt(sectionsUsage.totalTokens)} tokens, ${fmtCost(cost)})`)
    console.log(`     ${generatedSections.length}개 섹션 생성 완료`)
    console.log('')
  } catch (err: any) {
    console.log(` ❌ 실패: ${err.message}`)
    process.exit(1)
  }

  // ── Step 5: PPT 생성 ──

  process.stdout.write('[5/5] PPT 생성...')
  const t5 = new StepTimer()

  try {
    const PPT_WORKER_URL = process.env.PPT_WORKER_URL
    const PPT_WORKER_SECRET = process.env.PPT_WORKER_SECRET

    if (!PPT_WORKER_URL || !PPT_WORKER_SECRET) {
      throw new Error('PPT_WORKER_URL 또는 PPT_WORKER_SECRET 환경변수 미설정')
    }

    // 섹션 데이터 → PPT Worker 형식 변환
    const pptSections: any[] = []

    // 표지
    pptSections.push({ type: 'cover', subtitle: '기술 제안서' })

    // 목차
    pptSections.push({
      type: 'toc',
      items: generatedSections.map((s, i) => ({
        number: String(i + 1).padStart(2, '0'),
        title: s.sectionTitle,
        page: i + 3,
      })),
    })

    // 본문
    for (const sec of generatedSections) {
      const body: string[] = []
      if (Array.isArray(sec.content)) {
        for (const block of sec.content) {
          switch (block.type) {
            case 'heading':
              body.push(`■ ${block.text}`)
              break
            case 'paragraph':
              body.push(block.text)
              break
            case 'bullet_list':
              if (Array.isArray(block.items)) {
                body.push(...block.items)
              }
              break
            default:
              if (block.text) body.push(block.text)
          }
        }
      }
      pptSections.push({
        type: 'content',
        title: sec.sectionTitle,
        body,
      })
    }

    const pptPayload = {
      title: bidData.bidNtceNm,
      company: '(테스트 업체)',
      bid_org: bidData.ntceInsttNm,
      date: new Date().toLocaleDateString('ko-KR'),
      sections: pptSections,
    }

    const res = await fetch(`${PPT_WORKER_URL}/generate-ppt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PPT_WORKER_SECRET}`,
      },
      body: JSON.stringify(pptPayload),
    })

    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`PPT Worker 응답 ${res.status}: ${detail}`)
    }

    const pptBuffer = Buffer.from(await res.arrayBuffer())

    // output 디렉토리에 저장
    const outputDir = path.resolve(__dirname, '../../output')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const outputPath = path.join(outputDir, 'test.pptx')
    fs.writeFileSync(outputPath, pptBuffer)

    console.log(` ✅ (${fmtTime(t5.elapsed())})`)
    console.log(`     파일: ${outputPath}`)
    console.log(`     크기: ${fmt(pptBuffer.length)} bytes`)
    console.log(`     슬라이드: ${pptSections.length}장`)
    console.log('')
  } catch (err: any) {
    console.log(` ❌ 실패: ${err.message}`)
    console.log('')
    console.log('  (PPT Worker가 실행 중인지 확인하세요)')
    console.log(`  PPT_WORKER_URL: ${process.env.PPT_WORKER_URL || '미설정'}`)
    // PPT 실패해도 결과는 출력
  }

  // ── 최종 결과 ──

  const totalElapsed = Date.now() - totalStart

  console.log('─'.repeat(60))
  console.log('')
  console.log(`  총 소요: ${fmtTime(totalElapsed)}`)
  console.log(`  총 토큰: ${fmt(totalUsage.totalTokens)} (입력: ${fmt(totalUsage.promptTokens)} / 출력: ${fmt(totalUsage.completionTokens)})`)
  console.log(`  총 비용: ${fmtCost(totalCost)}`)
  console.log(`  파일:   output/test.pptx`)
  console.log('')
  console.log('='.repeat(60))
}

main().catch((err) => {
  console.error('\n치명적 오류:', err)
  process.exit(1)
})
