// 더망고 원문상품명 번역용 OpenAI API 키를 chrome.storage.local 에 저장/조회한다.
// 기기 로컬에만 남기고 동기화(storage.sync)하지 않는다.

const STORAGE_KEY = "wishfigure:mango-openai-api-key";

export async function getMangoOpenAiApiKey(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  return typeof value === "string" ? value : "";
}

export async function setMangoOpenAiApiKey(apiKey: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: apiKey.trim() });
}
