import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export default function TablePagination(props) {
  const {
    pagination,
    currentPage: propPage,
    totalItems: propTotal,
    pageSize: propSize,
    onPageChange,
    goToPage,
    setCurrentPage,
    onPageSizeChange,
    setPageSize,
    pageSizeOptions = [10, 25, 50, 100, 250, 500],
    style = {}
  } = props;

  const currentPage = pagination?.currentPage ?? propPage ?? 1;
  const totalItems = pagination?.totalItems ?? propTotal ?? 0;
  const pageSize = pagination?.pageSize ?? propSize ?? 25;

  const handlePageChange = onPageChange || goToPage || setCurrentPage || pagination?.onPageChange || pagination?.goToPage || pagination?.setCurrentPage;
  const handlePageSizeChange = onPageSizeChange || setPageSize || pagination?.onPageSizeChange || pagination?.setPageSize;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize)) || 1;
  const startItem = totalItems > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div 
      className="table-pagination-container"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: 'var(--surface-color, #ffffff)',
        borderTop: '1px solid var(--border-color, #e2e8f0)',
        borderBottomLeftRadius: '8px',
        borderBottomRightRadius: '8px',
        fontSize: '0.82rem',
        color: 'var(--text-secondary, #475569)',
        ...style
      }}
    >
      {/* Left: Record Count Info */}
      <div style={{ fontWeight: '500' }}>
        {totalItems > 0 ? (
          <span>
            Showing <strong style={{ color: 'var(--text-main, #0f172a)' }}>{startItem}</strong> – <strong style={{ color: 'var(--text-main, #0f172a)' }}>{endItem}</strong> of <strong style={{ color: 'var(--text-main, #0f172a)' }}>{totalItems}</strong> records
          </span>
        ) : (
          <span>No records found</span>
        )}
      </div>

      {/* Middle & Right: Rows per page & Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        {/* Page Size Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Rows per page:</span>
          <select
            className="form-control"
            style={{
              padding: '4px 8px',
              fontSize: '0.8rem',
              fontWeight: '600',
              width: 'auto',
              borderRadius: '6px',
              borderColor: 'var(--border-color, #cbd5e1)',
              cursor: 'pointer'
            }}
            value={pageSize}
            onChange={e => {
              const newSize = Number(e.target.value);
              if (handlePageSizeChange) handlePageSizeChange(newSize);
              if (handlePageChange) handlePageChange(1); // Reset to page 1 on page size change
            }}
          >
            {pageSizeOptions.map(size => (
              <option key={size} value={size}>
                {size} per page {size === 25 ? '(Default)' : size === 500 ? '(Max)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Page Navigation Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* First Page Button */}
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
            disabled={currentPage <= 1}
            onClick={() => handlePageChange && handlePageChange(1)}
            title="First Page"
          >
            <ChevronsLeft size={14} />
          </button>

          {/* Previous Page Button */}
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
            disabled={currentPage <= 1}
            onClick={() => handlePageChange && handlePageChange(currentPage - 1)}
            title="Previous Page"
          >
            <ChevronLeft size={14} /> Previous
          </button>

          {/* Page Counter */}
          <span style={{ padding: '0 8px', fontWeight: '700', color: 'var(--text-main, #0f172a)' }}>
            Page {currentPage} of {totalPages}
          </span>

          {/* Next Page Button */}
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
            disabled={currentPage >= totalPages}
            onClick={() => handlePageChange && handlePageChange(currentPage + 1)}
            title="Next Page"
          >
            Next <ChevronRight size={14} />
          </button>

          {/* Last Page Button */}
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
            disabled={currentPage >= totalPages}
            onClick={() => handlePageChange && handlePageChange(totalPages)}
            title="Last Page"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Custom React Hook for managing table pagination state seamlessly
 */
export function usePagination(items = [], defaultPageSize = 25) {
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(defaultPageSize);

  const itemsLength = items?.length || 0;
  const totalPages = Math.max(1, Math.ceil(itemsLength / pageSize));
  
  // If item length decreases and currentPage > totalPages, reset to last available page
  React.useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [itemsLength, pageSize, totalPages, currentPage]);

  // Reset to page 1 if search or item count changes
  const prevLengthRef = React.useRef(itemsLength);
  React.useEffect(() => {
    if (prevLengthRef.current !== itemsLength) {
      prevLengthRef.current = itemsLength;
      setCurrentPage(1);
    }
  }, [itemsLength]);

  const startIndex = itemsLength > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(currentPage * pageSize, itemsLength);

  const paginatedItems = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return (items || []).slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  return {
    currentPage,
    setCurrentPage,
    goToPage: setCurrentPage,
    onPageChange: setCurrentPage,
    pageSize,
    setPageSize,
    onPageSizeChange: setPageSize,
    totalPages,
    startIndex,
    endIndex,
    paginatedItems,
    pagedData: paginatedItems,
    totalItems: itemsLength
  };
}
