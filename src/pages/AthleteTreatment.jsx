import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Stethoscope, CalendarDays, List, Plus,
  Trash2, AlertCircle, Users, ChevronLeft, ChevronRight, Lock
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import HelpButton from '../components/HelpButton';
import TreatmentReminder from '../components/TreatmentReminder';
import {
  fetchEntitledPods, getAthleteByEmail,
  fetchCurrentAthlete, fetchMyTherapistProfile, upsertMyTherapistProfile,
  fetchClubTherapists, adminAddTherapist, adminSetTherapistActive,
  fetchTherapistSlots, saveTherapistSlot, deleteTherapistSlot,
  bookTreatmentSlot, cancelTreatmentBooking, completeTreatmentBooking,
  fetchMyTreatmentBookings, fetchTherapistBookings, fetchClubTreatmentBookings,
  fetchMyOpenInjuries
} from '../api';

// ===== SHARED DATE HELPERS (weeks start Monday — matches AthleteSchedule) =====
function getWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function getWeekColor(monday) {
  const WEEK_COLORS = ['#008ed3', '#8b5cf6', '#f59e0b', '#10b981'];
  const weekIndex = Math.floor(getWeekMonday(monday).getTime() / (7 * 86400000));
  return WEEK_COLORS[((weekIndex % 4) + 4) % 4];
}

function getTodayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(ymd) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':');
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${suffix}`;
}

// ===== CONSTANTS =====
const TREATMENT_TYPES = [
  { name: 'Physiotherapy', color: '#a855f7' },
  { name: 'Massage', color: '#ec4899' },
  { name: 'Recovery', color: '#06b6d4' },
  { name: 'Assessment', color: '#f59e0b' },
  { name: 'Other', color: '#64748b' }
];

const SPECIALTIES = ['Physiotherapist', 'Massage Therapist', 'Sports Therapist', 'Other'];

function typeColor(type) {
  return (TREATMENT_TYPES.find(t => t.name === type) || TREATMENT_TYPES[4]).color;
}

const STATUS_STYLE = {
  booked: { bg: '#fef9c3', color: '#a16207', label: 'Booked' },
  completed: { bg: '#dcfce7', color: '#15803d', label: 'Completed' },
  cancelled: { bg: '#fee2e2', color: '#b91c1c', label: 'Cancelled' },
  open: { bg: '#dcfce7', color: '#15803d', label: 'Open' }
};

export default function AthleteTreatment() {
  const { userEmail, role } = useAuth();
  const navigate = useNavigate();

  const isTherapist = role === 'therapist';
  const isStaff = role === 'coach' || isTherapist;

  // ----- core data -----
  const [pods, setPods] = useState([]);
  const [me, setMe] = useState(null);            // my athletes row
  const [profile, setProfile] = useState(null);  // my club_therapists row
  const [therapists, setTherapists] = useState([]);
  const [slots, setSlots] = useState([]);        // my slots (therapist view)
  const [bookings, setBookings] = useState([]);  // role-dependent booking list
  const [injuries, setInjuries] = useState([]);  // my open injuries
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);          // { kind: 'ok'|'err', text }

  // ----- navigation -----
  const [tab, setTab] = useState('book');        // book | bookings | availability | manage
  const [viewMode, setViewMode] = useState('agenda'); // agenda | calendar
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  // ----- booking form -----
  const [selType, setSelType] = useState('Physiotherapy');
  const [selTherapist, setSelTherapist] = useState(null);
  const [selDate, setSelDate] = useState(getTodayYMD());
  const [slotsForDate, setSlotsForDate] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selSlot, setSelSlot] = useState(null);
  const [selInjuryId, setSelInjuryId] = useState('');
  const [bookNotes, setBookNotes] = useState('');

  // ----- slot form (therapist availability) -----
  const [slotDate, setSlotDate] = useState(getTodayYMD());
  const [slotTime, setSlotTime] = useState('09:00');
  const [slotDur, setSlotDur] = useState(45);

  // ----- therapist profile form -----
  const [profSpecialty, setProfSpecialty] = useState('Physiotherapist');
  const [profDuration, setProfDuration] = useState(45);

  // ----- staff "add therapist" form -----
  const [staffEmail, setStaffEmail] = useState('');
  const [staffSpecialty, setStaffSpecialty] = useState('Physiotherapist');
  const [staffDuration, setStaffDuration] = useState(45);

  const hasAccess = isStaff || pods.includes('treatment');
  const clubId = me ? me.primary_club_id : null;

  // ----- data loading -----
  useEffect(() => {
    if (!userEmail) return;
    let mounted = true;

    async function loadAll() {
      setLoading(true);
      try {
        const meRes = await fetchCurrentAthlete();
        if (!mounted) return;
        setMe(meRes.athlete);

        if (isTherapist) {
          setTab('availability');
          const profRes = await fetchMyTherapistProfile();
          if (!mounted) return;
          setProfile(profRes.profile);
          if (profRes.profile) {
            setProfSpecialty(profRes.profile.specialty);
            setProfDuration(profRes.profile.default_duration_mins);
            setSlotDur(profRes.profile.default_duration_mins);
          }
          const [slotsRes, bookRes] = await Promise.all([
            profRes.profile ? fetchTherapistSlots({ therapistId: profRes.profile.id }) : Promise.resolve({ data: [] }),
            fetchTherapistBookings()
          ]);
          if (!mounted) return;
          setSlots(slotsRes.data || []);
          setBookings(bookRes.data || []);
        } else {
          // Athletes resolve their pods exactly like AthleteSchedule:
          // granted (admin-set active_pods) ∪ purchased (viewer_entitled_pods).
          if (role !== 'coach') {
            const athEmailRes = await getAthleteByEmail(userEmail).catch(() => ({ status: 'Error' }));
            let granted = [];
            if (athEmailRes.status === 'Success' && Array.isArray(athEmailRes.rowData)) {
              granted = String(athEmailRes.rowData[11] || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
            }
            const entRes = await fetchEntitledPods().catch(() => ({ pods: [] }));
            if (mounted) setPods(Array.from(new Set([...granted, ...(entRes.pods || [])])));
          }
          const club = meRes.athlete ? meRes.athlete.primary_club_id : null;
          if (club) {
            const [thRes, bookRes] = await Promise.all([
              fetchClubTherapists(club),
              role === 'coach' ? fetchClubTreatmentBookings(club) : fetchMyTreatmentBookings()
            ]);
            if (!mounted) return;
            setTherapists(thRes.data || []);
            setBookings(bookRes.data || []);
            if (role !== 'coach') {
              const injRes = await fetchMyOpenInjuries();
              if (mounted) setInjuries(injRes.data || []);
            }
            if (role === 'coach') setTab('manage');
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAll();
    return () => { mounted = false; };
  }, [userEmail, role, isTherapist]);

  // ===== reload helpers =====
  async function reloadBookings() {
    if (isTherapist) {
      const res = await fetchTherapistBookings();
      setBookings(res.data || []);
    } else if (role === 'coach') {
      if (clubId) {
        const res = await fetchClubTreatmentBookings(clubId);
        setBookings(res.data || []);
      }
    } else {
      const res = await fetchMyTreatmentBookings();
      setBookings(res.data || []);
      const injRes = await fetchMyOpenInjuries();
      setInjuries(injRes.data || []);
    }
  }

  async function reloadSlots() {
    if (!profile) return;
    const res = await fetchTherapistSlots({ therapistId: profile.id });
    setSlots(res.data || []);
  }

  // Load open slots for the booking picker (one therapist + one date).
  useEffect(() => {
    if (!selTherapist || !selDate) { setSlotsForDate([]); return; }
    let mounted = true;
    setSlotsLoading(true);
    setSelSlot(null);
    fetchTherapistSlots({ therapistId: selTherapist, fromDate: selDate, toDate: selDate })
      .then(res => { if (mounted) setSlotsForDate((res.data || []).filter(s => s.status === 'open')); })
      .catch(() => { if (mounted) setSlotsForDate([]); })
      .finally(() => { if (mounted) setSlotsLoading(false); });
    return () => { mounted = false; };
  }, [selTherapist, selDate]);

  // ===== action handlers =====
  async function handleBook() {
    if (!selSlot || saving) return;
    setSaving(true);
    setMsg(null);
    const res = await bookTreatmentSlot({
      slotId: selSlot.id,
      treatmentType: selType,
      injuryId: selInjuryId || null,
      notes: bookNotes
    });
    if (res.status === 'Success') {
      setSelSlot(null);
      setBookNotes('');
      setSelInjuryId('');
      setMsg({ kind: 'ok', text: 'Treatment booked! It now appears in your schedule calendar.' });
      await reloadBookings();
      setTab('bookings');
    } else {
      setMsg({ kind: 'err', text: res.message || 'Booking failed.' });
    }
    setSaving(false);
  }

  async function handleCancelBooking(id) {
    if (saving) return;
    if (!window.confirm('Cancel this treatment booking? The slot will be reopened for others.')) return;
    setSaving(true);
    const res = await cancelTreatmentBooking(id);
    if (res.status !== 'Success') setMsg({ kind: 'err', text: res.message || 'Cancel failed.' });
    await reloadBookings();
    setSaving(false);
  }

  async function handleCompleteBooking(id) {
    if (saving) return;
    setSaving(true);
    const res = await completeTreatmentBooking(id);
    if (res.status !== 'Success') setMsg({ kind: 'err', text: res.message || 'Update failed.' });
    await reloadBookings();
    setSaving(false);
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMsg(null);
    const res = await upsertMyTherapistProfile({ specialty: profSpecialty, defaultDurationMins: profDuration });
    if (res.status === 'Success') {
      const profRes = await fetchMyTherapistProfile();
      setProfile(profRes.profile);
      setMsg({ kind: 'ok', text: 'Profile saved.' });
    } else {
      setMsg({ kind: 'err', text: res.message || 'Save failed.' });
    }
    setSaving(false);
  }

  async function handleAddSlot(e) {
    e.preventDefault();
    if (saving || !profile) return;
    setSaving(true);
    setMsg(null);
    const res = await saveTherapistSlot({
      therapistId: profile.id,
      clubId,
      date: slotDate,
      startTime: slotTime,
      durationMins: slotDur
    });
    if (res.status === 'Success') {
      setMsg({ kind: 'ok', text: 'Slot published — athletes can now book it.' });
      await reloadSlots();
    } else {
      setMsg({ kind: 'err', text: res.message || 'Could not publish slot.' });
    }
    setSaving(false);
  }

  async function handleDeleteSlot(id) {
    if (!window.confirm('Remove this availability slot?')) return;
    const res = await deleteTherapistSlot(id);
    if (res.error) setMsg({ kind: 'err', text: res.error });
    await reloadSlots();
  }

  async function handleAddTherapist(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMsg(null);
    const res = await adminAddTherapist({
      email: staffEmail,
      specialty: staffSpecialty,
      defaultDurationMins: staffDuration
    });
    if (res.status === 'Success') {
      setStaffEmail('');
      setMsg({ kind: 'ok', text: 'Therapist added. They can now publish their own availability.' });
      if (clubId) {
        const thRes = await fetchClubTherapists(clubId, true);
        setTherapists(thRes.data || []);
      }
    } else {
      setMsg({ kind: 'err', text: res.message || 'Could not add therapist.' });
    }
    setSaving(false);
  }

  async function handleToggleTherapist(t) {
    const res = await adminSetTherapistActive(t.id, !t.is_active);
    if (res.error) setMsg({ kind: 'err', text: res.error });
    if (clubId) {
      const thRes = await fetchClubTherapists(clubId, true);
      setTherapists(thRes.data || []);
    }
  }

  // ===== render helpers =====
  const statusChip = (status) => {
    const st = STATUS_STYLE[status] || STATUS_STYLE.booked;
    return (
      <span style={{ background: st.bg, color: st.color, fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '99px', textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
        {st.label}
      </span>
    );
  };

  // Agenda rows grouped by week (weeks start Monday).
  const weekGroups = (() => {
    const groups = [];
    const sorted = [...bookings].sort((a, b) =>
      String(a.date || '').localeCompare(String(b.date || '')) ||
      String(a.startTime || '').localeCompare(String(b.startTime || '')));
    sorted.forEach(b => {
      if (!b.date) return;
      const monday = getWeekMonday(new Date(`${b.date}T00:00:00`));
      let g = groups.find(x => x.monday.getTime() === monday.getTime());
      if (!g) { g = { monday, color: getWeekColor(monday), items: [] }; groups.push(g); }
      g.items.push(b);
    });
    return groups.sort((a, b) => a.monday - b.monday);
  })();

  // Month calendar cells (Monday-first grid).
  const calendarCells = (() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday-first offset
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, ymd, bookings: bookings.filter(b => b.date === ymd) });
    }
    return cells;
  })();

  const renderBookingCard = (b) => {
    const tc = typeColor(b.treatmentType);
    const isFuture = b.date && `${b.date}T${b.startTime || '23:59'}` >= `${getTodayYMD()}T00:00`;
    return (
      <div key={b.id} className="tr-booking" style={{ borderLeft: `5px solid ${tc}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '15px' }}>
              {b.treatmentType} · {b.durationMins} min
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {formatDate(b.date)} · {formatTime(b.startTime)}
            </div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
              with <strong>{b.therapistName || 'Therapist'}</strong>{b.therapistSpecialty ? ` (${b.therapistSpecialty})` : ''}
            </div>
            {b.athleteName && (
              <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                Athlete: <strong>{b.athleteName}</strong>
              </div>
            )}
            {b.injuryBodyPart && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '6px', background: '#fef2f2', color: '#b91c1c', fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px' }}>
                <AlertCircle size={11} /> Linked injury: {b.injuryBodyPart}
              </div>
            )}
            {b.notes && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', fontStyle: 'italic' }}>"{b.notes}"</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            {statusChip(b.status)}
            {b.status === 'booked' && !isStaff && isFuture && (
              <button className="tr-cancel-btn" onClick={() => handleCancelBooking(b.id)}>Cancel</button>
            )}
            {b.status === 'booked' && isTherapist && (
              <button className="tr-complete-btn" onClick={() => handleCompleteBooking(b.id)}>Mark done</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ===== loading / gated states =====
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <p style={{ color: '#64748b', fontSize: '15px' }}>Loading Treatment Room...</p>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="tr-container">
        <div className="tr-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 4px 12px rgba(168, 85, 247, 0.4)' }}>
            <Lock size={30} color="white" strokeWidth={2.5} />
          </div>
          <h2 style={{ fontSize: '20px', color: '#0f172a', margin: '0 0 8px' }}>Treatment Room</h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px' }}>
            Book physiotherapy and massage appointments at your club.
            This pod is unlocked with the <strong>treatment</strong> pod —
            ask your club admin, or unlock it in the Shop.
          </p>
          <button className="tr-save-btn" onClick={() => navigate('/shop')}>Visit the Shop</button>
        </div>
        <HelpButton pageName="Treatment Room" position="bottom-right" />
      </div>
    );
  }

  const tabs = isTherapist
    ? [{ id: 'availability', label: 'My Availability', icon: Calendar }, { id: 'bookings', label: 'My Clients', icon: Users }]
    : role === 'coach'
      ? [{ id: 'manage', label: 'Therapists', icon: Users }, { id: 'bookings', label: 'Club Bookings', icon: Calendar }]
      : [{ id: 'book', label: 'Book', icon: Plus }, { id: 'bookings', label: 'My Bookings', icon: Calendar }];

  return (
    <div className="tr-container">
      <style>{`
        .tr-container { padding: 20px; max-width: 600px; margin: 0 auto; background-color: #f8fafc; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; padding-bottom: 100px; }
        .tr-header { display: flex; align-items: center; margin-bottom: 20px; }
        .tr-title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
        .tr-tabs { display: flex; gap: 8px; margin-bottom: 24px; background: #e2e8f0; padding: 4px; border-radius: 8px; }
        .tr-tab { flex: 1; padding: 10px; border: none; background: transparent; border-radius: 6px; font-weight: 700; color: #64748b; cursor: pointer; transition: 0.2s; display: flex; justify-content: center; align-items: center; gap: 8px; }
        .tr-tab.active { background: #fff; color: #a855f7; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .tr-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .tr-label { display: block; font-weight: 700; color: #0f172a; margin-bottom: 10px; font-size: 14px; }
        .tr-input { width: 100%; padding: 12px; font-size: 15px; font-weight: 600; color: #0f172a; border: 2px solid #e2e8f0; border-radius: 8px; background: #fff; outline: none; box-sizing: border-box; }
        .tr-input:focus { border-color: #a855f7; }
        .tr-textarea { width: 100%; padding: 12px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-family: inherit; resize: vertical; min-height: 70px; box-sizing: border-box; }
        .tr-type-btn { padding: 10px 16px; border-radius: 99px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 600; font-size: 13px; cursor: pointer; transition: 0.2s; }
        .tr-type-btn.active { color: white; border-color: transparent; }
        .tr-therapist { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 14px; border: 2px solid #e2e8f0; border-radius: 10px; margin-bottom: 10px; cursor: pointer; transition: 0.2s; background: #fff; width: 100%; text-align: left; }
        .tr-therapist:hover { border-color: #a855f7; }
        .tr-therapist.selected { border-color: #a855f7; background: #faf5ff; box-shadow: 0 0 0 3px rgba(168,85,247,0.15); }
        .tr-slot-btn { padding: 10px 14px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; font-size: 13px; font-weight: 700; color: #334155; cursor: pointer; transition: 0.2s; }
        .tr-slot-btn:hover { border-color: #a855f7; color: #a855f7; }
        .tr-slot-btn.selected { background: #a855f7; color: #fff; border-color: #a855f7; }
        .tr-save-btn { width: 100%; background: linear-gradient(90deg, #a855f7, #7c3aed); color: white; border: none; padding: 15px; font-size: 15px; font-weight: 800; border-radius: 8px; cursor: pointer; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3); }
        .tr-save-btn:disabled { background: #94a3b8; cursor: not-allowed; box-shadow: none; }
        .tr-booking { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .tr-cancel-btn { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 6px; padding: 5px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
        .tr-complete-btn { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 6px; padding: 5px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
        .tr-mini-btn { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 10px; font-size: 11px; font-weight: 700; cursor: pointer; }
        .tr-mini-btn:hover { border-color: #dc2626; color: #dc2626; background: #fef2f2; }
        .tr-week-header { display: flex; justify-content: space-between; align-items: center; margin: 20px 0 8px 0; }
        .tr-view-toggle { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1px solid #a855f7; background: #fff; color: #a855f7; font-size: 12px; font-weight: 700; cursor: pointer; }
        .tr-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .tr-cal-cell { background: #fff; border: 1px solid #f1f5f9; border-radius: 8px; min-height: 58px; padding: 4px; }
        .tr-cal-empty { background: transparent; border: none; }
        .tr-cal-chip { font-size: 9px; font-weight: 800; color: #fff; border-radius: 4px; padding: 1px 4px; margin-top: 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .tr-form-row { display: flex; gap: 10px; }
        .tr-form-row > * { flex: 1; }
      `}</style>

      <div className="tr-header">
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#008ed3', display: 'flex', marginRight: '12px' }}><ArrowLeft size={28} /></button>
        <div><h1 className="tr-title">Treatment Room</h1></div>
      </div>

      {!isStaff && <TreatmentReminder />}

      {msg && (
        <div style={{
          padding: '12px', borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold', fontSize: '14px',
          backgroundColor: msg.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
          color: msg.kind === 'ok' ? '#15803d' : '#dc2626'
        }}>
          {msg.text}
        </div>
      )}

      <div className="tr-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`tr-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon size={18} /> {t.label}
          </button>
        ))}
      </div>

      {/* ---------- ATHLETE: BOOK ---------- */}
      {tab === 'book' && (
        <div>
          {therapists.length === 0 ? (
            <div className="tr-card" style={{ textAlign: 'center' }}>
              <Stethoscope size={40} color="#94a3b8" style={{ marginBottom: '12px' }} />
              <p style={{ margin: 0, color: '#64748b', fontWeight: 500 }}>
                No therapists are set up at your club yet. Your club admin can add them in the Therapists tab.
              </p>
            </div>
          ) : (
            <>
              <div className="tr-card">
                <label className="tr-label">1. Treatment type</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {TREATMENT_TYPES.map(t => (
                    <button
                      key={t.name}
                      className={`tr-type-btn ${selType === t.name ? 'active' : ''}`}
                      style={selType === t.name ? { background: t.color } : {}}
                      onClick={() => setSelType(t.name)}
                    >{t.name}</button>
                  ))}
                </div>
              </div>

              <div className="tr-card">
                <label className="tr-label">2. Choose your therapist</label>
                {therapists.map(t => (
                  <button
                    key={t.id}
                    className={`tr-therapist ${selTherapist === t.id ? 'selected' : ''}`}
                    onClick={() => setSelTherapist(t.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '15px' }}>
                        {t.athletes ? t.athletes.name : 'Therapist'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{t.specialty}</div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#475569', fontWeight: 700, textAlign: 'right' }}>
                      {t.default_duration_mins} min
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>default session</div>
                    </div>
                  </button>
                ))}
              </div>

              {selTherapist && (
                <div className="tr-card">
                  <label className="tr-label">3. Pick a date & time</label>
                  <input
                    type="date"
                    className="tr-input"
                    min={getTodayYMD()}
                    value={selDate}
                    onChange={(e) => setSelDate(e.target.value)}
                  />
                  <div style={{ marginTop: '12px' }}>
                    {slotsLoading ? (
                      <p style={{ fontSize: '13px', color: '#64748b' }}>Checking availability...</p>
                    ) : slotsForDate.length === 0 ? (
                      <p style={{ fontSize: '13px', color: '#64748b' }}>
                        No open slots on {formatDate(selDate)}. Try another day — slots appear here as your therapist publishes them.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {slotsForDate.map(s => (
                          <button
                            key={s.id}
                            className={`tr-slot-btn ${selSlot && selSlot.id === s.id ? 'selected' : ''}`}
                            onClick={() => setSelSlot(s)}
                          >
                            {formatTime(String(s.start_time).slice(0, 5))} · {s.duration_mins} min
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selTherapist && selSlot && (
                <>
                  {injuries.length > 0 && (
                    <div className="tr-card">
                      <label className="tr-label">4. Link to an injury (optional)</label>
                      <select className="tr-input" value={selInjuryId} onChange={(e) => setSelInjuryId(e.target.value)}>
                        <option value="">No injury link</option>
                        {injuries.map(i => (
                          <option key={i.id} value={i.id}>
                            {i.date_logged} — {i.body_part}{i.injury_grade !== null && i.injury_grade !== undefined ? ` (Grade ${i.injury_grade})` : ''}
                          </option>
                        ))}
                      </select>
                      <p style={{ fontSize: '11px', color: '#94a3b8', margin: '6px 0 0' }}>
                        Linked treatments show up on the injury in your Medical Vault.
                      </p>
                    </div>
                  )}

                  <div className="tr-card">
                    <label className="tr-label">{injuries.length > 0 ? '5.' : '4.'} Notes for your therapist (optional)</label>
                    <textarea
                      className="tr-textarea"
                      placeholder="e.g. Right hamstring has been tight since Monday's field session..."
                      value={bookNotes}
                      onChange={(e) => setBookNotes(e.target.value)}
                    />
                    <button className="tr-save-btn" style={{ marginTop: '14px' }} onClick={handleBook} disabled={saving}>
                      {saving ? 'BOOKING...' : `CONFIRM BOOKING — ${formatDate(selDate)} ${formatTime(selSlot.start_time.slice(0, 5))}`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ---------- BOOKINGS (all roles): agenda + calendar views ---------- */}
      {tab === 'bookings' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 12px 0' }}>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>
              {isTherapist ? 'My Client Sessions' : role === 'coach' ? 'Club Treatments' : 'My Treatments'}
            </h3>
            <button className="tr-view-toggle" onClick={() => setViewMode(viewMode === 'agenda' ? 'calendar' : 'agenda')}>
              {viewMode === 'agenda' ? <><CalendarDays size={14} /> Calendar View</> : <><List size={14} /> Agenda View</>}
            </button>
          </div>

          {bookings.length === 0 ? (
            <div className="tr-card" style={{ textAlign: 'center' }}>
              <Calendar size={40} color="#94a3b8" style={{ marginBottom: '12px' }} />
              <p style={{ margin: 0, color: '#64748b', fontWeight: 500 }}>
                {isTherapist ? 'No bookings yet — publish availability so athletes can book you.'
                  : role === 'coach' ? 'No treatments booked at your club yet.'
                  : 'No treatments booked yet. Head to the Book tab to find a time.'}
              </p>
            </div>
          ) : viewMode === 'agenda' ? (
            weekGroups.map((group, gi) => {
              const currentMonday = getWeekMonday(new Date());
              const isThisWeek = group.monday.getTime() === currentMonday.getTime();
              return (
                <div key={gi}>
                  <div className="tr-week-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ display: 'inline-block', width: '18px', height: '4px', borderRadius: '2px', backgroundColor: group.color }}></span>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: group.color, textTransform: 'uppercase' }}>
                        {isThisWeek ? 'This Week' : `Week of ${group.monday.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      {group.items.length} treatment{group.items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {group.items.map(renderBookingCard)}
                </div>
              );
            })
          ) : (
            <div className="tr-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <button className="tr-mini-btn" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}><ChevronLeft size={14} /></button>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  {calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button className="tr-mini-btn" onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}><ChevronRight size={14} /></button>
              </div>
              <div className="tr-cal">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                  <div key={d} style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', textAlign: 'center', padding: '4px 0' }}>{d}</div>
                ))}
                {calendarCells.map((c, i) => c === null ? (
                  <div key={`e${i}`} className="tr-cal-cell tr-cal-empty"></div>
                ) : (
                  <div key={c.ymd} className="tr-cal-cell" style={c.ymd === getTodayYMD() ? { borderColor: '#a855f7', background: '#faf5ff' } : {}}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: c.ymd === getTodayYMD() ? '#a855f7' : '#0f172a' }}>{c.day}</div>
                    {c.bookings.map(b => (
                      <div key={b.id} className="tr-cal-chip" style={{ background: typeColor(b.treatmentType) }} title={`${b.treatmentType} ${formatTime(b.startTime)}`}>
                        {formatTime(b.startTime).replace(' ', '')}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- THERAPIST: MY AVAILABILITY ---------- */}
      {tab === 'availability' && (
        <div>
          <div className="tr-card">
            <label className="tr-label">{profile ? 'My therapist profile' : 'Set up your therapist profile'}</label>
            <form onSubmit={handleSaveProfile}>
              <div className="tr-form-row" style={{ marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>SPECIALTY</label>
                  <select className="tr-input" value={profSpecialty} onChange={(e) => setProfSpecialty(e.target.value)}>
                    {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>DEFAULT DURATION (MIN)</label>
                  <input type="number" min="5" step="5" className="tr-input" value={profDuration}
                    onChange={(e) => setProfDuration(e.target.value)} />
                </div>
              </div>
              <button type="submit" className="tr-save-btn" disabled={saving}>{saving ? 'SAVING...' : 'SAVE PROFILE'}</button>
            </form>
          </div>

          {profile && (
            <>
              <div className="tr-card">
                <label className="tr-label">Publish an availability slot</label>
                <form onSubmit={handleAddSlot}>
                  <div className="tr-form-row" style={{ marginBottom: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>DATE</label>
                      <input type="date" min={getTodayYMD()} className="tr-input" value={slotDate}
                        onChange={(e) => setSlotDate(e.target.value)} required />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>START TIME</label>
                      <input type="time" className="tr-input" value={slotTime}
                        onChange={(e) => setSlotTime(e.target.value)} required />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>DURATION (MIN)</label>
                      <input type="number" min="5" step="5" className="tr-input" value={slotDur}
                        onChange={(e) => setSlotDur(e.target.value)} required />
                    </div>
                  </div>
                  <button type="submit" className="tr-save-btn" disabled={saving}>
                    {saving ? 'PUBLISHING...' : 'PUBLISH SLOT'}
                  </button>
                </form>
                <p style={{ fontSize: '11px', color: '#94a3b8', margin: '8px 0 0' }}>
                  One athlete per slot. A cancelled booking re-opens the slot automatically.
                </p>
              </div>

              <h3 style={{ margin: '20px 0 12px', fontSize: '18px', color: '#0f172a' }}>My Published Slots</h3>
              {slots.length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center' }}>No upcoming slots published yet.</p>
              ) : (
                slots.map(s => (
                  <div key={s.id} className="tr-booking" style={{ borderLeft: `5px solid ${s.status === 'open' ? '#16a34a' : s.status === 'booked' ? '#a855f7' : '#94a3b8'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>
                        {formatDate(s.date)} · {formatTime(String(s.start_time).slice(0, 5))} · {s.duration_mins} min
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {statusChip(s.status)}
                        {s.status === 'open' && (
                          <button className="tr-mini-btn" onClick={() => handleDeleteSlot(s.id)} title="Remove slot"><Trash2 size={12} /></button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}

      {/* ---------- COACH / ADMIN: MANAGE THERAPISTS ---------- */}
      {tab === 'manage' && (
        <div>
          <div className="tr-card">
            <label className="tr-label">Add a therapist</label>
            <form onSubmit={handleAddTherapist}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>MEMBER EMAIL (MUST HAVE SIGNED UP)</label>
                <input type="email" className="tr-input" placeholder="therapist@club.com" value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)} required />
              </div>
              <div className="tr-form-row" style={{ marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>SPECIALTY</label>
                  <select className="tr-input" value={staffSpecialty} onChange={(e) => setStaffSpecialty(e.target.value)}>
                    {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>DEFAULT DURATION (MIN)</label>
                  <input type="number" min="5" step="5" className="tr-input" value={staffDuration}
                    onChange={(e) => setStaffDuration(e.target.value)} />
                </div>
              </div>
              <button type="submit" className="tr-save-btn" disabled={saving}>
                {saving ? 'ADDING...' : 'ADD THERAPIST'}
              </button>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '8px 0 0' }}>
                The member is promoted to the therapist role and can then publish their own slots and durations.
              </p>
            </form>
          </div>

          <h3 style={{ margin: '20px 0 12px', fontSize: '18px', color: '#0f172a' }}>Club Therapists</h3>
          {therapists.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center' }}>No therapists added yet.</p>
          ) : (
            therapists.map(t => (
              <div key={t.id} className="tr-booking" style={{ borderLeft: `5px solid ${t.is_active ? '#16a34a' : '#94a3b8'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>{t.athletes ? t.athletes.name : 'Therapist'}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {t.specialty} · {t.default_duration_mins} min default{t.athletes && t.athletes.email ? ` · ${t.athletes.email}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: t.is_active ? '#dcfce7' : '#f1f5f9', color: t.is_active ? '#15803d' : '#64748b', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '99px' }}>
                      {t.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                    <button className="tr-mini-btn" onClick={() => handleToggleTherapist(t)}>
                      {t.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <HelpButton pageName="Treatment Room" position="bottom-right" />
    </div>
  );
}