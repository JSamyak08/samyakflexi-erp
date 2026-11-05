import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpToLine, GripVertical } from 'lucide-react';
import { guardReorderEvent } from '../utils/pressQueueReorder';

const arrowStyle = (enabled) => ({
  padding: '4px',
  width: '28px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: enabled ? 1 : 0.35,
  cursor: enabled ? 'pointer' : 'not-allowed',
});

/**
 * Up, down, move-to-top, and a drag handle. Every pointer and key event
 * stops here so the job card cannot treat the gesture as "open the run".
 */
export default function PressQueueReorderControls({
  orderId,
  position,
  canUp,
  canDown,
  canTop,
  canDrag,
  onUp,
  onDown,
  onTop,
}) {
  const fire = (event, action) => {
    guardReorderEvent(event);
    if (action) action();
  };

  return (
    <div
      className="queue-reorder-controls"
      data-testid="queue-reorder-controls"
      onClick={(event) => guardReorderEvent(event)}
      onMouseDown={(event) => guardReorderEvent(event, { allowDefault: true })}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div
        role="button"
        tabIndex={canDrag ? 0 : -1}
        aria-label={`Drag job ${position} to a new queue position`}
        title="Drag to reorder"
        data-testid="queue-drag-handle"
        draggable={Boolean(canDrag)}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => guardReorderEvent(event)}
        onDragStart={(event) => {
          event.stopPropagation();
          if (!canDrag) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.setData('text/plain', String(orderId));
          event.dataTransfer.effectAllowed = 'move';
        }}
        style={{
          width: '28px',
          height: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          color: canDrag ? '#64748b' : '#cbd5e1',
          cursor: canDrag ? 'grab' : 'not-allowed',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
        }}
      >
        <GripVertical size={14} />
      </div>
      <button
        type="button"
        className="btn-secondary"
        data-testid="queue-move-up"
        aria-label={`Move job ${position} up`}
        title={canUp ? 'Move priority up' : 'Top of the waiting queue'}
        disabled={!canUp}
        style={arrowStyle(canUp)}
        onClick={(event) => fire(event, onUp)}
      >
        <ArrowUp size={14} />
      </button>
      <span data-testid="queue-position" style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b' }}>#{position}</span>
      <button
        type="button"
        className="btn-secondary"
        data-testid="queue-move-down"
        aria-label={`Move job ${position} down`}
        title={canDown ? 'Move priority down' : 'Bottom of the queue'}
        disabled={!canDown}
        style={arrowStyle(canDown)}
        onClick={(event) => fire(event, onDown)}
      >
        <ArrowDown size={14} />
      </button>
      <button
        type="button"
        className="btn-secondary"
        data-testid="queue-move-top"
        aria-label={`Move job ${position} to the top of the waiting queue`}
        title={canTop ? 'Move to top of the waiting queue' : 'Already at the top of the waiting queue'}
        disabled={!canTop}
        style={arrowStyle(canTop)}
        onClick={(event) => fire(event, onTop)}
      >
        <ArrowUpToLine size={14} />
      </button>
    </div>
  );
}
