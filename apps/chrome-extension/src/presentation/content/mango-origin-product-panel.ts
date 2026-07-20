// 더망고 상품관리 화면에 "원문상품명 추출" 플로팅 패널을 주입한다.
// 현재 화면에서 상품번호 + 원문상품명을 뽑아 스마트스토어 상품목록처럼
// 테이블로 보여주고, 행별 이름 수정 후 적용을 제공한다.
// 번역은 상품 하나씩이 아니라 화면에 불러온 상품 전체를 한 번에 배치로 보낸다
// (시스템 프롬프트/스키마 오버헤드를 여러 상품이 나눠 부담해서 건당 비용이 낮다).
import { applyMangoOriginProductName } from "../../infrastructure/mango-goods-name-apply.js";
import {
  applyMangoSelectedDelete,
  detectMangoSelectedDeleteAction,
} from "../../infrastructure/mango-goods-selected-delete.js";
import {
  applyGoodsListPageSize,
  findGoodsListPageSizeSelect,
  readGoodsListPageSizeOptions,
} from "../../infrastructure/mango-goods-list-page-size.js";
import { scrollUntilRowCount } from "../../infrastructure/mango-goods-list-infinite-scroll.js";
import {
  applyMangoNameReplacements,
  getMangoNameReplacementRules,
} from "../../infrastructure/mango-name-replacement-store.js";
import {
  getMangoNoisePhraseRules,
  stripMangoNoisePhrases,
} from "../../infrastructure/mango-noise-phrase-store.js";
import { getMangoTranslationExamples } from "../../infrastructure/mango-translation-example-store.js";
import { collectMangoGoodsOriginUrls } from "../../infrastructure/mango-goods-number-origin-link.js";
import {
  extractMangoOriginProducts,
  type MangoOriginProduct,
} from "../../infrastructure/mango-origin-product.parser.js";

const PANEL_ID = "wishfigure-mango-origin-panel";
const MIN_PANEL_WIDTH = 480;
const MIN_PANEL_HEIGHT = 260;
const VIEWPORT_MARGIN = 32;
const THEME_STORAGE_KEY = "wishfigure-mango-panel-theme";
// 상품리스트 ↔ 휴지통 등 페이지를 이동하면 콘텐츠 스크립트가 새로 실행되며 패널이
// 기본(닫힘) 상태로 되돌아간다. 같은 탭 안에서는 열림/최소화/위치/크기가 유지되도록
// sessionStorage(탭 단위, 탭을 닫으면 초기화)에 저장해두고 마운트 시 복원한다.
const PANEL_STATE_KEY = "wishfigure:mango-panel-state";

type PanelTheme = "light" | "dark";

type PersistedPanelState = {
  open?: boolean;
  minimized?: boolean;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
};

function readPanelState(windowRef: Window): PersistedPanelState {
  try {
    const raw = windowRef.sessionStorage.getItem(PANEL_STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedPanelState) : {};
  } catch {
    return {};
  }
}

function mergePanelState(windowRef: Window, patch: Partial<PersistedPanelState>): void {
  try {
    windowRef.sessionStorage.setItem(
      PANEL_STATE_KEY,
      JSON.stringify({ ...readPanelState(windowRef), ...patch }),
    );
  } catch {
    // sessionStorage를 못 쓰는 환경이면 상태 유지 없이 동작만 한다.
  }
}

const BATCH_MODEL_OPTIONS = ["gpt-5.5", "gpt-5.4-mini"] as const;
const DEFAULT_BATCH_MODEL = BATCH_MODEL_OPTIONS[0];

type ButtonVariant =
  | "primary"
  | "outline"
  | "outline-primary"
  | "outline-success"
  | "outline-danger"
  | "success"
  | "danger"
  | "disabled";

type RowState = {
  productId: string;
  originName: string;
  editedName: string;
  imageUrl: string;
  /** 화면에 이미 등록된 브랜드명. AI가 manufacturer 를 못 찾았을 때만 대신 쓴다. */
  fallbackManufacturer: string;
  /** 가장 최근 일괄번역 결과. 되돌리기 버튼이 이 값과 원문 사이를 오갈 때 기준이 된다. */
  lastTranslatedName: string | null;
  /** 원문사이트(주로 아마존 재팬) URL. 목록 화면에서 못 찾았으면 빈 문자열. */
  originUrl: string;
  /** 원문사이트에서 읽은 발매(예정)일. undefined=아직 조회 전, null=조회했지만 못 찾음. */
  releaseDate: string | null | undefined;
  /** 왼쪽 체크박스 상태. '일괄적용'은 이 값이 켜진 행에만 실행된다. */
  checked: boolean;
  /** 마지막으로 성공 적용한 이름. editedName이 이 값과 같은 동안만 '적용됨'으로 표시한다. */
  appliedName: string | null;
};

// 상품번호 → 발매일 조회 결과 캐시. 같은 상품을 다시 추출하거나 테이블이 다시
// 렌더링돼도(번역/적용 후) 아마존 페이지를 재조회하지 않는다.
const releaseDateCache = new Map<string, string | null>();
// 지금 background 에 조회를 보내둔 상품번호. 조회 중 재렌더링 시 중복 요청을 막는다.
const releaseDateRequestsInFlight = new Set<string>();
// 아마존 페이지 fetch 는 한 건에 수 초씩 걸릴 수 있어 소량씩 끊어 보내고,
// 청크가 돌아올 때마다 화면 셀을 바로 갱신한다.
const RELEASE_DATE_CHUNK_SIZE = 5;

/**
 * 패널을 화면에 표시한다. 아직 마운트되지 않았으면 먼저 마운트한다.
 * 확장 팝업의 '번역창 열기' 버튼이 이 함수를 (메시지를 통해) 호출한다.
 */
export function openMangoOriginProductPanel(
  documentRef: Document = document,
  windowRef: Window = window,
): void {
  mountMangoOriginProductPanel(documentRef, windowRef);
  documentRef.getElementById(PANEL_ID)?.classList.remove("wf-panel-closed");
  mergePanelState(windowRef, { open: true });
}

export function mountMangoOriginProductPanel(
  documentRef: Document = document,
  windowRef: Window = window,
): void {
  if (documentRef.getElementById(PANEL_ID)) {
    return;
  }

  const panel = documentRef.createElement("div");
  panel.id = PANEL_ID;
  panel.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    // 기본 크기는 화면을 거의 채우는 수준. 운영자가 드래그로 줄이면 그 크기가
    // (인라인 px로 덮여) 유지되고, 최소화→원래대로 시에도 그 크기로 돌아온다.
    "width:min(1800px, calc(100vw - 140px))",
    "height:min(85vh, 960px)",
    "max-width:calc(100vw - 32px)",
    "max-height:90vh",
    "overflow:hidden",
    "display:flex",
    "flex-direction:column",
    "background:var(--wf-surface)",
    "border:1px solid var(--wf-border)",
    "border-radius:12px",
    "box-shadow:0 12px 32px rgba(16,24,40,0.35)",
    "font-family:Pretendard,'Noto Sans KR','Apple SD Gothic Neo','Segoe UI','Malgun Gothic',AppleGothic,sans-serif",
    "font-size:13px",
    "color:var(--wf-text)",
  ].join(";");

  // 저장된 테마 복원. 색상 변수들은 스타일시트의 [data-theme] 블록에서 정의된다.
  const savedTheme = windowRef.localStorage?.getItem(THEME_STORAGE_KEY);
  panel.dataset.theme = savedTheme === "dark" ? "dark" : "light";

  panel.appendChild(buildScopedStyle(documentRef));

  // display/gap/flex 같은 레이아웃 속성은 호스트 페이지가 !important 리셋으로 덮는 경우가
  // 있어 인라인 스타일 대신 스코프 스타일시트(wf-bar 등, !important 부착)로 지정한다.
  const header = documentRef.createElement("div");
  header.className = "wf-bar";
  header.style.cssText = "padding:14px 16px 4px";

  const accentBar = documentRef.createElement("span");
  accentBar.style.cssText =
    "width:4px;height:16px;border-radius:2px;background:var(--wf-blue);flex-shrink:0";

  const title = documentRef.createElement("strong");
  title.className = "wf-spacer";
  title.textContent = "원문상품명 추출";
  title.style.cssText = "font-size:15px;font-weight:800;color:var(--wf-text)";

  const pageSizeSelect = documentRef.createElement("select");
  pageSizeSelect.className = "wf-select";

  const extractButton = documentRef.createElement("button");
  extractButton.type = "button";
  extractButton.textContent = "원문 상품명 추출";
  styleButton(extractButton, "primary");

  // 팝업(확장 설정)과 동일하게 라이트/다크 테마를 전환한다. 현재 테마 이름을 표시한다.
  const themeToggleButton = documentRef.createElement("button");
  themeToggleButton.type = "button";
  themeToggleButton.title = "테마 전환";
  styleButton(themeToggleButton, "outline");
  // 라벨은 '누르면 전환될 모드'를 표시한다 — 다크로 보는 중이면 '라이트모드'.
  const refreshThemeToggleLabel = (): void => {
    themeToggleButton.textContent = panel.dataset.theme === "dark" ? "라이트모드" : "다크모드";
  };
  refreshThemeToggleLabel();
  themeToggleButton.addEventListener("click", () => {
    const next: PanelTheme = panel.dataset.theme === "dark" ? "light" : "dark";
    panel.dataset.theme = next;
    windowRef.localStorage?.setItem(THEME_STORAGE_KEY, next);
    refreshThemeToggleLabel();
  });

  const minimizeButton = documentRef.createElement("button");
  minimizeButton.type = "button";
  minimizeButton.textContent = "최소화";
  styleButton(minimizeButton, "outline");

  const closeButton = documentRef.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "닫기";
  styleButton(closeButton, "outline");
  closeButton.addEventListener("click", () => {
    panel.classList.add("wf-panel-closed");
    mergePanelState(windowRef, { open: false });
  });

  const pageSizeSelectSource = findGoodsListPageSizeSelect(documentRef);
  if (pageSizeSelectSource) {
    for (const option of readGoodsListPageSizeOptions(pageSizeSelectSource)) {
      const opt = documentRef.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      opt.selected = option.value === pageSizeSelectSource.value;
      pageSizeSelect.appendChild(opt);
    }
  } else {
    pageSizeSelect.disabled = true;
    const opt = documentRef.createElement("option");
    opt.textContent = "건수 선택 불가";
    pageSizeSelect.appendChild(opt);
  }

  header.append(
    accentBar,
    title,
    pageSizeSelect,
    extractButton,
    themeToggleButton,
    minimizeButton,
    closeButton,
  );

  const status = documentRef.createElement("div");
  status.style.cssText =
    "padding:0 16px 12px;color:var(--wf-muted);font-size:13px;border-bottom:1px solid var(--wf-border)";
  status.textContent =
    "‘원문 상품명 추출’을 누르면 상품명에 가나/한자가 남아있는 미번역 상품만 선택한 건수만큼 불러옵니다.";

  // ── 툴바: 브레드크럼 + 보기 필터 + 상품리스트/휴지통 이동 ──────────────────
  const toolbar = documentRef.createElement("div");
  toolbar.className = "wf-bar";
  toolbar.style.cssText = "padding:11px 16px;border-bottom:1px solid var(--wf-border)";

  const breadcrumb = documentRef.createElement("span");
  breadcrumb.className = "wf-crumb";
  const crumbMango = documentRef.createElement("span");
  crumbMango.textContent = "더망고";
  const crumbSep1 = documentRef.createElement("span");
  crumbSep1.textContent = "›";
  const crumbGoods = documentRef.createElement("span");
  crumbGoods.textContent = "상품관리";
  const crumbSep2 = documentRef.createElement("span");
  crumbSep2.textContent = "›";
  const crumbPill = documentRef.createElement("span");
  crumbPill.className = "wf-crumb-pill";
  const crumbDot = documentRef.createElement("span");
  crumbDot.className = "wf-crumb-dot";
  crumbPill.append(crumbDot, "원문상품명 추출");
  breadcrumb.append(crumbMango, crumbSep1, crumbGoods, crumbSep2, crumbPill);

  const toolbarSpacer = documentRef.createElement("span");
  toolbarSpacer.className = "wf-spacer";

  // 보기 필터: 더망고 검색 파라미터 ps_fn으로 전환한다.
  //   미번역(상품명 미수정) 상품 보기 = ps_fn=nomodifygoods 로 검색
  //   전체 상품 보기               = ps_fn 파라미터 없이 검색
  // 현재 모드는 URL에서 읽고, 클릭하면 반대 모드 URL로 페이지를 이동한다
  // (패널 상태는 sessionStorage로 유지되므로 이동 후에도 열린 채 복원된다).
  const UNMODIFIED_FILTER_PARAM = "ps_fn";
  const UNMODIFIED_FILTER_VALUE = "nomodifygoods";
  const showOnlyUntranslated =
    new URLSearchParams(windowRef.location.search).get(UNMODIFIED_FILTER_PARAM) ===
    UNMODIFIED_FILTER_VALUE;

  const filterButton = documentRef.createElement("button");
  filterButton.type = "button";
  filterButton.title = "보기 필터";
  styleButton(filterButton, "outline");
  // 라벨은 '누르면 이동할 보기'를 표시한다 — 미번역 목록을 보는 중이면 '전체 상품 보기'.
  filterButton.textContent = showOnlyUntranslated ? "전체 상품 보기" : "미번역 상품 보기";
  filterButton.addEventListener("click", () => {
    const url = new URL(windowRef.location.href);
    if (showOnlyUntranslated) {
      url.searchParams.delete(UNMODIFIED_FILTER_PARAM);
    } else {
      url.searchParams.set(UNMODIFIED_FILTER_PARAM, UNMODIFIED_FILTER_VALUE);
    }
    windowRef.location.assign(url.toString());
  });

  const toolbarDivider = documentRef.createElement("span");
  toolbarDivider.style.cssText = "width:1px;height:22px;background:var(--wf-border);flex-shrink:0";

  const listNavButton = documentRef.createElement("button");
  listNavButton.type = "button";
  listNavButton.textContent = "상품리스트로 가기";
  styleButton(listNavButton, "outline");
  listNavButton.addEventListener("click", () => {
    windowRef.location.assign("/mall/admin/admin_goods.php");
  });

  const trashNavButton = documentRef.createElement("button");
  trashNavButton.type = "button";
  trashNavButton.textContent = "휴지통으로 가기";
  styleButton(trashNavButton, "outline-danger");
  trashNavButton.addEventListener("click", () => {
    // 화면에 이미 있는 '휴지통(삭제된 상품)' 버튼을 그대로 클릭한다(URL 규칙을 추측하지 않음).
    const trigger = Array.from(
      documentRef.querySelectorAll<HTMLElement>("a, button, [onclick]"),
    ).find((el) => !panel.contains(el) && (el.textContent ?? "").includes("휴지통"));
    if (trigger) {
      trigger.click();
    } else {
      status.textContent = "화면에서 '휴지통' 버튼을 찾지 못했습니다. 이미 휴지통 화면일 수 있습니다.";
    }
  });

  toolbar.append(breadcrumb, toolbarSpacer, filterButton, toolbarDivider, listNavButton, trashNavButton);

  const tableWrap = documentRef.createElement("div");
  tableWrap.className = "wf-body";
  tableWrap.style.cssText = "padding:0 16px 12px";

  const batchBar = documentRef.createElement("div");
  batchBar.className = "wf-bar";
  batchBar.style.cssText = "padding:14px 16px;border-top:1px solid var(--wf-border)";

  const modelLabel = documentRef.createElement("span");
  modelLabel.textContent = "번역 모델";
  modelLabel.style.cssText = "color:var(--wf-muted);font-weight:700";

  const modelSelect = documentRef.createElement("select");
  modelSelect.className = "wf-select";
  for (const modelOption of BATCH_MODEL_OPTIONS) {
    const opt = documentRef.createElement("option");
    opt.value = modelOption;
    opt.textContent = modelOption;
    opt.selected = modelOption === DEFAULT_BATCH_MODEL;
    modelSelect.appendChild(opt);
  }

  // margin-left:auto는 호스트 리셋에 무력화되므로 wf-spacer(flex:1 !important)로
  // 오른쪽 정렬을 만든다.
  const batchBarSpacer = documentRef.createElement("span");
  batchBarSpacer.className = "wf-spacer";

  const selectionCountLabel = documentRef.createElement("span");
  selectionCountLabel.style.cssText = "color:var(--wf-muted)";
  const selectionCountNumber = documentRef.createElement("strong");
  selectionCountNumber.style.cssText = "color:var(--wf-blue-fg);font-weight:700;font-size:15px";
  selectionCountNumber.textContent = "0건";
  selectionCountLabel.append(selectionCountNumber, " 선택됨");

  const batchTranslateButton = documentRef.createElement("button");
  batchTranslateButton.type = "button";
  batchTranslateButton.textContent = "일괄번역";
  styleButton(batchTranslateButton, "outline-primary");

  // 선택적용: 체크된 상품만 / 일괄적용: 체크 여부와 무관하게 불러온 전체.
  const selectedApplyButton = documentRef.createElement("button");
  selectedApplyButton.type = "button";
  selectedApplyButton.textContent = "선택적용";
  styleButton(selectedApplyButton, "outline-success");

  const batchApplyButton = documentRef.createElement("button");
  batchApplyButton.type = "button";
  batchApplyButton.textContent = "일괄적용";
  styleButton(batchApplyButton, "success");

  batchBar.append(
    modelLabel,
    modelSelect,
    batchBarSpacer,
    selectionCountLabel,
    batchTranslateButton,
    selectedApplyButton,
    batchApplyButton,
  );

  // ── 진행 표시: 추출/번역/적용 작업 중에만 보인다 ──────────────────────────
  const progressWrap = documentRef.createElement("div");
  progressWrap.className = "wf-progress-wrap wf-hidden";
  progressWrap.style.cssText = "padding:12px 16px;border-bottom:1px solid var(--wf-border)";

  const progressHead = documentRef.createElement("div");
  progressHead.className = "wf-bar";
  progressHead.style.cssText = "padding:0 0 10px";

  const progressSpinner = documentRef.createElement("span");
  progressSpinner.className = "wf-spinner";

  const progressLabel = documentRef.createElement("strong");
  progressLabel.style.cssText = "font-size:13.5px;font-weight:700;color:var(--wf-text)";

  const progressSub = documentRef.createElement("span");
  progressSub.className = "wf-progress-sub";

  const progressHeadSpacer = documentRef.createElement("span");
  progressHeadSpacer.className = "wf-spacer";

  const progressPct = documentRef.createElement("span");
  progressPct.style.cssText = "font-size:13px;font-weight:800;color:var(--wf-blue-fg)";

  progressHead.append(progressSpinner, progressLabel, progressSub, progressHeadSpacer, progressPct);

  const progressTrack = documentRef.createElement("div");
  progressTrack.className = "wf-progress-track";
  const progressFill = documentRef.createElement("div");
  progressFill.className = "wf-progress-fill";
  progressTrack.appendChild(progressFill);

  progressWrap.append(progressHead, progressTrack);

  // 실수로 누르는 것을 막기 위해 번역/적용 바와는 배경색으로 시각적으로 분리해둔다.
  const dangerBar = documentRef.createElement("div");
  dangerBar.className = "wf-bar";
  dangerBar.style.cssText =
    "padding:14px 16px;border-top:1px solid var(--wf-danger-border);background:var(--wf-danger-soft)";

  const dangerBadge = documentRef.createElement("span");
  dangerBadge.className = "wf-warn-badge";
  dangerBadge.textContent = "⚠ 위험 작업";

  const dangerText = documentRef.createElement("span");
  dangerText.textContent = "더망고 실제 상품에 즉시 반영됩니다. 되돌릴 수 없습니다.";
  dangerText.style.cssText = "color:var(--wf-muted);font-size:13px";

  const bulkDeleteButton = documentRef.createElement("button");
  bulkDeleteButton.type = "button";
  // 상품관리(선택삭제)/휴지통(선택 영구삭제) 중 현재 화면에 실제로 있는 쪽을 미리 표시해둔다.
  // 클릭 시점에는 handleBulkDelete가 다시 감지하므로 여기서 못 찾아도 동작에는 영향 없다.
  bulkDeleteButton.textContent = detectMangoSelectedDeleteAction(documentRef)?.label ?? "선택삭제";
  styleButton(bulkDeleteButton, "danger");

  const dangerBarSpacer = documentRef.createElement("span");
  dangerBarSpacer.className = "wf-spacer";

  dangerBar.append(dangerBadge, dangerText, dangerBarSpacer, bulkDeleteButton);

  panel.append(header, toolbar, progressWrap, status, tableWrap, batchBar, dangerBar);
  documentRef.body.appendChild(panel);

  // 같은 탭에서 페이지를 이동한 경우 이전 열림/최소화/위치/크기 상태를 복원한다.
  const persisted = readPanelState(windowRef);

  // 초기 위치는 화면 정가운데(이전 상태가 있으면 그 위치). left/top 좌표 앵커로 두어야
  // 어느 쪽 테두리를 끌어도(위/아래/좌/우 + 네 모서리) 그 방향에 맞게 늘고 줄어든다.
  // 주의: display:none 상태에선 rect가 0이 되므로, 반드시 좌표 계산을 마친 뒤에
  // wf-panel-closed(기본 닫힘)를 붙인다. 같은 프레임 안의 동기 작업이라 깜빡임은 없다.
  if (typeof persisted.width === "number" && persisted.width >= MIN_PANEL_WIDTH) {
    panel.style.width = `${Math.min(persisted.width, windowRef.innerWidth - VIEWPORT_MARGIN)}px`;
  }
  if (typeof persisted.height === "number" && persisted.height >= MIN_PANEL_HEIGHT) {
    panel.style.height = `${Math.min(persisted.height, windowRef.innerHeight * 0.9)}px`;
  }
  const initialRect = panel.getBoundingClientRect();
  const initialLeft =
    typeof persisted.left === "number"
      ? Math.max(0, Math.min(persisted.left, windowRef.innerWidth - initialRect.width))
      : Math.max(0, (windowRef.innerWidth - initialRect.width) / 2);
  const initialTop =
    typeof persisted.top === "number"
      ? Math.max(0, Math.min(persisted.top, windowRef.innerHeight - initialRect.height))
      : Math.max(0, (windowRef.innerHeight - initialRect.height) / 2);
  panel.style.left = `${initialLeft}px`;
  panel.style.top = `${initialTop}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";

  // 화면을 가리지 않도록 기본은 닫힌 상태. 확장 팝업의 '번역창 열기'로 열거나,
  // 직전 페이지에서 이미 열려있었으면 그대로 열린 채 복원한다.
  if (!persisted.open) {
    panel.classList.add("wf-panel-closed");
  }

  // 최소화 시 패널을 헤더만 남긴 높이로 접기 위해 드래그로 정한 높이를 따로 보관해둔다.
  let expandedHeight: number | null =
    typeof persisted.height === "number" && persisted.height >= MIN_PANEL_HEIGHT
      ? persisted.height
      : null;

  type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

  const RESIZE_HANDLES: Array<{ direction: ResizeDirection; style: string }> = [
    { direction: "n", style: "top:0;left:10px;right:10px;height:6px;cursor:n-resize" },
    { direction: "s", style: "bottom:0;left:10px;right:10px;height:6px;cursor:s-resize" },
    { direction: "w", style: "left:0;top:10px;bottom:10px;width:6px;cursor:w-resize" },
    { direction: "e", style: "right:0;top:10px;bottom:10px;width:6px;cursor:e-resize" },
    { direction: "nw", style: "top:0;left:0;width:10px;height:10px;cursor:nw-resize" },
    { direction: "ne", style: "top:0;right:0;width:10px;height:10px;cursor:ne-resize" },
    { direction: "sw", style: "bottom:0;left:0;width:10px;height:10px;cursor:sw-resize" },
    { direction: "se", style: "bottom:0;right:0;width:10px;height:10px;cursor:se-resize" },
  ];

  let resizeDrag: {
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    startLeft: number;
    startTop: number;
  } | null = null;

  const resizeHandleElements = RESIZE_HANDLES.map(({ direction, style }) => {
    const handle = documentRef.createElement("div");
    handle.style.cssText = `position:absolute;${style};touch-action:none;z-index:2`;

    handle.addEventListener("pointerdown", (event) => {
      const rect = panel.getBoundingClientRect();
      resizeDrag = {
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        startLeft: rect.left,
        startTop: rect.top,
      };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener("pointermove", (event) => {
      if (!resizeDrag || resizeDrag.direction !== direction) {
        return;
      }
      const dx = event.clientX - resizeDrag.startX;
      const dy = event.clientY - resizeDrag.startY;
      const maxWidth = windowRef.innerWidth - VIEWPORT_MARGIN;
      const maxHeight = windowRef.innerHeight * 0.9;

      let nextWidth = resizeDrag.startWidth;
      let nextLeft = resizeDrag.startLeft;
      if (direction.includes("e")) {
        nextWidth = Math.min(maxWidth, Math.max(MIN_PANEL_WIDTH, resizeDrag.startWidth + dx));
      } else if (direction.includes("w")) {
        nextWidth = Math.min(maxWidth, Math.max(MIN_PANEL_WIDTH, resizeDrag.startWidth - dx));
        nextLeft = resizeDrag.startLeft + (resizeDrag.startWidth - nextWidth);
      }

      let nextHeight = resizeDrag.startHeight;
      let nextTop = resizeDrag.startTop;
      if (direction.includes("s")) {
        nextHeight = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, resizeDrag.startHeight + dy));
      } else if (direction.includes("n")) {
        nextHeight = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, resizeDrag.startHeight - dy));
        nextTop = resizeDrag.startTop + (resizeDrag.startHeight - nextHeight);
      }

      panel.style.width = `${nextWidth}px`;
      panel.style.height = `${nextHeight}px`;
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
    });

    const endDrag = (): void => {
      if (resizeDrag?.direction === direction) {
        resizeDrag = null;
        const rect = panel.getBoundingClientRect();
        mergePanelState(windowRef, {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
      }
    };
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    panel.appendChild(handle);
    return handle;
  });

  // 헤더(빈 공간/제목)를 드래그하면 패널 위치를 옮길 수 있게 한다.
  // 버튼/셀렉트 위에서 누르면 그 컨트롤이 정상 동작해야 하므로 이동은 시작하지 않는다.
  header.style.cursor = "move";
  let moveDrag: { startX: number; startY: number; startLeft: number; startTop: number } | null = null;

  header.addEventListener("pointerdown", (event) => {
    if (event.target !== header && event.target !== title && event.target !== accentBar) {
      return;
    }
    const rect = panel.getBoundingClientRect();
    // 최소화 상태에선 right/bottom 앵커라서, 그대로 left/top을 갱신하면 top+bottom이
    // 동시에 걸려 패널이 세로로 늘어난다. 드래그 시작 시 left/top 앵커로 전환한다.
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    moveDrag = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };
    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  header.addEventListener("pointermove", (event) => {
    if (!moveDrag) {
      return;
    }
    const rect = panel.getBoundingClientRect();
    const maxLeft = Math.max(0, windowRef.innerWidth - rect.width);
    const maxTop = Math.max(0, windowRef.innerHeight - rect.height);
    const nextLeft = Math.min(maxLeft, Math.max(0, moveDrag.startLeft + (event.clientX - moveDrag.startX)));
    const nextTop = Math.min(maxTop, Math.max(0, moveDrag.startTop + (event.clientY - moveDrag.startY)));
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
  });

  const endMoveDrag = (): void => {
    if (moveDrag) {
      moveDrag = null;
      // 최소화 상태에서 옮긴 위치는 저장하지 않는다(펼친 상태 기준 위치만 기억).
      if (!isMinimized) {
        const rect = panel.getBoundingClientRect();
        mergePanelState(windowRef, { left: rect.left, top: rect.top });
      }
    }
  };
  header.addEventListener("pointerup", endMoveDrag);
  header.addEventListener("pointercancel", endMoveDrag);

  let rows: RowState[] = [];

  function updateSelectionCount(): void {
    const count = rows.filter((row) => row.checked).length;
    selectionCountNumber.textContent = `${count}건`;
  }

  // ── 진행 표시 제어. 추출/번역/적용 어떤 작업이든 이 세 함수로 표시한다 ────────
  // isJobRunning은 프로그레스 영역 표시 및 최소화 토글과 연동된다.
  let isJobRunning = false;

  function showJobProgress(
    label: string,
    sub: string,
    options: { indeterminate?: boolean } = {},
  ): void {
    isJobRunning = true;
    progressLabel.textContent = label;
    progressSub.textContent = sub;
    // 총량을 알 수 없는 작업(일괄번역 등)은 퍼센트 대신 바 전체를 깜빡여 표시한다.
    progressWrap.classList.toggle("wf-progress-indeterminate", Boolean(options.indeterminate));
    progressPct.classList.toggle("wf-hidden", Boolean(options.indeterminate));
    if (!options.indeterminate) {
      setJobProgress(0);
    }
    if (!isMinimized) {
      progressWrap.classList.remove("wf-hidden");
    }
  }

  function setJobProgress(percent: number, sub?: string): void {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    progressFill.style.width = `${clamped}%`;
    progressPct.textContent = `${clamped}%`;
    if (sub !== undefined) {
      progressSub.textContent = sub;
    }
  }

  function hideJobProgress(): void {
    isJobRunning = false;
    progressWrap.classList.add("wf-hidden");
  }

  // 행 단위 작업(단건 번역 등)이 renderTable을 거쳐 쓰는 진행 표시 훅.
  // 단건 작업은 총량을 알 수 없으므로 indeterminate로 표시한다.
  const jobProgressHooks: JobProgressHooks = {
    show: (label, sub) => showJobProgress(label, sub, { indeterminate: true }),
    hide: hideJobProgress,
  };

  // 화면 가림 문제는 이제 '기본 닫힘 + 팝업에서 열기'로 해결하므로,
  // 운영자가 직접 연 시점에는 바로 쓸 수 있게 펼쳐진 상태로 보여준다.
  // 페이지 이동으로 다시 마운트된 경우엔 직전의 최소화 상태를 그대로 복원한다.
  let isMinimized = persisted.minimized === true;
  // 최소화 직전의 인라인 width 값(기본 min() 식 또는 리사이즈한 px)과 위치.
  // '원래대로'를 누르면 이 크기/위치로 복원한다. 위치 기록이 없으면(비정상 케이스)
  // 화면 정가운데로 펼친다.
  let expandedWidthStyle: string | null =
    typeof persisted.width === "number" && persisted.width >= MIN_PANEL_WIDTH
      ? `${Math.min(persisted.width, windowRef.innerWidth - VIEWPORT_MARGIN)}px`
      : null;
  let expandedLeft: number | null = typeof persisted.left === "number" ? persisted.left : null;
  let expandedTop: number | null = typeof persisted.top === "number" ? persisted.top : null;
  function applyMinimizedState(): void {
    if (isMinimized) {
      const rect = panel.getBoundingClientRect();
      if (rect.height > 0) {
        expandedHeight = rect.height;
        expandedLeft = rect.left;
        expandedTop = rect.top;
      }
      // 최소화하면 어디에 있었든 화면 우하단 구석에 붙이고,
      // 가로도 헤더 내용 크기에 맞게 줄인다(width:auto = shrink-to-fit).
      expandedWidthStyle = panel.style.width;
      panel.style.width = "auto";
      panel.style.height = "auto";
      panel.style.left = "auto";
      panel.style.top = "auto";
      panel.style.right = "16px";
      panel.style.bottom = "16px";
    } else {
      // 리사이즈한 적이 없으면 기본 크기(화면의 85%, 최대 960px)로 펼친다.
      if (expandedWidthStyle !== null) {
        panel.style.width = expandedWidthStyle;
      }
      const height = expandedHeight ?? Math.min(960, windowRef.innerHeight * 0.85);
      panel.style.height = `${height}px`;
      // 폭 복원 후의 실제 크기로 위치를 보정해야 화면 밖으로 나가지 않는다.
      // 닫힌 상태(rect가 0)에서 마운트 직후 호출될 때는 위치를 건드리지 않는다.
      const rect = panel.getBoundingClientRect();
      if (rect.width > 0) {
        // 최소화 전 위치로 되돌리되(기록이 없으면 화면 정가운데), 화면 밖으로 나가지
        // 않게 좌표를 보정하고 다시 left/top 앵커(드래그/리사이즈 기준 좌표계)로 만든다.
        const desiredLeft = expandedLeft ?? (windowRef.innerWidth - rect.width) / 2;
        const desiredTop = expandedTop ?? (windowRef.innerHeight - height) / 2;
        const left = Math.max(0, Math.min(desiredLeft, windowRef.innerWidth - rect.width - 16));
        const top = Math.max(0, Math.min(desiredTop, windowRef.innerHeight - height - 16));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      }
    }
    status.classList.toggle("wf-hidden", isMinimized);
    toolbar.classList.toggle("wf-hidden", isMinimized);
    tableWrap.classList.toggle("wf-hidden", isMinimized);
    batchBar.classList.toggle("wf-hidden", isMinimized);
    dangerBar.classList.toggle("wf-hidden", isMinimized);
    progressWrap.classList.toggle("wf-hidden", isMinimized || !isJobRunning);
    for (const handle of resizeHandleElements) {
      handle.classList.toggle("wf-hidden", isMinimized);
    }
    minimizeButton.textContent = isMinimized ? "원래대로" : "최소화";
  }
  minimizeButton.addEventListener("click", () => {
    isMinimized = !isMinimized;
    applyMinimizedState();
    mergePanelState(windowRef, { minimized: isMinimized });
  });
  applyMinimizedState();

  pageSizeSelect.addEventListener("change", () => {
    if (!pageSizeSelectSource) {
      return;
    }

    const result = applyGoodsListPageSize(pageSizeSelectSource, pageSizeSelect.value, documentRef);
    status.textContent = result.note;
  });

  extractButton.addEventListener("click", () => {
    void handleExtract();
  });

  async function handleExtract(): Promise<void> {
    extractButton.disabled = true;
    const extractOptions = { includeTranslated: !showOnlyUntranslated };
    const targetNoun = showOnlyUntranslated ? "미번역 상품" : "상품";
    showJobProgress(
      "원문 상품명 추출 중",
      showOnlyUntranslated ? "가나·한자가 남은 미번역 상품을 불러오는 중…" : "전체 상품을 불러오는 중…",
    );
    try {
      const limit = parsePageSizeLimit(pageSizeSelect.value);

      if (limit !== undefined) {
        status.textContent = `${targetNoun} ${limit}건을 채울 때까지 화면을 스크롤합니다...`;
        await scrollUntilRowCount(windowRef, documentRef, {
          targetRowCount: limit,
          countLoadedRows: () => {
            const loaded = extractMangoOriginProducts(documentRef, extractOptions).length;
            // 진행률 = 지금까지 불러온 상품 수 / 가져오기로 한 건수.
            // (무한스크롤은 내려갈 때마다 새로 로드되어 스크롤 위치 기반 비율은
            // 맨 아래 도달 시마다 99%가 되어버리므로 쓰지 않는다.)
            // 조건에 맞는 상품이 목표보다 적으면 끝까지 못 채운 채 완료(100%)로 점프할
            // 수 있는데, 그건 실제 상황(상품이 더 없음)을 그대로 반영한 것이다.
            setJobProgress(Math.min(99, (loaded / limit) * 100));
            return loaded;
          },
        });
      }
      setJobProgress(100);

      const extracted = extractMangoOriginProducts(documentRef, { limit, ...extractOptions });
      const originUrlsByProductId = collectMangoGoodsOriginUrls(documentRef);
      rows = extracted.map((product: MangoOriginProduct) => ({
        productId: product.productId,
        originName: product.originName,
        editedName: product.originName,
        imageUrl: product.imageUrl,
        fallbackManufacturer: product.fallbackManufacturer,
        lastTranslatedName: null,
        originUrl: originUrlsByProductId.get(product.productId) ?? "",
        releaseDate: releaseDateCache.get(product.productId),
        // 실수로 전체선택 상태에서 일괄적용/선택삭제(특히 영구삭제)를 누르는 사고를
        // 막기 위해 기본은 전부 체크 해제 상태로 불러온다.
        checked: false,
        appliedName: null,
      }));

      renderTable(
        documentRef,
        tableWrap,
        rows,
        status,
        () => modelSelect.value,
        updateSelectionCount,
        jobProgressHooks,
      );
      updateSelectionCount();
      status.textContent =
        rows.length > 0
          ? `${targetNoun} ${rows.length}건을 불러왔습니다.`
          : showOnlyUntranslated
            ? "조건(상품명에 가나/한자 있음)에 맞는 상품을 찾지 못했습니다."
            : "불러올 상품을 찾지 못했습니다.";
    } catch (error) {
      status.textContent = `원문 상품명 추출에 실패했습니다: ${
        error instanceof Error ? error.message : String(error)
      }`;
      console.error("[wishfigure] 원문 상품명 추출 실패", error);
    } finally {
      hideJobProgress();
      extractButton.disabled = false;
    }
  }

  batchTranslateButton.addEventListener("click", () => {
    void handleBatchTranslate();
  });

  async function handleBatchTranslate(): Promise<void> {
    if (rows.length === 0) {
      status.textContent = "먼저 '원문 상품명 추출'로 상품을 불러와주세요.";
      return;
    }

    const model = modelSelect.value;
    batchTranslateButton.disabled = true;
    status.textContent = `상품 ${rows.length}건 일괄 번역 중... (모델: ${model})`;
    // 청크 단위로 나눠 보내므로, 완료된 청크만큼 실제 진행률(퍼센트)을 표시한다.
    showJobProgress("일괄 번역 중", `GPT로 상품 ${rows.length}건을 번역하는 중…`);

    try {
      const outcome = await requestMangoTranslation(
        rows.map((row) => ({
          id: row.productId,
          originName: row.originName,
          fallbackManufacturer: row.fallbackManufacturer,
        })),
        model,
        (completedItems, totalItems) => {
          setJobProgress((completedItems / totalItems) * 100);
          status.textContent = `상품 ${completedItems}/${totalItems}건 번역 요청 완료... (모델: ${model})`;
        },
      );

      if (!outcome.ok) {
        status.textContent = outcome.message ?? "일괄 번역에 실패했습니다.";
        return;
      }

      let successCount = 0;
      for (const row of rows) {
        const candidate = outcome.resultsById.get(row.productId)?.candidates[0];
        if (!candidate) {
          continue;
        }

        row.lastTranslatedName = candidate;
        row.editedName = candidate;
        successCount += 1;
      }

      renderTable(
        documentRef,
        tableWrap,
        rows,
        status,
        () => modelSelect.value,
        updateSelectionCount,
        jobProgressHooks,
      );
      updateSelectionCount();

      status.style.whiteSpace = "pre-wrap";
      const partialFailureNote = outcome.message ? `\n⚠ ${outcome.message}` : "";
      status.textContent = `${successCount}/${rows.length}건 번역 완료 | 모델: ${outcome.modelUsed} | ${outcome.usageNote}${partialFailureNote}\n(각 상품의 raw 추출값은 브라우저 콘솔에 출력했습니다.)`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "일괄 번역 요청에 실패했습니다.";
    } finally {
      hideJobProgress();
      batchTranslateButton.disabled = false;
    }
  }

  // 일괄적용: 체크 여부와 무관하게 불러온 상품 전체에 적용.
  batchApplyButton.addEventListener("click", () => {
    void handleApplyMany([...rows], "일괄적용");
  });

  // 선택적용: 왼쪽 체크박스로 선택한 상품에만 적용.
  selectedApplyButton.addEventListener("click", () => {
    const targets = rows.filter((row) => row.checked);
    if (rows.length > 0 && targets.length === 0) {
      status.textContent = "적용할 상품을 왼쪽 체크박스로 선택해주세요.";
      return;
    }
    void handleApplyMany(targets, "선택적용");
  });

  async function handleApplyMany(targets: RowState[], jobLabel: string): Promise<void> {
    if (targets.length === 0) {
      status.textContent = "먼저 '원문 상품명 추출'로 상품을 불러와주세요.";
      return;
    }

    batchApplyButton.disabled = true;
    selectedApplyButton.disabled = true;
    showJobProgress(`${jobLabel} 중`, `더망고 실제 상품에 반영하는 중… 0/${targets.length}건 완료`);

    let successCount = 0;
    let doneCount = 0;

    try {
      for (const row of targets) {
        status.textContent = `[${row.productId}] ${jobLabel} 중...`;
        const result = await applyMangoOriginProductName(row.productId, row.editedName);
        doneCount += 1;
        if (result.ok) {
          row.appliedName = row.editedName;
          successCount += 1;
        }
        setJobProgress(
          (doneCount / targets.length) * 100,
          successCount === doneCount
            ? `더망고 실제 상품에 반영하는 중… ${doneCount}/${targets.length}건 완료`
            : `더망고 실제 상품에 반영하는 중… ${doneCount}/${targets.length}건 처리 (성공 ${successCount})`,
        );
      }

      renderTable(
        documentRef,
        tableWrap,
        rows,
        status,
        () => modelSelect.value,
        updateSelectionCount,
        jobProgressHooks,
      );
      updateSelectionCount();
      status.textContent = `${jobLabel} ${successCount}/${targets.length}건 요청을 전송했습니다. 실제 반영 여부는 화면에서 확인해주세요.`;

      windowRef.alert(
        successCount === targets.length
          ? `${jobLabel} 완료: ${targets.length}건 모두 적용 요청을 전송했습니다.`
          : `${jobLabel} 완료: ${targets.length}건 중 ${successCount}건 성공, ${
              targets.length - successCount
            }건 실패했습니다. 상태 메시지를 확인해주세요.`,
      );
    } finally {
      hideJobProgress();
      batchApplyButton.disabled = false;
      selectedApplyButton.disabled = false;
    }
  }

  bulkDeleteButton.addEventListener("click", () => {
    handleBulkDelete();
  });

  function handleBulkDelete(): void {
    const targets = rows.filter((row) => row.checked);
    if (targets.length === 0) {
      status.textContent =
        rows.length === 0
          ? "먼저 '원문 상품명 추출'로 상품을 불러와주세요."
          : "삭제할 상품을 왼쪽 체크박스로 선택해주세요.";
      return;
    }

    const action = detectMangoSelectedDeleteAction(documentRef);
    if (!action) {
      status.textContent = "'선택삭제'/'선택 영구삭제' 버튼을 찾지 못했습니다. 화면 구조를 확인해주세요.";
      return;
    }

    const confirmMessage =
      action.kind === "permanent"
        ? `[휴지통] 선택한 상품 ${targets.length}개를 영구 삭제합니다.\n복구할 수 없습니다.\n진짜 영구 삭제하시겠습니까?`
        : `선택한 상품 ${targets.length}개를 삭제합니다.\n되돌릴 수 없습니다.\n진짜 삭제하시겠습니까?`;

    const confirmed = windowRef.confirm(confirmMessage);
    if (!confirmed) {
      return;
    }

    const result = applyMangoSelectedDelete(
      targets.map((row) => row.productId),
      documentRef,
    );

    if (result.ok) {
      const deletedIds = new Set(targets.map((row) => row.productId));
      rows = rows.filter((row) => !deletedIds.has(row.productId));
      renderTable(
        documentRef,
        tableWrap,
        rows,
        status,
        () => modelSelect.value,
        updateSelectionCount,
        jobProgressHooks,
      );
      updateSelectionCount();
    }

    status.textContent = result.note;
  }
}

type MangoTranslationOutcomeResult = {
  candidates: string[];
  rawFields: unknown;
};

type MangoTranslationOutcome = {
  ok: boolean;
  message?: string;
  resultsById: Map<string, MangoTranslationOutcomeResult>;
  modelUsed: string;
  usageNote: string;
};

// 한 번의 OpenAI 요청에 싣는 상품 수. 번역기의 출력 토큰 상한(20,000)은 이 규모의
// 배치를 가정한 값이라, 수백~수천 건을 한 요청에 다 실으면 응답이 잘려서
// "JSON을 찾지 못했습니다" 오류가 난다. 그래서 여기서 잘라 여러 요청으로 보낸다.
const TRANSLATION_CHUNK_SIZE = 30;
// OpenAI 요청 동시 수. 지나치게 올리면 rate limit 에 걸린다.
const TRANSLATION_CHUNK_CONCURRENCY = 2;

// 배치("일괄번역")와 한 줄짜리 번역("번역" 버튼) 둘 다 이 함수를 통해 같은
// mango/translate-product-names-batch 엔드포인트를 쓴다(상품 1건짜리 배열도 배치와
// 동일하게 처리됨). 치환/노이즈 제거 DB 전처리와, 결과에 대한 치환 DB 재적용
// (GPT가 브랜드/캐릭터명을 자기 표기로 되돌리는 것 방지)을 여기서 한 번에 처리한다.
// 상품이 TRANSLATION_CHUNK_SIZE 를 넘으면 여러 요청으로 나눠 보내고 결과를 합친다.
async function requestMangoTranslation(
  rawItems: Array<{ id: string; originName: string; fallbackManufacturer?: string }>,
  model: string,
  onProgress?: (completedItems: number, totalItems: number) => void,
): Promise<MangoTranslationOutcome> {
  const [replacementRules, noisePhraseRules, examples] = await Promise.all([
    getMangoNameReplacementRules(),
    getMangoNoisePhraseRules(),
    getMangoTranslationExamples(),
  ]);

  const items = rawItems.map((item) => {
    const replaced = applyMangoNameReplacements(item.originName, replacementRules);
    const preprocessed = stripMangoNoisePhrases(replaced, noisePhraseRules);
    // fallbackManufacturer(화면에 이미 등록된 브랜드명)는 GPT가 상품명에서 제조사를
    // 못 찾았을 때만 그대로 대신 채워지는 값이라, 원문상품명과 달리 치환 DB를 한
    // 번도 거치지 않고 있었다. 여기서도 같은 규칙을 적용해서 브랜드 치환이
    // 안 먹히는(예: "Furyu"가 등록해둔 "후류"로 안 바뀌는) 문제를 막는다.
    // GPT로 보내는 payload에는 안 들어가는 필드라 토큰 비용은 없다.
    const fallbackManufacturer = item.fallbackManufacturer
      ? applyMangoNameReplacements(item.fallbackManufacturer, replacementRules)
      : item.fallbackManufacturer;
    return { id: item.id, originName: preprocessed, fallbackManufacturer };
  });

  // 청크 단위로 나눠 보내고 결과를 합친다. 청크 하나가 실패해도 나머지는 계속
  // 진행해서, 1000건 중 일부 실패가 전체 실패로 번지지 않게 한다.
  const chunks: (typeof items)[] = [];
  for (let start = 0; start < items.length; start += TRANSLATION_CHUNK_SIZE) {
    chunks.push(items.slice(start, start + TRANSLATION_CHUNK_SIZE));
  }

  const resultsById = new Map<string, MangoTranslationOutcomeResult>();
  const usageTotal = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let usageSeen = false;
  let modelUsed = model;
  let completedItems = 0;
  let failedChunkCount = 0;
  let firstErrorMessage: string | undefined;

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor];
      cursor += 1;

      try {
        const response = await chrome.runtime.sendMessage({
          type: "mango/translate-product-names-batch",
          items: chunk,
          model,
          examples,
        });

        if (!response?.ok) {
          throw new Error(response?.message ?? "일괄 번역 요청에 실패했습니다.");
        }

        const results =
          (response.details?.results as
            | Array<{ id: string; candidates: string[]; rawFields: unknown }>
            | undefined) ?? [];
        for (const result of results) {
          resultsById.set(result.id, {
            candidates: result.candidates.map((candidate) =>
              applyMangoNameReplacements(candidate, replacementRules),
            ),
            rawFields: result.rawFields,
          });
        }
        console.debug("[wishfigure] 번역 결과", results);

        modelUsed = (response.details?.modelUsed as string | undefined) ?? model;
        const usage = response.details?.usage as
          | { inputTokens: number; outputTokens: number; totalTokens: number }
          | null
          | undefined;
        if (usage) {
          usageSeen = true;
          usageTotal.inputTokens += usage.inputTokens;
          usageTotal.outputTokens += usage.outputTokens;
          usageTotal.totalTokens += usage.totalTokens;
        }
      } catch (error) {
        failedChunkCount += 1;
        firstErrorMessage ??= error instanceof Error ? error.message : String(error);
        console.debug("[wishfigure] 번역 청크 실패", error);
      } finally {
        completedItems += chunk.length;
        onProgress?.(completedItems, items.length);
      }
    }
  }

  const workerCount = Math.min(TRANSLATION_CHUNK_CONCURRENCY, chunks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (failedChunkCount === chunks.length) {
    return {
      ok: false,
      message: firstErrorMessage,
      resultsById: new Map(),
      modelUsed: model,
      usageNote: "",
    };
  }

  const usageNote = usageSeen
    ? `입력 ${usageTotal.inputTokens} / 출력 ${usageTotal.outputTokens} 토큰(합계 ${usageTotal.totalTokens})`
    : "토큰 사용량 확인 불가";
  // 일부 청크만 실패했으면 성공으로 돌려주되, 사유를 message 로 같이 알린다.
  const message =
    failedChunkCount > 0
      ? `묶음 ${failedChunkCount}/${chunks.length}개 실패: ${firstErrorMessage}`
      : undefined;

  return { ok: true, message, resultsById, modelUsed, usageNote };
}

type JobProgressHooks = {
  show: (label: string, sub: string) => void;
  hide: () => void;
};

function renderTable(
  documentRef: Document,
  container: HTMLElement,
  rows: RowState[],
  status: HTMLElement,
  getSelectedModel: () => string,
  onSelectionChange: () => void,
  jobProgress: JobProgressHooks,
): void {
  container.textContent = "";

  const table = documentRef.createElement("table");
  table.style.cssText = "width:100%;table-layout:fixed";

  const thead = documentRef.createElement("thead");
  thead.innerHTML =
    "<tr>" +
    `<th style="width:3%;text-align:center"><input type="checkbox" data-role="select-all"></th>` +
    `<th style="width:15%">이미지</th>` +
    `<th style="width:7%">상품번호</th>` +
    `<th style="width:8%;text-align:center">발매일</th>` +
    `<th>원문 / 번역 상품명</th>` +
    `<th style="width:19%;text-align:center">적용</th>` +
    "</tr>";

  const selectAllCheckbox = thead.querySelector<HTMLInputElement>('input[data-role="select-all"]');

  const originUrlsByProductId = collectMangoGoodsOriginUrls(documentRef);

  const rowCheckboxes: HTMLInputElement[] = [];

  const tbody = documentRef.createElement("tbody");
  for (const row of rows) {
    const tr = documentRef.createElement("tr");

    const updateRowSelectedStyle = (): void => {
      tr.classList.toggle("wf-row-selected", row.checked);
    };
    updateRowSelectedStyle();

    const checkboxCell = documentRef.createElement("td");
    checkboxCell.style.textAlign = "center";
    const checkbox = documentRef.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = row.checked;
    checkbox.addEventListener("change", () => {
      row.checked = checkbox.checked;
      updateRowSelectedStyle();
      onSelectionChange();
    });
    checkboxCell.appendChild(checkbox);
    rowCheckboxes.push(checkbox);

    const imageCell = documentRef.createElement("td");
    imageCell.style.textAlign = "center";
    if (row.imageUrl) {
      const image = documentRef.createElement("img");
      image.className = "wf-thumb";
      image.src = row.imageUrl;
      image.alt = row.productId;
      image.referrerPolicy = "no-referrer";
      imageCell.appendChild(image);
    } else {
      const placeholder = documentRef.createElement("div");
      placeholder.className = "wf-thumb-empty";
      placeholder.textContent = "상품\n이미지";
      placeholder.style.whiteSpace = "pre-line";
      imageCell.appendChild(placeholder);
    }

    const idCell = documentRef.createElement("td");
    idCell.style.whiteSpace = "nowrap";
    const originUrl = originUrlsByProductId.get(row.productId);
    if (originUrl) {
      const idLink = documentRef.createElement("a");
      idLink.href = originUrl;
      idLink.target = "_blank";
      idLink.rel = "noopener noreferrer";
      idLink.textContent = row.productId;
      idLink.title = "원문사이트로 이동";
      idLink.style.cssText =
        "text-decoration:none;color:var(--wf-blue-fg);font-weight:700;font-size:14px";
      idCell.appendChild(idLink);
    } else {
      idCell.textContent = row.productId;
    }

    // 캐시에 이미 결과가 있으면(같은 상품 재추출 등) 행 상태에 반영해 재조회를 막는다.
    if (row.releaseDate === undefined && releaseDateCache.has(row.productId)) {
      row.releaseDate = releaseDateCache.get(row.productId);
    }
    const releaseCell = documentRef.createElement("td");
    releaseCell.dataset.wfReleaseCell = row.productId;
    releaseCell.style.cssText = "text-align:center;white-space:nowrap";
    releaseCell.textContent = releaseCellText(row);

    const nameCell = documentRef.createElement("td");

    const originLine = documentRef.createElement("div");
    originLine.className = "wf-line wf-line-origin";
    const originLabel = documentRef.createElement("span");
    originLabel.className = "wf-tag";
    originLabel.textContent = "원문";
    const originText = documentRef.createElement("span");
    originText.textContent = row.originName;
    originLine.append(originLabel, originText);

    const translatedLine = documentRef.createElement("div");
    translatedLine.className = "wf-line";
    const translatedLabel = documentRef.createElement("span");
    translatedLabel.className = "wf-tag wf-tag-translated";
    translatedLabel.textContent = "번역";

    const nameInput = documentRef.createElement("input");
    nameInput.type = "text";
    nameInput.value = row.editedName;
    nameInput.addEventListener("input", () => {
      row.editedName = nameInput.value;
      refreshApplyButtonState();
    });
    translatedLine.append(translatedLabel, nameInput);

    nameCell.append(originLine, translatedLine);

    const actionCell = documentRef.createElement("td");
    actionCell.className = "wf-actions";
    actionCell.style.cssText = "text-align:center;white-space:nowrap";

    const translateButton = documentRef.createElement("button");
    translateButton.type = "button";
    // 이미 번역된 행(일괄번역/단건번역 어느 쪽이든)이면 렌더링 시점부터 '대조' 모드로 만든다.
    setTranslateButtonMode(translateButton, row.lastTranslatedName !== null ? "compare" : "translate");
    translateButton.addEventListener("click", () => {
      // 번역 완료 후에는 같은 버튼이 '대조' 모드로 바뀐다.
      // 이때는 번역된 상품명을 구글에 검색하는 창을 새로 연다.
      if (translateButton.dataset.mode === "compare") {
        openGoogleSearch(nameInput.value.trim());
        return;
      }
      void handleSingleTranslate(
        row,
        nameInput,
        translateButton,
        status,
        getSelectedModel,
        refreshApplyButtonState,
        jobProgress,
      );
    });

    const revertButton = documentRef.createElement("button");
    revertButton.type = "button";
    revertButton.textContent = "되돌리기";
    styleButton(revertButton, "outline");
    revertButton.addEventListener("click", () => {
      handleRevert(row, nameInput, status, refreshApplyButtonState);
    });

    const applyButton = documentRef.createElement("button");
    applyButton.type = "button";

    const refreshApplyButtonState = (): void => {
      const applied = row.appliedName !== null && row.appliedName === row.editedName;
      applyButton.textContent = applied ? "적용됨" : "적용";
      applyButton.disabled = applied;
      styleButton(applyButton, applied ? "disabled" : "outline-success");
    };
    refreshApplyButtonState();

    applyButton.addEventListener("click", () => {
      void handleApply(row, applyButton, status, refreshApplyButtonState);
    });

    actionCell.append(translateButton, revertButton, applyButton);

    tr.append(checkboxCell, imageCell, idCell, releaseCell, nameCell, actionCell);
    tbody.appendChild(tr);
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.checked = rows.length > 0 && rows.every((row) => row.checked);
    selectAllCheckbox.addEventListener("change", () => {
      const next = selectAllCheckbox.checked;
      for (const row of rows) {
        row.checked = next;
      }
      for (const checkbox of rowCheckboxes) {
        checkbox.checked = next;
      }
      for (const tr of Array.from(tbody.children)) {
        tr.classList.toggle("wf-row-selected", next);
      }
      onSelectionChange();
    });
  }

  table.append(thead, tbody);
  container.appendChild(table);
  onSelectionChange();

  // 아직 발매일을 모르는 행은 background 를 통해 아마존 페이지에서 읽어온다.
  // 테이블 렌더링을 막지 않도록 백그라운드로 돌고, 도착하는 대로 셀을 채운다.
  void loadPendingReleaseDates(documentRef, rows);
}

function releaseCellText(row: RowState): string {
  if (typeof row.releaseDate === "string") {
    return row.releaseDate;
  }
  if (row.releaseDate === null) {
    return "-";
  }
  return row.originUrl ? "조회 중…" : "-";
}

// 원문사이트 URL이 있는데 아직 발매일을 조회하지 않은 행들을 청크 단위로
// background 에 보낸다. 응답이 오면 캐시/행 상태를 갱신하고, 셀은 (재렌더링으로
// 교체됐을 수 있으므로) data 속성으로 현재 DOM에서 다시 찾아 갱신한다.
async function loadPendingReleaseDates(documentRef: Document, rows: RowState[]): Promise<void> {
  const pending = rows.filter(
    (row) =>
      row.releaseDate === undefined &&
      row.originUrl !== "" &&
      !releaseDateRequestsInFlight.has(row.productId),
  );
  if (pending.length === 0) {
    return;
  }
  for (const row of pending) {
    releaseDateRequestsInFlight.add(row.productId);
  }

  try {
    for (let start = 0; start < pending.length; start += RELEASE_DATE_CHUNK_SIZE) {
      const chunk = pending.slice(start, start + RELEASE_DATE_CHUNK_SIZE);
      let releaseDatesById = new Map<string, string | null>();
      try {
        const response = await chrome.runtime.sendMessage({
          type: "mango/fetch-origin-release-dates",
          items: chunk.map((row) => ({ id: row.productId, url: row.originUrl })),
        });
        const results =
          (response?.ok
            ? (response.details?.results as
                | Array<{ id: string; releaseDate: string | null }>
                | undefined)
            : undefined) ?? [];
        releaseDatesById = new Map(results.map((result) => [result.id, result.releaseDate]));
      } catch (error) {
        // 이 청크만 실패 처리(아래에서 null 로 기록)하고 다음 청크는 계속 진행한다.
        console.debug("[wishfigure] 발매일 조회 실패", error);
      }

      for (const row of chunk) {
        const releaseDate = releaseDatesById.get(row.productId) ?? null;
        row.releaseDate = releaseDate;
        releaseDateCache.set(row.productId, releaseDate);
        releaseDateRequestsInFlight.delete(row.productId);
        const cell = documentRef.querySelector<HTMLElement>(
          `[data-wf-release-cell="${row.productId}"]`,
        );
        if (cell) {
          cell.textContent = releaseCellText(row);
        }
      }
    }
  } finally {
    for (const row of pending) {
      releaseDateRequestsInFlight.delete(row.productId);
    }
  }
}

async function handleSingleTranslate(
  row: RowState,
  nameInput: HTMLInputElement,
  translateButton: HTMLButtonElement,
  status: HTMLElement,
  getSelectedModel: () => string,
  onNameChanged: () => void,
  jobProgress: JobProgressHooks,
): Promise<void> {
  const model = getSelectedModel();
  translateButton.disabled = true;
  status.textContent = `상품번호 ${row.productId} 번역 중... (모델: ${model})`;
  jobProgress.show("번역 중", `상품번호 ${row.productId}를 번역하는 중…`);

  try {
    const outcome = await requestMangoTranslation(
      [
        {
          id: row.productId,
          originName: row.originName,
          fallbackManufacturer: row.fallbackManufacturer,
        },
      ],
      model,
    );

    if (!outcome.ok) {
      status.textContent = `[${row.productId}] ${outcome.message ?? "번역에 실패했습니다."}`;
      return;
    }

    const result = outcome.resultsById.get(row.productId);
    const candidate = result?.candidates[0];
    if (!candidate) {
      status.textContent = `[${row.productId}] 번역 후보를 받지 못했습니다.`;
      return;
    }

    row.lastTranslatedName = candidate;
    row.editedName = candidate;
    nameInput.value = candidate;
    onNameChanged();

    // 번역이 끝났으니 버튼을 '대조'로 바꿔 번역 결과를 구글에서 확인할 수 있게 한다.
    setTranslateButtonMode(translateButton, "compare");

    const rawFieldsNote = `raw: ${JSON.stringify(result?.rawFields ?? null)}`;
    status.style.whiteSpace = "pre-wrap";
    status.textContent = `[${row.productId}] 번역 완료 | 모델: ${outcome.modelUsed} | ${outcome.usageNote}\n${rawFieldsNote}`;
  } catch (error) {
    status.textContent = `[${row.productId}] ${
      error instanceof Error ? error.message : "번역 요청에 실패했습니다."
    }`;
  } finally {
    jobProgress.hide();
    translateButton.disabled = false;
  }
}

/** 번역 버튼과 '대조' 버튼은 같은 버튼이며, 모드에 따라 라벨/스타일만 바뀐다. */
function setTranslateButtonMode(
  button: HTMLButtonElement,
  mode: "translate" | "compare",
): void {
  button.dataset.mode = mode;
  if (mode === "compare") {
    button.textContent = "대조";
    button.title = "번역된 상품명을 구글에서 검색합니다.";
    styleButton(button, "outline-success");
  } else {
    button.textContent = "번역";
    button.title = "";
    styleButton(button, "outline-primary");
  }
}

/** 번역 결과를 구글 검색 창(새 탭)으로 연다. */
function openGoogleSearch(query: string): void {
  if (!query) {
    return;
  }
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function handleApply(
  row: RowState,
  applyButton: HTMLButtonElement,
  status: HTMLElement,
  onApplied: () => void,
): Promise<void> {
  applyButton.disabled = true;
  status.textContent = `상품번호 ${row.productId} 적용 중...`;

  try {
    const result = await applyMangoOriginProductName(row.productId, row.editedName);
    status.textContent = `[${row.productId}] ${result.note}`;
    if (result.ok) {
      row.appliedName = row.editedName;
    }
  } finally {
    onApplied();
  }
}

// 지금 보이는 값이 마지막 번역 결과와 다르면(직접 수정한 경우) 번역 결과로,
// 이미 번역 결과를 보고 있으면(또는 번역한 적이 없으면) 원문으로 되돌린다.
function handleRevert(
  row: RowState,
  nameInput: HTMLInputElement,
  status: HTMLElement,
  onNameChanged: () => void,
): void {
  const target =
    row.lastTranslatedName !== null && nameInput.value !== row.lastTranslatedName
      ? row.lastTranslatedName
      : row.originName;

  row.editedName = target;
  nameInput.value = target;
  onNameChanged();
  status.textContent =
    target === row.lastTranslatedName
      ? `[${row.productId}] 마지막 번역 결과로 되돌렸습니다.`
      : `[${row.productId}] 원문으로 되돌렸습니다.`;
}

function styleButton(button: HTMLButtonElement, variant: ButtonVariant): void {
  button.className = `wf-btn wf-btn-${variant}`;
}

function parsePageSizeLimit(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

// 패널 전용 스코프 스타일시트. 호스트 페이지 CSS가 td/th의 vertical-align 등을
// !important로 리셋해두는 경우가 있어(선택삭제 버튼 이슈와 같은 원인), 우리 쪽도
// 필요한 곳엔 !important를 맞춰 걸어둔다.
function buildScopedStyle(documentRef: Document): HTMLStyleElement {
  const style = documentRef.createElement("style");
  style.textContent = `
    /* 라이트/다크 테마 색상 변수. 패널 루트의 data-theme 속성으로 전환된다. */
    #${PANEL_ID}[data-theme="light"] {
      --wf-bg: #f5f7fa;
      --wf-surface: #ffffff;
      --wf-surface-2: #f2f4f8;
      --wf-border: #e6e9ef;
      --wf-border-strong: #d4d9e2;
      --wf-text: #1a2130;
      --wf-muted: #667085;
      --wf-faint: #97a0b0;
      --wf-blue: #2f6fed;
      --wf-blue-soft: #eef4ff;
      --wf-blue-border: #c3d8fb;
      --wf-blue-fg: #2f6fed;
      --wf-green: #1f9d67;
      --wf-green-soft: #ecf8f1;
      --wf-green-border: #b6e2c9;
      --wf-green-fg: #1f9d67;
      --wf-danger: #d94848;
      --wf-danger-btn: #e05353;
      --wf-danger-soft: #fdeeee;
      --wf-danger-border: #f4d0d0;
    }
    #${PANEL_ID}[data-theme="dark"] {
      --wf-bg: #0e1116;
      --wf-surface: #141821;
      --wf-surface-2: #1f2532;
      --wf-border: #262d3b;
      --wf-border-strong: #333c4d;
      --wf-text: #e7ebf2;
      --wf-muted: #9aa4b6;
      --wf-faint: #626d80;
      --wf-blue: #3b82f6;
      --wf-blue-soft: #16233d;
      --wf-blue-border: #2a4a7a;
      --wf-blue-fg: #7db0fb;
      --wf-green: #22a06b;
      --wf-green-soft: #12281f;
      --wf-green-border: #245c42;
      --wf-green-fg: #5fd6a0;
      --wf-danger: #f26d6d;
      --wf-danger-btn: #dc4b4b;
      --wf-danger-soft: #2a1618;
      --wf-danger-border: #522a2d;
    }

    #${PANEL_ID} *, #${PANEL_ID} *::before, #${PANEL_ID} *::after { box-sizing: border-box; }
    #${PANEL_ID} ::-webkit-scrollbar { width: 10px; height: 10px; }
    #${PANEL_ID} ::-webkit-scrollbar-thumb { background: var(--wf-border-strong); border-radius: 8px; }
    #${PANEL_ID} ::-webkit-scrollbar-track { background: transparent; }

    /* 레이아웃 핵심 속성은 호스트 페이지의 !important 리셋을 이기도록 전부 !important */
    #${PANEL_ID} { display: flex !important; flex-direction: column !important; }
    #${PANEL_ID}.wf-panel-closed { display: none !important; }
    #${PANEL_ID} .wf-bar {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      flex-wrap: wrap !important;
    }
    #${PANEL_ID} .wf-spacer { flex: 1 1 auto !important; }
    #${PANEL_ID} .wf-hidden { display: none !important; }
    #${PANEL_ID} .wf-body {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      overflow: auto !important;
    }
    #${PANEL_ID} .wf-line {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
    }
    #${PANEL_ID} .wf-line input[type="text"] { flex: 1 1 auto !important; }
    #${PANEL_ID} .wf-line-origin {
      align-items: flex-start !important;
      margin-bottom: 6px !important;
      color: var(--wf-muted);
      word-break: break-all;
    }
    #${PANEL_ID} .wf-actions .wf-btn + .wf-btn { margin-left: 8px !important; }

    #${PANEL_ID} .wf-crumb {
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--wf-faint);
    }
    #${PANEL_ID} .wf-crumb-pill {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 4px 11px;
      border-radius: 999px;
      background: var(--wf-blue-soft);
      border: 1px solid var(--wf-blue-border);
      color: var(--wf-blue-fg);
      font-weight: 700;
    }
    #${PANEL_ID} .wf-crumb-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--wf-blue);
      flex-shrink: 0;
    }

    @keyframes wf-spin { to { transform: rotate(360deg); } }
    @keyframes wf-bar-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

    #${PANEL_ID} .wf-spinner {
      width: 16px !important;
      height: 16px !important;
      border-radius: 50%;
      border: 2px solid var(--wf-blue-border);
      border-top-color: var(--wf-blue);
      animation: wf-spin 0.7s linear infinite;
      display: inline-block !important;
      flex-shrink: 0;
    }
    #${PANEL_ID} .wf-progress-sub {
      font-size: 12.5px;
      color: var(--wf-muted);
      animation: wf-bar-pulse 1.4s ease-in-out infinite;
    }
    #${PANEL_ID} .wf-progress-track {
      height: 8px !important;
      width: 100% !important;
      border-radius: 999px;
      background: var(--wf-surface-2);
      overflow: hidden !important;
    }
    #${PANEL_ID} .wf-progress-fill {
      height: 100% !important;
      width: 0%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--wf-blue), #6aa4fb);
      transition: width 0.25s ease;
    }
    #${PANEL_ID} .wf-progress-indeterminate .wf-progress-fill {
      width: 100% !important;
      animation: wf-bar-pulse 1.4s ease-in-out infinite;
    }

    #${PANEL_ID} table {
      border-collapse: collapse !important;
      width: 100% !important;
      table-layout: fixed !important;
    }
    #${PANEL_ID} thead th {
      text-align: left;
      padding: 12px 8px;
      background: var(--wf-bg);
      color: var(--wf-faint);
      font-weight: 700;
      font-size: 12px;
      border-bottom: 1px solid var(--wf-border);
      position: sticky;
      top: 0;
    }
    #${PANEL_ID} tbody td {
      padding: 16px 8px;
      border-bottom: 1px solid var(--wf-border);
      line-height: 1.6;
      font-size: 13px;
      color: var(--wf-text);
      vertical-align: middle !important;
    }
    #${PANEL_ID} tbody tr:hover { background: var(--wf-surface-2); }
    #${PANEL_ID} tbody tr.wf-row-selected { background: var(--wf-blue-soft); }
    #${PANEL_ID} tbody tr.wf-row-selected:hover { background: var(--wf-blue-soft); }

    #${PANEL_ID} .wf-thumb {
      display: block;
      margin: 0 auto;
      width: 100%;
      max-width: 140px;
      height: auto;
      aspect-ratio: 1 / 1;
      object-fit: contain;
      border-radius: 10px;
      border: 1px solid var(--wf-border);
      background: #ffffff;
    }
    #${PANEL_ID} .wf-thumb-empty {
      width: 100%;
      max-width: 140px;
      aspect-ratio: 1 / 1;
      margin: 0 auto;
      border-radius: 10px;
      border: 1px solid var(--wf-border);
      background: var(--wf-surface-2);
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--wf-faint);
      font-size: 11px;
      line-height: 1.3;
    }

    #${PANEL_ID} .wf-tag {
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 9px;
      border-radius: 999px;
      background: var(--wf-surface-2);
      color: var(--wf-muted);
      margin-top: 1px;
    }
    #${PANEL_ID} .wf-tag-translated { background: var(--wf-blue-soft); color: var(--wf-blue-fg); }

    #${PANEL_ID} .wf-warn-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      font-size: 12px;
      font-weight: 700;
      color: var(--wf-danger);
      background: transparent;
      border: 1px solid var(--wf-danger-border);
      border-radius: 999px;
      padding: 4px 11px;
    }

    #${PANEL_ID} input[type="text"] {
      border: 1px solid var(--wf-border-strong);
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 13px;
      color: var(--wf-text);
      background: var(--wf-surface);
      font-family: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    #${PANEL_ID} input[type="text"]:focus {
      outline: none;
      border-color: var(--wf-blue);
      box-shadow: 0 0 0 3px var(--wf-blue-soft);
    }
    #${PANEL_ID} input[type="checkbox"] { width: 15px; height: 15px; accent-color: var(--wf-blue); cursor: pointer; }

    #${PANEL_ID} .wf-select {
      border: 1px solid var(--wf-border-strong);
      border-radius: 8px;
      padding: 7px 12px;
      font-size: 13px;
      color: var(--wf-text);
      font-family: inherit;
      cursor: pointer;
      background: var(--wf-surface-2);
    }

    #${PANEL_ID} .wf-btn {
      border-radius: 9px;
      padding: 9px 18px;
      font-size: 13px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      border: 1px solid transparent;
      transition: filter 0.15s ease, transform 0.05s ease;
      white-space: nowrap;
    }
    #${PANEL_ID} .wf-btn:hover:not(:disabled) { filter: brightness(1.08); }
    #${PANEL_ID} .wf-btn:active:not(:disabled) { filter: brightness(0.92); transform: translateY(1px); }
    #${PANEL_ID} .wf-btn:disabled { cursor: not-allowed; opacity: 0.7; }

    #${PANEL_ID} .wf-btn-primary { background: var(--wf-blue); color: #ffffff; border-color: var(--wf-blue); }
    #${PANEL_ID} .wf-btn-outline {
      background: var(--wf-surface-2);
      color: var(--wf-muted);
      border-color: var(--wf-border-strong);
    }
    #${PANEL_ID} .wf-btn-outline-primary {
      background: var(--wf-blue-soft);
      color: var(--wf-blue-fg);
      border-color: var(--wf-blue-border);
    }
    #${PANEL_ID} .wf-btn-outline-success {
      background: var(--wf-green-soft);
      color: var(--wf-green-fg);
      border-color: var(--wf-green-border);
    }
    #${PANEL_ID} .wf-btn-outline-danger {
      background: var(--wf-danger-soft);
      color: var(--wf-danger);
      border-color: var(--wf-danger-border);
    }
    #${PANEL_ID} .wf-btn-success { background: var(--wf-green); color: #ffffff; border-color: var(--wf-green); }
    #${PANEL_ID} .wf-btn-danger { background: var(--wf-danger-btn); color: #ffffff; border-color: var(--wf-danger-btn); }
    #${PANEL_ID} .wf-btn-disabled {
      background: var(--wf-green-soft);
      color: var(--wf-green-fg);
      border-color: var(--wf-green-border);
      cursor: not-allowed;
      opacity: 0.65;
    }
  `;
  return style;
}
