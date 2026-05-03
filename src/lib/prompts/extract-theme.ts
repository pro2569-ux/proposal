import { generateClaudeJsonCompletion } from '../anthropic'
import { generateJsonCompletion } from '../openai'
import type { TokenUsage } from '../openai'

/**
 * worker의 Theme dataclass와 1:1 매핑되는 JSON 스키마.
 * 누락 필드는 worker가 DEFAULT_THEME 값으로 보완한다.
 */
export interface ThemeSpec {
  name?: string
  font_regular?: string
  font_bold?: string
  font_display?: string
  title_size?: number
  body_size?: number
  caption_size?: number
  page_num_size?: number
  cover_title_size?: number
  cover_subtitle_size?: number
  cover_meta_size?: number
  cover_company_size?: number
  color_text?: string
  color_text_muted?: string
  color_bg_body?: string
  color_divider?: string
  color_light_surface?: string
  color_primary?: string
  color_accent?: string
  color_bg_accent?: string
  color_text_on_accent?: string
  color_bar_on_accent?: string
  color_table_header_bg?: string
  color_table_header_text?: string
  sharp_corners?: boolean
}

const SYSTEM_PROMPT = `너는 디자인 시스템 문서를 PPT 테마 JSON으로 변환하는 전문가다.
입력으로 받는 마크다운 디자인 가이드(예: xAI 스타일, 미니멀, 정부 공식 등)를 분석하여
PPT 생성기가 사용할 Theme JSON 객체를 출력한다.

**중요 제약**:
- 본 PPT는 한국 공공기관 평가위원이 보는 제안서이므로, 본문 슬라이드는 흰 배경(color_bg_body=#FFFFFF) + 진한 텍스트(color_text)를 유지해 가독성을 보장한다.
- 디자인 문서가 다크 테마라도 다크 색은 표지·목차의 액센트 영역(color_bg_accent + color_text_on_accent)에만 적용한다.
- 본문 표 헤더(color_table_header_bg)는 액센트 색을 사용해 다크 임팩트를 표현하되, 셀 배경은 흰색을 유지한다.

**필드 의미**:
- color_text: 본문 텍스트색 (검정 계열 권장, #1F2228 등)
- color_text_muted: 부가 정보 회색
- color_bg_body: 본문 배경 (반드시 흰색 #FFFFFF 또는 매우 밝은 색)
- color_divider: 본문 구분선
- color_light_surface: 표 짝수행/약한 표면 회색
- color_primary: 슬라이드 헤더 제목·구분바·강조 (액센트 색)
- color_accent: 보조 강조 (예: 간트차트 바)
- color_bg_accent: 표지/목차 배경 (다크 가능)
- color_text_on_accent: 액센트 배경 위 텍스트 (보통 흰색)
- color_bar_on_accent: 표지 좌측 포인트 바 색
- color_table_header_bg / color_table_header_text: 표 헤더 색
- font_regular / font_bold: 한글 본문 폰트 (한글 글리프 보장 필수 — Pretendard, 나눔고딕 등)
- font_display: 영문 디스플레이/모노 폰트 (페이지 번호 등 영문 한정)
- *_size: 정수 (단위는 pt)
- sharp_corners: 0px 모서리 강조 여부 (브루탈리즘이면 true)

**출력**: 위 스키마에 맞는 순수 JSON 객체. 마크다운 코드펜스나 설명 없이.`

export async function extractThemeFromMarkdown(
  markdown: string
): Promise<{ theme: ThemeSpec; usage: TokenUsage }> {
  const userPrompt = `다음 디자인 시스템 문서를 분석하여 Theme JSON을 추출해줘:\n\n${markdown}`

  // Claude 우선, 없으면 OpenAI 폴백
  if (process.env.ANTHROPIC_API_KEY) {
    const { data, usage } = await generateClaudeJsonCompletion<ThemeSpec>(
      SYSTEM_PROMPT,
      userPrompt,
      { temperature: 0.2, maxTokens: 2048 }
    )
    return { theme: data, usage }
  }
  const { data, usage } = await generateJsonCompletion<ThemeSpec>(
    SYSTEM_PROMPT,
    userPrompt,
    { temperature: 0.2, maxTokens: 2048 }
  )
  return { theme: data, usage }
}
