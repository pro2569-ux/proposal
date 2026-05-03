import { createServerSupabaseClient } from '@/src/lib/supabase-server'
import { analyzeBid } from '@/src/lib/prompts/analyze-bid'
import { generateOutline } from '@/src/lib/prompts/generate-outline'
import { generateSection as generateSectionContent } from '@/src/lib/prompts/generate-section'
import { reviewSections, improveSection } from '@/src/lib/prompts/review-sections'
import { generateDiagram, type DiagramType } from '@/src/lib/mermaid'
import type { TokenUsage } from '@/src/lib/openai'
import type {
  BidData,
  PipelineStep,
  PipelineProgress,
  AccumulatedUsage,
  ProposalResult,
  ProposalSectionRow,
} from '@/src/types/proposal'
import type { BidAnalysis } from '@/src/lib/prompts/analyze-bid'
import type { ProposalOutline } from '@/src/lib/prompts/generate-outline'
import type { GeneratedSection } from '@/src/lib/prompts/generate-section'

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  }
}

/** 병렬 처리 동시 실행 수 제한 */
const CONCURRENCY_LIMIT = 3

/** 생성할 다이어그램 목록 — keywords로 섹션 제목/ID를 퍼지 매칭 */
const DIAGRAM_SPECS: { type: DiagramType; sectionMatch: string; keywords: string[] }[] = [
  { type: 'system_architecture', sectionMatch: 'tech_stack', keywords: ['기술', '솔루션', '시스템', '아키텍처', 'tech', 'architecture'] },
  { type: 'process_flow', sectionMatch: 'approach', keywords: ['운영', '프로세스', '추진', '방안', '전략', 'approach', 'process'] },
  { type: 'schedule', sectionMatch: 'schedule', keywords: ['일정', '스케줄', 'schedule', '계획'] },
]

/**
 * 누락된 요구사항을 가장 잘 다룰 수 있는 섹션 ID를 선택한다.
 *
 * 점수 = 요구사항(category + description) 단어와 섹션(title + keyMessage + contentGuide) 단어 교집합 크기.
 * 동점이거나 매칭이 없으면 이미 가장 적게 커버된 섹션을 선택해 부담을 분산한다.
 */
function pickBestSectionForRequirement(
  req: { id: string; category: string; description: string },
  outlineSections: { id: string; title: string; keyMessage?: string; contentGuide?: string }[],
  generatedSections: { sectionId: string; coveredRequirementIds?: string[] }[]
): string | null {
  if (outlineSections.length === 0) return null

  const tokenize = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(/[^\w가-힣\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2)

  const reqTokens = new Set(tokenize(`${req.category} ${req.description}`))
  let best: { id: string; score: number } | null = null

  for (const sec of outlineSections) {
    const secText = `${sec.title} ${sec.keyMessage ?? ''} ${sec.contentGuide ?? ''}`
    const secTokens = tokenize(secText)
    const overlap = secTokens.filter((t) => reqTokens.has(t)).length
    if (!best || overlap > best.score) {
      best = { id: sec.id, score: overlap }
    }
  }

  // 매칭 없으면 커버수 가장 적은 섹션으로 분산
  if (!best || best.score === 0) {
    let leastCovered: { id: string; count: number } | null = null
    for (const sec of outlineSections) {
      const gen = generatedSections.find((g) => g.sectionId === sec.id)
      const count = gen?.coveredRequirementIds?.length ?? 0
      if (!leastCovered || count < leastCovered.count) {
        leastCovered = { id: sec.id, count }
      }
    }
    return leastCovered?.id ?? outlineSections[0].id
  }

  return best.id
}

export interface DiagramImage {
  diagramType: DiagramType
  url: string
  storagePath: string
  isPlaceholder: boolean
  mermaidCode?: string
}

export class ProposalPipeline {
  private proposalId: string
  private supabase = createServerSupabaseClient()
  private onProgress?: (progress: PipelineProgress) => void

  constructor(
    proposalId: string,
    options?: {
      onProgress?: (progress: PipelineProgress) => void
    }
  ) {
    this.proposalId = proposalId
    this.onProgress = options?.onProgress
  }

  /**
   * 전체 파이프라인 실행
   */
  async execute(bidData: BidData): Promise<ProposalResult> {
    const usage: AccumulatedUsage = {
      analyze: emptyUsage(),
      outline: emptyUsage(),
      sections: emptyUsage(),
      total: emptyUsage(),
    }

    try {
      // RFP 데이터 조회 (있으면 상세 분석에 활용)
      const rfpData = await this.fetchRfpData()

      // Step 1: 공고 분석 (RFP가 있으면 상세 프롬프트 분기)
      await this.updateStatus(
        'analyzing',
        rfpData ? 'RFP 기반 상세 분석 중...' : '입찰공고를 분석하고 있습니다...',
        10
      )
      const analysis = await this.runAnalysis(bidData, rfpData)
      usage.analyze = analysis.usage
      usage.total = addUsage(usage.total, analysis.usage)

      // Step 2: 목차 생성
      await this.updateStatus('outlining', '제안서 목차를 설계하고 있습니다...', 30)
      const outline = await this.runOutline(analysis.result)
      usage.outline = outline.usage
      usage.total = addUsage(usage.total, outline.usage)

      // Step 3: 섹션별 본문 생성 (병렬)
      await this.updateStatus('generating_sections', '섹션 본문을 생성하고 있습니다...', 40)
      const sections = await this.runSections(outline.result, analysis.result)
      usage.sections = sections.usage
      usage.total = addUsage(usage.total, sections.usage)

      // Step 3.5: 요구사항 커버리지 검증 + 누락 항목 보강 (1패스)
      await this.updateStatus('generating_sections', '요구사항 커버리지를 검증하고 있습니다...', 75)
      const coverageUsage = await this.ensureRequirementCoverage(
        outline.result,
        analysis.result,
        sections.results
      )
      usage.sections = addUsage(usage.sections, coverageUsage)
      usage.total = addUsage(usage.total, coverageUsage)

      // Step 4: 자가 검수 + 이미지 생성 (병렬)
      await this.updateStatus('assembling', '검수 및 다이어그램을 생성하고 있습니다...', 80)

      const [reviewResult, images] = await Promise.all([
        // 4a: LLM 자가 검수 + 저점 섹션 개선
        this.runReview(sections.results, analysis.result),
        // 4b: Mermaid 다이어그램 3장 병렬 생성
        this.generateProposalImages(analysis.result, sections.results),
      ])

      usage.sections = addUsage(usage.sections, reviewResult.usage)
      usage.total = addUsage(usage.total, reviewResult.usage)
      const finalSections = reviewResult.sections

      // Step 5: DB 저장 + 완료
      await this.updateStatus('assembling', '제안서를 저장하고 있습니다...', 95)
      await this.saveSections(outline.result, finalSections, images)
      await this.finalizeProposal(usage)

      await this.updateStatus('completed', '제안서 생성이 완료되었습니다.', 100)

      return {
        proposalId: this.proposalId,
        title: outline.result.title,
        analysis: analysis.result,
        outline: outline.result,
        sections: finalSections,
        images,
        usage,
      }
    } catch (error: any) {
      await this.updateStatus('failed', `생성 실패: ${error.message}`, 0)
      throw error
    }
  }

  // --- RFP 데이터 조회 ---

  private async fetchRfpData(): Promise<Record<string, any> | null> {
    const { data } = await this.supabase
      .from('proposals')
      .select('rfp_data')
      .eq('id', this.proposalId)
      .single()

    if (data?.rfp_data && Object.keys(data.rfp_data).length > 0) {
      console.log('[Pipeline] RFP 데이터 발견 — 상세 분석 모드')
      return data.rfp_data
    }
    return null
  }

  // --- Step 1: 공고 분석 ---

  private async runAnalysis(
    bidData: BidData,
    rfpData: Record<string, any> | null
  ): Promise<{ result: BidAnalysis; usage: TokenUsage }> {
    const { analysis, usage } = await analyzeBid(bidData, rfpData)
    console.log('[Pipeline] 공고 분석 완료', rfpData ? '(RFP 상세 모드)' : '(기본 모드)')
    return { result: analysis, usage }
  }

  // --- Step 2: 목차 생성 ---

  private async runOutline(
    analysis: BidAnalysis
  ): Promise<{ result: ProposalOutline; usage: TokenUsage }> {
    const { outline, usage } = await generateOutline(analysis)
    console.log('[Pipeline] 목차 생성 완료:', outline.sections.length, '섹션')
    return { result: outline, usage }
  }

  // --- Step 3: 섹션별 본문 생성 ---

  private async runSections(
    outline: ProposalOutline,
    analysis: BidAnalysis
  ): Promise<{ results: GeneratedSection[]; usage: TokenUsage }> {
    const allSections = outline.sections.flatMap((s) =>
      s.subsections && s.subsections.length > 0 ? s.subsections : [s]
    )

    const totalSections = allSections.length
    const results: GeneratedSection[] = []
    let accumulatedUsage = emptyUsage()

    for (let i = 0; i < totalSections; i += CONCURRENCY_LIMIT) {
      const batch = allSections.slice(i, i + CONCURRENCY_LIMIT)
      const batchResults = await Promise.all(
        batch.map((section) =>
          generateSectionContent(outline, section, {
            requirements: analysis.coreRequirements,
          })
        )
      )

      for (const { section, usage } of batchResults) {
        results.push(section)
        accumulatedUsage = addUsage(accumulatedUsage, usage)
      }

      const completed = Math.min(i + CONCURRENCY_LIMIT, totalSections)
      const percentage = 40 + Math.round((completed / totalSections) * 35)
      await this.updateStatus(
        'generating_sections',
        '섹션 본문을 생성하고 있습니다...',
        percentage,
        `${completed}/${totalSections} 섹션 완료`
      )
    }

    console.log('[Pipeline] 전체 섹션 생성 완료:', results.length, '개')
    return { results, usage: accumulatedUsage }
  }

  // --- Step 3.5: 요구사항 커버리지 검증 ---

  /**
   * 모든 요구사항이 최소 1개 섹션에서 커버되었는지 확인하고,
   * 누락된 요구사항이 있으면 가장 적합한 섹션을 1회 보강 재생성한다.
   * 매트릭스를 콘솔에 로깅한다.
   */
  private async ensureRequirementCoverage(
    outline: ProposalOutline,
    analysis: BidAnalysis,
    sections: GeneratedSection[]
  ): Promise<TokenUsage> {
    const reqs = analysis.coreRequirements ?? []
    if (reqs.length === 0) return emptyUsage()

    const allReqIds = reqs.map((r) => r.id)
    const coveredIds = new Set<string>()
    for (const s of sections) {
      for (const id of s.coveredRequirementIds ?? []) coveredIds.add(id)
    }
    const missing = allReqIds.filter((id) => !coveredIds.has(id))

    let usage = emptyUsage()

    if (missing.length > 0) {
      console.warn(
        `[Pipeline] 누락된 요구사항 ${missing.length}/${allReqIds.length}개 — 보강 시작:`,
        missing.join(', ')
      )

      const allOutlineSections = outline.sections.flatMap((s) =>
        s.subsections && s.subsections.length > 0 ? s.subsections : [s]
      )

      // 누락 요구사항을 가장 적합한 섹션에 매핑 (어휘 중복 점수)
      const targetMap = new Map<string, string[]>() // sectionId -> reqIds[]
      for (const reqId of missing) {
        const req = reqs.find((r) => r.id === reqId)
        if (!req) continue
        const target = pickBestSectionForRequirement(req, allOutlineSections, sections)
        if (!target) continue
        const list = targetMap.get(target) ?? []
        list.push(reqId)
        targetMap.set(target, list)
      }

      // 섹션별 보강 재생성 (병렬)
      const regenJobs = Array.from(targetMap.entries()).map(
        async ([sectionId, mustCoverIds]) => {
          const outlineSection = allOutlineSections.find((s) => s.id === sectionId)
          if (!outlineSection) return null
          try {
            const { section, usage: u } = await generateSectionContent(
              outline,
              outlineSection,
              {
                requirements: reqs,
                mustCoverIds,
              }
            )
            return { sectionId, section, usage: u }
          } catch (err: any) {
            console.error(`[Pipeline] 섹션 ${sectionId} 보강 실패:`, err.message)
            return null
          }
        }
      )

      const results = await Promise.all(regenJobs)
      for (const r of results) {
        if (!r) continue
        const idx = sections.findIndex((s) => s.sectionId === r.sectionId)
        if (idx >= 0) sections[idx] = r.section
        usage = addUsage(usage, r.usage)
      }

      // 보강 후 다시 커버리지 계산
      coveredIds.clear()
      for (const s of sections) {
        for (const id of s.coveredRequirementIds ?? []) coveredIds.add(id)
      }
    }

    // 추적 매트릭스 로깅
    const matrix = reqs.map((req) => ({
      id: req.id,
      priority: req.priority,
      desc: req.description.slice(0, 40),
      coveredBy: sections
        .filter((s) => (s.coveredRequirementIds ?? []).includes(req.id))
        .map((s) => s.sectionId),
    }))
    const finalMissing = allReqIds.filter((id) => !coveredIds.has(id))
    console.log(
      `[Pipeline] 요구사항 추적 매트릭스 (커버: ${
        allReqIds.length - finalMissing.length
      }/${allReqIds.length}):`,
      JSON.stringify(matrix, null, 2)
    )
    if (finalMissing.length > 0) {
      console.warn('[Pipeline] 보강 후에도 누락된 요구사항:', finalMissing.join(', '))
    }

    return usage
  }

  // --- Step 4a: LLM 자가 검수 ---

  /**
   * 작성된 섹션들을 LLM 으로 일괄 평가하고, 저점(needsRevision=true) 섹션만
   * 피드백 반영해 1패스 개선한다.
   *
   * - Pass 1: 분석 결과 + 모든 섹션 요약 → 점수/이슈/섹션간 불일치/누락요구사항
   * - Pass 2: needsRevision 섹션 병렬 개선 (실패해도 원본 유지)
   */
  private async runReview(
    sections: GeneratedSection[],
    analysis: BidAnalysis
  ): Promise<{ sections: GeneratedSection[]; usage: TokenUsage }> {
    let usage = emptyUsage()
    if (sections.length === 0) return { sections, usage }

    let review
    try {
      const r = await reviewSections(analysis, sections)
      review = r.review
      usage = addUsage(usage, r.usage)
    } catch (err: any) {
      console.error('[Pipeline] 검수 Pass 1 실패:', err.message)
      return { sections, usage }
    }

    console.log(
      `[Pipeline] 검수 결과 — 종합 점수 ${review.overallScore}/100, 섹션간 불일치 ${review.crossSectionIssues.length}건, 누락 요구 ${review.missingRequirements.length}건`
    )
    if (review.crossSectionIssues.length > 0) {
      console.log('[Pipeline] 섹션간 불일치:', review.crossSectionIssues)
    }
    if (review.missingRequirements.length > 0) {
      console.log('[Pipeline] 누락 요구사항(검수):', review.missingRequirements)
    }

    const targets = review.sectionReviews.filter((r) => r.needsRevision)
    if (targets.length === 0) {
      console.log('[Pipeline] 개선 필요 섹션 없음 (모두 75점 이상)')
      return { sections, usage }
    }
    console.log(`[Pipeline] 개선 대상 섹션 ${targets.length}개:`, targets.map((t) => `${t.sectionId}(${t.score})`).join(', '))

    const improved = await Promise.all(
      targets.map(async (feedback) => {
        const original = sections.find((s) => s.sectionId === feedback.sectionId)
        if (!original) return null
        try {
          const { section, usage: u } = await improveSection(
            original,
            feedback,
            review.crossSectionIssues
          )
          return { section, usage: u }
        } catch (err: any) {
          console.error(`[Pipeline] 섹션 ${feedback.sectionId} 개선 실패:`, err.message)
          return null
        }
      })
    )

    const next = sections.slice()
    for (const r of improved) {
      if (!r) continue
      const idx = next.findIndex((s) => s.sectionId === r.section.sectionId)
      if (idx >= 0) {
        // coveredRequirementIds는 개선 응답에 누락될 수 있으니 보존
        next[idx] = {
          ...r.section,
          coveredRequirementIds:
            r.section.coveredRequirementIds ?? next[idx].coveredRequirementIds,
        }
      }
      usage = addUsage(usage, r.usage)
    }

    return { sections: next, usage }
  }

  // --- Step 4b: 다이어그램 이미지 생성 ---

  /**
   * 3종 다이어그램을 병렬 생성하고 Supabase Storage에 업로드한다.
   *
   * - system_architecture: 시스템 구성도
   * - process_flow: 업무 프로세스 플로우차트
   * - schedule: 추진 일정 간트차트
   */
  private async generateProposalImages(
    analysis: BidAnalysis,
    sections: GeneratedSection[]
  ): Promise<DiagramImage[]> {
    console.log('[Pipeline] 다이어그램 3장 병렬 생성 시작')

    const results = await Promise.all(
      DIAGRAM_SPECS.map(async (spec) => {
        const context = this.buildDiagramContext(spec.type, analysis, sections)

        try {
          const diagram = await generateDiagram(spec.type, context)

          // Supabase Storage에 업로드
          const ext = diagram.mimeType.includes('png') ? 'png' : 'jpg'
          const storagePath = `diagrams/${this.proposalId}/${spec.type}.${ext}`

          const { error: uploadError } = await this.supabase.storage
            .from('proposal-files')
            .upload(storagePath, diagram.imageBuffer, {
              contentType: diagram.mimeType,
              upsert: true,
            })

          if (uploadError) {
            console.warn(`[Pipeline] 다이어그램 업로드 실패 (${spec.type}):`, uploadError.message)
            return null
          }

          // 공개 URL 생성
          const { data: urlData } = this.supabase.storage
            .from('proposal-files')
            .getPublicUrl(storagePath)

          console.log(`[Pipeline] 다이어그램 생성 완료: ${spec.type} (placeholder=${diagram.isPlaceholder})`)

          return {
            diagramType: spec.type,
            url: urlData.publicUrl,
            storagePath,
            isPlaceholder: diagram.isPlaceholder,
            mermaidCode: diagram.mermaidCode,
          } satisfies DiagramImage
        } catch (err: any) {
          console.error(`[Pipeline] 다이어그램 생성/업로드 실패 (${spec.type}):`, err.message)
          return null
        }
      })
    )

    const images = results.filter((r): r is DiagramImage => r !== null)
    console.log(`[Pipeline] 다이어그램 완료: ${images.length}/${DIAGRAM_SPECS.length}장`)
    return images
  }

  /**
   * 다이어그램 타입에 맞는 맥락 텍스트를 섹션 내용에서 추출한다.
   */
  private buildDiagramContext(
    type: DiagramType,
    analysis: BidAnalysis,
    sections: GeneratedSection[]
  ): string {
    const lines: string[] = []

    const findSection = (keywords: string[]) =>
      sections.find((s) => {
        const target = `${s.sectionId} ${s.sectionTitle}`.toLowerCase()
        return keywords.some((kw) => target.includes(kw))
      })

    switch (type) {
      case 'system_architecture': {
        lines.push(`프로젝트: ${analysis.projectPurpose || ''}`)
        if (analysis.coreRequirements?.length) {
          lines.push(`핵심 요구사항: ${analysis.coreRequirements.join(', ')}`)
        }
        const techSection = findSection(['기술', '솔루션', '시스템', '아키텍처', 'tech'])
        if (techSection) {
          lines.push(`기술 내용: ${this.extractText(techSection.content).slice(0, 500)}`)
        }
        break
      }
      case 'process_flow': {
        lines.push(`프로젝트: ${analysis.projectPurpose || ''}`)
        const approachSection = findSection(['운영', '프로세스', '추진', '방안', '전략', 'approach'])
        if (approachSection) {
          lines.push(`추진 방법: ${this.extractText(approachSection.content).slice(0, 500)}`)
        }
        break
      }
      case 'schedule': {
        const scheduleSection = findSection(['일정', '스케줄', 'schedule', '계획'])
        if (scheduleSection) {
          lines.push(`일정 내용: ${this.extractText(scheduleSection.content).slice(0, 500)}`)
        } else {
          lines.push(`프로젝트 규모: ${analysis.projectScale || ''}`)
        }
        break
      }
      default: {
        lines.push(`프로젝트: ${analysis.projectPurpose || ''}`)
      }
    }

    return lines.filter(Boolean).join('\n')
  }

  /**
   * 섹션 content(JSON 블록 배열)에서 순수 텍스트를 추출한다.
   */
  private extractText(content: any[]): string {
    if (!Array.isArray(content)) return String(content)

    return content
      .map((block) => {
        if (block.text) return block.text
        if (block.items && Array.isArray(block.items)) return block.items.join(', ')
        if (block.description) return block.description
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }

  // --- Step 5: DB 저장 ---

  private async saveSections(
    outline: ProposalOutline,
    sections: GeneratedSection[],
    images: DiagramImage[]
  ): Promise<void> {
    // 이미지를 diagramType 기준으로 매핑
    const imageByType = new Map<DiagramType, { url: string; mermaidCode?: string }>()
    for (const img of images) {
      if (img.isPlaceholder) continue
      imageByType.set(img.diagramType, { url: img.url, mermaidCode: img.mermaidCode })
    }

    // 각 다이어그램을 가장 적합한 섹션에 매칭 (이미 매칭된 이미지는 제거)
    const usedTypes = new Set<DiagramType>()

    const rows: ProposalSectionRow[] = sections.map((section, index) => {
      let content = section.content

      // 섹션 제목+ID로 가장 적합한 다이어그램 찾기
      const matchTarget = `${section.sectionId} ${section.sectionTitle}`.toLowerCase()
      let matched: { url: string; mermaidCode?: string } | null = null

      for (const spec of DIAGRAM_SPECS) {
        if (usedTypes.has(spec.type)) continue
        if (!imageByType.has(spec.type)) continue

        const matches = spec.keywords.some((kw) => matchTarget.includes(kw.toLowerCase()))
        if (matches) {
          matched = imageByType.get(spec.type)!
          usedTypes.add(spec.type)
          break
        }
      }

      if (matched) {
        const contentArray = Array.isArray(content) ? [...content] : content
        if (Array.isArray(contentArray)) {
          // diagram_placeholder를 diagram_image로 교체
          const placeholderIdx = contentArray.findIndex(
            (b: any) => b.type === 'diagram_placeholder'
          )
          const imageBlock = {
            type: 'diagram_image' as const,
            url: matched.url,
            mermaidCode: matched.mermaidCode,
            description: `${section.sectionTitle} 다이어그램`,
          }
          if (placeholderIdx >= 0) {
            contentArray[placeholderIdx] = imageBlock
          } else {
            contentArray.push(imageBlock)
          }
          content = contentArray
        }
      }

      return {
        proposal_id: this.proposalId,
        section_type: section.sectionId,
        title: section.sectionTitle,
        content: JSON.stringify(content),
        order_index: index,
      }
    })

    const { error } = await this.supabase
      .from('proposal_sections')
      .insert(rows)

    if (error) {
      console.error('[Pipeline] 섹션 저장 실패:', error)
      throw new Error(`섹션 저장 실패: ${error.message}`)
    }

    // 제안서 제목 업데이트
    await this.supabase
      .from('proposals')
      .update({ bid_title: outline.title })
      .eq('id', this.proposalId)

    console.log('[Pipeline] DB 저장 완료:', rows.length, '섹션,', images.length, '이미지')
  }

  private async finalizeProposal(usage: AccumulatedUsage): Promise<void> {
    const { error } = await this.supabase
      .from('proposals')
      .update({
        status: 'completed',
        ai_cost: usage.total.totalTokens,
        completed_at: new Date().toISOString(),
      })
      .eq('id', this.proposalId)

    if (error) {
      console.error('[Pipeline] 최종 업데이트 실패:', error)
      throw new Error(`최종 업데이트 실패: ${error.message}`)
    }
  }

  // --- 상태 관리 ---

  private async updateStatus(
    step: PipelineStep,
    message: string,
    percentage: number,
    detail?: string
  ): Promise<void> {
    const progress: PipelineProgress = { step, message, percentage, detail }

    this.onProgress?.(progress)

    const dbStatus = step === 'completed' ? 'completed'
      : step === 'failed' ? 'failed'
      : 'generating'

    const { error } = await this.supabase
      .from('proposals')
      .update({
        status: dbStatus,
        progress_step: step,
        progress_pct: percentage,
        progress_msg: detail || message,
      })
      .eq('id', this.proposalId)

    if (error) {
      console.warn('[Pipeline] 상태 업데이트 실패:', error.message)
    }

    console.log(`[Pipeline] [${percentage}%] ${message}`, detail || '')
  }
}
