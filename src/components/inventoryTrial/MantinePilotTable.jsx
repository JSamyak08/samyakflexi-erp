import { Table } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { rowPaginationFeature, tableFeatures, useTable } from '@tanstack/react-table';
import MantinePilot from './MantinePilot';
import './inventoryTrial.css';

const PHONE_QUERY = '(max-width: 768px)';
const NO_ROWS = [];
const features = tableFeatures({ rowPaginationFeature });

export default function MantinePilotTable({
  data,
  columns,
  getRowId,
  emptyMessage = 'No records found',
  rowStyle,
  cardTitle,
  cardFields,
  cardActions,
  testId,
  minWidth,
}) {
  const cards = useMediaQuery(PHONE_QUERY, false, { getInitialValueInEffect: false });
  const rows = data?.length ? data : NO_ROWS;
  const table = useTable({
    features,
    data: rows,
    columns,
    manualPagination: true,
    getRowId: (row, index) => String(getRowId ? getRowId(row, index) : index),
  });

  if (cards) {
    return (
      <MantinePilot>
        <div className="mantine-trial-cards" data-testid={testId ? `${testId}-cards` : undefined}>
          {rows.length === 0 ? (
            <p className="mantine-trial-empty">{emptyMessage}</p>
          ) : rows.map((row, index) => (
            <article key={String(getRowId ? getRowId(row, index) : index)} className="mantine-trial-card" style={rowStyle?.(row)}>
              <h4 className="mantine-trial-card-title">{cardTitle(row)}</h4>
              <dl>
                {(cardFields(row) || []).map((field) => (
                  <div key={field.label} style={{ display: 'contents' }}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
              {cardActions ? (
                <div className="mantine-trial-card-actions">{cardActions(row)}</div>
              ) : null}
            </article>
          ))}
        </div>
      </MantinePilot>
    );
  }

  return (
    <MantinePilot>
      <div style={{ overflowX: 'auto' }} data-testid={testId}>
        <Table
          highlightOnHover={false}
          withTableBorder
          verticalSpacing="sm"
          horizontalSpacing="md"
          style={{ minWidth: minWidth || undefined, fontSize: '0.875rem' }}
        >
          <Table.Thead>
            {table.getHeaderGroups().map((group) => (
              <Table.Tr key={group.id}>
                {group.headers.map((header) => (
                  <Table.Th key={header.id} style={header.column.columnDef.meta?.headerStyle}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </Table.Th>
                ))}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {table.getRowModel().rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={Math.max(columns.length, 1)} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                  {emptyMessage}
                </Table.Td>
              </Table.Tr>
            ) : table.getRowModel().rows.map((row) => (
              <Table.Tr key={row.id} style={rowStyle?.(row.original)}>
                {row.getAllCells().map((cell) => (
                  <Table.Td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </MantinePilot>
  );
}
