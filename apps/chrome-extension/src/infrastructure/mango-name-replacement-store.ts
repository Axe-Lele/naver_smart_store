// 더망고 "상품명 치환조건" 규칙(변경전 문자열 -> 변경후 문자열)을
// chrome.storage.local 에 저장/조회한다. 번역 요청 전에 이 규칙을 먼저 적용하고,
// 남은 부분만 GPT로 보내는 흐름에서 사용한다. 기기 로컬에만 남기고 동기화하지 않는다.

const STORAGE_KEY = "wishfigure:mango-name-replacement-rules";

export type MangoNameReplacementRule = {
  id: string;
  before: string;
  after: string;
  caseInsensitive: boolean;
};

export async function getMangoNameReplacementRules(): Promise<MangoNameReplacementRule[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  return Array.isArray(value) ? (value as MangoNameReplacementRule[]) : [];
}

export async function saveMangoNameReplacementRules(
  rules: MangoNameReplacementRule[],
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: rules });
}

export type MergeMangoNameReplacementRulesResult = {
  rules: MangoNameReplacementRule[];
  addedCount: number;
  updatedCount: number;
};

// 같은 '변경전 문자열'이 이미 있으면 새로 들어온 값으로 덮어쓴다.
// (같은 엑셀을 다시 업로드하면 최신 내용으로 갱신되는 게 자연스럽다.)
export function mergeMangoNameReplacementRules(
  existing: MangoNameReplacementRule[],
  incoming: Array<Omit<MangoNameReplacementRule, "id">>,
): MergeMangoNameReplacementRulesResult {
  const byBefore = new Map(existing.map((rule) => [rule.before, rule]));
  let addedCount = 0;
  let updatedCount = 0;

  for (const item of incoming) {
    const current = byBefore.get(item.before);
    if (current) {
      byBefore.set(item.before, {
        ...current,
        after: item.after,
        caseInsensitive: item.caseInsensitive,
      });
      updatedCount += 1;
    } else {
      byBefore.set(item.before, { id: crypto.randomUUID(), ...item });
      addedCount += 1;
    }
  }

  return { rules: Array.from(byBefore.values()), addedCount, updatedCount };
}

// 원문 상품명에 치환 규칙을 먼저 적용한다. GPT에는 이 결과를 넘겨서 나머지 부분만
// 처리하게 한다. 겹치는 규칙이 있을 때 더 구체적인(긴) 문자열이 먼저 적용되도록 정렬한다.
export function applyMangoNameReplacements(
  text: string,
  rules: MangoNameReplacementRule[],
): string {
  const sortedRules = [...rules]
    .filter((rule) => rule.before.length > 0)
    .sort((a, b) => b.before.length - a.before.length);

  let result = text;
  for (const rule of sortedRules) {
    const pattern = new RegExp(escapeRegExp(rule.before), rule.caseInsensitive ? "gi" : "g");
    result = result.replace(pattern, rule.after);
  }

  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
