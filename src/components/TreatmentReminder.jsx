import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { fetchMyTreatmentBookings } from '../api';

function getTodayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':');
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${suffix}`;
}

// Morning-of treatment reminder. Renders a banner whenever the signed-in
// athlete has a BOOKED treatment today. Athletes can opt in to a browser
// notification (Notification API) which fires once per treatment day —
// the app has no email infrastructure, so this is the in-app channel.
export default function TreatmentReminder() {
  const [todays, setTodays] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const [notifPref, setNotifPref] = useState(() => localStorage.getItem('fp_treatment_reminders') === 'on');

  useEffect(() => {
    let isMounted = true;
    fetchMyTreatmentBookings()
      .then(res => {
        if (!isMounted) return;
        const today = getTodayYMD();
        const list = (res.data || []).filter(b => b.status === 'booked' && b.date === today);
        setTodays(list);

        // Fire the browser notification once for today (opted-in users).
        if (list.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
          const dayKey = `fp_treatment_notified_${today}`;
          if (!localStorage.getItem(dayKey)) {
            const b = list[0];
            try {
              new Notification('Treatment today', {
                body: `${b.treatmentType} with ${b.therapistName} at ${formatTime(b.startTime)} (${b.durationMins} min).`
              });
              localStorage.setItem(dayKey, '1');
            } catch { /* notifications unsupported on this browser */ }
          }
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const handleEnable = async () => {
    if (!('Notification' in window)) {
      alert('Your browser does not support notifications. The banner will still remind you on the day.');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      localStorage.setItem('fp_treatment_reminders', 'on');
      setNotifPref(true);
    } else {
      localStorage.setItem('fp_treatment_reminders', 'off');
      setNotifPref(false);
    }
  };

  if (dismissed || todays.length === 0) return null;

  return (
    <div style={{
      background: 'linear-gradient(90deg, #a855f7 0%, #7c3aed 100%)',
      color: 'white', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px',
      display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)'
    }}>
      <Bell size={20} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 800 }}>
          {todays.length === 1 ? 'Treatment today!' : `${todays.length} treatments today!`}
        </div>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
          {todays.slice(0, 2).map((b, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {b.treatmentType} with {b.therapistName} at {formatTime(b.startTime)} ({b.durationMins} min)
            </span>
          ))}
        </div>
        {!notifPref && (
          <button
            onClick={handleEnable}
            style={{ marginTop: '6px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
          >
            <Bell size={11} style={{ verticalAlign: '-1px', marginRight: '4px' }} /> Enable morning reminders
          </button>
        )}
      </div>
      <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', padding: '4px' }} aria-label="Dismiss reminder">
        <X size={16} />
      </button>
    </div>
  );
}