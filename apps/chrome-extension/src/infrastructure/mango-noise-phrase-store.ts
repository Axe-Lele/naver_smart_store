// 더망고 원문상품명에서 항상 제거해도 되는 확정 노이즈 문구(판매/광고성 보일러플레이트)를
// chrome.storage.local 에 저장/조회한다. 치환 DB와 마찬가지로 GPT에 넘기기 전에
// 원문 단계에서 미리 적용한다. 기기 로컬에만 남기고 동기화하지 않는다.

const STORAGE_KEY = "wishfigure:mango-noise-phrases";
const SEEDED_FLAG_KEY = "wishfigure:mango-noise-phrases-seeded";

// 예전에 코드에 하드코딩되어 있던 기본 목록. 처음 한 번만 시딩하고, 이후 사용자가
// 전부 지워도 다시 채워 넣지 않는다(SEEDED_FLAG_KEY 로 구분).
const DEFAULT_NOISE_PHRASES = [
  "예약",
  "재판",
  "특전",
  "초회",
  "한정",
  "정품",
  "공식",
  "도색완료",
  "완성품 피규어",
  "PVC",
  "ABS",
  "JAN",
  "판매",
  "입고",
  "送料無料",
  "무료배송",
  "수량한정",
  "발매예정",
];

export type MangoNoisePhraseRule = {
  id: string;
  phrase: string;
  caseInsensitive: boolean;
};

export async function getMangoNoisePhraseRules(): Promise<MangoNoisePhraseRule[]> {
  await ensureSeeded();
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  return Array.isArray(value) ? (value as MangoNoisePhraseRule[]) : [];
}

export async function saveMangoNoisePhraseRules(rules: MangoNoisePhraseRule[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: rules });
}

async function ensureSeeded(): Promise<void> {
  const stored = await chrome.storage.local.get(SEEDED_FLAG_KEY);
  if (stored[SEEDED_FLAG_KEY] === true) {
    return;
  }

  const seeded: MangoNoisePhraseRule[] = DEFAULT_NOISE_PHRASES.map((phrase) => ({
    id: crypto.randomUUID(),
    phrase,
    caseInsensitive: true,
  }));

  await chrome.storage.local.set({
    [STORAGE_KEY]: seeded,
    [SEEDED_FLAG_KEY]: true,
  });
}

export type MergeMangoNoisePhraseRulesResult = {
  rules: MangoNoisePhraseRule[];
  addedCount: number;
  updatedCount: number;
};

// 같은 '노이즈 문구'가 이미 있으면 새로 들어온 값(대소문자구분 여부)으로 덮어쓴다.
export function mergeMangoNoisePhraseRules(
  existing: MangoNoisePhraseRule[],
  incoming: Array<Omit<MangoNoisePhraseRule, "id">>,
): MergeMangoNoisePhraseRulesResult {
  const byPhrase = new Map(existing.map((rule) => [rule.phrase, rule]));
  let addedCount = 0;
  let updatedCount = 0;

  for (const item of incoming) {
    const current = byPhrase.get(item.phrase);
    if (current) {
      byPhrase.set(item.phrase, { ...current, caseInsensitive: item.caseInsensitive });
      updatedCount += 1;
    } else {
      byPhrase.set(item.phrase, { id: crypto.randomUUID(), ...item });
      addedCount += 1;
    }
  }

  return { rules: Array.from(byPhrase.values()), addedCount, updatedCount };
}

// 원문에 노이즈 문구 제거를 적용한다. 긴 문구가 짧은 문구에 부분적으로 가려지지 않도록
// 긴 문구부터 먼저 제거한다.
export function stripMangoNoisePhrases(text: string, rules: MangoNoisePhraseRule[]): string {
  const sortedRules = [...rules]
    .filter((rule) => rule.phrase.length > 0)
    .sort((a, b) => b.phrase.length - a.phrase.length);

  let result = text;
  for (const rule of sortedRules) {
    const pattern = new RegExp(escapeRegExp(rule.phrase), rule.caseInsensitive ? "gi" : "g");
    result = result.replace(pattern, "");
  }

  return result.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
