import Anthropic from '@anthropic-ai/sdk'
import type { TokenUsage } from './openai'

// 모듈 로드 시점이 아니라 실제 호출 시점에 클라이언트를 초기화한다.
// 이렇게 하지 않으면 ANTHROPIC_API_KEY 가 undefined 일 때 import 만으로도
// pipeline 전체가 throw 되어 /api/proposals/.../generate 가 500이 된다.
let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.')
  }
  _anthropic = new Anthropic({ apiKey: key })
  return _anthropic
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface ClaudeCompletionResult {
  content: string
  usage: TokenUsage
}

/**
 * Claude Messages API 호출 (재시도 + 토큰 추적).
 * 검수 패스 등 OpenAI와 다른 모델로 cross-check가 필요한 곳에서 사용.
 */
export async function generateClaudeCompletion(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
  }
): Promise<ClaudeCompletionResult> {
  const {
    model = 'claude-sonnet-4-6',
    temperature = 0.3,
    maxTokens = 4096,
  } = options ?? {}

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await getAnthropic().messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const block = message.content[0]
      const content = block && block.type === 'text' ? block.text : ''
      if (!content) {
        throw new Error('Claude 응답이 비어있습니다.')
      }

      const usage: TokenUsage = {
        promptTokens: message.usage?.input_tokens ?? 0,
        completionTokens: message.usage?.output_tokens ?? 0,
        totalTokens:
          (message.usage?.input_tokens ?? 0) +
          (message.usage?.output_tokens ?? 0),
      }

      console.log(
        `[Claude:${model}] 토큰 사용량 - 입력: ${usage.promptTokens}, 출력: ${usage.completionTokens}, 합계: ${usage.totalTokens}`
      )

      return { content, usage }
    } catch (error: any) {
      lastError = error
      const status = error?.status ?? error?.response?.status
      const isRetryable =
        status === 429 ||
        status === 500 ||
        status === 503 ||
        status === 529 ||
        error?.code === 'ECONNRESET'

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1)
        console.warn(
          `[Claude] 요청 실패 (시도 ${attempt}/${MAX_RETRIES}), ${delay}ms 후 재시도:`,
          error?.message
        )
        await sleep(delay)
        continue
      }
      break
    }
  }

  console.error('[Claude] 최종 실패:', lastError)
  throw new Error(
    `Claude API 호출 실패: ${lastError?.message || '알 수 없는 오류'}`
  )
}

/**
 * JSON 응답을 파싱하여 반환. Claude는 응답에 ```json 블록을 붙이는 경우가 있어 보정한다.
 */
export async function generateClaudeJsonCompletion<T = any>(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
  }
): Promise<{ data: T; usage: TokenUsage }> {
  const jsonHint = '\n\n응답은 반드시 순수 JSON 객체만 출력하라. 코드펜스(```)나 설명 텍스트를 추가하지 말 것.'
  const result = await generateClaudeCompletion(
    systemPrompt + jsonHint,
    userPrompt,
    options
  )

  const cleaned = extractJson(result.content)
  try {
    const data = JSON.parse(cleaned) as T
    return { data, usage: result.usage }
  } catch {
    throw new Error('Claude 응답 JSON 파싱 실패: ' + result.content.slice(0, 200))
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) return fence[1].trim()
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}
