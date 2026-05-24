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
  return (
    <span
      className={`status-badge tone-${props.tone}`}
      data-value={props.value}
    >
      {props.value}
    </span>
  );
}

export function BrandLogo(props: {
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <div className={`brand-logo ${props.compact ? 'compact' : ''}`}>
      <div className="brand-logo-mark" aria-hidden="true">
        <span className="brand-logo-orbit" />
        <span className="brand-logo-letter">W</span>
      </div>
      <div className="brand-logo-copy">
        <strong className="brand-logo-wordmark">Wishfigure</strong>
        <small className="brand-logo-subtitle">{props.subtitle ?? 'SELLER DESK'}</small>
      </div>
    </div>
  );
}

export function VersionPill(props: {
  version: string;
  packaged: boolean;
}) {
  return (
    <span className="version-pill">
      버전 {props.version} · {props.packaged ? '설치형' : '개발 모드'}
    </span>
  );
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

export function WorkflowCard(props: {
  step: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <article className="workflow-card">
      <span className="workflow-step">{props.step}</span>
      <strong>{props.title}</strong>
      <p className="muted">{props.description}</p>
      <button type="button" className="secondary-button" onClick={props.onAction}>
        {props.actionLabel}
      </button>
    </article>
  );
}

export function ActionCard(props: {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  primaryTone?: 'primary' | 'secondary' | 'danger';
}) {
  const primaryClass =
    props.primaryTone === 'danger'
      ? 'danger-button'
      : props.primaryTone === 'secondary'
        ? 'secondary-button'
        : 'primary-button';

  return (
    <article className="action-card">
      <strong>{props.title}</strong>
      <p className="muted">{props.description}</p>
      <div className="button-row wrap">
        <button type="button" className={primaryClass} onClick={props.onPrimary}>
          {props.primaryLabel}
        </button>
        {props.secondaryLabel && props.onSecondary ? (
          <button type="button" className="secondary-button" onClick={props.onSecondary}>
            {props.secondaryLabel}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function GuideList(props: {
  title: string;
  items: readonly string[];
}) {
  return (
    <section className="guide-card">
      <h3>{props.title}</h3>
      <ol className="guide-list">
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  );
}

export function ProductSelectionPreview(props: {
  products: readonly ProductSnapshot[];
}) {
  if (props.products.length === 0) {
    return (
      <EmptyState
        title="선택된 상품이 없습니다"
        description="상품 목록에서 체크박스로 변경 대상을 고르세요."
      />
    );
  }

  return (
    <div className="selection-preview">
      {props.products.slice(0, 8).map((product) => (
        <div key={product.id} className="selection-chip">
          <strong>{product.id}</strong>
          <span>{product.name ?? product.status}</span>
        </div>
      ))}
      {props.products.length > 8 ? (
        <div className="selection-chip more">
          +{props.products.length - 8}건 더 선택됨
        </div>
      ) : null}
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
