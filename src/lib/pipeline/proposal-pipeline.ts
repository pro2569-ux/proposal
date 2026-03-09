import { createServerSupabaseClient } from '@/src/lib/supabase-server'
import { analyzeBid } from '@/src/lib/prompts/analyze-bid'
import { generateOutline } from '@/src/lib/prompts/generate-outline'
import { generateSection as generateSectionContent } from '@/src/lib/prompts/generate-section'
import { generateDiagram, type DiagramType } from '@/src/lib/gemini'
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

/** 생성할 다이어그램 목록 */
const DIAGRAM_SPECS: { type: DiagramType; sectionMatch: string }[] = [
  { type: 'system_architecture', sectionMatch: 'tech_stack' },
  { type: 'process_flow', sectionMatch: 'approach' },
  { type: 'schedule', sectionMatch: 'schedule' },
]

export interface DiagramImage {
  diagramType: DiagramType
  url: string
  storagePath: string
  isPlaceholder: boolean
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

      // Step 4: 검수 + 이미지 생성 (병렬)
      await this.updateStatus('assembling', '검수 및 다이어그램을 생성하고 있습니다...', 80)

      const [reviewResult, images] = await Promise.all([
        // 4a: Claude 검수 (향후 구현, 현재 패스스루)
        this.runReview(sections.results),
        // 4b: Gemini 다이어그램 3장 병렬 생성
        this.generateProposalImages(analysis.result, sections.results),
      ])

      const finalSections = reviewResult

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
          generateSectionContent(outline, section)
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

  // --- Step 4a: Claude 검수 (향후 구현) ---

  private async runReview(
    sections: GeneratedSection[]
  ): Promise<GeneratedSection[]> {
    // TODO: Claude API로 각 섹션 품질 검수
    // - 평가항목 반영 여부
    // - 누락 내용 보완
    // - 문체 통일
    console.log('[Pipeline] 검수 단계 (패스스루)')
    return sections
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

    switch (type) {
      case 'system_architecture': {
        lines.push(`프로젝트: ${analysis.projectPurpose || ''}`)
        if (analysis.coreRequirements?.length) {
          lines.push(`핵심 요구사항: ${analysis.coreRequirements.join(', ')}`)
        }
        // tech_stack 또는 overview 섹션에서 기술 키워드 추출
        const techSection = sections.find(
          (s) => s.sectionId === 'tech_stack' || s.sectionId === 'overview'
        )
        if (techSection) {
          lines.push(`기술 내용: ${this.extractText(techSection.content).slice(0, 500)}`)
        }
        break
      }
      case 'process_flow': {
        lines.push(`프로젝트: ${analysis.projectPurpose || ''}`)
        const approachSection = sections.find(
          (s) => s.sectionId === 'approach' || s.sectionId === 'overview'
        )
        if (approachSection) {
          lines.push(`추진 방법: ${this.extractText(approachSection.content).slice(0, 500)}`)
        }
        break
      }
      case 'schedule': {
        const scheduleSection = sections.find((s) => s.sectionId === 'schedule')
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
    // 이미지 URL을 sectionType 기준으로 매핑
    const imageMap = new Map<string, string>()
    for (const img of images) {
      if (img.isPlaceholder) continue
      const matchSpec = DIAGRAM_SPECS.find((s) => s.type === img.diagramType)
      if (matchSpec) {
        imageMap.set(matchSpec.sectionMatch, img.url)
      }
    }

    const rows: ProposalSectionRow[] = sections.map((section, index) => {
      // 해당 섹션에 매칭되는 이미지가 있으면 content에 추가
      const imageUrl = imageMap.get(section.sectionId)
      let content = section.content

      if (imageUrl) {
        // content 블록 배열에 이미지 블록 추가
        const contentArray = Array.isArray(content) ? [...content] : content
        if (Array.isArray(contentArray)) {
          contentArray.push({
            type: 'diagram_image',
            url: imageUrl,
            description: `${section.sectionTitle} 다이어그램`,
          })
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
      .update({ status: dbStatus })
      .eq('id', this.proposalId)

    if (error) {
      console.warn('[Pipeline] 상태 업데이트 실패:', error.message)
    }

    console.log(`[Pipeline] [${percentage}%] ${message}`, detail || '')
  }
}
