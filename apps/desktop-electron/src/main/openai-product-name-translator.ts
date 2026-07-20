// File: apps/desktop-electron/src/main/openai-product-name-translator.ts
import type {
  GenerateProductNameTranslationsInput,
  ProductNameTranslationBatchResult,
  ProductNameTranslatorPort,
} from '@smart-store/application';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.4-mini';
const DEFAULT_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = [
  '너는 한국 스마트스토어 피규어 판매용 상품명 로컬라이저다.',
  '일본어 상품명을 자연스러운 한국어 상품명 후보로 바꾼다.',
  '캐릭터명과 작품명은 한국 팬덤에서 많이 쓰는 표기를 우선한다.',
  '예: 範馬勇次郎는 한마 유지로, バキ는 바키로 쓴다.',
  '어색한 직역, 감탄문, 중복 키워드, 불필요한 조사와 광고 문구를 제거한다.',
  '브랜드, 공식 여부, 소재, LED 같은 속성은 입력에 근거가 있을 때만 사용한다.',
  '입력에 없는 브랜드나 정품/공식 표현은 추측해서 추가하지 않는다.',
  '각 item의 id를 그대로 유지하고, 요청한 개수만큼 후보를 만든다.',
].join('\n');

type OpenAiProductNameTranslatorOptions = {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
};

export class OpenAiProductNameTranslator implements ProductNameTranslatorPort {
  private readonly apiKey?: string;

  private readonly model: string;

  private readonly timeoutMs: number;

  constructor(options: OpenAiProductNameTranslatorOptions = {}) {
    this.apiKey = options.apiKey?.trim();
    this.model = options.model?.trim() || DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async generate(
    input: GenerateProductNameTranslationsInput,
  ): Promise<ProductNameTranslationBatchResult> {
    if (!this.apiKey) {
      throw new ProductNameTranslationConfigurationError(
        'OPENAI_API_KEY 환경변수를 설정한 뒤 앱을 다시 시작해 주세요.',
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.createRequestBody(input)),
      });

      const body = await readResponseJson(response);

      if (!response.ok) {
        throw new ProductNameTranslationApiError(readOpenAiErrorMessage(body, response.status));
      }

      const outputText = extractOutputText(body);
      if (!outputText) {
        throw new ProductNameTranslationApiError(
          'OpenAI 응답에서 상품명 JSON을 찾지 못했습니다.',
        );
      }

      return {
        ...parseOutputJson(outputText),
        model: this.model,
      };
    } catch (error) {
      if (error instanceof ProductNameTranslationError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ProductNameTranslationApiError('상품명 번역 요청 시간이 초과되었습니다.');
      }

      throw new ProductNameTranslationApiError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private createRequestBody(input: GenerateProductNameTranslationsInput): unknown {
    return {
      model: this.model,
      store: false,
      max_output_tokens: Math.max(600, input.items.length * input.candidateCount * 80),
      input: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              market: '한국 스마트스토어',
              candidateCount: input.candidateCount,
              maxNameLength: input.maxNameLength,
              forbiddenTerms: input.forbiddenTerms,
              items: input.items,
            },
            null,
            2,
          ),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'product_name_translations',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    candidates: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          name: { type: 'string' },
                        },
                        required: ['name'],
                      },
                    },
                  },
                  required: ['id', 'title', 'candidates'],
                },
              },
            },
            required: ['items'],
          },
        },
      },
    };
  }
}

class ProductNameTranslationError extends Error {
  readonly code: string;

  readonly recoveryCommand?: string;

  constructor(code: string, message: string, recoveryCommand?: string) {
    super(message);
    this.name = code;
    this.code = code;
    this.recoveryCommand = recoveryCommand;
  }
}

class ProductNameTranslationConfigurationError extends ProductNameTranslationError {
  constructor(message: string) {
    super(
      'PRODUCT_NAME_TRANSLATION_NOT_CONFIGURED',
      message,
      'OPENAI_API_KEY 환경변수를 설정한 뒤 앱을 다시 시작하세요.',
    );
  }
}

class ProductNameTranslationApiError extends ProductNameTranslationError {
  constructor(message: string) {
    super('PRODUCT_NAME_TRANSLATION_FAILED', message);
  }
}

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function readOpenAiErrorMessage(body: unknown, status: number): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error?: unknown }).error === 'object' &&
    (body as { error?: unknown }).error !== null &&
    'message' in (body as { error: { message?: unknown } }).error &&
    typeof (body as { error: { message?: unknown } }).error.message === 'string'
  ) {
    return (body as { error: { message: string } }).error.message;
  }

  return `OpenAI 상품명 번역 요청에 실패했습니다. HTTP ${status}`;
}

function extractOutputText(body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'output_text' in body &&
    typeof (body as { output_text?: unknown }).output_text === 'string'
  ) {
    return (body as { output_text: string }).output_text;
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('output' in body) ||
    !Array.isArray((body as { output?: unknown }).output)
  ) {
    return '';
  }

  const chunks: string[] = [];
  for (const outputItem of (body as { output: unknown[] }).output) {
    if (
      typeof outputItem !== 'object' ||
      outputItem === null ||
      !('content' in outputItem) ||
      !Array.isArray((outputItem as { content?: unknown }).content)
    ) {
      continue;
    }

    for (const contentItem of (outputItem as { content: unknown[] }).content) {
      if (
        typeof contentItem === 'object' &&
        contentItem !== null &&
        'type' in contentItem &&
        (contentItem as { type?: unknown }).type === 'output_text' &&
        'text' in contentItem &&
        typeof (contentItem as { text?: unknown }).text === 'string'
      ) {
        chunks.push((contentItem as { text: string }).text);
      }
    }
  }

  return chunks.join('');
}

function parseOutputJson(outputText: string): ProductNameTranslationBatchResult {
  try {
    return JSON.parse(outputText) as ProductNameTranslationBatchResult;
  } catch (error) {
    throw new ProductNameTranslationApiError(
      `상품명 번역 결과 JSON을 해석하지 못했습니다.${
        error instanceof Error ? ` ${error.message}` : ''
      }`,
    );
  }
}
