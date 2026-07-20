// Path: C:\smart-store\apps\chrome-extension\src\presentation\popup\popup.ts
import {
  getMangoOpenAiApiKey,
  setMangoOpenAiApiKey,
} from "../../infrastructure/mango-openai-api-key-store.js";
import {
  getMangoNameReplacementRules,
  mergeMangoNameReplacementRules,
  saveMangoNameReplacementRules,
  type MangoNameReplacementRule,
} from "../../infrastructure/mango-name-replacement-store.js";
import {
  buildMangoNameReplacementXls,
  parseMangoNameReplacementXls,
} from "../../infrastructure/mango-name-replacement-xls.parser.js";
import {
  getMangoNoisePhraseRules,
  mergeMangoNoisePhraseRules,
  saveMangoNoisePhraseRules,
  type MangoNoisePhraseRule,
} from "../../infrastructure/mango-noise-phrase-store.js";
import {
  buildMangoNoisePhraseXls,
  parseMangoNoisePhraseXls,
} from "../../infrastructure/mango-noise-phrase-xls.parser.js";
import {
  getMangoTranslationExamples,
  saveMangoTranslationExamples,
  type MangoTranslationExample,
} from "../../infrastructure/mango-translation-example-store.js";

function isExtensionRuntimeAvailable(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.runtime?.id === "string"
  );
}

initTabs();
initThemeToggle();
initOpenMangoPanelButton();
void initApiKeySettings();
void initReplacementTab();
void initNoiseTab();
void initExamplesTab();

const THEME_STORAGE_KEY = "wishfigure-popup-theme";

// 라이트/다크 테마 토글. 팝업 페이지의 localStorage는 브라우저/프로필 설정에 따라
// 유지되지 않는 경우가 있어, API 키 등과 동일하게 chrome.storage.local에 저장한다.
function initThemeToggle(): void {
  const button = document.querySelector<HTMLButtonElement>("#theme-toggle");
  const label = document.querySelector<HTMLElement>("#theme-label");

  if (!button || !label) {
    return;
  }

  // 라벨은 '누르면 전환될 모드'를 표시한다 — 다크로 보는 중이면 '라이트모드'.
  const applyTheme = (theme: "light" | "dark"): void => {
    document.body.dataset.theme = theme;
    label.textContent = theme === "dark" ? "라이트모드" : "다크모드";
  };

  const hasChromeStorage = isExtensionRuntimeAvailable() && Boolean(chrome.storage?.local);

  if (hasChromeStorage) {
    chrome.storage.local.get(THEME_STORAGE_KEY, (items) => {
      applyTheme(items[THEME_STORAGE_KEY] === "dark" ? "dark" : "light");
    });
  } else {
    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light");
  }

  button.addEventListener("click", () => {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    if (hasChromeStorage) {
      void chrome.storage.local.set({ [THEME_STORAGE_KEY]: next });
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    }
  });
}

// '번역창 열기' — 활성 탭(더망고 관리자 화면)의 콘텐츠 스크립트로 열기 명령을 보낸다.
// 패널은 기본 닫힘 상태로 마운트돼 있고, 이 명령을 받으면 표시된다.
function initOpenMangoPanelButton(): void {
  const button = document.querySelector<HTMLButtonElement>("#open-mango-panel");
  const status = document.querySelector<HTMLElement>("#open-mango-panel-status");

  if (!button || !status || !isExtensionRuntimeAvailable()) {
    return;
  }

  button.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        status.textContent = "활성 탭을 찾지 못했습니다.";
        return;
      }

      chrome.tabs.sendMessage(
        tab.id,
        { type: "mango/open-origin-panel" },
        (response: { ok?: boolean; message?: string } | undefined) => {
          if (chrome.runtime.lastError || !response) {
            status.textContent = "더망고 상품관리 탭에서 눌러주세요.";
            return;
          }
          status.textContent = response.message ?? (response.ok ? "열었습니다." : "실패했습니다.");
        },
      );
    });
  });
}

async function initApiKeySettings(): Promise<void> {
  const input = document.querySelector<HTMLInputElement>("#openai-api-key");
  const saveButton = document.querySelector<HTMLButtonElement>("#save-api-key");
  const status = document.querySelector<HTMLElement>("#api-key-status");

  if (!input || !saveButton || !status || !isExtensionRuntimeAvailable()) {
    return;
  }

  const savedKey = await getMangoOpenAiApiKey();
  input.value = savedKey;
  status.textContent = savedKey ? "저장됨" : "미설정";

  saveButton.addEventListener("click", () => {
    void setMangoOpenAiApiKey(input.value).then(() => {
      status.textContent = input.value.trim() ? "저장됨" : "미설정";
    });
  });
}

function initTabs(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab-button"));
  const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-tab-panel]"));

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.tab;
      buttons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== target;
      });
    });
  });
}


type ReplacementElements = {
  fileInput: HTMLInputElement;
  uploadStatus: HTMLElement;
  exportButton: HTMLButtonElement;
  countLabel: HTMLElement;
  listContainer: HTMLElement;
  beforeInput: HTMLInputElement;
  afterInput: HTMLInputElement;
  caseInsensitiveInput: HTMLInputElement;
  addButton: HTMLButtonElement;
  addStatus: HTMLElement;
};

async function initReplacementTab(): Promise<void> {
  const fileInput = document.querySelector<HTMLInputElement>("#replacement-file-input");
  const uploadStatus = document.querySelector<HTMLElement>("#replacement-upload-status");
  const exportButton = document.querySelector<HTMLButtonElement>("#replacement-export");
  const countLabel = document.querySelector<HTMLElement>("#replacement-count");
  const listContainer = document.querySelector<HTMLElement>("#replacement-list");
  const beforeInput = document.querySelector<HTMLInputElement>("#replacement-before");
  const afterInput = document.querySelector<HTMLInputElement>("#replacement-after");
  const caseInsensitiveInput = document.querySelector<HTMLInputElement>(
    "#replacement-case-insensitive",
  );
  const addButton = document.querySelector<HTMLButtonElement>("#replacement-add");
  const addStatus = document.querySelector<HTMLElement>("#replacement-add-status");

  if (
    !fileInput ||
    !uploadStatus ||
    !exportButton ||
    !countLabel ||
    !listContainer ||
    !beforeInput ||
    !afterInput ||
    !caseInsensitiveInput ||
    !addButton ||
    !addStatus ||
    !isExtensionRuntimeAvailable()
  ) {
    return;
  }

  const elements: ReplacementElements = {
    fileInput,
    uploadStatus,
    exportButton,
    countLabel,
    listContainer,
    beforeInput,
    afterInput,
    caseInsensitiveInput,
    addButton,
    addStatus,
  };

  await refreshReplacementList(elements);

  fileInput.addEventListener("change", () => {
    void handleReplacementFileUpload(elements);
  });

  exportButton.addEventListener("click", () => {
    void handleReplacementExport(elements);
  });

  addButton.addEventListener("click", () => {
    void handleReplacementAdd(elements);
  });
}

async function refreshReplacementList(elements: ReplacementElements): Promise<void> {
  const rules = await getMangoNameReplacementRules();
  elements.countLabel.textContent = String(rules.length);
  elements.listContainer.textContent = "";

  if (rules.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.style.margin = "8px";
    empty.textContent = "등록된 규칙이 없습니다.";
    elements.listContainer.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const rule of rules) {
    fragment.appendChild(createReplacementRow(elements, rule));
  }

  elements.listContainer.appendChild(fragment);
}

// 정적 마크업만 담는 화살표 아이콘. 사용자 입력은 절대 innerHTML로 넣지 않는다.
const ROW_ARROW_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg>';

function createCaseInsensitiveBadge(): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "대소문자 무시";
  return badge;
}

function createReplacementRow(
  elements: ReplacementElements,
  rule: MangoNameReplacementRule,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "row-item";

  const body = document.createElement("div");
  body.className = "row-body";
  body.title = `${rule.before} → ${rule.after}`;

  const from = document.createElement("span");
  from.className = "row-from";
  from.textContent = rule.before;

  const arrow = document.createElement("span");
  arrow.className = "row-arrow";
  arrow.innerHTML = ROW_ARROW_SVG;

  const to = document.createElement("span");
  to.className = "row-to";
  to.textContent = rule.after;

  body.append(from, arrow, to);
  row.appendChild(body);

  if (rule.caseInsensitive) {
    row.appendChild(createCaseInsensitiveBadge());
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "btn-delete";
  deleteButton.textContent = "삭제";
  deleteButton.addEventListener("click", () => {
    void handleReplacementDelete(elements, rule.id);
  });

  row.appendChild(deleteButton);
  return row;
}

async function handleReplacementFileUpload(elements: ReplacementElements): Promise<void> {
  const file = elements.fileInput.files?.[0];
  if (!file) {
    return;
  }

  elements.uploadStatus.textContent = "파일을 읽는 중...";

  try {
    const text = await file.text();
    const parsedRows = parseMangoNameReplacementXls(text);
    if (parsedRows.length === 0) {
      elements.uploadStatus.textContent = "파일에서 치환 규칙을 찾지 못했습니다.";
      return;
    }

    const existing = await getMangoNameReplacementRules();
    const { rules, addedCount, updatedCount } = mergeMangoNameReplacementRules(
      existing,
      parsedRows,
    );
    await saveMangoNameReplacementRules(rules);
    await refreshReplacementList(elements);

    elements.uploadStatus.textContent = `신규 ${addedCount}건 추가, 기존 ${updatedCount}건 갱신 (총 ${rules.length}건).`;
  } catch (error) {
    elements.uploadStatus.textContent =
      error instanceof Error ? error.message : "파일을 읽는 중 오류가 발생했습니다.";
  } finally {
    elements.fileInput.value = "";
  }
}

async function handleReplacementExport(elements: ReplacementElements): Promise<void> {
  const rules = await getMangoNameReplacementRules();
  if (rules.length === 0) {
    elements.uploadStatus.textContent = "내보낼 규칙이 없습니다.";
    return;
  }

  const xlsContent = buildMangoNameReplacementXls(rules);
  const filename = `mango-name-replacement-${formatDateStamp()}.xls`;

  const blob = new Blob([xlsContent], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }

  elements.uploadStatus.textContent = `${rules.length}건을 '${filename}'로 내보냈습니다.`;
}

function formatDateStamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function handleReplacementAdd(elements: ReplacementElements): Promise<void> {
  const before = elements.beforeInput.value.trim();
  const after = elements.afterInput.value.trim();

  if (!before || !after) {
    elements.addStatus.textContent = "변경 전/후 문자열을 모두 입력해주세요.";
    return;
  }

  const existing = await getMangoNameReplacementRules();
  const { rules, addedCount } = mergeMangoNameReplacementRules(existing, [
    { before, after, caseInsensitive: elements.caseInsensitiveInput.checked },
  ]);

  await saveMangoNameReplacementRules(rules);
  await refreshReplacementList(elements);

  elements.beforeInput.value = "";
  elements.afterInput.value = "";
  elements.caseInsensitiveInput.checked = false;
  elements.addStatus.textContent =
    addedCount > 0 ? "규칙을 추가했습니다." : "기존 규칙을 갱신했습니다.";
}

async function handleReplacementDelete(elements: ReplacementElements, id: string): Promise<void> {
  const existing = await getMangoNameReplacementRules();
  const rules = existing.filter((rule) => rule.id !== id);
  await saveMangoNameReplacementRules(rules);
  await refreshReplacementList(elements);
}

type NoiseElements = {
  fileInput: HTMLInputElement;
  uploadStatus: HTMLElement;
  exportButton: HTMLButtonElement;
  countLabel: HTMLElement;
  listContainer: HTMLElement;
  phraseInput: HTMLInputElement;
  caseInsensitiveInput: HTMLInputElement;
  addButton: HTMLButtonElement;
  addStatus: HTMLElement;
};

async function initNoiseTab(): Promise<void> {
  const fileInput = document.querySelector<HTMLInputElement>("#noise-file-input");
  const uploadStatus = document.querySelector<HTMLElement>("#noise-upload-status");
  const exportButton = document.querySelector<HTMLButtonElement>("#noise-export");
  const countLabel = document.querySelector<HTMLElement>("#noise-count");
  const listContainer = document.querySelector<HTMLElement>("#noise-list");
  const phraseInput = document.querySelector<HTMLInputElement>("#noise-phrase");
  const caseInsensitiveInput = document.querySelector<HTMLInputElement>(
    "#noise-case-insensitive",
  );
  const addButton = document.querySelector<HTMLButtonElement>("#noise-add");
  const addStatus = document.querySelector<HTMLElement>("#noise-add-status");

  if (
    !fileInput ||
    !uploadStatus ||
    !exportButton ||
    !countLabel ||
    !listContainer ||
    !phraseInput ||
    !caseInsensitiveInput ||
    !addButton ||
    !addStatus ||
    !isExtensionRuntimeAvailable()
  ) {
    return;
  }

  const elements: NoiseElements = {
    fileInput,
    uploadStatus,
    exportButton,
    countLabel,
    listContainer,
    phraseInput,
    caseInsensitiveInput,
    addButton,
    addStatus,
  };

  await refreshNoiseList(elements);

  fileInput.addEventListener("change", () => {
    void handleNoiseFileUpload(elements);
  });

  exportButton.addEventListener("click", () => {
    void handleNoiseExport(elements);
  });

  addButton.addEventListener("click", () => {
    void handleNoiseAdd(elements);
  });
}

async function refreshNoiseList(elements: NoiseElements): Promise<void> {
  const rules = await getMangoNoisePhraseRules();
  elements.countLabel.textContent = String(rules.length);
  elements.listContainer.textContent = "";

  if (rules.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.style.margin = "8px";
    empty.textContent = "등록된 문구가 없습니다.";
    elements.listContainer.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const rule of rules) {
    fragment.appendChild(createNoiseRow(elements, rule));
  }

  elements.listContainer.appendChild(fragment);
}

function createNoiseRow(elements: NoiseElements, rule: MangoNoisePhraseRule): HTMLElement {
  const row = document.createElement("div");
  row.className = "row-item";

  const text = document.createElement("span");
  text.className = "row-text";
  text.title = rule.phrase;
  text.textContent = rule.phrase;
  row.appendChild(text);

  if (rule.caseInsensitive) {
    row.appendChild(createCaseInsensitiveBadge());
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "btn-delete";
  deleteButton.textContent = "삭제";
  deleteButton.addEventListener("click", () => {
    void handleNoiseDelete(elements, rule.id);
  });

  row.appendChild(deleteButton);
  return row;
}

async function handleNoiseFileUpload(elements: NoiseElements): Promise<void> {
  const file = elements.fileInput.files?.[0];
  if (!file) {
    return;
  }

  elements.uploadStatus.textContent = "파일을 읽는 중...";

  try {
    const text = await file.text();
    const parsedRows = parseMangoNoisePhraseXls(text);
    if (parsedRows.length === 0) {
      elements.uploadStatus.textContent = "파일에서 노이즈 문구를 찾지 못했습니다.";
      return;
    }

    const existing = await getMangoNoisePhraseRules();
    const { rules, addedCount, updatedCount } = mergeMangoNoisePhraseRules(existing, parsedRows);
    await saveMangoNoisePhraseRules(rules);
    await refreshNoiseList(elements);

    elements.uploadStatus.textContent = `신규 ${addedCount}건 추가, 기존 ${updatedCount}건 갱신 (총 ${rules.length}건).`;
  } catch (error) {
    elements.uploadStatus.textContent =
      error instanceof Error ? error.message : "파일을 읽는 중 오류가 발생했습니다.";
  } finally {
    elements.fileInput.value = "";
  }
}

async function handleNoiseExport(elements: NoiseElements): Promise<void> {
  const rules = await getMangoNoisePhraseRules();
  if (rules.length === 0) {
    elements.uploadStatus.textContent = "내보낼 문구가 없습니다.";
    return;
  }

  const xlsContent = buildMangoNoisePhraseXls(rules);
  const filename = `mango-noise-phrases-${formatDateStamp()}.xls`;

  const blob = new Blob([xlsContent], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }

  elements.uploadStatus.textContent = `${rules.length}건을 '${filename}'로 내보냈습니다.`;
}

async function handleNoiseAdd(elements: NoiseElements): Promise<void> {
  const phrase = elements.phraseInput.value.trim();
  if (!phrase) {
    elements.addStatus.textContent = "노이즈 문구를 입력해주세요.";
    return;
  }

  const existing = await getMangoNoisePhraseRules();
  const { rules, addedCount } = mergeMangoNoisePhraseRules(existing, [
    { phrase, caseInsensitive: elements.caseInsensitiveInput.checked },
  ]);

  await saveMangoNoisePhraseRules(rules);
  await refreshNoiseList(elements);

  elements.phraseInput.value = "";
  elements.caseInsensitiveInput.checked = true;
  elements.addStatus.textContent =
    addedCount > 0 ? "문구를 추가했습니다." : "기존 문구를 갱신했습니다.";
}

async function handleNoiseDelete(elements: NoiseElements, id: string): Promise<void> {
  const existing = await getMangoNoisePhraseRules();
  const rules = existing.filter((rule) => rule.id !== id);
  await saveMangoNoisePhraseRules(rules);
  await refreshNoiseList(elements);
}

type ExampleFieldElements = {
  countLabel: HTMLElement;
  listContainer: HTMLElement;
  originInput: HTMLInputElement;
  animeInput: HTMLInputElement;
  seriesInput: HTMLInputElement;
  characterInput: HTMLInputElement;
  versionInput: HTMLInputElement;
  scaleInput: HTMLInputElement;
  manufacturerInput: HTMLInputElement;
  addButton: HTMLButtonElement;
  addStatus: HTMLElement;
};

async function initExamplesTab(): Promise<void> {
  const countLabel = document.querySelector<HTMLElement>("#example-count");
  const listContainer = document.querySelector<HTMLElement>("#example-list");
  const originInput = document.querySelector<HTMLInputElement>("#example-origin");
  const animeInput = document.querySelector<HTMLInputElement>("#example-anime");
  const seriesInput = document.querySelector<HTMLInputElement>("#example-series");
  const characterInput = document.querySelector<HTMLInputElement>("#example-character");
  const versionInput = document.querySelector<HTMLInputElement>("#example-version");
  const scaleInput = document.querySelector<HTMLInputElement>("#example-scale");
  const manufacturerInput = document.querySelector<HTMLInputElement>("#example-manufacturer");
  const addButton = document.querySelector<HTMLButtonElement>("#example-add");
  const addStatus = document.querySelector<HTMLElement>("#example-add-status");

  if (
    !countLabel ||
    !listContainer ||
    !originInput ||
    !animeInput ||
    !seriesInput ||
    !characterInput ||
    !versionInput ||
    !scaleInput ||
    !manufacturerInput ||
    !addButton ||
    !addStatus ||
    !isExtensionRuntimeAvailable()
  ) {
    return;
  }

  const elements: ExampleFieldElements = {
    countLabel,
    listContainer,
    originInput,
    animeInput,
    seriesInput,
    characterInput,
    versionInput,
    scaleInput,
    manufacturerInput,
    addButton,
    addStatus,
  };

  await refreshExampleList(elements);

  addButton.addEventListener("click", () => {
    void handleExampleAdd(elements);
  });
}

async function refreshExampleList(elements: ExampleFieldElements): Promise<void> {
  const examples = await getMangoTranslationExamples();
  elements.countLabel.textContent = String(examples.length);
  elements.listContainer.textContent = "";

  if (examples.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.style.margin = "8px";
    empty.textContent = "등록된 예시가 없습니다.";
    elements.listContainer.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const example of examples) {
    fragment.appendChild(createExampleRow(elements, example));
  }

  elements.listContainer.appendChild(fragment);
}

function createExampleRow(
  elements: ExampleFieldElements,
  example: MangoTranslationExample,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "example-item";

  const head = document.createElement("div");
  head.className = "example-head";

  const originText = document.createElement("span");
  originText.className = "example-title";
  originText.textContent = example.originName;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "btn-delete";
  deleteButton.textContent = "삭제";
  deleteButton.addEventListener("click", () => {
    void handleExampleDelete(elements, example.id);
  });

  head.append(originText, deleteButton);

  const fieldsText = document.createElement("div");
  fieldsText.className = "example-meta";
  fieldsText.textContent = [
    example.anime_name ? `작품: ${example.anime_name}` : null,
    example.figure_series_name ? `시리즈: ${example.figure_series_name}` : null,
    example.character_name ? `캐릭터: ${example.character_name}` : null,
    example.version_name ? `버전: ${example.version_name}` : null,
    example.scale ? `스케일: ${example.scale}` : null,
    example.manufacturer ? `제조사: ${example.manufacturer}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  row.append(head, fieldsText);
  return row;
}

async function handleExampleAdd(elements: ExampleFieldElements): Promise<void> {
  const originName = elements.originInput.value.trim();
  if (!originName) {
    elements.addStatus.textContent = "원문을 입력해주세요.";
    return;
  }

  const example: MangoTranslationExample = {
    id: crypto.randomUUID(),
    originName,
    anime_name: emptyToNull(elements.animeInput.value),
    figure_series_name: emptyToNull(elements.seriesInput.value),
    character_name: emptyToNull(elements.characterInput.value),
    version_name: emptyToNull(elements.versionInput.value),
    scale: emptyToNull(elements.scaleInput.value),
    manufacturer: emptyToNull(elements.manufacturerInput.value),
  };

  const existing = await getMangoTranslationExamples();
  await saveMangoTranslationExamples([...existing, example]);
  await refreshExampleList(elements);

  elements.originInput.value = "";
  elements.animeInput.value = "";
  elements.seriesInput.value = "";
  elements.characterInput.value = "";
  elements.versionInput.value = "";
  elements.scaleInput.value = "";
  elements.manufacturerInput.value = "";
  elements.addStatus.textContent = "예시를 추가했습니다.";
}

async function handleExampleDelete(elements: ExampleFieldElements, id: string): Promise<void> {
  const existing = await getMangoTranslationExamples();
  const examples = existing.filter((example) => example.id !== id);
  await saveMangoTranslationExamples(examples);
  await refreshExampleList(elements);
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
