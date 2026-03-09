import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface CompletionResult {
  content: string
  usage: TokenUsage
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * OpenAI Chat Completion 호출 (재시도 + 토큰 추적)
 */
export async function generateCompletion(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
    jsonMode?: boolean
  }
): Promise<CompletionResult> {
  const {
    model = 'gpt-4o',
    temperature = 0.7,
    maxTokens = 4096,
    jsonMode = false,
  } = options ?? {}

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode && { response_format: { type: 'json_object' as const } }),
      })

      const content = completion.choices[0]?.message?.content
      if (!content) {
        throw new Error('OpenAI 응답이 비어있습니다.')
      }

      const usage: TokenUsage = {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      }

      console.log(
        `[OpenAI] 토큰 사용량 - 입력: ${usage.promptTokens}, 출력: ${usage.completionTokens}, 합계: ${usage.totalTokens}`
      )

      return { content, usage }
    } catch (error: any) {
      lastError = error
      const isRetryable =
        error?.status === 429 ||
        error?.status === 500 ||
        error?.status === 503 ||
        error?.code === 'ECONNRESET'

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1)
        console.warn(
          `[OpenAI] 요청 실패 (시도 ${attempt}/${MAX_RETRIES}), ${delay}ms 후 재시도:`,
          error?.message
        )
        await sleep(delay)
        continue
      }

      break
    }
  }

  console.error('[OpenAI] 최종 실패:', lastError)
  throw new Error(
    `OpenAI API 호출 실패: ${lastError?.message || '알 수 없는 오류'}`
  )
}

/**
 * JSON 모드로 호출하고 파싱된 결과 반환
 */
export async function generateJsonCompletion<T = any>(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    model?: string
    temperature?: number
    maxTokens?: number
  }
): Promise<{ data: T; usage: TokenUsage }> {
  const result = await generateCompletion(systemPrompt, userPrompt, {
    ...options,
    jsonMode: true,
  })

  try {
    const data = JSON.parse(result.content) as T
    return { data, usage: result.usage }
  } catch {
    throw new Error('OpenAI 응답 JSON 파싱 실패: ' + result.content.substring(0, 200))
  }
}
