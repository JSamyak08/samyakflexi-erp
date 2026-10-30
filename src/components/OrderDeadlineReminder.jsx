import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Printer } from 'lucide-react';
import {
  assessPrintingDeadlineReminder,
  canManageOrderDeadline,
  deadlineActorLabel,
} from '../utils/orderDeadlineReminder.js';
import {
  fetchOrderDeadlineHistory,
  saveOrderClientInformed,
  saveRevisedOrderDeadline,
} from '../services/orderDeadlineReminder.js';

function stamp(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function OrderDeadlineReminder({
  order,
  stageInfo,
  currentUser,
  canPlanPrinting = false,
  onPlanPrinting,
  onSaved,
  variant = 'inline',
}) {
  const assessment = useMemo(
    () => assessPrintingDeadlineReminder(order, stageInfo),
    [order, stageInfo]
  );
  const canManage = canManageOrderDeadline(currentUser?.role);
  const [revisedDate, setRevisedDate] = useState(assessment.revisedDate || '');
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRevisedDate(assessment.revisedDate || '');
  }, [order?.id, assessment.revisedDate]);

  useEffect(() => {
    if (variant !== 'detail' || !order?.id) return undefined;
    let active = true;
    fetchOrderDeadlineHistory(order.id)
      .then((rows) => { if (active) setHistory(rows); })
      .catch(() => { if (active) setHistory([]); });
    return () => { active = false; };
  }, [variant, order?.id, order?.revisedDeadline, order?.clientInformed, order?.deadlineRevisedAt]);

  if (!canManage || !assessment.active) return null;

  const persist = async (resultPromise) => {
    setSaving(true);
    setError('');
    try {
      const result = await resultPromise;
      if (result?.history) setHistory((prev) => [result.history, ...prev.filter((row) => row.id !== result.history.id)]);
      if (onSaved) await onSaved(result.order, result.audit);
      setReason('');
    } catch (err) {
      setError(err?.message || 'The deadline change was not saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveDate = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canManage || saving) return;
    persist(saveRevisedOrderDeadline(order, {
      revisedDeadline: revisedDate,
      reason,
      actor: deadlineActorLabel(currentUser),
    }));
  };

  const toggleInformed = (event) => {
    event.stopPropagation();
    if (!canManage || saving) return;
    persist(saveOrderClientInformed(order, {
      informed: event.target.checked,
      actor: deadlineActorLabel(currentUser),
    }));
  };

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      style={{
        margin: variant === 'inline' ? '0 20px 16px' : '0 0 16px',
        padding: '14px 16px',
        borderRadius: '10px',
        border: '1px solid #fde68a',
        background: '#fffbeb',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div>
        <div style={{ fontSize: '0.86rem', fontWeight: '800', color: '#92400e' }}>
          Delivery is {assessment.distanceLabel}, and Printing has not started
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#78350f', lineHeight: 1.45 }}>
          Original deadline {assessment.originalDate || 'not recorded'}
          {assessment.revisedDate ? ` · revised to ${assessment.revisedDate}` : ''}.
          Set a new date and plan the press. Client informed applies to this revised date only:
          once it is saved, this reminder stays quiet even if that date is still inside 2 days.
          A new date brings it back when that date is under 2 days away.
        </p>
      </div>

      <form onSubmit={saveDate} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem', fontWeight: '700', color: '#92400e' }}>
          Revised deadline
          <input
            type="date"
            value={revisedDate}
            disabled={!canManage || saving}
            onChange={(event) => setRevisedDate(event.target.value)}
            className="form-control"
            style={{ fontSize: '0.82rem' }}
            required
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem', fontWeight: '700', color: '#92400e', flex: '1 1 180px' }}>
          Reason
          <input
            type="text"
            value={reason}
            disabled={!canManage || saving}
            onChange={(event) => setReason(event.target.value)}
            className="form-control"
            placeholder="Why the date is moving"
            maxLength={500}
            style={{ fontSize: '0.82rem' }}
          />
        </label>
        <button
          type="submit"
          className="btn-primary"
          disabled={!canManage || saving}
          style={{ background: '#d97706', borderColor: '#d97706', padding: '8px 12px', fontSize: '0.8rem', fontWeight: '700' }}
        >
          {saving ? 'Saving…' : 'Save revised date'}
        </button>
        {canPlanPrinting ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onPlanPrinting?.(order)}
            style={{ padding: '8px 12px', fontSize: '0.8rem', fontWeight: '700', color: '#9a3412', borderColor: '#fdba74', background: '#fff7ed', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Printer size={14} /> Plan on Printing Scheduler
          </button>
        ) : (
          <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: '700', alignSelf: 'center' }}>
            Ask the plant to plan this job on the Printing Scheduler.
          </span>
        )}
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#78350f', fontWeight: '700' }}>
          Update the client about the revised date (WhatsApp)
        </p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8rem', color: '#78350f', fontWeight: '700' }}>
          <input
            type="checkbox"
            checked={assessment.clientInformed}
            disabled={!canManage || saving}
            onChange={toggleInformed}
            style={{ marginTop: '2px' }}
          />
          <span>
            Client informed
            {assessment.clientInformed && order.clientInformedBy && (
              <span style={{ fontWeight: '600', color: '#92400e' }}>
                {' '}· {order.clientInformedBy}{order.clientInformedAt ? `, ${stamp(order.clientInformedAt)}` : ''}
                {assessment.revisedDate ? ` · for ${assessment.revisedDate}` : ''}
              </span>
            )}
          </span>
        </label>
      </div>

      {error && <div style={{ color: '#b91c1c', fontSize: '0.78rem', fontWeight: '700' }}>{error}</div>}

      {order.deadlineRevisedBy && (
        <div style={{ fontSize: '0.75rem', color: '#92400e' }}>
          <CheckCircle2 size={12} style={{ verticalAlign: 'text-bottom' }} /> Last revision by {order.deadlineRevisedBy}
          {order.deadlineRevisedAt ? ` on ${stamp(order.deadlineRevisedAt)}` : ''}
          {order.deadlineRevisionReason ? ` · ${order.deadlineRevisionReason}` : ''}
        </div>
      )}

      {variant === 'detail' && history.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#92400e', textTransform: 'uppercase' }}>History</div>
          {history.map((row) => (
            <div key={row.id} style={{ fontSize: '0.75rem', color: '#78350f', background: '#fff', borderRadius: '6px', padding: '6px 8px' }}>
              <strong>{row.actor || 'User'}</strong> · {stamp(row.actedAt)} · {row.eventType === 'revision'
                ? `Revised ${row.previousDeadline || 'unset'} → ${row.revisedDeadline}`
                : row.reason}
              {row.reason && row.eventType === 'revision' ? ` · ${row.reason}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
