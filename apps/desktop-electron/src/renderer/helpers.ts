// File: apps/desktop-electron/src/renderer/helpers.ts
import type { RunEvent } from '@smart-store/application';
import type { LoginSessionSnapshot } from '@smart-store/core';
import type { HybridBridgeClientState } from '@smart-store/shared';

export type NoticeTone = 'info' | 'success' | 'error';

export type HybridProgressSnapshot = {
  phase: string;
  updatedAt: string;
  targetCount: number;
  completedCount: number;
  results: Array<{
    productId: string;
    state: string;
    message: string;
  }>;
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
};

export function formatDateTime(value?: string): string {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('ko-KR', {
    hour12: false,
  });
}

export function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) {
    return '-';
  }

  if (durationMs < 1_000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1_000).toFixed(1)} s`;
}

export function describeRunEvent(event: RunEvent): string {
  if (event.type === 'log') {
    return `${event.level.toUpperCase()} · ${event.message}`;
  }

  if (event.type === 'job-state') {
    return `JOB ${event.jobId} · ${event.status}${event.stopReason ? ` · ${event.stopReason}` : ''}`;
  }

  if (event.type === 'job-progress') {
    return `JOB ${event.jobId} · ${event.processedItems}/${event.totalItems} 처리 · 성공 ${event.successCount} · 잠금 ${event.lockedCount} · 실패 ${event.failedCount}`;
  }

  return `SESSION · ${event.status} · ${event.message}`;
}

export function describeHybridCommand(command: string): string {
  switch (command) {
    case 'check-surface':
      return '현재 탭 확인';
    case 'run-dom-inspection':
      return '화면 점검';
    case 'collect-targets':
      return '대상 수집';
    case 'run-dry-run':
      return '미리보기 실행';
    case 'start-batch':
      return '예약 설정 시작';
    case 'resume-batch':
      return '배치 재개';
    case 'stop-batch':
      return '배치 중단';
    default:
      return command;
  }
}

export function getConnectionLabel(connected: boolean): string {
  return connected ? '탭 연결됨' : '탭 연결 대기';
}

export function getSessionLabel(status?: LoginSessionSnapshot['status']): string {
  switch (status) {
    case 'READY':
      return '로그인 확인됨';
    case 'MISSING':
    case 'LOGIN_REQUIRED':
      return '로그인 필요';
    case 'EXPIRED':
      return '다시 로그인 필요';
    case 'ACCESS_DENIED':
      return '권한 확인 필요';
    case 'CHALLENGE_REQUIRED':
      return '추가 인증 필요';
    case 'INVALID':
      return '세션 확인 필요';
    default:
      return '확인 전';
  }
}

export function getChromePageLabel(input: {
  connected: boolean;
  activeClient?: HybridBridgeClientState;
}): string {
  if (!input.connected) {
    return '브라우저 대기';
  }

  const pageUrl = input.activeClient?.pageUrl.toLowerCase() ?? '';
  const pageTitle = input.activeClient?.pageTitle.toLowerCase() ?? '';
  const pageRole = input.activeClient?.pageRole;

  if (pageRole === 'login' || pageUrl.includes('login') || pageTitle.includes('로그인')) {
    return '로그인 필요';
  }

  if (pageRole === 'product-list' || pageUrl.includes('origin-list')) {
    return '상품목록 연결';
  }

  if (pageRole === 'product-edit') {
    return '상품수정 연결';
  }

  if (pageUrl.includes('sell.smartstore.naver.com')) {
    return '판매자센터 연결';
  }

  return '화면 확인 필요';
}

export function getProgressPhaseLabel(phase?: string): string {
  switch (phase) {
    case 'idle':
      return '대기 중';
    case 'checking':
      return '현재 화면 확인 중';
    case 'inspecting':
      return '화면 점검 중';
    case 'collecting':
      return '대상 상품 확인 중';
    case 'dry-run':
      return '미리보기 완료';
    case 'executing':
      return '실행 중';
    case 'stopped':
      return '중단됨';
    case 'verification-required':
      return '점검 필요';
    default:
      return '대기 중';
  }
}

export function getRecommendedNextStep(input: {
  connected: boolean;
  activeClient?: HybridBridgeClientState;
  extensionPackageAvailable?: boolean;
  productCount: number;
  selectedCount: number;
  pendingCommand?: string | null;
  progress?: HybridProgressSnapshot | null;
}): string {
  if (!input.connected) {
    return input.extensionPackageAvailable === false
      ? '확장 파일이 없습니다. 패키지를 다시 빌드하세요.'
      : '작업용 브라우저를 열고 상품 조회/수정 탭에서 새로고침하세요.';
  }

  if (input.pendingCommand === 'collect-targets') {
    return '상품을 읽는 중입니다.';
  }

  if (input.pendingCommand === 'stop-batch') {
    return '중단 요청을 처리하고 있습니다.';
  }

  if (input.pendingCommand === 'start-batch' || input.progress?.phase === 'executing') {
    return '실행 중입니다. 작업용 브라우저 창을 닫지 마세요.';
  }

  const pageUrl = input.activeClient?.pageUrl.toLowerCase() ?? '';
  const pageTitle = input.activeClient?.pageTitle.toLowerCase() ?? '';
  const pageRole = input.activeClient?.pageRole;

  if (input.progress?.phase === 'stopped') {
    return '중단되었습니다. 계속하려면 다시 실행하세요.';
  }

  if (pageRole === 'login' || pageUrl.includes('login') || pageTitle.includes('로그인')) {
    return '작업용 브라우저에서 로그인을 완료하세요.';
  }

  if (
    pageRole !== 'product-list' &&
    !pageUrl.includes('origin-list') &&
    !pageUrl.includes('product-list')
  ) {
    return '상품 조회/수정 화면에서 묶음배송 결과를 여세요.';
  }

  if (input.progress?.phase === 'verification-required') {
    return '묶음배송 검색 조건을 확인하고 다시 불러오세요.';
  }

  if (input.productCount === 0) {
    return '현재 페이지 상품을 불러오세요.';
  }

  if (input.selectedCount === 0) {
    return '예약상품으로 설정할 상품을 하나 이상 체크하세요.';
  }

  return '제외할 상품 체크를 풀고 실행하세요.';
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return buildRichErrorMessage(error);
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return buildRichErrorMessage(error as {
      message: unknown;
      details?: unknown;
      recoveryCommand?: unknown;
    });
  }

  return String(error);
}

export function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function getHybridProgress(value: unknown): HybridProgressSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.phase !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.targetCount !== 'number' ||
    typeof value.completedCount !== 'number' ||
    !Array.isArray(value.results) ||
    !Array.isArray(value.logs)
  ) {
    return null;
  }

  return {
    phase: value.phase,
    updatedAt: value.updatedAt,
    targetCount: value.targetCount,
    completedCount: value.completedCount,
    results: value.results
      .filter((item) => isRecord(item))
      .map((item) => ({
        productId: String(item.productId ?? ''),
        state: String(item.state ?? ''),
        message: String(item.message ?? ''),
      })),
    logs: value.logs
      .filter((item) => isRecord(item))
      .map((item) => ({
        timestamp: String(item.timestamp ?? ''),
        level: String(item.level ?? ''),
        message: String(item.message ?? ''),
      })),
  };
}

function buildRichErrorMessage(error: {
  message: unknown;
  details?: unknown;
  recoveryCommand?: unknown;
}): string {
  const parts = [String(error.message)];

  if (typeof error.details === 'string' && error.details.trim().length > 0) {
    parts.push(error.details.trim());
  }

  if (
    typeof error.recoveryCommand === 'string' &&
    error.recoveryCommand.trim().length > 0
  ) {
    parts.push(`복구: ${error.recoveryCommand.trim()}`);
  }

  return parts.join('\n\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
