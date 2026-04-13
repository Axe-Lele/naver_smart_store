// File: apps/desktop-electron/src/renderer/components.tsx
import type {
  BatchJobItemResultSnapshot,
  BatchJobResultSnapshot,
  ProductSnapshot,
} from '@smart-store/core';

import {
  formatDateTime,
  formatDuration,
} from './helpers.js';

export function StatusBadge(props: {
  value: string;
  tone: 'session' | 'event' | 'neutral';
}) {
  return <span className={`status-badge tone-${props.tone}`}>{props.value}</span>;
}

export function StatCard(props: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="stat-card">
      <p className="eyebrow">{props.label}</p>
      <strong>{props.value}</strong>
      {props.subtext ? <p className="muted">{props.subtext}</p> : null}
    </div>
  );
}

export function DetailPair(props: { label: string; value: string }) {
  return (
    <div className="detail-pair">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function EmptyState(props: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <strong>{props.title}</strong>
      <p className="muted">{props.description}</p>
    </div>
  );
}

export function RecentRunsTable(props: {
  runs: readonly BatchJobResultSnapshot[];
  selectedRunId: string;
  onSelect: (jobId: string) => void;
}) {
  if (props.runs.length === 0) {
    return (
      <EmptyState
        title="최근 실행이 없습니다"
        description="상품을 선택하고 배치를 한 번 실행하면 이력이 쌓입니다."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>선택</th>
            <th>Job ID</th>
            <th>상태</th>
            <th>완료 시각</th>
            <th>성공</th>
            <th>잠금</th>
            <th>실패</th>
          </tr>
        </thead>
        <tbody>
          {props.runs.map((run) => (
            <tr key={run.jobId}>
              <td>
                <input
                  type="radio"
                  name="selected-run"
                  checked={props.selectedRunId === run.jobId}
                  onChange={() => props.onSelect(run.jobId)}
                />
              </td>
              <td>{run.jobId}</td>
              <td>{run.status}</td>
              <td>{formatDateTime(run.finishedAt)}</td>
              <td>{run.summary.successCount}</td>
              <td>{run.summary.lockedCount}</td>
              <td>{run.summary.failedCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProductTable(props: {
  products: readonly ProductSnapshot[];
  selectedProductIds: readonly string[];
  onToggle: (productId: string) => void;
}) {
  if (props.products.length === 0) {
    return (
      <EmptyState
        title="조회된 상품이 없습니다"
        description="검색 조건을 입력하고 상품 불러오기를 실행하세요."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>선택</th>
            <th>상품번호</th>
            <th>상품명</th>
            <th>상태</th>
            <th>판매유형</th>
            <th>사유</th>
          </tr>
        </thead>
        <tbody>
          {props.products.map((product) => (
            <tr key={product.id}>
              <td>
                <input
                  type="checkbox"
                  checked={props.selectedProductIds.includes(product.id)}
                  onChange={() => props.onToggle(product.id)}
                />
              </td>
              <td>{product.id}</td>
              <td>{product.name ?? '-'}</td>
              <td>{product.status}</td>
              <td>{product.saleType}</td>
              <td>{product.reason ?? product.metadata?.classificationReason ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultItemsTable(props: {
  items: readonly BatchJobItemResultSnapshot[];
  onOpenPath: (targetPath?: string) => void;
}) {
  if (props.items.length === 0) {
    return (
      <EmptyState
        title="표시할 결과가 없습니다"
        description="현재 조건에 맞는 실행 결과가 없습니다."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>상품번호</th>
            <th>상태</th>
            <th>결과</th>
            <th>검증</th>
            <th>사유</th>
            <th>소요시간</th>
            <th>아티팩트</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => (
            <tr key={`${item.productId}-${item.finishedAt}-${item.attemptNumber}`}>
              <td>{item.productId}</td>
              <td>{item.status}</td>
              <td>{item.actionResult}</td>
              <td>{item.verificationMethod}</td>
              <td>
                <div className="cell-stack">
                  <span>{item.reason}</span>
                  {item.errorMessage ? (
                    <small className="muted">{item.errorMessage}</small>
                  ) : null}
                </div>
              </td>
              <td>{formatDuration(item.durationMs)}</td>
              <td>
                <div className="button-row tight wrap">
                  {item.artifact?.screenshotPath ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => props.onOpenPath(item.artifact?.screenshotPath)}
                    >
                      PNG
                    </button>
                  ) : null}
                  {item.artifact?.htmlPath ? (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => props.onOpenPath(item.artifact?.htmlPath)}
                    >
                      HTML
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
