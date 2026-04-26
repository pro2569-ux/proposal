/**
 * @deprecated Gemini 다이어그램 생성은 Mermaid 방식으로 대체되었습니다.
 * 새 모듈: src/lib/mermaid-diagram.ts
 *
 * 이 파일은 더 이상 사용되지 않으며, 다음 정리 시 삭제할 수 있습니다.
 * @google/generative-ai 패키지도 package.json에서 제거되었습니다.
 */

export type DiagramType =
  | 'system_architecture'
  | 'process_flow'
  | 'org_chart'
  | 'schedule'

export interface DiagramResult {
  imageBuffer: Buffer
  mimeType: string
  isPlaceholder: boolean
}

/** @deprecated mermaid-diagram.ts의 generateMermaidDiagram()을 사용하세요. */
export async function generateDiagram(
  _diagramType: DiagramType,
  _context: string
): Promise<DiagramResult> {
  throw new Error(
    'generateDiagram()은 deprecated되었습니다. mermaid-diagram.ts의 generateMermaidDiagram()을 사용하세요.'
  )
}
