// ==========================================================================
// cycleMath.js — Menstrual cycle phase & hormone-curve utilities (v1.6.0)
//
// Athletes log PERIOD START DATES only (opt-in, see cycle_logs table).
// Everything else — cycle day, phase, hormone curve position, forward
// outlook — is derived here from population-average physiology curves,
// NOT from individual measurements.
//
// Hormone curves are normalized 0–100 shapes over a canonical 28-day
// cycle, interpolated for shorter/longer cycles (luteal phase held at
// ~14 days, the physiologically stable part of the cycle).
//
//   Estrogen      — low during menstruation, climbs through the
//                   follicular phase, peaks just before ovulation,
//                   secondary luteal rise, falls late luteal.
//   Progesterone  — negligible until ovulation, peaks mid-luteal,
//                   collapses before the next period.
//   Testosterone  — small amplitude; mid-cycle bump coinciding with the
//                   estrogen/LH peak, minor luteal secondary rise.
//
// Growth hormone is deliberately NOT charted: it is pulsatile
// (sleep/training driven) with no reliable day-of-cycle curve in the
// literature. The UI mentions it as a note instead of drawing a fake
// line.
// ==========================================================================

// Canonical 28-day curves, index 0 = cycle day 1. Values 0–100 relative
// to each hormone's own cycle maximum (illustrative population-average
// shapes for orientation, not clinical data).
export const HORMONE_CURVES = {
  estrogen:      [20,18,17,16,18,25,32,40,50,62,75,88,100,70,45,42,48,55,62,68,72,68,58,45,32,24,20,20],
  progesterone:  [ 5, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 6, 8,20,38,58,76,90,100,100,94,80,60,40,24,12, 8],
  testosterone:  [55,52,50,50,52,56,60,64,70,78,88,100,96,82,70,64,60,58,60,62,64,62,58,54,52,50,50,52],
};

// Canonical cycle length the curves are drawn on.
export const CANONICAL_CYCLE = 28;

// Physiological constants.
export const DEFAULT_CYCLE_LENGTH = 28;   // days, until the athlete's own history teaches us better
export const LUTEAL_LENGTH = 14;          // luteal phase is ~14 days in nearly all cycles
export const MENSTRUAL_DAYS = 5;          // low-hormone window = days 1–5
export const OVERDUE_GRACE_DAYS = 4;      // predicted start + this many days = overdue
export const NO_CYCLE_DAYS = 45;          // days since last start that flags a welfare check-in
export const IRREGULAR_RANGE_DAYS = 9;    // shortest/longest interval spread that flags irregularity

// Visual states used by both athlete and coach UIs. Colors stay inside
// the app's existing palette (amber caution / green good / blue peak /
// violet luteal) so nothing clashes with the Wellness Center.
export const PHASE_STATUS = {
  low:     { label: 'Low hormone window', color: '#d97706', bg: '#fef3c7', border: '#fcd34d', arrow: 'down' },
  rising:  { label: 'Rising — build window', color: '#16a34a', bg: '#dcfce7', border: '#86efac', arrow: 'up' },
  peak:    { label: 'Peak capacity window', color: '#0ea5e9', bg: '#e0f2fe', border: '#7dd3fc', arrow: 'up' },
  high:    { label: 'Luteal — high effort cost', color: '#8b5cf6', bg: '#ede9fe', border: '#c4b5fd', arrow: 'flat' },
  falling: { label: 'Declining — monitor readiness', color: '#f59e0b', bg: '#fef3c7', border: '#fcd34d', arrow: 'down' },
};

// ---------- small date helpers (local-safe, no external deps) ----------

export function ymd(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYmd(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function diffDays(a, b) {
  const msA = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const msB = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((msA - msB) / 86400000);
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round(((s[mid - 1] + s[mid]) / 2) * 10) / 10;
}

// ---------- cycle length learning ----------

// Learn the athlete's own average cycle length from consecutive period
// starts (median of intervals — robust against one wild cycle). Falls
// back to 28 until two or more starts exist.
export function getLearnedCycleLength(periodStartYmds) {
  const sorted = [...periodStartYmds].sort();
  const intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = diffDays(parseYmd(sorted[i]), parseYmd(sorted[i - 1]));
    if (gap >= 15 && gap <= 60) intervals.push(gap); // ignore physiologically impossible gaps
  }
  if (!intervals.length) return DEFAULT_CYCLE_LENGTH;
  const m = median(intervals);
  return clamp(m || DEFAULT_CYCLE_LENGTH, 21, 45);
}

// ---------- phase mapping ----------

// Ovulation lands ~14 days before the next period (stable), so the
// follicular phase absorbs cycle-length variation.
export function getPhase(cycleDay, cycleLength) {
  const len = clamp(cycleLength || DEFAULT_CYCLE_LENGTH, 21, 45);
  const day = Math.max(1, cycleDay);
  const ovulationDay = Math.max(len - LUTEAL_LENGTH, MENSTRUAL_DAYS + 1);
  if (day <= MENSTRUAL_DAYS) return 'menstrual';
  if (day < ovulationDay - 1) return 'follicular';
  if (day <= ovulationDay + 1) return 'ovulatory';
  if (day <= len) return 'luteal';
  return 'late-luteal'; // cycle running past its learned length — extended luteal
}

// Map a phase to the coarse UI status (color + arrow + label).
export function statusForPhase(phase) {
  switch (phase) {
    case 'menstrual':    return 'low';
    case 'follicular':   return 'rising';
    case 'ovulatory':    return 'peak';
    case 'luteal':       return 'high';
    case 'late-luteal':  return 'falling';
    default:             return null;
  }
}

// ---------- curve sampling ----------

// Sample a canonical 28-point curve at (cycleDay, cycleLength). The
// x-axis is stretched/compressed so day 1 and the last day align with
// the athlete's own cycle length.
export function sampleCurve(curve, cycleDay, cycleLength) {
  const len = clamp(cycleLength || DEFAULT_CYCLE_LENGTH, 21, 45);
  const frac = (Math.max(1, cycleDay) - 1) / (len - 1); // 0..1 across the cycle
  const pos = clamp(frac * (CANONICAL_CYCLE - 1), 0, CANONICAL_CYCLE - 1);
  const lo = Math.floor(pos), hi = Math.min(CANONICAL_CYCLE - 1, lo + 1);
  const t = pos - lo;
  return curve[lo] * (1 - t) + curve[hi] * t;
}

// Single composite "hormone load" number (0–100) for mini sparklines.
export function compositeLevel(cycleDay, cycleLength) {
  const e = sampleCurve(HORMONE_CURVES.estrogen, cycleDay, cycleLength);
  const p = sampleCurve(HORMONE_CURVES.progesterone, cycleDay, cycleLength);
  const t = sampleCurve(HORMONE_CURVES.testosterone, cycleDay, cycleLength);
  return Math.round((e * 0.45 + p * 0.35 + t * 0.20) * 10) / 10;
}

// ---------- cycle context (the core derivation) ----------

// cycleEntries: [{ entryKind: 'period_start' | 'missed_cycle', entryDate }]
// entryDate may be a Date or 'YYYY-MM-DD'. Returns null when the athlete
// has never logged a period start (i.e. has not opted in / no data).
export function getCycleContext(cycleEntries, today = new Date()) {
  const starts = [];
  const missed = [];
  (cycleEntries || []).forEach((e) => {
    const d = e.entryDate instanceof Date ? e.entryDate : parseYmd(e.entryDate);
    if (!d) return;
    if (e.entryKind === 'missed_cycle') missed.push(d);
    else starts.push(d);
  });
  if (!starts.length) return null;

  starts.sort((a, b) => a - b);
  missed.sort((a, b) => a - b);
  const lastStart = starts[starts.length - 1];
  const cycleLength = getLearnedCycleLength(starts.map(ymd));

  const intervals = [];
  for (let i = 1; i < starts.length; i++) {
    const gap = diffDays(starts[i], starts[i - 1]);
    if (gap >= 15 && gap <= 60) intervals.push(gap);
  }

  const cycleDay = Math.max(1, diffDays(today, lastStart) + 1);
  const predictedNext = new Date(lastStart.getFullYear(), lastStart.getMonth(), lastStart.getDate());
  predictedNext.setDate(predictedNext.getDate() + Math.round(cycleLength));

  const phase = getPhase(cycleDay, cycleLength);
  const status = statusForPhase(phase);
  const irregular = intervals.length >= 2
    && (Math.max(...intervals) - Math.min(...intervals)) > IRREGULAR_RANGE_DAYS;
  const overdue = cycleDay > Math.round(cycleLength) + OVERDUE_GRACE_DAYS;
  const noCycle = cycleDay >= NO_CYCLE_DAYS;
  // An explicitly flagged missed/absent cycle dated after the most recent
  // start — the athlete told us this cycle didn't arrive on its own.
  const missedFlagged = missed.length > 0 && diffDays(missed[missed.length - 1], lastStart) > 0;

  return {
    lastStart,
    cycleLength,
    cycleDay,
    phase,
    status,
    isLowHormone: phase === 'menstrual',
    irregular,
    overdue,
    noCycle,
    missedFlagged,
    predictedNext,
    daysUntilNext: overdue ? null : diffDays(predictedNext, today),
    intervalCount: intervals.length,
    history: starts.map(ymd),
    missedHistory: missed.map(ymd),
  };
}

// ---------- forward outlook ----------

// Day-by-day forecast for the next `days` days (offset 0 = today).
// Powers the coach's "low today, peaking Wednesday" view and the
// athlete's next-7-days strip.
export function getForwardWindow(ctx, days = 7) {
  if (!ctx) return [];
  const out = [];
  for (let offset = 0; offset < days; offset++) {
    const day = ctx.cycleDay + offset;
    const phase = getPhase(day, ctx.cycleLength);
    const date = new Date();
    date.setDate(date.getDate() + offset);
    out.push({
      offset,
      dateYmd: ymd(date),
      cycleDay: day,
      phase,
      status: statusForPhase(phase),
      estrogen: Math.round(sampleCurve(HORMONE_CURVES.estrogen, day, ctx.cycleLength)),
      progesterone: Math.round(sampleCurve(HORMONE_CURVES.progesterone, day, ctx.cycleLength)),
      testosterone: Math.round(sampleCurve(HORMONE_CURVES.testosterone, day, ctx.cycleLength)),
      composite: compositeLevel(day, ctx.cycleLength),
    });
  }
  return out;
}

// Full x-series for the Cycle Insights modal chart: every cycle day from
// 1 through max(learned length, current day) + a few days of lookahead,
// with `today` marked via a separate (nullable) series.
export function buildCycleChartData(ctx, extraDays = 4) {
  if (!ctx) return [];
  const lastDay = Math.max(Math.round(ctx.cycleLength), ctx.cycleDay) + extraDays;
  const rows = [];
  for (let day = 1; day <= lastDay; day++) {
    rows.push({
      day,
      estrogen: Math.round(sampleCurve(HORMONE_CURVES.estrogen, day, ctx.cycleLength)),
      progesterone: Math.round(sampleCurve(HORMONE_CURVES.progesterone, day, ctx.cycleLength)),
      testosterone: Math.round(sampleCurve(HORMONE_CURVES.testosterone, day, ctx.cycleLength)),
      todayMarker: day === ctx.cycleDay
        ? Math.round(sampleCurve(HORMONE_CURVES.estrogen, day, ctx.cycleLength))
        : null,
    });
  }
  return rows;
}

// ---------- plain-language training guidance ----------

// Evidence-informed heuristics for load planning, phrased for coaches.
// Deliberately conservative — population averages, not medical advice.
export function getTrainingGuidance(ctx) {
  if (!ctx) return null;
  const s = PHASE_STATUS[ctx.status] || {};
  const guidance = {
    low: {
      headline: 'Low-hormone window — favor recovery, technique and aerobic work.',
      detail: 'Estrogen and progesterone are at their lowest during the menstrual days. Some athletes train fine; others feel flat or cramped. Default to lighter loading and watch readiness scores.',
    },
    rising: {
      headline: 'Estrogen rising — good window for progressive strength work.',
      detail: 'Rising estrogen is generally associated with good recovery and strength gains. A good phase to build volume and intensity.',
    },
    peak: {
      headline: 'Peak capacity window — best day(s) for heavy or high-intensity sessions.',
      detail: 'Estrogen peaks around ovulation with a coinciding testosterone bump — typically the athlete\'s highest-capacity days.',
    },
    high: {
      headline: 'Luteal phase — effort feels harder, recovery slightly slower.',
      detail: 'Progesterone is high: core temperature and perceived effort run up. Keep quality work but expect the same session to feel harder.',
    },
    falling: {
      headline: 'Hormones declining — PMS symptoms possible; monitor readiness.',
      detail: 'The pre-period dip: mood, sleep and soreness can wobble. Consider lighter loading and rely on daily readiness data.',
    },
  };
  const flags = [];
  if (ctx.irregular) flags.push('Cycle intervals vary widely — phase estimates are rough. Encourage consistent logging.');
  if (ctx.missedFlagged) flags.push('Athlete flagged this cycle as delayed/absent. In training athletes this can signal over-training or low energy availability — worth a supportive check-in.');
  else if (ctx.noCycle) flags.push(`No period logged in ${ctx.cycleDay}+ days. In training athletes this can signal over-training or low energy availability — worth a supportive check-in.`);
  else if (ctx.overdue) flags.push('Period is later than her usual pattern. Could be nothing — or an early irregularity signal. The athlete has been prompted to update.');
  return { ...guidance[ctx.status], statusLabel: s.label, flags };
}
