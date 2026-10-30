import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Mail, Printer } from 'lucide-react';
import {
  assessPrintingDeadlineReminder,
  buildClientDelayMessage,
  canManageOrderDeadline,
  deadlineActorLabel,
  mailtoHref,
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
  clients = [],
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
  const client = useMemo(() => {
    const name = String(order?.clientName || '').trim().toLowerCase();
    return (clients || []).find((item) => String(item?.name || '').trim().toLowerCase() === name) || null;
  }, [clients, order?.clientName]);
  const draftSeed = useMemo(() => buildClientDelayMessage(order, client), [order, client]);
  const [revisedDate, setRevisedDate] = useState(assessment.revisedDate || '');
  const [reason, setReason] = useState('');
  const [messageOpen, setMessageOpen] = useState(false);
  const [draftBody, setDraftBody] = useState(draftSeed.body);
  const [draftSubject, setDraftSubject] = useState(draftSeed.subject);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRevisedDate(assessment.revisedDate || '');
    setDraftBody(draftSeed.body);
    setDraftSubject(draftSeed.subject);
  }, [order?.id, assessment.revisedDate, draftSeed.body, draftSeed.subject]);

  useEffect(() => {
    if (variant !== 'detail' || !order?.id) return undefined;
    let active = true;
    fetchOrderDeadlineHistory(order.id)
      .then((rows) => { if (active) setHistory(rows); })
      .catch(() => { if (active) setHistory([]); });
    return () => { active = false; };
  }, [variant, order?.id, order?.revisedDeadline, order?.clientInformed, order?.deadlineRevisedAt]);

  if (!assessment.active) return null;

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

  const openMail = () => {
    const href = mailtoHref({ to: '', subject: draftSubject, body: draftBody });
    const link = document.createElement('a');
    link.href = href;
    link.rel = 'noopener';
    link.click();
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
          Set a new date, put the job on the Printing Scheduler, and tick Client informed after you tell them.
          The reminder stays until both are done, then waits for the new date.
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
            </span>
          )}
        </span>
      </label>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setMessageOpen((open) => !open)}
          style={{ padding: '6px 10px', fontSize: '0.78rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Mail size={13} /> {messageOpen ? 'Hide message draft' : 'Review client message'}
        </button>
        {!canManage && (
          <span style={{ fontSize: '0.75rem', color: '#92400e' }}>
            Sales, plant, production, or admin can save this.
          </span>
        )}
      </div>

      {messageOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px' }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#92400e', fontWeight: '700' }}>
            Nothing is sent from FlexiERP. Review the text, then open it in your mail app and send it yourself.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem', fontWeight: '700', color: '#78350f' }}>
            Subject
            <input className="form-control" value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem', fontWeight: '700', color: '#78350f' }}>
            Message
            <textarea className="form-control" rows={8} value={draftBody} onChange={(event) => setDraftBody(event.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" style={{ fontSize: '0.78rem', fontWeight: '700' }} onClick={openMail}>
              Open in my mail app
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.78rem', fontWeight: '700' }}
              onClick={() => navigator.clipboard?.writeText(`${draftSubject}\n\n${draftBody}`)}
            >
              Copy message
            </button>
          </div>
        </div>
      )}

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
