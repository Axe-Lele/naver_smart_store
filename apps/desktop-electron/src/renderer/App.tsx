// File: apps/desktop-electron/src/renderer/App.tsx
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';

import type {
  BootState,
  HybridBridgeCommandState,
  HybridBridgeState,
  HybridCommandPayload,
  HybridCommandType,
} from '@smart-store/shared';

import {
  BrandLogo,
  EmptyState,
  StatusBadge,
  VersionPill,
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
type OperatorTab = 'work' | 'logs';
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
  const [productFilter, setProductFilter] = useState('');
  const [pendingCommand, setPendingCommand] = useState<HybridCommandType | null>(null);
  const lastRespondedCommandRef = useRef<string | null>(null);
  const pendingCommandIdRef = useRef<string | null>(null);
  const pendingCommandTimeoutIdRef = useRef<number | null>(null);
  const ignoredCommandIdsRef = useRef<Set<string>>(new Set());
  const cancelPendingTypeRef = useRef<HybridCommandType | null>(null);
  const autoCollectKeyRef = useRef<string | null>(null);

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
  const progressTitleText = isCollectingProducts
    ? '불러오는 중...'
    : isStartingBatch
      ? '작업을 시작하는 중...'
    : isStoppingBatch
      ? '중단 중...'
      : isStopped
        ? '중단됨'
        : `${completedCount} / ${targetCount} 완료`;
  const progressDetailText = isCollectingProducts
    ? '작업용 브라우저 탭에서 검색 결과 전체 페이지 상품을 읽고 있습니다.'
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

  useEffect(() => {
    if (
      booting ||
      pendingCommand ||
      products.length > 0 ||
      activeProgress?.phase === 'executing' ||
      activeProgress?.phase === 'stopped' ||
      !isProductListBridgeState(hybridState)
    ) {
      return;
    }

    const activeClient = hybridState?.activeClient;
    if (!activeClient) {
      return;
    }

    const autoCollectKey = `${activeClient.clientId}:${activeClient.pageUrl}`;
    if (autoCollectKeyRef.current === autoCollectKey) {
      return;
    }

    autoCollectKeyRef.current = autoCollectKey;
    setNotice({
      tone: 'info',
      text: '상품 조회/수정 화면을 감지했습니다. 전체 기간과 묶음배송 가능 조건을 자동 설정한 뒤 상품을 불러옵니다.',
    });
    void sendHybridCommand('collect-targets');
  }, [
    activeProgress?.phase,
    booting,
    hybridState,
    pendingCommand,
    products.length,
  ]);

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
      setProducts(loadedProducts);
      setSelectedProductIds(loadedProducts.map((product) => product.productId));
      setNotice({
        tone: loadedProducts.length > 0 ? 'success' : 'error',
        text:
          loadedProducts.length > 0
            ? `전체 페이지에서 상품 ${loadedProducts.length}건을 불러왔습니다. 제외할 상품만 체크 해제하세요.`
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

  return (
    <div className="operator-shell" data-theme={theme}>
      <header className="operator-header">
        <div className="operator-brand">
          <BrandLogo subtitle="SELLER DESK" compact />
          <VersionPill version={appInfo.version} packaged={appInfo.packaged} />
        </div>
        <div className="operator-header-actions">
          <div className="operator-status-cluster" aria-label="브라우저 연결 상태">
            <StatusBadge value={connectionLabel} tone="session" />
            <StatusBadge value={chromePageLabel} tone="session" />
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleOpenSellerCenter()}
          >
            작업용 브라우저
          </button>
          <button
            type="button"
            className="theme-toggle"
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? '라이트 모드' : '다크 모드'}
          </button>
        </div>
      </header>

      <nav className="operator-tabs" aria-label="운영 화면">
        <button
          type="button"
          className={activeTab === 'work' ? 'active' : ''}
          aria-current={activeTab === 'work' ? 'page' : undefined}
          onClick={() => setActiveTab('work')}
        >
          <span>작업</span>
          <small>{selectedProductIds.length}건 선택</small>
        </button>
        <button
          type="button"
          className={activeTab === 'logs' ? 'active' : ''}
          aria-current={activeTab === 'logs' ? 'page' : undefined}
          onClick={() => setActiveTab('logs')}
        >
          <span>로그</span>
          <small>{operatorLogs.length}개</small>
        </button>
      </nav>

      {activeTab === 'work' ? (
        <main className="operator-main">
          <section className="operator-workbench">
            <div className="operator-title-row">
            <div>
              <p className="eyebrow">예약구매 설정 작업</p>
              <h1>예약상품으로 설정</h1>
              <p className="muted">
                묶음배송 검색 결과 전체 페이지를 불러와 선택한 상품에 적용합니다.
              </p>
            </div>
            <button
              type="button"
              className="primary-button load-button"
              disabled={isBusy}
              onClick={() => void handleLoadProducts()}
            >
              {pendingCommand === 'collect-targets'
                ? '불러오는 중...'
                : products.length > 0
                  ? '전체 페이지 다시 불러오기'
                  : '전체 페이지 상품 불러오기'}
            </button>
          </div>

          <section className="next-step-strip" aria-live="polite">
            <span>다음 할 일</span>
            <strong>{nextStepText}</strong>
          </section>

          {notice ? (
            <div className={`notice notice-${notice.tone}`}>
              <span>{notice.text}</span>
              <button type="button" onClick={() => setNotice(null)}>
                닫기
              </button>
            </div>
          ) : null}

          <section className={progressNoteClassName} aria-busy={isIndeterminateProgress} aria-live="polite">
            <div>
              <span className="progress-note-label">{progressLabelText}</span>
              <strong>{progressTitleText}</strong>
              <p className="muted">{progressDetailText}</p>
            </div>
            <div
              className="progress-note-bar"
              aria-label={isIndeterminateProgress ? `${progressLabelText} 진행률` : '작업 진행률'}
            >
              <span style={{ width: progressBarWidth }} />
            </div>
          </section>

          <section className="operator-summary-grid">
            <div className="summary-tile">
              <span>불러온 상품</span>
              <strong>{products.length}건</strong>
            </div>
            <div className="summary-tile">
              <span>설정 대상</span>
              <strong>{selectedProductIds.length}건</strong>
            </div>
          </section>

          <section className="operator-actions">
            <input
              className="product-filter"
              value={productFilter}
              placeholder="상품번호나 상품명 검색"
              onChange={(event) => setProductFilter(event.target.value)}
            />
            <div className="operator-button-group">
              <button
                type="button"
                className="secondary-button"
                disabled={products.length === 0}
                onClick={toggleAllProducts}
              >
                {allProductsSelected ? '전체 해제' : '전체 선택'}
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={isBusy || selectedProductIds.length === 0 || !hasProductListTab}
                onClick={() => void handleRunSelected()}
              >
                예약상품으로 설정
              </button>
              {activeProgress?.phase === 'executing' || pendingCommand === 'start-batch' ? (
                <button
                  type="button"
                  className="danger-button"
                  disabled={isCommandBusy}
                  onClick={() => void sendHybridCommand('stop-batch')}
                >
                  {pendingCommand === 'stop-batch' ? '중단 중...' : '중단'}
                </button>
              ) : null}
            </div>
            <p className="selection-hint">
              {products.length === 0
                ? '상품을 불러오면 기본으로 전체 선택됩니다.'
                : selectedProductIds.length > 0
                  ? `${selectedProductIds.length}건이 선택되어 있습니다. 제외할 상품은 체크를 해제하세요.`
                  : '선택된 상품이 없습니다.'}
            </p>
          </section>

          <section className="product-list-card">
            {products.length === 0 ? (
              <EmptyState
                title="상품을 불러오세요"
                description="상품 조회/수정 화면에서 묶음배송 검색 후 전체 페이지 상품 불러오기를 누르세요."
              />
            ) : (
              <div className="simple-table-wrap">
                <table className="simple-product-table">
                  <thead>
                    <tr>
                      <th>선택</th>
                      <th>상품번호</th>
                      <th>상품명</th>
                      <th>상태</th>
                      <th>메시지</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => {
                      const result = resultByProductId.get(product.productId);
                      return (
                        <tr key={product.productId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedSet.has(product.productId)}
                              onChange={() => toggleProduct(product.productId)}
                            />
                          </td>
                          <td>
                            <strong>{product.productId}</strong>
                          </td>
                          <td>{product.name ?? '-'}</td>
                          <td>
                            <StatusBadge
                              value={result ? toStateLabel(result.state) : '대기'}
                              tone="neutral"
                            />
                          </td>
                          <td>{result ? toOperatorMessage(result.message) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>

        <aside className="operator-side-panel">
          <section className="side-card">
            <details className="side-details">
              <summary>사용 순서</summary>
              <ol className="simple-step-list">
                <li>작업용 브라우저에서 로그인합니다.</li>
                <li>묶음배송 검색 결과를 엽니다.</li>
                <li>전체 페이지 상품을 불러옵니다.</li>
                <li>제외할 상품 체크를 풉니다.</li>
                <li>예약상품으로 설정합니다.</li>
                <li>선택한 상품만 자동으로 처리합니다.</li>
              </ol>
            </details>
          </section>

          <section className="side-card">
            <details className="settings-details">
              <summary>상세설정</summary>
              <div className="required-option-editor">
                <div className="required-option-header">
                  <span>필수 옵션</span>
                  <button
                    type="button"
                    className="secondary-button small-button"
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
                          onChange={(event) =>
                            updateRequiredOption(index, 'name', event.target.value)
                          }
                        />
                      </label>
                      <label>
                        <span>옵션값</span>
                        <input
                          value={option.value}
                          onChange={(event) =>
                            updateRequiredOption(index, 'value', event.target.value)
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="ghost-button small-button"
                        disabled={preorderRequiredOptions.length <= 1}
                        onClick={() => removeRequiredOption(index)}
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                </div>
                <p className={hasInvalidRequiredOption ? 'settings-warning' : 'muted'}>
                  {hasInvalidRequiredOption
                    ? '빈 옵션명이나 옵션값이 있습니다.'
                    : `현재 ${preorderRequiredOptions.length}개: ${requiredOptionsSummary}`}
                </p>
                <div className="button-row tight wrap">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={savingSettings || hasInvalidRequiredOption || !settingsDirty}
                    onClick={() => void handleSaveSettings()}
                  >
                    {savingSettings ? '저장 중...' : settingsDirty ? '설정 저장' : '저장됨'}
                  </button>
                </div>
              </div>
            </details>
          </section>

          {!hybridState?.connected ? (
            <section className="side-card compact-side-card">
              <h2>연결되지 않을 때</h2>
              <p className="muted">
                작업용 브라우저는 앱 전용 프로필과 번들 확장을 사용합니다. 연결되지 않으면 상품 조회/수정 탭을 Ctrl+R로 새로고침하세요.
              </p>
              <div className="side-button-stack">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleExtensionSetupHelper()}
                >
                  확장 확인
                </button>
              </div>
            </section>
          ) : null}
        </aside>
      </main>
      ) : (
        <main className="operator-main operator-main-single">
          <section className="operator-workbench log-workbench">
            <div className="operator-title-row">
              <div>
                <p className="eyebrow">운영 로그</p>
                <h1>로그</h1>
                <p className="muted">
                  앱 이벤트와 브라우저 확장 진행 로그를 최신순으로 모아 확인합니다.
                </p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void refreshHybridState()}
              >
                새로고침
              </button>
            </div>

            <section className="operator-summary-grid log-summary-grid">
              <div className="summary-tile">
                <span>전체 로그</span>
                <strong>{operatorLogs.length}개</strong>
              </div>
              <div className="summary-tile">
                <span>오류</span>
                <strong>{logErrorCount}개</strong>
              </div>
              <div className="summary-tile">
                <span>확장 로그</span>
                <strong>{progressLogCount}개</strong>
              </div>
              <div className="summary-tile">
                <span>최근 기록</span>
                <strong>{latestLogAt ? formatDateTime(latestLogAt) : '-'}</strong>
              </div>
            </section>

            <section className="log-list-card">
              {operatorLogs.length === 0 ? (
                <EmptyState
                  title="아직 로그가 없습니다"
                  description="상품을 불러오거나 작업을 시작하면 앱/확장 로그가 여기에 쌓입니다."
                />
              ) : (
                <div className="operator-log-list" aria-live="polite">
                  {operatorLogs.map((entry) => (
                    <article
                      className={`operator-log-entry tone-${entry.tone}`}
                      key={entry.id}
                    >
                      <div className="operator-log-entry-top">
                        <div>
                          <span className="operator-log-source">{entry.source}</span>
                          <strong>{entry.level}</strong>
                        </div>
                        <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                      </div>
                      <p>{entry.message}</p>
                      {entry.context && Object.keys(entry.context).length > 0 ? (
                        <dl className="operator-log-context">
                          {Object.entries(entry.context).map(([key, value]) => (
                            <div key={key}>
                              <dt>{key}</dt>
                              <dd>{value === null ? '-' : String(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </main>
      )}
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
