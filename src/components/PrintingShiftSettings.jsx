import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { fetchSystemSetting, saveSystemSetting } from '../services/supabaseDataService';
import { isAdminRole } from '../utils/orderAutoClose';
import {
  DEFAULT_PRINTING_SHIFTS,
  PRINTING_SHIFT_WINDOWS_SETTING,
  normalizePrintingShifts
} from '../utils/printingShifts';

export default function PrintingShiftSettings({ currentUser = null }) {
  const admin = isAdminRole(currentUser);
  const [shifts, setShifts] = useState(DEFAULT_PRINTING_SHIFTS);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    fetchSystemSetting(PRINTING_SHIFT_WINDOWS_SETTING)
      .then((value) => {
        if (active && value) setShifts(normalizePrintingShifts(value));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const updateShift = (index, field, value) => {
    setShifts((current) => current.map((shift, itemIndex) => (
      itemIndex === index ? { ...shift, [field]: value } : shift
    )));
  };

  const save = async (event) => {
    event.preventDefault();
    if (!admin) return;
    const next = normalizePrintingShifts(shifts);
    if (next.length !== shifts.filter((shift) => shift.start && shift.end).length) {
      setStatus('Each shift needs a name and a time like 08:00.');
      return;
    }
    try {
      await saveSystemSetting(PRINTING_SHIFT_WINDOWS_SETTING, next);
      setShifts(next);
      setStatus('Shift times saved. Run and idle reports use them on the next load.');
    } catch (error) {
      setStatus(error?.message || 'Shift times were not saved.');
    }
  };

  return (
    <form
      className="glass-panel"
      data-testid="printing-shift-settings"
      style={{ padding: '24px', marginBottom: '24px' }}
      onSubmit={save}
    >
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} /> Printing shift times
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
          Run and idle time is split on these clocks in IST. The default is Day 08:00–20:00 and Night 20:00–08:00.
          A shift that ends at or before its start crosses midnight. Only Admin can change the times.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {shifts.map((shift, index) => (
          <div key={shift.id || index} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.8fr auto', gap: '8px', alignItems: 'end' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
              Name
              <input className="form-control" value={shift.name} disabled={!admin} onChange={(event) => updateShift(index, 'name', event.target.value)} />
            </label>
            <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
              Start
              <input className="form-control" type="time" value={shift.start} disabled={!admin} onChange={(event) => updateShift(index, 'start', event.target.value)} required />
            </label>
            <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>
              End
              <input className="form-control" type="time" value={shift.end} disabled={!admin} onChange={(event) => updateShift(index, 'end', event.target.value)} required />
            </label>
            {admin && shifts.length > 1 ? (
              <button type="button" className="btn-secondary" onClick={() => setShifts((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            ) : <span />}
          </div>
        ))}
      </div>
      {admin && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShifts((current) => [...current, { id: `shift-${current.length + 1}`, name: `Shift ${current.length + 1}`, start: '08:00', end: '16:00' }])}
          >
            Add shift
          </button>
          <button type="button" className="btn-secondary" onClick={() => setShifts(DEFAULT_PRINTING_SHIFTS.map((shift) => ({ ...shift })))}>Reset default</button>
          <button type="submit" className="btn-primary">Save shift times</button>
        </div>
      )}
      {status && <p style={{ margin: '12px 0 0', fontSize: '0.82rem', fontWeight: 700 }}>{status}</p>}
    </form>
  );
}
