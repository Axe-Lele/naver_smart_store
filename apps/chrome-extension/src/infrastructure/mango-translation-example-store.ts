// 번역 프롬프트에 few-shot 예시로 넣을 (원문 -> 필드값) 세트를 관리한다.
// 사용자가 raw JSON을 직접 안 써도 되게 필드별 입력폼으로 등록하고, 실제 API
// 요청에는 user/assistant 메시지 쌍으로 변환해 넣는다(mango-openai-product-name-translator).
// 기기 로컬에만 남기고 동기화(storage.sync)하지 않는다.

const STORAGE_KEY = "wishfigure:mango-translation-examples";
const SEEDED_FLAG_KEY = "wishfigure:mango-translation-examples-seeded";

export type MangoTranslationExample = {
  id: string;
  originName: string;
  anime_name: string | null;
  figure_series_name: string | null;
  character_name: string | null;
  version_name: string | null;
  scale: string | null;
  manufacturer: string | null;
};

// 설치 후 처음 조회할 때만 채워 넣는 기본 예시. 이후 사용자가 전부 지워도
// 다시 시딩하지 않는다(SEEDED_FLAG_KEY로 구분).
const DEFAULT_EXAMPLES: Array<Omit<MangoTranslationExample, "id">> = [
  {
    originName: "ドールズフロントライン ルイス 寒客を迎えるVer.",
    anime_name: "소녀전선",
    figure_series_name: null,
    character_name: "루이스",
    version_name: "환객 Ver.",
    scale: null,
    manufacturer: null,
  },
  {
    originName: "ROBOT魂 SIDE MS ユニコーンガンダム3号機フェネクス",
    anime_name: "기동전사 건담 UC",
    figure_series_name: "로봇혼",
    character_name: "유니콘 건담 3호기 페넥스",
    version_name: null,
    scale: null,
    manufacturer: null,
  },
  {
    originName: "ねんどろいど 初音ミク",
    anime_name: "보컬로이드",
    figure_series_name: "넨도로이드",
    character_name: "하츠네 미쿠",
    version_name: null,
    scale: null,
    manufacturer: null,
  },
  {
    originName: "METAL ROBOT魂 Ka signature Ζプラス A1 テストカラー",
    anime_name: "건담 센티넬",
    figure_series_name: "메탈 로봇혼 Ka 시그니처",
    character_name: "제타 플러스 A1",
    version_name: "테스트 컬러",
    scale: null,
    manufacturer: null,
  },
  {
    originName: "範馬刃牙 範馬勇次郎",
    anime_name: "바키",
    figure_series_name: null,
    character_name: "한마 유지로",
    version_name: null,
    scale: null,
    manufacturer: null,
  },
];

async function ensureSeeded(): Promise<void> {
  const stored = await chrome.storage.local.get(SEEDED_FLAG_KEY);
  if (stored[SEEDED_FLAG_KEY] === true) {
    return;
  }

  const seeded: MangoTranslationExample[] = DEFAULT_EXAMPLES.map((example) => ({
    id: crypto.randomUUID(),
    ...example,
  }));

  await chrome.storage.local.set({
    [STORAGE_KEY]: seeded,
    [SEEDED_FLAG_KEY]: true,
  });
}

export async function getMangoTranslationExamples(): Promise<MangoTranslationExample[]> {
  await ensureSeeded();
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  return Array.isArray(value) ? (value as MangoTranslationExample[]) : [];
}

export async function saveMangoTranslationExamples(
  examples: MangoTranslationExample[],
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: examples });
}
