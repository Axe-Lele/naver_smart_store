// File: apps/desktop-electron/src/renderer/App.tsx
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import type {
  BootState,
  AmazonProductLookupItem,
  HybridBridgeCommandState,
  HybridBridgeState,
  HybridCommandPayload,
  HybridCommandType,
  ProductNameTranslationResultItem,
} from '@smart-store/shared';

import {
  BrandLogo,
  EmptyState,
  StatusBadge,
} from './components.js';
import {
  describeRunEvent,
  describeHybridCommand,
  formatDateTime,
  formatError,
  getChromePageLabel,
  getConnectionLabel,
  getHybridProgress,
  getProgressPhaseLabel,
  getRecommendedNextStep,
  getSessionLabel,
  type NoticeTone,
} from './helpers.js';

type AppInfo = BootState['appInfo'];
type AppSettings = BootState['settings'];
type PreorderRequiredOption = AppSettings['preorderRequiredOptions'][number];
type RunEvent = BootState['eventHistory'][number];
type OperatorTab = 'work' | 'name-change' | 'source' | 'logs' | 'settings';
type ThemeMode = 'light' | 'dark';
type OperatorLogTone = 'info' | 'warn' | 'error' | 'success' | 'neutral';
type OperatorLogEntry = {
  id: string;
  source: string;
  level: string;
  tone: OperatorLogTone;
  createdAt: string;
  message: string;
  context?: Readonly<Record<string, string | number | boolean | null>>;
};

const STOP_COMMAND_TIMEOUT_MS = 3_000;
const THEME_STORAGE_KEY = 'wishfigure-seller-desk-theme';
// 2차 외부 소싱 탭(Amazon 기반)은 아직 운영 흐름에서 쓰지 않으므로 숨깁니다.
// 스마트스토어에서 불러온 상품 목록을 1차 소스로 먼저 사용합니다.
const ENABLE_EXTERNAL_SOURCE_TAB = false;
// 상품명 변경(번역) 기능은 Chrome 확장 쪽으로 옮기는 중이라 데스크톱 탭은 숨긴다.
// 내부 상태/로직은 그대로 두고 탭 노출만 끈다.
const ENABLE_NAME_CHANGE_TAB = false;

type LoadedProduct = {
  productId: string;
  name?: string;
  editUrl?: string;
  channelProductNo?: string;
  originProductNo?: string;
  rowTextPreview?: string;
  sourceVerification?: string;
};

export function App() {
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [hybridState, setHybridState] = useState<HybridBridgeState | null>(null);
  const [eventHistory, setEventHistory] = useState<readonly RunEvent[]>([]);
  const [activeTab, setActiveTab] = useState<OperatorTab>('work');
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [products, setProducts] = useState<readonly LoadedProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<readonly string[]>([]);
  const [nameChangeSelectedProductIds, setNameChangeSelectedProductIds] = useState<
    readonly string[]
  >([]);
  const [nameChangeFilter, setNameChangeFilter] = useState('');
  const [nameChangeDraftText, setNameChangeDraftText] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [sourceInput, setSourceInput] = useState('');
  const [sourceItems, setSourceItems] = useState<readonly AmazonProductLookupItem[]>([]);
  const [sourceNameResults, setSourceNameResults] = useState<
    readonly ProductNameTranslationResultItem[]
  >([]);
  const [loadingSourceItems, setLoadingSourceItems] = useState(false);
  const [generatingSourceNames, setGeneratingSourceNames] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<HybridCommandType | null>(null);
  const lastRespondedCommandRef = useRef<string | null>(null);
  const pendingCommandIdRef = useRef<string | null>(null);
  const pendingCommandTimeoutIdRef = useRef<number | null>(null);
  const ignoredCommandIdsRef = useRef<Set<string>>(new Set());
  const cancelPendingTypeRef = useRef<HybridCommandType | null>(null);

  const activeProgress = useMemo(
    () => getHybridProgress(hybridState?.activeClient?.progress),
    [hybridState],
  );
  const shouldHideProgressResults =
    pendingCommand === 'collect-targets' ||
    pendingCommand === 'start-batch' ||
    activeProgress?.phase === 'collecting';
  const resultByProductId = useMemo(
    () =>
      shouldHideProgressResults
        ? new Map()
        : new Map((activeProgress?.results ?? []).map((result) => [result.productId, result])),
    [activeProgress, shouldHideProgressResults],
  );
  const filteredProducts = useMemo(() => {
    const keyword = productFilter.trim().toLowerCase();
    if (!keyword) {
      return products;
    }

    return products.filter((product) =>
      [
        product.productId,
        product.name,
        product.channelProductNo,
        product.originProductNo,
        product.rowTextPreview,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }, [productFilter, products]);
  const selectedSet = useMemo(
    () => new Set(selectedProductIds),
    [selectedProductIds],
  );
  const nameChangeCandidates = useMemo(
    () => products.filter((product) => hasJapaneseText(product.name)),
    [products],
  );
  const nameChangeFilteredProducts = useMemo(() => {
    const keyword = nameChangeFilter.trim().toLowerCase();
    const source = nameChangeCandidates;

    if (!keyword) {
      return source;
    }

    return source.filter((product) =>
      [
        product.productId,
        product.name,
        product.channelProductNo,
        product.originProductNo,
        product.rowTextPreview,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    );
  }, [nameChangeCandidates, nameChangeFilter]);
  const nameChangeSelectedSet = useMemo(
    () => new Set(nameChangeSelectedProductIds),
    [nameChangeSelectedProductIds],
  );
  const allNameChangeCandidatesSelected =
    nameChangeCandidates.length > 0 &&
    nameChangeSelectedProductIds.length === nameChangeCandidates.length;
  const nameChangeDraftLines = useMemo(
    () =>
      nameChangeDraftText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    [nameChangeDraftText],
  );
  const preorderRequiredOptions = useMemo(
    () => normalizeRequiredOptionsForUi(settings?.preorderRequiredOptions ?? []),
    [settings?.preorderRequiredOptions],
  );
  const hasInvalidRequiredOption = preorderRequiredOptions.some(
    (option) => option.name.trim().length === 0 || option.value.trim().length === 0,
  );
  const requiredOptionsSummary = preorderRequiredOptions
    .map((option) => `${option.name.trim()} / ${option.value.trim()}`)
    .join(', ');
  const completedCount = activeProgress?.completedCount ?? 0;
  const targetCount = activeProgress?.targetCount ?? selectedProductIds.length;
  const latestProgressMessage = activeProgress?.logs.at(-1)?.message;
  const progressLabel = getProgressPhaseLabel(activeProgress?.phase);
  const isCollectingProducts = pendingCommand === 'collect-targets';
  const isStartingBatch = pendingCommand === 'start-batch';
  const isStoppingBatch = pendingCommand === 'stop-batch';
  const isExecutingBatch = activeProgress?.phase === 'executing';
  const isStopped = activeProgress?.phase === 'stopped';
  const isIndeterminateProgress = isCollectingProducts || isStartingBatch || isStoppingBatch;
  const progressPercent =
    targetCount > 0 ? Math.min(100, Math.round((completedCount / targetCount) * 100)) : 0;
  const progressNoteClassName = [
    'progress-note',
    isIndeterminateProgress ? 'progress-note-loading' : '',
    isStopped ? 'progress-note-stopped' : '',
  ].filter(Boolean).join(' ');
  const progressBarWidth = isIndeterminateProgress ? '42%' : `${progressPercent}%`;
  const progressLabelText = isCollectingProducts
    ? '상품 불러오기'
    : isStartingBatch
      ? '작업 시작'
    : isStoppingBatch
      ? '작업 중단'
      : '진행률';
  // 수집 진행 상황: 확장이 페이지 하나를 읽을 때마다 progress(phase=collecting)에
  // 누적 건수와 "N페이지까지 M건" 로그를 남기고, 하트비트로 여기까지 전달된다.
  const collectingCount =
    activeProgress?.phase === 'collecting' ? activeProgress.completedCount : 0;
  const collectingDetailNote =
    isCollectingProducts && activeProgress?.phase === 'collecting'
      ? latestProgressMessage
      : undefined;
  const progressTitleText = isCollectingProducts
    ? collectingCount > 0
      ? `불러오는 중... (${collectingCount}건 읽음)`
      : '불러오는 중...'
    : isStartingBatch
      ? '작업을 시작하는 중...'
    : isStoppingBatch
      ? '중단 중...'
      : isStopped
        ? '중단됨'
        : `${completedCount} / ${targetCount} 완료`;
  const progressDetailText = isCollectingProducts
    ? `작업용 브라우저 탭에서 검색 결과 전체 페이지 상품을 읽고 있습니다.${
        collectingDetailNote ? ` ${collectingDetailNote}` : ''
      }`
    : isStartingBatch
      ? '선택한 상품 작업을 작업용 브라우저 탭으로 보내고 있습니다.'
    : isStoppingBatch
      ? '작업용 브라우저 탭에 중단 요청을 보내고 있습니다.'
      : isStopped
        ? '작업이 중단되었습니다. 다시 실행하면 남은 상품부터 처리합니다.'
        : activeProgress
          ? `${progressLabel} · ${latestProgressMessage ?? '진행 상태 확인 중'} · 최근 업데이트 ${formatDateTime(activeProgress.updatedAt)}`
          : '아직 실행 전입니다.';
  const allProductsSelected =
    products.length > 0 && selectedProductIds.length === products.length;
  const showBlockingProgress =
    isCollectingProducts || isStartingBatch || isStoppingBatch || isExecutingBatch;
  const modalProgressTitle = isExecutingBatch && !pendingCommand
    ? '예약상품 설정 중...'
    : progressTitleText;
  const modalProgressDetail = progressDetailText;
  const modalProgressLabel = isExecutingBatch && !pendingCommand
    ? '작업 진행'
    : progressLabelText;
  const modalProgressBarWidth = isExecutingBatch && !isIndeterminateProgress
    ? `${progressPercent}%`
    : progressBarWidth;
  const modalProgressIsIndeterminate =
    isIndeterminateProgress || (isExecutingBatch && targetCount === 0);
  const activePageUrl = hybridState?.activeClient?.pageUrl.toLowerCase() ?? '';
  const activePageTitle = hybridState?.activeClient?.pageTitle.toLowerCase() ?? '';
  const isLoginPage = activePageUrl.includes('login') || activePageTitle.includes('로그인');
  const hasProductListTab = isProductListBridgeState(hybridState);
  const nextStepText = getRecommendedNextStep({
    connected: Boolean(hybridState?.connected),
    activeClient: hybridState?.activeClient,
    extensionPackageAvailable: hybridState?.extensionPackageAvailable,
    progress: activeProgress,
    productCount: products.length,
    selectedCount: selectedProductIds.length,
    pendingCommand,
  });
  const operatorLogs = useMemo(() => {
    const entries: OperatorLogEntry[] = [
      ...eventHistory.map((event, index) => toRunEventLogEntry(event, index)),
      ...(activeProgress?.logs ?? []).map((log, index) => ({
        id: `progress-${log.timestamp}-${index}`,
        source: '브라우저 확장',
        level: toLogLevelLabel(log.level),
        tone: toLogTone(log.level),
        createdAt: log.timestamp,
        message: toOperatorMessage(log.message),
      })),
    ];
    const lastCommand = hybridState?.lastCommand;

    if (lastCommand) {
      entries.push({
        id: `command-${lastCommand.commandId}-${lastCommand.respondedAt ?? lastCommand.queuedAt}`,
        source: '명령',
        level: toCommandStatusLabel(lastCommand.status),
        tone: lastCommand.status === 'FAILED'
          ? 'error'
          : lastCommand.status === 'COMPLETED'
            ? 'success'
            : 'info',
        createdAt: lastCommand.respondedAt ?? lastCommand.queuedAt,
        message: `${describeHybridCommand(lastCommand.type)} · ${
          lastCommand.message ? toOperatorMessage(lastCommand.message) : '응답 대기 중'
        }`,
      });
    }

    return entries.sort(
      (first, second) => readTimestamp(second.createdAt) - readTimestamp(first.createdAt),
    );
  }, [activeProgress?.logs, eventHistory, hybridState?.lastCommand]);
  const logErrorCount = operatorLogs.filter((entry) => entry.tone === 'error').length;
  const latestLogAt = operatorLogs[0]?.createdAt;
  const progressLogCount = activeProgress?.logs.length ?? 0;
  const readySourceItems = sourceItems.filter(
    (item) => item.status === 'READY' && Boolean(item.title),
  );
  const preorderSourceCount = sourceItems.filter(
    (item) => item.preorderStatus === 'PREORDER_LIKELY',
  ).length;
  const sourceNamesById = useMemo(
    () => new Map(sourceNameResults.map((item) => [item.id, item])),
    [sourceNameResults],
  );

  useEffect(() => {
    void bootApplication();

    const intervalId = window.setInterval(() => {
      void refreshHybridState();
    }, 2_000);

    return () => {
      window.clearInterval(intervalId);
      clearPendingCommandTimeout();
    };
  }, []);

  useEffect(() => {
    return window.desktopApi.events.subscribe((event) => {
      setEventHistory((current) => [event, ...current].slice(0, 300));
    });
  }, []);

  // 상품 목록 화면을 감지해도 자동으로 수집하지 않는다.
  // 수집은 운영자가 '상품 불러오기' 버튼을 눌렀을 때만 시작한다.

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme persistence is optional; the selected mode still applies in memory.
    }
  }, [theme]);

  useEffect(() => {
    const lastCommand = hybridState?.lastCommand;
    if (!lastCommand?.respondedAt) {
      return;
    }

    const key = `${lastCommand.commandId}:${lastCommand.status}:${lastCommand.respondedAt}`;
    if (lastRespondedCommandRef.current === key) {
      return;
    }

    lastRespondedCommandRef.current = key;

    if (ignoredCommandIdsRef.current.has(lastCommand.commandId)) {
      ignoredCommandIdsRef.current.delete(lastCommand.commandId);
      if (pendingCommandIdRef.current === lastCommand.commandId) {
        clearPendingCommandTimeout();
        pendingCommandIdRef.current = null;
      }
      return;
    }

    setPendingCommand((current) =>
      current === lastCommand.type ? null : current,
    );
    if (pendingCommandIdRef.current === lastCommand.commandId) {
      clearPendingCommandTimeout();
      pendingCommandIdRef.current = null;
    }

    if (lastCommand.status === 'FAILED') {
      setNotice({
        tone: 'error',
        text: toOperatorMessage(lastCommand.message),
      });
      return;
    }

    if (lastCommand.type === 'collect-targets') {
      const loadedProducts = readProductsFromResponse(lastCommand.response);
      const nameChangeCandidateIds = loadedProducts
        .filter((product) => hasJapaneseText(product.name))
        .map((product) => product.productId);
      setProducts(loadedProducts);
      setSelectedProductIds(loadedProducts.map((product) => product.productId));
      setNameChangeSelectedProductIds(nameChangeCandidateIds);
      setNotice({
        tone: loadedProducts.length > 0 ? 'success' : 'error',
        text:
          loadedProducts.length > 0
            ? `전체 페이지에서 상품 ${loadedProducts.length}건을 불러왔습니다. 상품명 변경 후보 ${nameChangeCandidateIds.length}건을 자동 선별했습니다.`
            : '불러온 상품이 없습니다. 묶음배송 검색 결과 화면을 확인해 주세요.',
      });
      return;
    }

    if (lastCommand.type === 'start-batch') {
      setNotice({
        tone: 'success',
        text: lastCommand.message ?? '선택한 상품의 예약구매 설정을 시작했습니다.',
      });
      return;
    }

    if (lastCommand.type === 'stop-batch' || lastCommand.type === 'resume-batch') {
      setNotice({
        tone: 'info',
        text: lastCommand.message ?? `${describeHybridCommand(lastCommand.type)} 요청을 처리했습니다.`,
      });
      return;
    }

    setNotice({
      tone: 'success',
      text: lastCommand.message ?? `${describeHybridCommand(lastCommand.type)} 작업이 끝났습니다.`,
    });
  }, [hybridState?.lastCommand]);

  async function bootApplication(): Promise<void> {
    try {
      const bootState = await window.desktopApi.app.getBootState();
      startTransition(() => {
        setAppInfo(bootState.appInfo);
        setSettings(bootState.settings);
        setEventHistory(bootState.eventHistory);
        setSettingsDirty(false);
      });
      await refreshHybridState();
      setNotice({
        tone: 'info',
        text: '작업용 브라우저를 열고 전용 프로필에서 직접 로그인한 뒤, 상품 조회/수정 화면에서 상품 불러오기를 누르면 됩니다.',
      });
    } catch (error) {
      showError(error);
    } finally {
      setBooting(false);
    }
  }

  async function refreshHybridState(): Promise<void> {
    try {
      setHybridState(await window.desktopApi.hybrid.getState());
    } catch (error) {
      showError(error);
    }
  }

  async function sendHybridCommand(
    type: HybridCommandType,
    payload?: HybridCommandPayload,
  ): Promise<HybridBridgeCommandState | null> {
    clearPendingCommandTimeout();
    setPendingCommand(type);
    pendingCommandIdRef.current = null;

    try {
      const queued = await window.desktopApi.hybrid.sendCommand({ type, payload });
      if (cancelPendingTypeRef.current === type) {
        ignoredCommandIdsRef.current.add(queued.commandId);
        cancelPendingTypeRef.current = null;
        setPendingCommand((current) => (current === type ? null : current));
        await refreshHybridState();
        return queued;
      }

      if (queued.status === 'FAILED' || !queued.targetClientId) {
        if (queued.status !== 'FAILED') {
          ignoredCommandIdsRef.current.add(queued.commandId);
        }
        setPendingCommand((current) => (current === type ? null : current));
        pendingCommandIdRef.current = null;
        clearPendingCommandTimeout();
        await refreshHybridState();
        setNotice({
          tone: 'error',
          text:
            queued.message ??
            '연결된 판매자센터 상품 목록 탭이 없어 요청을 시작하지 않았습니다.',
        });
        return queued;
      }

      pendingCommandIdRef.current = queued.commandId;
      scheduleCommandResponseTimeout(type, queued.commandId);
      await refreshHybridState();
      setNotice({
        tone: 'info',
        text: queued.targetClientId
          ? `${describeHybridCommand(type)} 요청을 작업용 브라우저 탭으로 보냈습니다.`
          : '판매자센터 탭이 연결되면 요청이 자동으로 전달됩니다.',
      });
      return queued;
    } catch (error) {
      setPendingCommand(null);
      pendingCommandIdRef.current = null;
      clearPendingCommandTimeout();
      if (cancelPendingTypeRef.current === type) {
        cancelPendingTypeRef.current = null;
      }
      showError(error);
      return null;
    }
  }

  function scheduleCommandResponseTimeout(
    type: HybridCommandType,
    commandId: string,
  ): void {
    if (type !== 'stop-batch') {
      return;
    }

    pendingCommandTimeoutIdRef.current = window.setTimeout(() => {
      pendingCommandTimeoutIdRef.current = null;

      if (pendingCommandIdRef.current !== commandId) {
        return;
      }

      pendingCommandIdRef.current = null;
      setPendingCommand((current) => (current === type ? null : current));
      setNotice({
        tone: 'error',
        text: '중단 요청에 3초 동안 응답이 없습니다. 확장프로그램이 꺼졌거나 작업용 브라우저 탭 연결이 끊겼을 수 있습니다. 판매자센터 탭을 새로고침한 뒤 상태를 확인해 주세요.',
      });
      void refreshHybridState();
    }, STOP_COMMAND_TIMEOUT_MS);
  }

  function clearPendingCommandTimeout(): void {
    if (pendingCommandTimeoutIdRef.current === null) {
      return;
    }

    window.clearTimeout(pendingCommandTimeoutIdRef.current);
    pendingCommandTimeoutIdRef.current = null;
  }

  function handleCancelLoadProducts(): void {
    if (pendingCommand !== 'collect-targets') {
      return;
    }

    const commandId = pendingCommandIdRef.current;
    if (commandId) {
      ignoredCommandIdsRef.current.add(commandId);
    } else {
      cancelPendingTypeRef.current = 'collect-targets';
    }
    pendingCommandIdRef.current = null;
    setPendingCommand(null);
    setNotice({
      tone: 'info',
      text: '상품 불러오기를 중지했습니다. 늦게 도착한 결과는 화면에 반영하지 않습니다.',
    });
  }

  async function handleLoadProducts(): Promise<void> {
    if (!(await requireProductListTab('상품을 불러오려면'))) {
      return;
    }

    if (isLoginPage) {
      setNotice({
        tone: 'error',
        text: '작업용 브라우저 탭이 아직 로그인 화면입니다. 판매자센터 로그인을 끝낸 뒤 상품 조회/수정 화면에서 다시 눌러 주세요.',
      });
      return;
    }

    setNotice({
      tone: 'info',
      text: '작업용 브라우저 판매자센터 화면에서 상품을 읽고 있습니다. 잠시만 기다려 주세요.',
    });
    await sendHybridCommand('collect-targets');
  }

  async function handleRunSelected(): Promise<void> {
    if (selectedProductIds.length === 0) {
      setNotice({
        tone: 'error',
        text: '예약상품으로 설정할 상품을 하나 이상 체크해 주세요.',
      });
      return;
    }

    if (!(await requireProductListTab('작업을 시작하려면'))) {
      return;
    }

    const requiredOptions = getRunnableRequiredOptions();
    if (!requiredOptions) {
      return;
    }

    if (settingsDirty) {
      const saved = await saveRequiredOptions(requiredOptions, false);
      if (!saved) {
        return;
      }
    }

    const confirmed = window.confirm(
      [
        `선택한 상품 ${selectedProductIds.length}건을 예약상품으로 설정합니다.`,
        '',
        '설정 내용:',
        '- 예약구매 사용',
        '- 주문기간 최대값',
        '- 종료 후 판매상태: 판매중',
        '- 발송완료일 최대값',
        `- 필수 옵션 ${requiredOptions.length}개: ${requiredOptions.map((option) => `${option.name} / ${option.value}`).join(', ')}`,
        '',
        '계속할까요?',
      ].join('\n'),
    );
    if (!confirmed) {
      setNotice({
        tone: 'info',
        text: '실행을 취소했습니다. 상품 체크 상태를 다시 확인한 뒤 시작할 수 있습니다.',
      });
      return;
    }

    await sendHybridCommand('start-batch', {
      selectedProductIds: [...selectedProductIds],
      preorderRequiredOptions: requiredOptions,
    });
  }

  function updateRequiredOption(
    index: number,
    field: keyof PreorderRequiredOption,
    value: string,
  ): void {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      const nextOptions = normalizeRequiredOptionsForUi(current.preorderRequiredOptions);
      nextOptions[index] = {
        ...nextOptions[index],
        [field]: value,
      };

      return {
        ...current,
        preorderRequiredOptions: nextOptions,
      };
    });
    setSettingsDirty(true);
  }

  function addRequiredOption(): void {
    setSettings((current) =>
      current
        ? {
            ...current,
            preorderRequiredOptions: [
              ...normalizeRequiredOptionsForUi(current.preorderRequiredOptions),
              { name: '', value: '' },
            ],
          }
        : current,
    );
    setSettingsDirty(true);
  }

  function removeRequiredOption(index: number): void {
    setSettings((current) => {
      if (!current) {
        return current;
      }

      const nextOptions = normalizeRequiredOptionsForUi(current.preorderRequiredOptions)
        .filter((_, optionIndex) => optionIndex !== index);

      return {
        ...current,
        preorderRequiredOptions:
          nextOptions.length > 0
            ? nextOptions
            : [{ name: '해외 유통구조상 예약캔슬 불가', value: '동의합니다.' }],
      };
    });
    setSettingsDirty(true);
  }

  async function handleSaveSettings(): Promise<void> {
    const requiredOptions = getRunnableRequiredOptions();
    if (!requiredOptions) {
      return;
    }

    await saveRequiredOptions(requiredOptions, true);
  }

  async function saveRequiredOptions(
    requiredOptions: readonly PreorderRequiredOption[],
    showSuccessNotice: boolean,
  ): Promise<boolean> {
    if (!settings) {
      setNotice({
        tone: 'error',
        text: '설정 정보를 아직 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
      return false;
    }

    setSavingSettings(true);
    try {
      const saved = await window.desktopApi.app.updateSettings({
        ...settings,
        preorderRequiredOptions: [...requiredOptions],
      });
      setSettings(saved);
      setSettingsDirty(false);
      if (showSuccessNotice) {
        setNotice({
          tone: 'success',
          text: '상세설정을 저장했습니다. 다음 실행부터 이 옵션 목록을 사용합니다.',
        });
      }
      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setSavingSettings(false);
    }
  }

  function getRunnableRequiredOptions(): PreorderRequiredOption[] | null {
    if (preorderRequiredOptions.length === 0 || hasInvalidRequiredOption) {
      setNotice({
        tone: 'error',
        text: '상세설정의 필수 옵션명과 옵션값을 모두 입력해 주세요.',
      });
      return null;
    }

    return preorderRequiredOptions.map((option) => ({
      name: option.name.trim(),
      value: option.value.trim(),
    }));
  }

  async function requireProductListTab(prefix: string): Promise<boolean> {
    try {
      const latestState = await window.desktopApi.hybrid.getState();
      setHybridState(latestState);
      if (isProductListBridgeState(latestState)) {
        return true;
      }

      const pageRole = latestState.activeClient?.pageRole;
      const pageUrl = latestState.activeClient?.pageUrl.toLowerCase() ?? '';
      const pageTitle = latestState.activeClient?.pageTitle.toLowerCase() ?? '';
      const isCurrentLoginPage =
        pageRole === 'login' || pageUrl.includes('login') || pageTitle.includes('로그인');
      setPendingCommand(null);
      pendingCommandIdRef.current = null;
      setNotice({
        tone: 'error',
        text: isCurrentLoginPage
          ? `${prefix} 작업용 브라우저에서 로그인을 끝낸 뒤 상품 조회/수정 화면을 열어 주세요.`
          : `${prefix} 작업용 브라우저의 상품 조회/수정 탭을 열고 Ctrl+R로 새로고침해 주세요.`,
      });
      return false;
    } catch (error) {
      setPendingCommand(null);
      pendingCommandIdRef.current = null;
      showError(error);
      return false;
    }
  }

  async function handleOpenSellerCenter(): Promise<void> {
    try {
      await window.desktopApi.hybrid.openSellerCenter();
      setNotice({
        tone: 'success',
        text: '작업용 브라우저 창을 열었습니다. 앱 전용 프로필에서 직접 로그인한 뒤 상품 조회/수정 화면을 확인해 주세요.',
      });
    } catch (error) {
      showError(error);
    }
  }

  async function handleOpenCafe24Admin(): Promise<void> {
    try {
      await window.desktopApi.hybrid.openCafe24Admin();
      setNotice({
        tone: 'success',
        text: '작업용 브라우저에서 cafe24 관리자 로그인 페이지를 열었습니다. 로그인을 끝내면 상품 관리 화면으로 자동 이동합니다.',
      });
    } catch (error) {
      showError(error);
    }
  }

  async function handleExtensionSetupHelper(): Promise<void> {
    if (!hybridState) {
      setNotice({
        tone: 'error',
        text: '확장 폴더 위치를 아직 확인하지 못했습니다. 잠시 후 다시 눌러 주세요.',
      });
      return;
    }

    try {
      await window.desktopApi.system.copyText({
        text: hybridState.extensionBuildPath,
      });
      await window.desktopApi.system.openPath({
        targetPath: hybridState.extensionBuildPath,
      });
      await window.desktopApi.hybrid.openChromeExtensions();
      setNotice({
        tone: 'success',
        text:
          '작업용 브라우저를 다시 열고 번들 확장을 자동 로드했습니다. 직접 로드가 필요하면 복사된 폴더 경로 자체를 선택해 주세요.',
      });
    } catch (error) {
      showError(error);
    }
  }

  async function handleCopyTranslatedName(name: string): Promise<void> {
    try {
      await window.desktopApi.system.copyText({ text: name });
      setNotice({
        tone: 'success',
        text: '상품명을 클립보드에 복사했습니다.',
      });
    } catch (error) {
      showError(error);
    }
  }

  async function handleLookupAmazonProducts(): Promise<void> {
    const sources = readSourceQueries(sourceInput);
    if (sources.length === 0) {
      setNotice({
        tone: 'error',
        text: '조회할 Amazon URL 또는 ASIN을 한 줄 이상 입력해 주세요.',
      });
      return;
    }

    if (sources.length > 10) {
      setNotice({
        tone: 'error',
        text: 'Amazon 상품 조회는 한 번에 10건까지 처리할 수 있습니다.',
      });
      return;
    }

    setLoadingSourceItems(true);
    setSourceNameResults([]);
    try {
      const result = await window.desktopApi.amazon.lookupProducts({
        queries: sources.map((source) => ({ source })),
      });
      setSourceItems(result.items);
      setNotice({
        tone: result.items.some((item) => item.status === 'READY') ? 'success' : 'error',
        text: `Amazon 상품 ${result.items.length}건을 조회했습니다. 사용 가능한 상품 ${result.items.filter((item) => item.status === 'READY').length}건`,
      });
    } catch (error) {
      showError(error);
    } finally {
      setLoadingSourceItems(false);
    }
  }

  async function handleGenerateSourceNames(): Promise<void> {
    if (readySourceItems.length === 0) {
      setNotice({
        tone: 'error',
        text: '상품명 후보를 만들 수 있는 Amazon 조회 결과가 없습니다.',
      });
      return;
    }

    setGeneratingSourceNames(true);
    try {
      const result = await window.desktopApi.productNames.translate({
        items: readySourceItems.map((item) => ({
          id: item.id,
          title: item.title ?? '',
          brand: item.brand,
          manufacturer: item.manufacturer,
          categoryHint: item.category ?? '피규어',
          releaseDate: item.releaseDate,
          features: item.features.slice(0, 6),
        })),
        candidateCount: 3,
        maxNameLength: 100,
        forbiddenTerms: [],
      });
      setSourceNameResults(result.items);
      setNotice({
        tone: 'success',
        text: `조회 결과 기반 상품명 후보 ${result.items.length}건을 만들었습니다.`,
      });
    } catch (error) {
      showError(error);
    } finally {
      setGeneratingSourceNames(false);
    }
  }

  function showError(error: unknown): void {
    setNotice({
      tone: 'error',
      text: toOperatorMessage(formatError(error)),
    });
  }

  function toggleProduct(productId: string): void {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function toggleAllProducts(): void {
    setSelectedProductIds(
      allProductsSelected ? [] : products.map((product) => product.productId),
    );
  }

  function toggleNameChangeProduct(productId: string): void {
    setNameChangeSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function toggleAllNameChangeCandidates(): void {
    setNameChangeSelectedProductIds(
      allNameChangeCandidatesSelected
        ? []
        : nameChangeCandidates.map((product) => product.productId),
    );
  }

  function handlePrepareNameChangeAi(): void {
    const selectedProducts = getNameChangeSelectedProducts();
    setNameChangeDraftText(
      selectedProducts
        .map((product) => product.name ?? product.rowTextPreview ?? '')
        .filter((name) => name.trim().length > 0)
        .join('\n'),
    );
    setNotice({
      tone: 'info',
      text: `선택한 ${selectedProducts.length}건의 스마트스토어 상품명을 1차 소스로 넣었습니다. 한 줄씩 수정한 뒤 적용할 수 있습니다.`,
    });
  }

  function handleApplyNameChangeDraft(): void {
    if (nameChangeSelectedProductIds.length === 0) {
      setNotice({
        tone: 'error',
        text: '상품명 변경 대상을 먼저 선택해 주세요.',
      });
      return;
    }

    if (nameChangeDraftLines.length !== nameChangeSelectedProductIds.length) {
      setNotice({
        tone: 'error',
        text: `선택 상품 ${nameChangeSelectedProductIds.length}건과 가공 상품명 ${nameChangeDraftLines.length}줄이 일치해야 합니다.`,
      });
      return;
    }

    setNotice({
      tone: 'success',
      text: `가공 상품명 ${nameChangeDraftLines.length}건을 적용 대기 상태로 확인했습니다. 다음 단계에서 스마트스토어 상품명 변경 실행에 연결합니다.`,
    });
  }

  function getNameChangeSelectedProducts(): LoadedProduct[] {
    const selected = new Set(nameChangeSelectedProductIds);
    return nameChangeCandidates.filter((product) => selected.has(product.productId));
  }

  if (booting || !appInfo) {
    return (
      <div className="boot-screen" data-theme={theme}>
        <div className="boot-card boot-brand-card">
          <BrandLogo subtitle="SELLER DESK" />
          <h1>Wishfigure Seller Desk</h1>
          <p>작업 화면을 준비하고 있습니다.</p>
        </div>
      </div>
    );
  }

  const isExecuting = activeProgress?.phase === 'executing';
  const isCommandBusy = Boolean(pendingCommand);
  const isBusy = isCommandBusy || isExecuting;
  const connectionLabel = getConnectionLabel(Boolean(hybridState?.connected));
  const chromePageLabel = getChromePageLabel({
    connected: Boolean(hybridState?.connected),
    activeClient: hybridState?.activeClient,
  });

  // 새 디자인의 진행률 게이지/레일 상태 표시용 파생값.
  const progressResults = shouldHideProgressResults ? [] : (activeProgress?.results ?? []);
  const succeededCount = progressResults.filter((result) => result.state === 'SUCCEEDED').length;
  const failedResultCount = progressResults.filter(
    (result) => result.state === 'FAILED' || result.state === 'STOPPED',
  ).length;
  const remainingCount = Math.max(0, targetCount - completedCount);
  const inFlightCount = isExecuting ? remainingCount : 0;
  const isFinishedRun =
    targetCount > 0 && completedCount >= targetCount && !isExecuting && !isCommandBusy;
  const gaugeStatusLabel = isExecuting
    ? '설정 중'
    : isCollectingProducts
      ? '불러오는 중'
      : isStopped
        ? '중단됨'
        : isFinishedRun
          ? '완료'
          : '대기';
  const gaugeStatusTone =
    isExecuting || isCollectingProducts
      ? 'amber'
      : isFinishedRun
        ? 'success'
        : isStopped
          ? 'danger'
          : 'neutral';
  const railStatusLabel = isExecuting
    ? '작업 실행 중'
    : hybridState?.connected
      ? '브라우저 대기'
      : '연결 대기';
  const railStatusTone = isExecuting ? 'amber' : hybridState?.connected ? 'ok' : 'off';
  const metricCards = [
    { label: '불러온 상품', value: products.length, accent: 'text' },
    { label: '설정 대상', value: selectedProductIds.length, accent: 'primary' },
    { label: '완료', value: completedCount, accent: 'text' },
    { label: '남은 대상', value: remainingCount, accent: 'muted' },
  ] as const;

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="rail">
        <div className="rail-brand">
          <div className="rail-brand-mark" aria-hidden="true">W</div>
          <div className="rail-brand-copy">
            <strong>Wishfigure</strong>
            <small>SELLER DESK</small>
          </div>
        </div>
        <span className="rail-version">
          버전 {appInfo.version} · {appInfo.packaged ? '설치형' : '개발 모드'}
        </span>

        <div className="rail-menu-label">메뉴</div>
        <nav className="rail-nav" aria-label="운영 화면">
          <button
            type="button"
            className={`rail-nav-item${activeTab === 'work' ? ' active' : ''}`}
            aria-current={activeTab === 'work' ? 'page' : undefined}
            onClick={() => setActiveTab('work')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M8 12l2.6 2.6L16 9" /></svg>
            <span>작업</span>
            <span className="rail-badge mono">{selectedProductIds.length}</span>
          </button>
          <button
            type="button"
            className={`rail-nav-item${activeTab === 'logs' ? ' active' : ''}`}
            aria-current={activeTab === 'logs' ? 'page' : undefined}
            onClick={() => setActiveTab('logs')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="5" y1="7" x2="19" y2="7" /><line x1="5" y1="12" x2="19" y2="12" /><line x1="5" y1="17" x2="13" y2="17" /></svg>
            <span>로그</span>
            <span className="rail-badge mono">{operatorLogs.length}</span>
          </button>
          {ENABLE_NAME_CHANGE_TAB ? (
            <button
              type="button"
              className={`rail-nav-item${activeTab === 'name-change' ? ' active' : ''}`}
              aria-current={activeTab === 'name-change' ? 'page' : undefined}
              onClick={() => setActiveTab('name-change')}
            >
              <span>상품명 변경</span>
              <span className="rail-badge mono">{nameChangeCandidates.length}</span>
            </button>
          ) : null}
          {ENABLE_EXTERNAL_SOURCE_TAB ? (
            <button
              type="button"
              className={`rail-nav-item${activeTab === 'source' ? ' active' : ''}`}
              aria-current={activeTab === 'source' ? 'page' : undefined}
              onClick={() => setActiveTab('source')}
            >
              <span>소싱</span>
              <span className="rail-badge mono">{sourceItems.length}</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`rail-nav-item${activeTab === 'settings' ? ' active' : ''}`}
            aria-current={activeTab === 'settings' ? 'page' : undefined}
            onClick={() => setActiveTab('settings')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="4" y1="8" x2="20" y2="8" /><circle cx="9" cy="8" r="2.6" fill="var(--rail)" /><line x1="4" y1="16" x2="20" y2="16" /><circle cx="15" cy="16" r="2.6" fill="var(--rail)" /></svg>
            <span>설정</span>
          </button>
        </nav>

        <div className="rail-spacer" />

        <div className="rail-status-card">
          <div className="rail-status-line">
            <span className={`rail-status-dot ${railStatusTone}`} aria-hidden="true" />
            {railStatusLabel}
          </div>
          <div className="rail-status-sub">{connectionLabel} · {chromePageLabel}</div>
          <button type="button" onClick={() => void handleOpenSellerCenter()}>
            작업용 브라우저 열기
          </button>
        </div>

        <button
          type="button"
          className="rail-theme-toggle"
          aria-pressed={theme === 'dark'}
          onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? '☀ 라이트 모드' : '☾ 다크 모드'}
        </button>
      </aside>

      <div className="content-area">
      {notice ? (
        <div className={`notice notice-${notice.tone}`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)}>
            닫기
          </button>
        </div>
      ) : null}
      {activeTab === 'work' ? (
        <div className="page">
          <p className="page-eyebrow">예약구매 설정 작업</p>
          <div className="hero-row">
            <section className="hero-card">
              <h1>예약상품으로 설정</h1>
              <p className="hero-desc">
                묶음배송 검색 결과 전체 페이지를 불러와 선택한 상품을 예약구매 상품으로 일괄 전환합니다.
              </p>
              <div className="next-step-chip" aria-live="polite">
                <span>다음 할 일</span>
                <strong>{nextStepText}</strong>
              </div>
              <div className="hero-spacer" />
              <div className="hero-actions">
                <button
                  type="button"
                  className="run-button"
                  disabled={isBusy || selectedProductIds.length === 0 || !hasProductListTab}
                  onClick={() => void handleRunSelected()}
                >
                  {isStartingBatch ? <span className="spinner" aria-hidden="true" /> : null}
                  {isStartingBatch ? '작업을 시작하는 중…' : '예약상품으로 설정'}
                </button>
                <button
                  type="button"
                  className="hero-secondary-button"
                  disabled={isBusy}
                  onClick={() => void handleLoadProducts()}
                >
                  {pendingCommand === 'collect-targets'
                    ? '불러오는 중...'
                    : products.length > 0
                      ? '전체 다시 불러오기'
                      : '전체 페이지 상품 불러오기'}
                </button>
                {isExecuting || pendingCommand === 'start-batch' ? (
                  <button
                    type="button"
                    className="hero-danger-button"
                    disabled={pendingCommand === 'stop-batch'}
                    onClick={() => void sendHybridCommand('stop-batch')}
                  >
                    {pendingCommand === 'stop-batch' ? '중단 중...' : '중단'}
                  </button>
                ) : null}
              </div>
            </section>

            <section className="gauge-card">
              <div className="gauge-card-head">
                <span>진행률</span>
                <span className={`status-chip tone-${gaugeStatusTone}`}>{gaugeStatusLabel}</span>
              </div>
              <div
                className="gauge"
                role="img"
                aria-label={`진행률 ${progressPercent}%`}
                style={{
                  background: `conic-gradient(var(--primary) ${progressPercent}%, var(--ring-track) 0)`,
                }}
              >
                <div className="gauge-inner">
                  <div className="gauge-pct mono">
                    {progressPercent}
                    <span>%</span>
                  </div>
                  <div className="gauge-count mono">
                    {completedCount} / {targetCount}
                  </div>
                </div>
              </div>
              <div className="gauge-legend">
                <div className="gauge-legend-row">
                  <span className="legend-label"><span className="legend-dot dot-primary" aria-hidden="true" />완료</span>
                  <strong className="mono">{succeededCount}</strong>
                </div>
                <div className="gauge-legend-row">
                  <span className="legend-label"><span className="legend-dot dot-amber" aria-hidden="true" />처리중</span>
                  <strong className="mono">{inFlightCount}</strong>
                </div>
                <div className="gauge-legend-row">
                  <span className="legend-label"><span className="legend-dot dot-danger" aria-hidden="true" />오류</span>
                  <strong className="mono">{failedResultCount}</strong>
                </div>
              </div>
            </section>
          </div>

          <div className="metric-grid">
            {metricCards.map((card) => (
              <div className="metric-card" key={card.label}>
                <span>{card.label}</span>
                <strong className={`mono accent-${card.accent}`}>{card.value.toLocaleString()}</strong>
              </div>
            ))}
          </div>

          <section className="table-card">
            <div className="table-card-head">
              <div className="table-card-title">
                <strong>설정 대상 상품</strong>
                <span>제외할 상품은 체크를 해제하세요</span>
              </div>
              <div className="table-card-tools">
                <div className="search-box">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" /></svg>
                  <input
                    value={productFilter}
                    placeholder="상품번호·상품명 검색"
                    onChange={(event) => setProductFilter(event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="table-tool-button"
                  disabled={products.length === 0}
                  onClick={toggleAllProducts}
                >
                  {allProductsSelected ? '전체 해제' : '전체 선택'}
                </button>
              </div>
            </div>
            {products.length === 0 ? (
              <EmptyState
                title="상품을 불러오세요"
                description="작업용 브라우저의 상품 조회/수정 화면에서 묶음배송 검색 후, 전체 페이지 상품 불러오기를 누르세요."
              />
            ) : (
              <>
                <div className="product-table-wrap">
                  <table className="product-table">
                    <thead>
                      <tr>
                        <th className="col-check">선택</th>
                        <th className="col-id">상품번호</th>
                        <th>상품명</th>
                        <th className="col-status">상태</th>
                        <th className="col-msg">메시지</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product) => {
                        const result = resultByProductId.get(product.productId);
                        const stateLabel = result ? toStateLabel(result.state) : '대기';
                        const stateTone = result ? toStateTone(result.state) : 'neutral';
                        return (
                          <tr key={product.productId}>
                            <td className="col-check">
                              <input
                                type="checkbox"
                                checked={selectedSet.has(product.productId)}
                                onChange={() => toggleProduct(product.productId)}
                              />
                            </td>
                            <td className="col-id mono">{product.productId}</td>
                            <td>{product.name ?? '-'}</td>
                            <td className="col-status">
                              <span className={`pill tone-${stateTone}`}>{stateLabel}</span>
                            </td>
                            <td className={`col-msg${stateTone === 'danger' ? ' msg-danger' : ''}`}>
                              {result ? toOperatorMessage(result.message) : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="table-card-foot">
                  전체 {products.length}건 중 {filteredProducts.length}건 표시 · 실행 시 선택한 대상에 순차 적용됩니다
                </div>
              </>
            )}
          </section>
        </div>
      ) : ENABLE_NAME_CHANGE_TAB && activeTab === 'name-change' ? (
        <main className="operator-main operator-main-single">
          <section className="operator-workbench name-change-workbench">
            <div className="operator-title-row">
              <div>
                <p className="eyebrow">스마트스토어 1차 소스</p>
                <h1>상품명 변경</h1>
                <p className="muted">
                  스마트스토어에서 불러온 상품 목록을 먼저 기준으로 삼고, 일본어가 포함된 상품명만 가공 대상으로 선별합니다.
                </p>
              </div>
              <div className="button-row wrap">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleOpenCafe24Admin()}
                >
                  작업용 브라우저
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isBusy}
                  onClick={() => void handleLoadProducts()}
                >
                  {pendingCommand === 'collect-targets'
                    ? '불러오는 중...'
                    : products.length > 0
                      ? '상품 다시 불러오기'
                      : '상품 불러오기'}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={nameChangeSelectedProductIds.length === 0}
                  onClick={handlePrepareNameChangeAi}
                >
                  선택 상품 1차 소스 준비
                </button>
              </div>
            </div>

            {notice ? (
              <div className={`notice notice-${notice.tone}`}>
                <span>{notice.text}</span>
                <button type="button" onClick={() => setNotice(null)}>
                  닫기
                </button>
              </div>
            ) : null}

            <section className="next-step-strip" aria-live="polite">
              <span>1차 소스 흐름</span>
              <strong>스마트스토어 상품명을 먼저 정리하고, 필요한 상품만 다음 가공 단계로 넘깁니다.</strong>
            </section>

            <section className="operator-summary-grid">
              <div className="summary-tile">
                <span>전체 상품</span>
                <strong>{products.length}건</strong>
              </div>
              <div className="summary-tile">
                <span>일본어 포함</span>
                <strong>{nameChangeCandidates.length}건</strong>
              </div>
              <div className="summary-tile">
                <span>가공 대상</span>
                <strong>{nameChangeSelectedProductIds.length}건</strong>
              </div>
              <div className="summary-tile">
                <span>AI 호출 예상</span>
                <strong>{nameChangeSelectedProductIds.length}건 이하</strong>
              </div>
            </section>

            <section className="operator-actions">
              <input
                className="product-filter"
                value={nameChangeFilter}
                placeholder="상품번호나 원문 상품명 검색"
                onChange={(event) => setNameChangeFilter(event.target.value)}
              />
              <div className="operator-button-group">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={nameChangeCandidates.length === 0}
                  onClick={toggleAllNameChangeCandidates}
                >
                  {allNameChangeCandidatesSelected ? '후보 전체 해제' : '후보 전체 선택'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={products.length === 0}
                  onClick={() =>
                    setNameChangeSelectedProductIds(
                      products
                        .filter((product) => hasJapaneseText(product.name))
                        .map((product) => product.productId),
                    )
                  }
                >
                  일본어 상품 재선별
                </button>
              </div>
              <p className="selection-hint">
                {products.length === 0
                  ? '상품을 불러오면 일본어가 포함된 상품명만 자동으로 후보가 됩니다.'
                  : nameChangeCandidates.length > 0
                    ? `일본어 포함 상품 ${nameChangeCandidates.length}건 중 ${nameChangeSelectedProductIds.length}건이 선택되어 있습니다.`
                    : '일본어가 포함된 상품명이 없습니다.'}
              </p>
            </section>

            <section className="name-change-grid">
              <section className="product-list-card">
                {products.length === 0 ? (
                  <EmptyState
                    title="상품을 불러오세요"
                    description="상품 조회/수정 화면에서 전체 페이지 상품을 불러오면 스마트스토어 상품명을 1차 소스로 사용합니다."
                  />
                ) : nameChangeCandidates.length === 0 ? (
                  <EmptyState
                    title="가공 후보가 없습니다"
                    description="현재 불러온 상품명에는 히라가나/가타카나가 포함된 상품이 없습니다."
                  />
                ) : (
                  <div className="simple-table-wrap">
                    <table className="simple-product-table name-change-table">
                      <thead>
                        <tr>
                          <th>선택</th>
                          <th>상품번호</th>
                          <th>현재 상품명</th>
                          <th>판정</th>
                        </tr>
                      </thead>
                      <tbody>
                        {nameChangeFilteredProducts.map((product) => (
                          <tr key={product.productId}>
                            <td>
                              <input
                                type="checkbox"
                                checked={nameChangeSelectedSet.has(product.productId)}
                                onChange={() => toggleNameChangeProduct(product.productId)}
                              />
                            </td>
                            <td>
                              <strong>{product.productId}</strong>
                            </td>
                            <td>{product.name ?? product.rowTextPreview ?? '-'}</td>
                            <td>
                              <StatusBadge value="일본어 포함" tone="neutral" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="name-change-editor-card">
                <div className="name-change-editor-header">
                  <div>
                    <span className="progress-note-label">가공 상품명</span>
                    <strong>{nameChangeDraftLines.length}줄</strong>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={nameChangeDraftText.trim().length === 0}
                    onClick={handleApplyNameChangeDraft}
                  >
                    적용
                  </button>
                </div>
                <textarea
                  value={nameChangeDraftText}
                  placeholder="선택 상품 1차 소스 준비를 누르면 스마트스토어 상품명이 한 줄씩 들어옵니다."
                  onChange={(event) => setNameChangeDraftText(event.target.value)}
                />
                <p className="muted">
                  한 줄이 선택 상품 한 건입니다. 줄 수가 맞아야 일괄 적용 대기로 넘길 수 있습니다.
                </p>
              </section>
            </section>
          </section>
        </main>
      ) : ENABLE_EXTERNAL_SOURCE_TAB && activeTab === 'source' ? (
        <main className="operator-main operator-main-single">
          <section className="operator-workbench source-workbench">
            <div className="operator-title-row">
              <div>
                <p className="eyebrow">상품정보 소싱</p>
                <h1>Amazon 상품정보</h1>
                <p className="muted">
                  URL/ASIN에서 상품명, 제조사, 발매월, 예약 판단 근거를 가져옵니다.
                </p>
              </div>
              <div className="button-row wrap">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={loadingSourceItems || sourceInput.trim().length === 0}
                  onClick={() => void handleLookupAmazonProducts()}
                >
                  {loadingSourceItems ? '조회 중...' : '상품정보 조회'}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={generatingSourceNames || readySourceItems.length === 0}
                  onClick={() => void handleGenerateSourceNames()}
                >
                  {generatingSourceNames ? '생성 중...' : '상품명 후보 생성'}
                </button>
              </div>
            </div>

            <section className="source-input-card">
              <label className="source-input-field">
                <span>Amazon URL / ASIN</span>
                <textarea
                  value={sourceInput}
                  rows={5}
                  placeholder="https://www.amazon.co.jp/dp/B0H2VYXNX4"
                  disabled={loadingSourceItems}
                  onChange={(event) => setSourceInput(event.target.value)}
                />
              </label>
            </section>

            <section className="operator-summary-grid source-summary-grid">
              <div className="summary-tile">
                <span>조회 결과</span>
                <strong>{sourceItems.length}건</strong>
              </div>
              <div className="summary-tile">
                <span>사용 가능</span>
                <strong>{readySourceItems.length}건</strong>
              </div>
              <div className="summary-tile">
                <span>예약 후보</span>
                <strong>{preorderSourceCount}건</strong>
              </div>
              <div className="summary-tile">
                <span>상품명 후보</span>
                <strong>{sourceNameResults.length}건</strong>
              </div>
            </section>

            <section className="source-result-card">
              {sourceItems.length === 0 ? (
                <EmptyState
                  title="조회된 상품정보가 없습니다"
                  description="Amazon URL 또는 ASIN을 입력하고 상품정보를 조회하세요."
                />
              ) : (
                <div className="source-result-list">
                  {sourceItems.map((item) => {
                    const generatedNames = sourceNamesById.get(item.id)?.candidates ?? [];
                    return (
                      <article className="source-result-item" key={`${item.id}-${item.source}`}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="source-product-image" />
                        ) : (
                          <div className="source-product-image-placeholder" aria-hidden="true" />
                        )}
                        <div className="source-result-body">
                          <div className="source-result-top">
                            <div>
                              <span className="translation-source">
                                {item.asin ?? item.source}
                              </span>
                              <h2>{item.title ?? '상품명 미확인'}</h2>
                            </div>
                            <div className="source-badge-row">
                              <StatusBadge value={toAmazonStatusLabel(item.status)} tone="neutral" />
                              <StatusBadge
                                value={toPreorderStatusLabel(item.preorderStatus)}
                                tone="neutral"
                              />
                            </div>
                          </div>

                          <dl className="source-detail-grid">
                            <div>
                              <dt>브랜드</dt>
                              <dd>{item.brand ?? '-'}</dd>
                            </div>
                            <div>
                              <dt>제조사</dt>
                              <dd>{item.manufacturer ?? '-'}</dd>
                            </div>
                            <div>
                              <dt>발매월</dt>
                              <dd>{item.releaseMonth ?? '-'}</dd>
                            </div>
                            <div>
                              <dt>배송 시작</dt>
                              <dd>
                                {item.shippingStartDate ?? '-'} ·{' '}
                                {toConfidenceLabel(item.shippingStartConfidence)}
                              </dd>
                            </div>
                            <div>
                              <dt>가격/상태</dt>
                              <dd>{[item.priceDisplay, item.availabilityMessage].filter(Boolean).join(' · ') || '-'}</dd>
                            </div>
                            <div>
                              <dt>JAN/EAN</dt>
                              <dd>{item.externalIds.eans[0] ?? '-'}</dd>
                            </div>
                          </dl>

                          {item.features.length > 0 ? (
                            <ul className="source-feature-list">
                              {item.features.slice(0, 3).map((feature) => (
                                <li key={feature}>{feature}</li>
                              ))}
                            </ul>
                          ) : null}

                          {generatedNames.length > 0 ? (
                            <div className="source-name-list">
                              {generatedNames.map((candidate) => (
                                <button
                                  type="button"
                                  className="translation-copy-button"
                                  key={candidate.name}
                                  onClick={() => void handleCopyTranslatedName(candidate.name)}
                                >
                                  {candidate.name}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          {item.warning ? (
                            <p className="settings-warning">{item.warning}</p>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </section>
        </main>
      ) : activeTab === 'settings' ? (
        <div className="page page-narrow">
          <p className="page-eyebrow">환경 설정</p>
          <div className="page-head-row">
            <div>
              <h1>상세설정</h1>
              <p className="page-sub">예약구매 설정에 사용할 필수 옵션과 도움말을 관리합니다.</p>
            </div>
          </div>

          <section className="panel-card">
            <div className="panel-card-head">
              <strong>필수 옵션</strong>
              <button
                type="button"
                className="table-tool-button"
                disabled={preorderRequiredOptions.length >= 20}
                onClick={addRequiredOption}
              >
                추가
              </button>
            </div>
            <div className="required-option-list">
              {preorderRequiredOptions.map((option, index) => (
                <div className="required-option-row" key={`${index}-${option.name}`}>
                  <label>
                    <span>옵션명</span>
                    <input
                      value={option.name}
                      onChange={(event) => updateRequiredOption(index, 'name', event.target.value)}
                    />
                  </label>
                  <label>
                    <span>옵션값</span>
                    <input
                      value={option.value}
                      onChange={(event) => updateRequiredOption(index, 'value', event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={preorderRequiredOptions.length <= 1}
                    onClick={() => removeRequiredOption(index)}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
            <p className={hasInvalidRequiredOption ? 'settings-warning' : 'panel-note'}>
              {hasInvalidRequiredOption
                ? '빈 옵션명이나 옵션값이 있습니다.'
                : `현재 ${preorderRequiredOptions.length}개: ${requiredOptionsSummary}`}
            </p>
            <div className="panel-card-actions">
              <button
                type="button"
                className="run-button compact"
                disabled={savingSettings || hasInvalidRequiredOption || !settingsDirty}
                onClick={() => void handleSaveSettings()}
              >
                {savingSettings ? '저장 중...' : settingsDirty ? '설정 저장' : '저장됨'}
              </button>
            </div>
          </section>

          <h2 className="section-title">사용 순서</h2>
          <section className="panel-card">
            <ol className="step-list">
              <li>
                <span className="step-no">1</span>
                <span>작업용 브라우저를 열고 스마트스토어 판매자센터에 로그인합니다.</span>
              </li>
              <li>
                <span className="step-no">2</span>
                <span>상품 조회/수정에서 묶음배송 검색 결과 페이지를 엽니다.</span>
              </li>
              <li>
                <span className="step-no">3</span>
                <span>전체 페이지 상품 불러오기로 대상 상품을 불러옵니다.</span>
              </li>
              <li>
                <span className="step-no">4</span>
                <span>제외할 상품 체크를 해제한 뒤 예약상품으로 설정을 실행합니다.</span>
              </li>
            </ol>
          </section>

          <section className="panel-card">
            <strong className="panel-title">연결되지 않을 때</strong>
            <p className="panel-note">
              작업용 브라우저는 앱 전용 프로필과 번들 확장을 사용합니다. 연결되지 않으면 상품
              조회/수정 탭을 <b>Ctrl+R</b>로 새로고침하세요.
            </p>
            <div className="panel-card-actions">
              <button
                type="button"
                className="run-button compact"
                onClick={() => void handleExtensionSetupHelper()}
              >
                확장 확인
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="page">
          <p className="page-eyebrow">실행 로그</p>
          <div className="page-head-row">
            <div>
              <h1>작업 로그</h1>
              <p className="page-sub">최근 실행 및 연결 이벤트 · 총 {operatorLogs.length}건</p>
            </div>
            <button type="button" className="table-tool-button" onClick={() => void refreshHybridState()}>
              새로고침
            </button>
          </div>

          <div className="metric-grid">
            <div className="metric-card">
              <span>전체 로그</span>
              <strong className="mono accent-text">{operatorLogs.length}</strong>
            </div>
            <div className="metric-card">
              <span>오류</span>
              <strong className="mono accent-danger">{logErrorCount}</strong>
            </div>
            <div className="metric-card">
              <span>확장 로그</span>
              <strong className="mono accent-text">{progressLogCount}</strong>
            </div>
            <div className="metric-card">
              <span>최근 기록</span>
              <strong className="metric-time">{latestLogAt ? formatDateTime(latestLogAt) : '-'}</strong>
            </div>
          </div>

          <section className="log-card">
            {operatorLogs.length === 0 ? (
              <EmptyState
                title="아직 로그가 없습니다"
                description="상품을 불러오거나 작업을 시작하면 앱/확장 로그가 여기에 쌓입니다."
              />
            ) : (
              <div className="log-list" aria-live="polite">
                {operatorLogs.map((entry) => (
                  <article className={`log-entry tone-${entry.tone}`} key={entry.id}>
                    <time className="mono" dateTime={entry.createdAt}>
                      {formatDateTime(entry.createdAt)}
                    </time>
                    <span className="log-dot" aria-hidden="true" />
                    <div className="log-body">
                      <div className="log-line">
                        <span className="log-tag">{entry.level}</span>
                        <span className="log-source">{entry.source}</span>
                        <span className="log-text">{entry.message}</span>
                      </div>
                      {entry.context && Object.keys(entry.context).length > 0 ? (
                        <dl className="log-context">
                          {Object.entries(entry.context).map(([key, value]) => (
                            <div key={key}>
                              <dt>{key}</dt>
                              <dd>{value === null ? '-' : String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      </div>
      {showBlockingProgress ? (
        <div className="blocking-progress-overlay" role="presentation">
          <section
            className="blocking-progress-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="blocking-progress-title"
            aria-describedby="blocking-progress-detail"
          >
            <span className="blocking-progress-label">{modalProgressLabel}</span>
            <h2 id="blocking-progress-title">{modalProgressTitle}</h2>
            <p id="blocking-progress-detail">{modalProgressDetail}</p>
            <div
              className={`blocking-progress-bar${modalProgressIsIndeterminate ? ' is-indeterminate' : ''}`}
              aria-label={`${modalProgressLabel} 진행률`}
            >
              <span style={{ width: modalProgressBarWidth }} />
            </div>
            <div className="blocking-progress-actions">
              {isCollectingProducts ? (
                <button type="button" className="danger-button" onClick={handleCancelLoadProducts}>
                  불러오기 중지
                </button>
              ) : isExecutingBatch || isStoppingBatch ? (
                <button
                  type="button"
                  className="danger-button"
                  disabled={isStoppingBatch}
                  onClick={() => void sendHybridCommand('stop-batch')}
                >
                  {isStoppingBatch ? '중단 중...' : '중단'}
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function toRunEventLogEntry(event: RunEvent, index: number): OperatorLogEntry {
  if (event.type === 'log') {
    return {
      id: `event-${event.createdAt}-${index}`,
      source: '앱',
      level: toLogLevelLabel(event.level),
      tone: toLogTone(event.level),
      createdAt: event.createdAt,
      message: toOperatorMessage(event.message),
      context: event.context,
    };
  }

  if (event.type === 'job-progress') {
    return {
      id: `event-${event.createdAt}-${event.jobId}-${index}`,
      source: '작업',
      level: '진행',
      tone: 'info',
      createdAt: event.createdAt,
      message: describeRunEvent(event),
      context: {
        jobId: event.jobId,
        totalItems: event.totalItems,
        processedItems: event.processedItems,
      },
    };
  }

  if (event.type === 'job-state') {
    return {
      id: `event-${event.createdAt}-${event.jobId}-${index}`,
      source: '작업',
      level: toBatchStatusLabel(event.status),
      tone: toLogTone(event.status),
      createdAt: event.createdAt,
      message: describeRunEvent(event),
      context: {
        jobId: event.jobId,
      },
    };
  }

  return {
    id: `event-${event.createdAt}-session-${index}`,
    source: '세션',
    level: getSessionLabel(event.status),
    tone: toLogTone(event.status),
    createdAt: event.createdAt,
    message: `${getSessionLabel(event.status)} · ${toOperatorMessage(event.message)}`,
  };
}

function toLogLevelLabel(level: string): string {
  switch (level.toLowerCase()) {
    case 'debug':
      return '디버그';
    case 'info':
      return '정보';
    case 'warn':
    case 'warning':
      return '경고';
    case 'error':
      return '오류';
    default:
      return level;
  }
}

function toBatchStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return '대기';
    case 'RUNNING':
      return '실행 중';
    case 'STOP_REQUESTED':
      return '중단 요청';
    case 'STOPPED':
      return '중단';
    case 'COMPLETED':
    case 'SUCCEEDED':
      return '완료';
    case 'FAILED':
      return '실패';
    default:
      return status;
  }
}

function toCommandStatusLabel(status: HybridBridgeCommandState['status']): string {
  switch (status) {
    case 'QUEUED':
      return '대기';
    case 'COMPLETED':
      return '완료';
    case 'FAILED':
      return '실패';
    default:
      return status;
  }
}

function toLogTone(value: string): OperatorLogTone {
  const normalized = value.toLowerCase();

  if (
    normalized.includes('error') ||
    normalized.includes('fail') ||
    normalized.includes('invalid') ||
    normalized.includes('expired') ||
    normalized.includes('denied')
  ) {
    return 'error';
  }

  if (
    normalized.includes('warn') ||
    normalized.includes('stop') ||
    normalized.includes('challenge') ||
    normalized.includes('login_required') ||
    normalized.includes('missing')
  ) {
    return 'warn';
  }

  if (
    normalized.includes('ready') ||
    normalized.includes('complete') ||
    normalized.includes('success') ||
    normalized.includes('succeed')
  ) {
    return 'success';
  }

  if (normalized.includes('info') || normalized.includes('debug') || normalized.includes('running')) {
    return 'info';
  }

  return 'neutral';
}

function readTimestamp(value: string): number {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function getInitialTheme(): ThemeMode {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function readProductsFromResponse(response: unknown): LoadedProduct[] {
  const details = isRecord(response) ? response.details : undefined;
  if (!isRecord(details)) {
    return [];
  }

  const source = Array.isArray(details.products)
    ? details.products
    : Array.isArray(details.sample)
      ? details.sample
      : [];

  return source
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      productId: String(item.productId ?? '').trim(),
      name: readOptionalString(item.name),
      editUrl: readOptionalString(item.editUrl),
      channelProductNo: readOptionalString(item.channelProductNo),
      originProductNo: readOptionalString(item.originProductNo),
      rowTextPreview: readOptionalString(item.rowTextPreview),
      sourceVerification: readOptionalString(item.sourceVerification),
    }))
    .filter((product) => product.productId.length > 0);
}

function readTranslationTitles(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function hasJapaneseText(name?: string): boolean {
  const value = (name ?? '').trim();
  return /[\u3040-\u30ff]/.test(value);
}

function readSourceQueries(value: string): string[] {
  return [...new Set(readTranslationTitles(value))];
}

function toAmazonStatusLabel(status: AmazonProductLookupItem['status']): string {
  switch (status) {
    case 'READY':
      return '조회 완료';
    case 'MISSING_ASIN':
      return 'ASIN 없음';
    case 'NOT_FOUND':
      return '미검출';
    case 'FAILED':
      return '실패';
    default:
      return status;
  }
}

function toPreorderStatusLabel(
  status: AmazonProductLookupItem['preorderStatus'],
): string {
  switch (status) {
    case 'PREORDER_LIKELY':
      return '예약 후보';
    case 'RELEASED_OR_AVAILABLE':
      return '판매/출고 가능';
    case 'UNKNOWN':
      return '예약 미확인';
    default:
      return status;
  }
}

function toConfidenceLabel(
  confidence: AmazonProductLookupItem['shippingStartConfidence'],
): string {
  switch (confidence) {
    case 'HIGH':
      return '높음';
    case 'MEDIUM':
      return '보통';
    case 'LOW':
      return '낮음';
    case 'UNKNOWN':
      return '미확인';
    default:
      return confidence;
  }
}

function isProductListBridgeState(state: HybridBridgeState | null): boolean {
  const activeClient = state?.activeClient;
  if (!activeClient) {
    return false;
  }

  const pageUrl = activeClient.pageUrl.toLowerCase();
  return (
    activeClient.pageRole === 'product-list' ||
    pageUrl.includes('origin-list') ||
    pageUrl.includes('product-list')
  );
}

// 상태 필(pill) 색상 톤. toStateLabel과 짝을 이룬다.
function toStateTone(state: string): 'success' | 'danger' | 'amber' | 'neutral' {
  switch (state) {
    case 'SUCCEEDED':
      return 'success';
    case 'FAILED':
    case 'STOPPED':
      return 'danger';
    case 'LOCKED_BY_ORDER_PERIOD':
    case 'SKIPPED':
      return 'amber';
    default:
      return 'neutral';
  }
}

function toStateLabel(state: string): string {
  switch (state) {
    case 'SUCCEEDED':
      return '완료';
    case 'FAILED':
      return '실패';
    case 'STOPPED':
      return '중단';
    case 'SKIPPED':
      return '건너뜀';
    case 'LOCKED_BY_ORDER_PERIOD':
      return '변경 불가';
    default:
      return state;
  }
}

function toOperatorMessage(message?: string): string {
  const value = (message ?? '').trim();
  if (!value) {
    return '상세 메시지가 없습니다.';
  }

  if (value.includes('Bundle-delivery filter') || value.includes('묶음배송')) {
    return '묶음배송 검색 조건이 적용되어 있는지 확인해 주세요. 조건이 없으면 전체 상품을 건드릴 위험이 있어 중단합니다.';
  }

  if (value.includes('seller center') || value.includes('판매자센터')) {
    return value.includes('Chrome')
      ? value
      : '작업용 브라우저에서 스마트스토어 판매자센터 상품 조회/수정 화면을 열어 주세요.';
  }

  if (value.includes('Edit URL') || value.includes('수정 화면')) {
    return '상품 수정 화면으로 들어가는 버튼을 찾지 못했습니다. 화면을 새로고침한 뒤 상품을 다시 불러와 주세요.';
  }

  if (value.includes('Target page') || value.includes('frame was detached')) {
    return '작업용 브라우저 탭이 새로고침되거나 이동하면서 연결이 끊겼습니다. 판매자센터 화면을 다시 열고 상품 불러오기를 다시 눌러 주세요.';
  }

  if (value.includes('verification required')) {
    return '현재 화면 구조 확인이 더 필요합니다. 판매자센터 화면이 맞는지, 묶음배송 검색이 적용됐는지 확인해 주세요.';
  }

  return value;
}

function normalizeRequiredOptionsForUi(
  options: readonly PreorderRequiredOption[],
): PreorderRequiredOption[] {
  return options.length > 0
    ? options.map((option) => ({ ...option }))
    : [{ name: '해외 유통구조상 예약캔슬 불가', value: '동의합니다.' }];
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
