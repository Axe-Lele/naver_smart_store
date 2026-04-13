// File: apps/desktop-electron/src/renderer/App.tsx
import { startTransition, useEffect, useState } from 'react';

import type { AppSettings, RunEvent } from '@smart-store/application';
import type {
  BatchJobResultSnapshot,
  LoginSessionSnapshot,
  ProductSnapshot,
  ProductStatus,
} from '@smart-store/core';
import type { BootState, RunDetail } from '@smart-store/shared';

import {
  DetailPair,
  EmptyState,
  ProductTable,
  RecentRunsTable,
  ResultItemsTable,
  StatCard,
  StatusBadge,
} from './components.js';
import {
  describeRunEvent,
  filterResultItems,
  formatError,
  normalizePositiveInt,
  normalizeProductIdsText,
  type NoticeTone,
  type ResultBucketFilter,
  type ViewId,
} from './helpers.js';

const NAV_ITEMS: Array<{ id: ViewId; label: string; description: string }> = [
  { id: 'dashboard', label: '대시보드', description: '현재 세션, 최근 실행, 빠른 요약' },
  { id: 'session', label: '로그인 세션', description: '수동 로그인 준비와 세션 검증' },
  { id: 'products', label: '상품 목록', description: '조회, 검색, 필터, 선택' },
  { id: 'batch', label: '배치 실행', description: 'dry-run, 실행, 중지, 재개' },
  { id: 'results', label: '실행 결과', description: '성공/잠금/실패와 산출물 확인' },
  { id: 'retry', label: '실패 재시도', description: '이전 실패 항목으로 재실행' },
  { id: 'settings', label: '설정', description: '속도, 경로, 셀렉터, 출력 제어' },
];

const PRODUCT_STATUS_OPTIONS: ProductStatus[] = [
  'UNCLASSIFIED',
  'NOT_FOUND',
  'NOT_PREORDER',
  'EDITABLE_PREORDER',
  'LOCKED_BY_ORDER_PERIOD',
  'UI_CHANGED',
  'UNKNOWN_ERROR',
];

export function App() {
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState<{ tone: NoticeTone; text: string } | null>(
    null,
  );
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings | null>(null);
  const [session, setSession] = useState<LoginSessionSnapshot | null>(null);
  const [products, setProducts] = useState<readonly ProductSnapshot[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [recentRuns, setRecentRuns] = useState<readonly BatchJobResultSnapshot[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [logs, setLogs] = useState<readonly RunEvent[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | undefined>();
  const [currentProgress, setCurrentProgress] = useState<
    Extract<RunEvent, { type: 'job-progress' }> | null
  >(null);
  const [runningBatch, setRunningBatch] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [productsBusy, setProductsBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [productSearchText, setProductSearchText] = useState('');
  const [productIdsText, setProductIdsText] = useState('');
  const [productLimit, setProductLimit] = useState('30');
  const [productStatusFilters, setProductStatusFilters] = useState<ProductStatus[]>(
    [],
  );
  const [batchDryRun, setBatchDryRun] = useState(true);
  const [batchRequestedBy, setBatchRequestedBy] = useState('');
  const [retryDryRun, setRetryDryRun] = useState(false);
  const [retryIncludeAllFailed, setRetryIncludeAllFailed] = useState(false);
  const [retryRequestedBy, setRetryRequestedBy] = useState('');
  const [resultBucketFilter, setResultBucketFilter] =
    useState<ResultBucketFilter>('all');
  const [resultSearchText, setResultSearchText] = useState('');

  const selectedProducts = products.filter((product) =>
    selectedProductIds.includes(product.id),
  );
  const activeRun = selectedRunId
    ? recentRuns.find((run) => run.jobId === selectedRunId) ?? null
    : recentRuns[0] ?? null;
  const filteredResultItems = filterResultItems(
    runDetail?.itemResults ?? [],
    resultBucketFilter,
    resultSearchText,
  );
  const currentProgressPercent =
    currentProgress && currentProgress.totalItems > 0
      ? Math.round((currentProgress.processedItems / currentProgress.totalItems) * 100)
      : 0;

  useEffect(() => {
    void bootApplication();

    const unsubscribe = window.desktopApi.events.subscribe((event) => {
      startTransition(() => {
        setLogs((current) => [event, ...current].slice(0, 200));
      });

      if (event.type === 'session-state') {
        setSession((current) => ({
          storageStatePath:
            current?.storageStatePath ?? settingsDraft?.storageStatePath ?? '',
          status: event.status,
          validatedAt: event.createdAt,
          lastErrorMessage: event.message,
          preparedAt: current?.preparedAt,
          expiresAt: current?.expiresAt,
        }));
      }

      if (event.type === 'job-state') {
        if (event.status === 'RUNNING' || event.status === 'STOP_REQUESTED') {
          setCurrentJobId(event.jobId);
          setRunningBatch(true);
        } else {
          setCurrentJobId((current) =>
            current === event.jobId ? undefined : current,
          );
          setCurrentProgress((current) =>
            current?.jobId === event.jobId ? null : current,
          );
          setRunningBatch(false);
          setSelectedRunId(event.jobId);
          void refreshRecentRuns();
          void loadRunDetail(event.jobId);
        }
      }

      if (event.type === 'job-progress') {
        setCurrentProgress(event);
        setCurrentJobId(event.jobId);
        setRunningBatch(true);
      }
    });

    return unsubscribe;
  }, []);

  async function bootApplication(): Promise<void> {
    try {
      const bootState = await window.desktopApi.app.getBootState();
      applyBootState(bootState);
      setNotice({
        tone: 'info',
        text: 'Electron 운영 도구가 준비되었습니다. 세션 상태를 먼저 확인하세요.',
      });
    } catch (error) {
      showError(error);
    } finally {
      setBooting(false);
    }
  }

  function applyBootState(bootState: BootState): void {
    startTransition(() => {
      setSettings(bootState.settings);
      setSettingsDraft(bootState.settings);
      setSession(bootState.session);
      setRecentRuns(bootState.recentRuns);
      setLogs(bootState.eventHistory.slice(0, 200));
      setCurrentJobId(bootState.currentJobId);
    });

    if (bootState.recentRuns[0]) {
      setSelectedRunId(bootState.recentRuns[0].jobId);
      void loadRunDetail(bootState.recentRuns[0].jobId);
    }
  }

  async function refreshRecentRuns(): Promise<void> {
    try {
      const runs = await window.desktopApi.history.listRecent({ limit: 12 });
      startTransition(() => {
        setRecentRuns(runs);
        if (!selectedRunId && runs[0]) {
          setSelectedRunId(runs[0].jobId);
        }
      });
    } catch (error) {
      showError(error);
    }
  }

  async function loadRunDetail(jobId: string): Promise<void> {
    setDetailBusy(true);

    try {
      const detail = await window.desktopApi.history.getRunDetail({ jobId });
      startTransition(() => {
        setRunDetail(detail);
        setSelectedRunId(jobId);
      });
    } catch (error) {
      showError(error);
    } finally {
      setDetailBusy(false);
    }
  }

  async function handlePrepareSession(): Promise<void> {
    setSessionBusy(true);

    try {
      const nextSession = await window.desktopApi.session.prepare({
        initiatedBy: batchRequestedBy || undefined,
      });
      setSession(nextSession);
      setNotice({
        tone: 'success',
        text: `로그인 세션이 저장되었습니다: ${nextSession.storageStatePath}`,
      });
    } catch (error) {
      showError(error);
    } finally {
      setSessionBusy(false);
    }
  }

  async function handleValidateSession(): Promise<void> {
    setSessionBusy(true);

    try {
      const nextSession = await window.desktopApi.session.validate();
      setSession(nextSession);
      setNotice({
        tone: 'success',
        text: '저장된 세션이 유효하다고 확인되었습니다.',
      });
    } catch (error) {
      showError(error);
    } finally {
      setSessionBusy(false);
    }
  }

  async function handleLoadProducts(): Promise<void> {
    setProductsBusy(true);

    try {
      const productIds = normalizeProductIdsText(productIdsText);
      const nextProducts = await window.desktopApi.products.load({
        searchText: productSearchText || undefined,
        productIds: productIds.length > 0 ? productIds : undefined,
        statuses:
          productStatusFilters.length > 0 ? productStatusFilters : undefined,
        limit: normalizePositiveInt(productLimit),
      });
      startTransition(() => setProducts(nextProducts));
      setNotice({
        tone: 'success',
        text: `${nextProducts.length}건의 상품을 불러왔습니다.`,
      });
    } catch (error) {
      showError(error);
    } finally {
      setProductsBusy(false);
    }
  }

  async function handleExecuteBatch(): Promise<void> {
    if (selectedProductIds.length === 0) {
      setNotice({
        tone: 'error',
        text: '배치를 실행하려면 최소 1개 상품을 선택해야 합니다.',
      });
      return;
    }

    setBatchBusy(true);
    setRunningBatch(true);

    try {
      const result = await window.desktopApi.batch.execute({
        selectedProductIds,
        dryRun: batchDryRun,
        requestedBy: batchRequestedBy || undefined,
      });
      await refreshRecentRuns();
      await loadRunDetail(result.jobId);
      setActiveView('results');
      setNotice({
        tone: 'success',
        text: `배치 실행이 완료되었습니다. 상태: ${result.status}`,
      });
    } catch (error) {
      showError(error);
    } finally {
      setBatchBusy(false);
      setRunningBatch(false);
    }
  }

  async function handleResumeBatch(): Promise<void> {
    const jobId = selectedRunId || currentJobId;
    if (!jobId) {
      setNotice({ tone: 'error', text: '이어 실행할 체크포인트 대상이 없습니다.' });
      return;
    }

    setBatchBusy(true);
    setRunningBatch(true);

    try {
      const result = await window.desktopApi.batch.resume({ jobId });
      await refreshRecentRuns();
      await loadRunDetail(result.jobId);
      setActiveView('results');
      setNotice({
        tone: 'success',
        text: `체크포인트 이어 실행이 완료되었습니다. 상태: ${result.status}`,
      });
    } catch (error) {
      showError(error);
    } finally {
      setBatchBusy(false);
      setRunningBatch(false);
    }
  }

  async function handleStopBatch(): Promise<void> {
    try {
      await window.desktopApi.batch.stop({
        jobId: currentJobId,
        reason: '운영자가 중지 버튼을 눌렀습니다.',
      });
      setNotice({ tone: 'info', text: '배치 중지 요청을 보냈습니다.' });
    } catch (error) {
      showError(error);
    }
  }

  async function handleRetryFailedItems(): Promise<void> {
    if (!selectedRunId) {
      setNotice({ tone: 'error', text: '재시도할 실행 이력을 먼저 선택하세요.' });
      return;
    }

    setBatchBusy(true);
    setRunningBatch(true);

    try {
      const result = await window.desktopApi.batch.retry({
        jobId: selectedRunId,
        dryRun: retryDryRun,
        includeAllFailed: retryIncludeAllFailed,
        requestedBy: retryRequestedBy || undefined,
      });
      await refreshRecentRuns();
      await loadRunDetail(result.jobId);
      setActiveView('results');
      setNotice({
        tone: 'success',
        text: `실패 항목 재시도가 완료되었습니다. 상태: ${result.status}`,
      });
    } catch (error) {
      showError(error);
    } finally {
      setBatchBusy(false);
      setRunningBatch(false);
    }
  }

  async function handleSaveSettings(): Promise<void> {
    if (!settingsDraft) {
      return;
    }

    setSettingsBusy(true);

    try {
      const saved = await window.desktopApi.settings.save(sanitizeSettings(settingsDraft));
      setSettings(saved);
      setSettingsDraft(saved);
      setNotice({ tone: 'success', text: '설정이 저장되었습니다.' });
    } catch (error) {
      showError(error);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function handleExportRunReport(): Promise<void> {
    if (!selectedRunId) {
      setNotice({ tone: 'error', text: '내보낼 실행 이력이 없습니다.' });
      return;
    }

    try {
      const exported = await window.desktopApi.history.export({ jobId: selectedRunId });
      setNotice({
        tone: 'success',
        text: `실행 리포트를 저장했습니다: ${exported.targetPath}`,
      });
    } catch (error) {
      showError(error);
    }
  }

  async function handleOpenPath(targetPath?: string): Promise<void> {
    if (!targetPath) {
      return;
    }

    try {
      await window.desktopApi.system.openPath({ targetPath });
    } catch (error) {
      showError(error);
    }
  }

  function toggleProductSelection(productId: string): void {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function toggleSelectAllProducts(): void {
    const productIds = products.map((product) => product.id);
    const everySelected =
      productIds.length > 0 &&
      productIds.every((productId) => selectedProductIds.includes(productId));
    setSelectedProductIds(everySelected ? [] : productIds);
  }

  function toggleStatusFilter(status: ProductStatus): void {
    setProductStatusFilters((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  }

  function showError(error: unknown): void {
    setNotice({
      tone: 'error',
      text: formatError(error),
    });
  }

  if (booting || !settingsDraft || !settings) {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <h1>Smart Store Desktop Operator</h1>
          <p>Electron 셸과 Playwright 인프라를 불러오는 중입니다.</p>
        </div>
      </div>
    );
  }

  const currentSettings = settings;
  const currentSettingsDraft = settingsDraft;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">Smart Store</p>
          <h1>Desktop Operator</h1>
          <p className="muted">
            운영자가 로그인 세션, 상품 선택, 일괄 변경을 한 화면에서 관리합니다.
          </p>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              onClick={() => setActiveView(item.id)}
              type="button"
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-summary">
          <div className="summary-row">
            <span>세션</span>
            <StatusBadge value={session?.status ?? 'UNKNOWN'} tone="session" />
          </div>
          <div className="summary-row">
            <span>선택 상품</span>
            <strong>{selectedProductIds.length}</strong>
          </div>
          <div className="summary-row">
            <span>실행 중</span>
            <strong>{currentJobId ? '예' : '아니오'}</strong>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">운영 도구</p>
            <h2>{getViewTitle(activeView)}</h2>
          </div>
          <div className="topbar-actions">
            <button type="button" className="secondary-button" onClick={() => void handleValidateSession()}>
              세션 검증
            </button>
            <button type="button" className="primary-button" onClick={() => void handlePrepareSession()}>
              로그인 준비
            </button>
          </div>
        </header>

        {notice ? (
          <div className={`notice notice-${notice.tone}`}>
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)}>
              닫기
            </button>
          </div>
        ) : null}

        <div className="content-grid">
          <section className="page-panel">{renderActiveView()}</section>
          <aside className="log-panel">
            <div className="panel-header">
              <div>
                <h3>실시간 로그</h3>
                <p className="muted">
                  main process에서 전달된 로그, 세션 상태, 진행 이벤트를 표시합니다.
                </p>
              </div>
            </div>
            <div className="log-list">
              {logs.length === 0 ? (
                <EmptyState
                  title="아직 로그가 없습니다"
                  description="로그인 준비나 상품 조회를 시작하면 이벤트가 여기에 나타납니다."
                />
              ) : (
                logs.map((event, index) => (
                  <div key={`${event.type}-${event.createdAt}-${index}`} className="log-entry">
                    <div className="log-entry-top">
                      <StatusBadge value={event.type} tone="event" />
                      <span className="muted">{event.createdAt}</span>
                    </div>
                    <p>{describeRunEvent(event)}</p>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );

  function renderActiveView() {
    switch (activeView) {
      case 'dashboard':
        return renderDashboardView();
      case 'session':
        return renderSessionView();
      case 'products':
        return renderProductsView();
      case 'batch':
        return renderBatchView();
      case 'results':
        return renderResultsView();
      case 'retry':
        return renderRetryView();
      case 'settings':
        return renderSettingsView();
    }
  }

  function renderDashboardView() {
    return (
      <div className="stack">
        <div className="stats-grid">
          <StatCard
            label="세션 상태"
            value={session?.status ?? 'UNKNOWN'}
            subtext={session?.storageStatePath ?? '세션 경로 미설정'}
          />
          <StatCard label="선택 상품 수" value={String(selectedProductIds.length)} />
          <StatCard
            label="최근 실행"
            value={activeRun?.status ?? '없음'}
            subtext={activeRun?.finishedAt ?? '아직 기록이 없습니다'}
          />
          <StatCard
            label="실행 중 Job"
            value={currentJobId ?? '없음'}
            subtext={currentProgress ? `${currentProgressPercent}% 진행` : '대기 중'}
          />
        </div>
        <div className="dashboard-grid">
          <section className="card">
            <div className="panel-header">
              <div>
                <h3>빠른 작업</h3>
                <p className="muted">가장 자주 쓰는 작업을 바로 시작할 수 있습니다.</p>
              </div>
            </div>
            <div className="button-row wrap">
              <button type="button" className="primary-button" onClick={() => setActiveView('session')}>
                로그인 세션 준비
              </button>
              <button type="button" className="secondary-button" onClick={() => setActiveView('products')}>
                상품 목록 불러오기
              </button>
              <button type="button" className="secondary-button" onClick={() => setActiveView('batch')}>
                배치 실행 화면으로
              </button>
            </div>
          </section>
          <section className="card">
            <div className="panel-header">
              <div>
                <h3>최근 실행 이력</h3>
                <p className="muted">최근 12건까지 표시합니다.</p>
              </div>
              <button type="button" className="ghost-button" onClick={() => void refreshRecentRuns()}>
                새로고침
              </button>
            </div>
            <RecentRunsTable
              runs={recentRuns}
              selectedRunId={selectedRunId}
              onSelect={(jobId) => {
                setSelectedRunId(jobId);
                void loadRunDetail(jobId);
                setActiveView('results');
              }}
            />
          </section>
        </div>
      </div>
    );
  }

  function renderSessionView() {
    return (
      <div className="stack">
        <section className="card">
          <div className="panel-header">
            <div>
              <h3>로그인 세션 준비</h3>
              <p className="muted">
                앱은 ID/PW를 저장하거나 자동 입력하지 않습니다. 브라우저를 열어 사용자가 직접 로그인한 뒤 storageState를 저장합니다.
              </p>
            </div>
          </div>
          <div className="details-grid">
            <DetailPair label="storageState 경로" value={currentSettings.storageStatePath} />
            <DetailPair label="로그인 방식" value={currentSettings.loginMode} />
            <DetailPair label="상품 목록 URL" value={currentSettings.productsUrl} />
            <DetailPair label="현재 세션 상태" value={session?.status ?? 'UNKNOWN'} />
          </div>
          <div className="button-row">
            <button type="button" className="primary-button" disabled={sessionBusy} onClick={() => void handlePrepareSession()}>
              {sessionBusy ? '준비 중...' : '로그인 준비 시작'}
            </button>
            <button type="button" className="secondary-button" disabled={sessionBusy} onClick={() => void handleValidateSession()}>
              세션 검증
            </button>
            <button type="button" className="ghost-button" onClick={() => void handleOpenPath(currentSettings.storageStatePath)}>
              세션 파일 열기
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderProductsView() {
    return (
      <div className="stack">
        <section className="card">
          <div className="panel-header">
            <div>
              <h3>상품 조회</h3>
              <p className="muted">검색어, 직접 입력한 상품번호, 상태 필터로 Smart Store 상품을 불러옵니다.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>검색어</span>
              <input value={productSearchText} onChange={(event) => setProductSearchText(event.target.value)} />
            </label>
            <label className="field">
              <span>최대 조회 수</span>
              <input value={productLimit} onChange={(event) => setProductLimit(event.target.value)} inputMode="numeric" />
            </label>
          </div>
          <label className="field">
            <span>직접 조회할 상품번호</span>
            <textarea rows={5} value={productIdsText} onChange={(event) => setProductIdsText(event.target.value)} />
          </label>
          <div className="status-filter-row">
            {PRODUCT_STATUS_OPTIONS.map((status) => (
              <label key={status} className="checkbox-pill">
                <input type="checkbox" checked={productStatusFilters.includes(status)} onChange={() => toggleStatusFilter(status)} />
                <span>{status}</span>
              </label>
            ))}
          </div>
          <div className="button-row wrap">
            <button type="button" className="primary-button" disabled={productsBusy} onClick={() => void handleLoadProducts()}>
              {productsBusy ? '조회 중...' : '상품 불러오기'}
            </button>
            <button type="button" className="secondary-button" onClick={toggleSelectAllProducts}>
              현재 목록 전체 선택/해제
            </button>
            <button type="button" className="ghost-button" onClick={() => setSelectedProductIds([])}>
              선택 초기화
            </button>
          </div>
        </section>
        <section className="card">
          <ProductTable
            products={products}
            selectedProductIds={selectedProductIds}
            onToggle={toggleProductSelection}
          />
        </section>
      </div>
    );
  }

  function renderBatchView() {
    return (
      <div className="stack">
        <section className="card">
          <div className="panel-header">
            <div>
              <h3>배치 실행</h3>
              <p className="muted">선택된 상품을 대상으로 예약상품 → 일반상품 전환을 실행합니다.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field checkbox-field">
              <span>dry-run</span>
              <input type="checkbox" checked={batchDryRun} onChange={(event) => setBatchDryRun(event.target.checked)} />
            </label>
            <label className="field">
              <span>실행 메모 / 요청자</span>
              <input value={batchRequestedBy} onChange={(event) => setBatchRequestedBy(event.target.value)} />
            </label>
          </div>
          <div className="details-grid">
            <DetailPair label="선택 상품 수" value={`${selectedProductIds.length}건`} />
            <DetailPair label="딜레이" value={`${currentSettings.delayMs} ms`} />
            <DetailPair label="동시성" value={String(currentSettings.concurrency)} />
            <DetailPair label="연속 실패 제한" value={String(currentSettings.consecutiveFailureLimit)} />
          </div>
          {currentProgress ? (
            <div className="progress-card">
              <div className="progress-card-top">
                <strong>{currentProgress.jobId}</strong>
                <span>{currentProgressPercent}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${currentProgressPercent}%` }} />
              </div>
              <p className="muted">
                처리 {currentProgress.processedItems}/{currentProgress.totalItems} · 성공 {currentProgress.successCount} · 잠금 {currentProgress.lockedCount} · 실패 {currentProgress.failedCount}
              </p>
            </div>
          ) : null}
          <div className="button-row wrap">
            <button type="button" className="primary-button" disabled={batchBusy || runningBatch} onClick={() => void handleExecuteBatch()}>
              {batchBusy ? '실행 중...' : batchDryRun ? 'dry-run 실행' : '실제 변경 실행'}
            </button>
            <button type="button" className="secondary-button" disabled={batchBusy || runningBatch} onClick={() => void handleResumeBatch()}>
              체크포인트 이어 실행
            </button>
            <button type="button" className="danger-button" disabled={!currentJobId} onClick={() => void handleStopBatch()}>
              실행 중지
            </button>
          </div>
        </section>
      </div>
    );
  }

  function renderResultsView() {
    return (
      <div className="stack">
        <section className="card">
          <div className="panel-header">
            <div>
              <h3>실행 결과</h3>
              <p className="muted">최근 실행 결과를 요약하고 실패 아티팩트를 열 수 있습니다.</p>
            </div>
            <div className="button-row wrap">
              <select value={selectedRunId} onChange={(event) => {
                setSelectedRunId(event.target.value);
                void loadRunDetail(event.target.value);
              }}>
                {recentRuns.map((run) => (
                  <option key={run.jobId} value={run.jobId}>
                    {run.jobId} · {run.status}
                  </option>
                ))}
              </select>
              <button type="button" className="ghost-button" onClick={() => void handleExportRunReport()}>
                리포트 내보내기
              </button>
            </div>
          </div>
          {runDetail?.result ? (
            <>
              <div className="stats-grid compact">
                <StatCard label="상태" value={runDetail.result.status} />
                <StatCard label="성공" value={String(runDetail.result.summary.successCount)} />
                <StatCard label="잠금" value={String(runDetail.result.summary.lockedCount)} />
                <StatCard label="실패" value={String(runDetail.result.summary.failedCount)} />
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>결과 검색</span>
                  <input value={resultSearchText} onChange={(event) => setResultSearchText(event.target.value)} />
                </label>
                <label className="field">
                  <span>결과 그룹</span>
                  <select value={resultBucketFilter} onChange={(event) => setResultBucketFilter(event.target.value as ResultBucketFilter)}>
                    <option value="all">전체</option>
                    <option value="success">success</option>
                    <option value="locked">locked</option>
                    <option value="failed">failed</option>
                  </select>
                </label>
              </div>
              <ResultItemsTable items={filteredResultItems} onOpenPath={(targetPath) => void handleOpenPath(targetPath)} />
            </>
          ) : detailBusy ? (
            <EmptyState title="실행 상세를 불러오는 중입니다" description="잠시만 기다려 주세요." />
          ) : (
            <EmptyState title="표시할 실행 결과가 없습니다" description="배치를 먼저 실행하세요." />
          )}
        </section>
      </div>
    );
  }

  function renderRetryView() {
    return (
      <div className="stack">
        <section className="card">
          <div className="panel-header">
            <div>
              <h3>실패 항목 재시도</h3>
              <p className="muted">기존 실행 이력에서 실패한 항목만 골라 새 배치로 재실행합니다.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>대상 실행 이력</span>
              <select value={selectedRunId} onChange={(event) => {
                setSelectedRunId(event.target.value);
                void loadRunDetail(event.target.value);
              }}>
                {recentRuns.map((run) => (
                  <option key={run.jobId} value={run.jobId}>
                    {run.jobId} · 실패 {run.summary.failedCount}건
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>요청자 메모</span>
              <input value={retryRequestedBy} onChange={(event) => setRetryRequestedBy(event.target.value)} />
            </label>
          </div>
          <div className="button-row wrap">
            <label className="checkbox-pill">
              <input type="checkbox" checked={retryDryRun} onChange={(event) => setRetryDryRun(event.target.checked)} />
              <span>dry-run 재시도</span>
            </label>
            <label className="checkbox-pill">
              <input type="checkbox" checked={retryIncludeAllFailed} onChange={(event) => setRetryIncludeAllFailed(event.target.checked)} />
              <span>모든 failed 포함</span>
            </label>
            <button type="button" className="primary-button" disabled={batchBusy} onClick={() => void handleRetryFailedItems()}>
              실패 항목 재시도
            </button>
          </div>
        </section>
        <section className="card">
          <ResultItemsTable
            items={(runDetail?.itemResults ?? []).filter((item) => item.outputBucket === 'failed')}
            onOpenPath={(targetPath) => void handleOpenPath(targetPath)}
          />
        </section>
      </div>
    );
  }

  function renderSettingsView() {
    return (
      <div className="stack">
        <section className="card">
          <div className="panel-header">
            <div>
              <h3>설정</h3>
              <p className="muted">실행 속도, 세션 경로, 셀렉터 override, 출력 경로를 조정합니다.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field wide">
              <span>상품 목록 URL</span>
              <input value={currentSettingsDraft.productsUrl} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, productsUrl: event.target.value })} />
            </label>
            <label className="field">
              <span>로그인 방식</span>
              <select value={currentSettingsDraft.loginMode} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, loginMode: event.target.value as AppSettings['loginMode'] })}>
                <option value="storageState">storageState</option>
                <option value="persistent">persistent</option>
              </select>
            </label>
            <label className="field wide">
              <span>storageState 경로</span>
              <input value={currentSettingsDraft.storageStatePath} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, storageStatePath: event.target.value })} />
            </label>
            <label className="field wide">
              <span>persistent userDataDir</span>
              <input value={currentSettingsDraft.userDataDir ?? ''} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, userDataDir: event.target.value })} />
            </label>
            <label className="field wide">
              <span>output 디렉터리</span>
              <input value={currentSettingsDraft.outputDir} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, outputDir: event.target.value })} />
            </label>
            <label className="field">
              <span>delayMs</span>
              <input value={String(currentSettingsDraft.delayMs)} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, delayMs: Number(event.target.value || '0') })} inputMode="numeric" />
            </label>
            <label className="field">
              <span>concurrency</span>
              <input value={String(currentSettingsDraft.concurrency)} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, concurrency: Number(event.target.value || '1') })} inputMode="numeric" />
            </label>
            <label className="field">
              <span>연속 실패 제한</span>
              <input value={String(currentSettingsDraft.consecutiveFailureLimit)} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, consecutiveFailureLimit: Number(event.target.value || '1') })} inputMode="numeric" />
            </label>
            <label className="field">
              <span>selector profile id</span>
              <input value={currentSettingsDraft.selectorProfileId} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, selectorProfileId: event.target.value })} />
            </label>
            <label className="field wide">
              <span>selector override 파일</span>
              <input value={currentSettingsDraft.selectorConfigPath ?? ''} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, selectorConfigPath: event.target.value })} />
            </label>
          </div>
          <div className="button-row wrap">
            <label className="checkbox-pill">
              <input type="checkbox" checked={currentSettingsDraft.headless} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, headless: event.target.checked })} />
              <span>headless</span>
            </label>
            <label className="checkbox-pill">
              <input type="checkbox" checked={currentSettingsDraft.captureScreenshotOnFailure} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, captureScreenshotOnFailure: event.target.checked })} />
              <span>실패 스크린샷</span>
            </label>
            <label className="checkbox-pill">
              <input type="checkbox" checked={currentSettingsDraft.captureHtmlOnFailure} onChange={(event) => setSettingsDraft({ ...currentSettingsDraft, captureHtmlOnFailure: event.target.checked })} />
              <span>실패 HTML</span>
            </label>
            <button type="button" className="primary-button" disabled={settingsBusy} onClick={() => void handleSaveSettings()}>
              {settingsBusy ? '저장 중...' : '설정 저장'}
            </button>
          </div>
        </section>
      </div>
    );
  }
}

function getViewTitle(view: ViewId): string {
  const item = NAV_ITEMS.find((navItem) => navItem.id === view);
  return item?.label ?? 'Smart Store Desktop Operator';
}

function sanitizeSettings(settings: AppSettings): AppSettings {
  const clean = (value?: string) =>
    value && value.trim().length > 0 ? value : undefined;

  return {
    ...settings,
    userDataDir: clean(settings.userDataDir),
    selectorConfigPath: clean(settings.selectorConfigPath),
  };
}
