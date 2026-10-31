import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  pageOf,
  collapsedStorageKey,
  readCollapsed,
  writeCollapsed,
} from '../utils/printingDeadlinePaging.js';

function browserStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useCollapsedSection(section, userKey) {
  const key = collapsedStorageKey(section, userKey);
  const [collapsed, setCollapsed] = useState(() => readCollapsed(browserStorage(), key));
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setCollapsed(readCollapsed(browserStorage(), key));
  }
  const toggle = () => {
    setCollapsed((current) => {
      const next = !current;
      writeCollapsed(browserStorage(), key, next);
      return next;
    });
  };
  return { collapsed, toggle, key };
}

export function usePagedItems(items) {
  const list = Array.isArray(items) ? items : [];
  const signature = list.map((item) => item?.order?.id || item?.orderId || '').join('|');
  const [page, setPage] = useState(1);
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    const next = pageOf(list, page).page;
    if (next !== page) setPage(next);
  }
  const view = pageOf(list, page);
  return { view, setPage };
}

export function ListPager({ view, onPage, testId }) {
  if (!view?.showControls) return null;
  const buttonStyle = (disabled) => ({
    background: '#ffffff',
    border: '1px solid #cbd5e1',
    color: disabled ? '#94a3b8' : '#0f172a',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '0.78rem',
    fontWeight: '800',
    cursor: disabled ? 'default' : 'pointer',
  });
  return (
    <div
      data-testid={`${testId}-pager`}
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
    >
      <span data-testid={`${testId}-range`} style={{ fontSize: '0.78rem', color: '#475569', fontWeight: '700' }}>
        Showing {view.showingFrom}–{view.showingTo} of {view.total}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          data-testid={`${testId}-prev`}
          disabled={view.page <= 1}
          onClick={() => onPage(view.page - 1)}
          style={buttonStyle(view.page <= 1)}
        >
          Prev
        </button>
        <span data-testid={`${testId}-page`} style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0f172a', minWidth: '88px', textAlign: 'center' }}>
          Page {view.page} of {view.pageCount}
        </span>
        <button
          type="button"
          data-testid={`${testId}-next`}
          disabled={view.page >= view.pageCount}
          onClick={() => onPage(view.page + 1)}
          style={buttonStyle(view.page >= view.pageCount)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function SectionChevron({ collapsed }) {
  return collapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />;
}
