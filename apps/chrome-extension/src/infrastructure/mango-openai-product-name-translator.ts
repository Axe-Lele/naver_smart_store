// 더망고 원문상품명(일본어/영어/중국어 혼용)을 한국어 상품명으로 로컬라이즈한다.
// Electron 쪽 apps/desktop-electron/src/main/openai-product-name-translator.ts 와
// 같은 OpenAI Responses API를 쓰지만, Chrome 확장 background 에서 fetch 만으로
// 완결되도록 별도로 둔다 (Node 전용 API 의존 없음 - 서버/추가 런타임 불필요).
//
// 여러 상품을 한 번에 배치로 보낸다 — 매 요청마다 시스템 프롬프트/스키마를 다시
// 보내는 오버헤드를 여러 상품이 나눠 부담하게 되어, 건당으로 보면 더 저렴하다.

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const ALLOWED_MODELS = new Set(["gpt-5.4-mini", "gpt-5.4", "gpt-5.5"]);
// 30건 배치 + reasoning 모델이면 응답이 오래 걸릴 수 있어서 5분까지 기다린다.
const DEFAULT_TIMEOUT_MS = 300_000;
// 상품당 대략 이 정도 출력 토큰을 상한으로 잡고, 최소/최대를 벗어나지 않게 한다.
const OUTPUT_TOKENS_PER_ITEM = 350;
const MIN_OUTPUT_TOKENS = 600;
const MAX_OUTPUT_TOKENS = 20_000;

// 스케일이 이 값이면 조립된 상품명에서 뺀다 (1/7, 1/8 은 국내 관례상 표기하지 않음).
const OMITTED_SCALES = new Set(["1/7", "1/8"]);

// 제조사명 등 알려진 용어의 한국어 표기 변환, 그리고 확정 노이즈 문구 제거는
// 치환 DB(mango-name-replacement-store) / 노이즈 제거 DB(mango-noise-phrase-store)가
// 원문 단계에서 이미 처리한다. 여기서는 추출된 값을 그대로 쓴다.

// 운영자가 직접 고치지 않고 소스에서만 관리한다(잘못 고치면 JSON 스키마 준수
// 지시까지 깨질 수 있어서). 튜닝은 치환 DB / 노이즈 제거 DB / few-shot 예시로 한다.
const DEFAULT_MANGO_TRANSLATION_SYSTEM_PROMPT = [
  "너는 한국 스마트스토어 피규어 판매용 상품명 로컬라이저다.",
  "",
  "입력된 피규어 원문 상품명(일본어/영어/중국어 혼용) 목록에서, 각 상품마다 아래",
  "필드를 추출한다. 입력 items 배열의 id 는 그대로 출력 items 배열에도 넣는다.",
  "",
  "추출 필드:",
  "- anime_name: 작품명, 애니메이션명, 게임명 (한국어로 번역해서 넣는다)",
  "- figure_series_name: 넨도로이드, figma, POP UP PARADE, S.H.Figuarts 등 실제 피규어 라인명 (없으면 넣지 않는다)",
  "- character_name: 캐릭터명 (한국어로 번역해서 넣는다)",
  "- version_name: Ver., 의상명, 컬러명, 형태명, 모드명 등 상품 구분에 필요한 표현 (한국어로 번역해서 넣는다)",
  "- scale: 1/7, 1/8, 1/6, 1/4, 논스케일 등",
  "- manufacturer: 실제 제조사/브랜드명만 (원문 표기 그대로, 한국어로 번역하지 않는다)",
  "",
  "규칙:",
  "1. 원문에 없는 정보는 추측하지 않는다.",
  "2. anime_name, character_name, version_name 은 한국 팬덤에서 많이 쓰는 표기를 우선해서",
  "   전부 한국어로 옮긴다. 원문 그대로(일본어/영어) 남겨두지 않는다.",
  "   통용 표기가 불확실하면 자연스러운 한국어 음역으로 표기한다.",
  "   예: 範馬勇次郎 → 한마 유지로, バキ → 바키, 黒 → 블랙",
  "3. manufacturer 는 실제 제조사/브랜드 회사명만 넣는다. 상품 모델번호, 품번, SKU,",
  "   시리즈 코드(예: MMS667, B002NHVP66)는 manufacturer 가 아니다 — 이런 코드만 있고",
  "   회사명이 명확히 없으면 manufacturer 는 null 로 둔다.",
  "4. 어색한 직역, 감탄문, 광고 문구는 제거한다.",
  "5. LED, 합금, 가동, DX 등은 상품 구분에 중요하고 원문에 명확히 있을 때만 유지한다.",
  "6. 입력 원문에 이미 한글로 표기된 고유명사(캐릭터명, 작품명, 시리즈명 등)가 있으면",
  "   이미 확정된 표기이니 그대로 사용한다. 다른 한글 표기나 로마자 표기로 임의로",
  "   바꾸지 않는다. 예: 입력에 '모리간'이 있으면 '모리건'으로 고치지 않는다.",
  "7. 해당 정보가 없는 필드는 null로 반환한다.",
  "8. 출력은 지정된 JSON 형식만 반환한다.",
].join("\n");

export class MangoProductNameTranslationError extends Error {}

export type MangoTranslationUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type MangoExtractedProductFields = {
  anime_name: string | null;
  figure_series_name: string | null;
  character_name: string | null;
  version_name: string | null;
  scale: string | null;
  manufacturer: string | null;
};

export type MangoBatchTranslationItem = {
  id: string;
  originName: string;
  /** 화면에서 읽은 브랜드명. AI가 manufacturer 를 못 찾았을 때만 대신 채운다. */
  fallbackManufacturer?: string | null;
};

export type MangoTranslationFewShotExample = {
  originName: string;
  anime_name: string | null;
  figure_series_name: string | null;
  character_name: string | null;
  version_name: string | null;
  scale: string | null;
  manufacturer: string | null;
};

export type MangoBatchTranslationItemResult = {
  id: string;
  /** 조립에 실패하면 빈 배열. */
  candidates: string[];
  /** 조립 전 모델이 실제로 반환한 필드 원본. 결과가 이상할 때 그대로 확인하는 용도. */
  rawFields: MangoExtractedProductFields | null;
};

export type MangoBatchTranslationResult = {
  results: MangoBatchTranslationItemResult[];
  usage: MangoTranslationUsage | null;
  /** 실제로 이 요청에 사용된 모델명 (허용 목록에 없으면 기본값으로 대체됨). */
  modelUsed: string;
};

export async function translateMangoOriginProductNamesBatch(
  apiKey: string,
  items: MangoBatchTranslationItem[],
  model: string = "",
  examples: MangoTranslationFewShotExample[] = [],
  windowRef: { fetch: typeof fetch } = globalThis,
): Promise<MangoBatchTranslationResult> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new MangoProductNameTranslationError(
      "OpenAI API 키가 설정되지 않았습니다. 확장 팝업에서 API 키를 입력해주세요.",
    );
  }

  if (items.length === 0) {
    throw new MangoProductNameTranslationError("번역할 상품이 없습니다.");
  }

  const resolvedModel = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await windowRef.fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${trimmedKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createRequestBody(items, resolvedModel, examples)),
    });

    const body = await readResponseJson(response);
    if (!response.ok) {
      throw new MangoProductNameTranslationError(readOpenAiErrorMessage(body, response.status));
    }

    const outputText = extractOutputText(body);
    if (!outputText) {
      throw new MangoProductNameTranslationError(
        `OpenAI 응답에서 상품명 JSON을 찾지 못했습니다. ${describeEmptyOutput(body)}`,
      );
    }

    return {
      results: parseAndAssembleTitles(outputText, items),
      usage: extractUsage(body),
      modelUsed: resolvedModel,
    };
  } catch (error) {
    if (error instanceof MangoProductNameTranslationError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new MangoProductNameTranslationError("상품명 번역 요청 시간이 초과되었습니다.");
    }

    throw new MangoProductNameTranslationError(
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function createRequestBody(
  items: MangoBatchTranslationItem[],
  model: string,
  examples: MangoTranslationFewShotExample[],
): unknown {
  const systemPrompt = DEFAULT_MANGO_TRANSLATION_SYSTEM_PROMPT;

  // 상품 수 + 예시 수만큼 출력 토큰 상한을 늘려야, few-shot 예시의 assistant
  // 응답까지 계산에 넣었을 때 실제 상품 처리분이 부족해지지 않는다.
  const maxOutputTokens = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(MIN_OUTPUT_TOKENS, (items.length + examples.length) * OUTPUT_TOKENS_PER_ITEM),
  );

  // few-shot 예시는 실제 상품 요청과 동일한 입력/출력 형식(user: items 배열,
  // assistant: 필드 JSON)의 대화 쌍으로 넣는다 — 프롬프트 안에 설명으로 적는 것보다
  // 구조화 출력 모델이 형식을 훨씬 안정적으로 따라간다.
  // 예시 전체를 한 쌍(user 1개 + assistant 1개)에 묶어서, 예시 수만큼 JSON 래핑이
  // 반복되며 입력 토큰이 늘어나는 것을 막는다. 형식 시연 효과는 동일하다.
  const exampleMessages =
    examples.length === 0
      ? []
      : [
          {
            role: "user",
            content: JSON.stringify({
              items: examples.map((example, index) => ({
                id: `example-${index + 1}`,
                title: example.originName,
              })),
            }),
          },
          {
            role: "assistant",
            content: JSON.stringify({
              items: examples.map((example, index) => ({
                id: `example-${index + 1}`,
                anime_name: example.anime_name,
                figure_series_name: example.figure_series_name,
                character_name: example.character_name,
                version_name: example.version_name,
                scale: example.scale,
                manufacturer: example.manufacturer,
              })),
            }),
          },
        ];

  return {
    model,
    store: false,
    // gpt-5.5 는 reasoning 모델이라 temperature 파라미터를 지원하지 않아서 넣지 않는다.
    // reasoning 강도는 모델 기본값을 그대로 쓰고(애매한 분류 판단에 도움이 될 수
    // 있어서), 대신 max_output_tokens 를 상품 수에 비례해 넉넉히 잡아 reasoning만
    // 하다 실제 텍스트를 못 내는 상황을 막는다.
    max_output_tokens: maxOutputTokens,
    input: [
      { role: "system", content: systemPrompt },
      ...exampleMessages,
      // 판매처(한국 스마트스토어) 정보는 시스템 프롬프트에 이미 있으므로 payload에는
      // 넣지 않고, 들여쓰기 없는 컴팩트 JSON으로 입력 토큰을 아낀다.
      {
        role: "user",
        content: JSON.stringify({
          items: items.map((item) => ({ id: item.id, title: item.originName })),
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "product_name_fields",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  anime_name: { type: ["string", "null"] },
                  figure_series_name: { type: ["string", "null"] },
                  character_name: { type: ["string", "null"] },
                  version_name: { type: ["string", "null"] },
                  scale: { type: ["string", "null"] },
                  manufacturer: { type: ["string", "null"] },
                },
                required: [
                  "id",
                  "anime_name",
                  "figure_series_name",
                  "character_name",
                  "version_name",
                  "scale",
                  "manufacturer",
                ],
              },
            },
          },
          required: ["items"],
        },
      },
    },
  };
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
  const message = readNestedString(body, ["error", "message"]);
  return message ?? `OpenAI 상품명 번역 요청에 실패했습니다. HTTP ${status}`;
}

function extractOutputText(body: unknown): string {
  const outputText = readNestedString(body, ["output_text"]);
  if (outputText) {
    return outputText;
  }

  const output = readRecord(body).output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const outputItem of output) {
    const content = readRecord(outputItem).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      const record = readRecord(contentItem);
      if (record.type === "output_text" && typeof record.text === "string") {
        chunks.push(record.text);
      }
    }
  }

  return chunks.join("");
}

// output_text 가 비었을 때 원인을 바로 알 수 있도록 응답의 status/incomplete 사유/
// output 항목 타입을 요약한다. 상위 모델일수록 reasoning 토큰을 먼저 소모하다가
// max_output_tokens 를 다 써버려 실제 텍스트가 하나도 안 나오는 경우가 흔하다.
function describeEmptyOutput(body: unknown): string {
  const record = readRecord(body);
  const status = typeof record.status === "string" ? record.status : "unknown";
  const incompleteReason = readNestedString(body, ["incomplete_details", "reason"]);
  const output = Array.isArray(record.output) ? record.output : [];
  const outputTypes = output
    .map((item) => readRecord(item).type)
    .filter((type): type is string => typeof type === "string");

  const parts = [`status=${status}`];
  if (incompleteReason) {
    parts.push(`incomplete_reason=${incompleteReason}`);
  }
  parts.push(`output_types=[${outputTypes.join(", ")}]`);

  return `(${parts.join(", ")}) 모델이 응답 토큰을 다 쓰기 전에 실제 텍스트를 못 냈을 수 있습니다. 상위 모델이면 max_output_tokens를 늘려보세요.`;
}

// 조립 순서: [anime_name] [character_name] [version_name] [figure_series_name] [scale] - [manufacturer]
// - scale 이 1/7, 1/8 이면 제외한다.
// - manufacturer 가 없으면 " - " 를 붙이지 않는다.
// - null/빈 필드는 전부 제외한다.
// - anime_name 과 character_name 이 완전히 같으면 하나만 남긴다.
// - manufacturer 를 모델이 못 찾았으면(null), 상품별 fallbackManufacturer(화면에 이미
//   등록된 브랜드명)로 대신 채운다. rawFields.manufacturer 도 이 값으로 갱신해서,
//   디버그용 raw 추출값과 실제 조립된 제목이 항상 일치하게 한다.
// 노이즈 문구 제거는 노이즈 제거 DB가 원문 단계에서 이미 처리했으므로 여기선 하지 않는다.
function parseAndAssembleTitles(
  outputText: string,
  requestItems: MangoBatchTranslationItem[],
): MangoBatchTranslationItemResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    throw new MangoProductNameTranslationError(
      `상품명 번역 결과 JSON을 해석하지 못했습니다.${
        error instanceof Error ? ` ${error.message}` : ""
      }`,
    );
  }

  const items = readRecord(parsed).items;
  if (!Array.isArray(items)) {
    throw new MangoProductNameTranslationError("상품명 번역 결과에서 items 배열을 찾지 못했습니다.");
  }

  const fallbackManufacturerById = new Map(
    requestItems.map((item) => [item.id, readTrimmedString(item.fallbackManufacturer ?? null)]),
  );

  return items.map((item) => {
    const record = readRecord(item);
    const id = typeof record.id === "string" ? record.id : "";

    const rawFields: MangoExtractedProductFields = {
      anime_name: readTrimmedString(record.anime_name),
      figure_series_name: readTrimmedString(record.figure_series_name),
      character_name: readTrimmedString(record.character_name),
      version_name: readTrimmedString(record.version_name),
      scale: readTrimmedString(record.scale),
      manufacturer: readTrimmedString(record.manufacturer) ?? fallbackManufacturerById.get(id) ?? null,
    };

    const title = assembleTitle(rawFields);

    return {
      id,
      candidates: title ? [title] : [],
      rawFields,
    };
  });
}

function assembleTitle(rawFields: MangoExtractedProductFields): string | null {
  const isAnimeCharacterDuplicate =
    rawFields.anime_name !== null &&
    rawFields.character_name !== null &&
    rawFields.anime_name.toLowerCase() === rawFields.character_name.toLowerCase();

  const namePart = [
    rawFields.anime_name,
    isAnimeCharacterDuplicate ? null : rawFields.character_name,
    rawFields.version_name,
    rawFields.figure_series_name,
    rawFields.scale && !OMITTED_SCALES.has(rawFields.scale) ? rawFields.scale : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  const title = rawFields.manufacturer
    ? namePart
      ? `${namePart} - ${rawFields.manufacturer}`
      : rawFields.manufacturer
    : namePart;

  return title.length > 0 ? title : null;
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractUsage(body: unknown): MangoTranslationUsage | null {
  const usage = readRecord(body).usage;
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const record = usage as Record<string, unknown>;
  const inputTokens = record.input_tokens;
  const outputTokens = record.output_tokens;
  const totalTokens = record.total_tokens;

  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens: typeof totalTokens === "number" ? totalTokens : inputTokens + outputTokens,
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readNestedString(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    current = readRecord(current)[key];
  }

  return typeof current === "string" ? current : undefined;
}
