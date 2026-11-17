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

// Visual states used by both athlete and coach UIs.
// v1.12.0: one program-wide color language, so a phase means the same thing
// on every screen: yellow = menstrual, green = follicular (slightly stronger
// than the ovulatory green), soft green = ovulatory, amber = luteal. Status
// chips and chart bands share the same hues (see PHASE_BAND_COLORS).
export const PHASE_STATUS = {
  low:     { label: 'Low hormone window', color: '#a16207', bg: '#fef9c3', border: '#fde047', arrow: 'down' },
  rising:  { label: 'Rising — build window', color: '#15803d', bg: '#bbf7d0', border: '#86efac', arrow: 'up' },
  peak:    { label: 'Peak capacity window', color: '#059669', bg: '#d1fae5', border: '#6ee7b7', arrow: 'up' },
  high:    { label: 'Luteal — high effort cost', color: '#c2410c', bg: '#fed7aa', border: '#fdba74', arrow: 'flat' },
  falling: { label: 'Declining — monitor readiness', color: '#d97706', bg: '#ffedd5', border: '#fdba74', arrow: 'down' },
};

// v1.12.0: program-wide shading colors for the phase bands on the hormone
// charts (athlete My Progress + coach Cycle Insights). Shades, not strong
// colors — they sit behind the hormone lines. Follicular green is slightly
// stronger than the ovulatory green; menstrual is yellow; luteal is amber.
export const PHASE_BAND_COLORS = {
  menstrual: '#fef08a',   // yellow-200
  follicular: '#bbf7d0',  // green-200 — stronger than the ovulatory green
  ovulatory: '#d1fae5',   // emerald-100 — softer green
  luteal: '#fed7aa',      // orange-200 — amber shade
  'late-luteal': '#fed7aa',
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
  // v1.12.0: zones aligned to the training protocol — follicular runs to the
  // day before ovulation (days 6-13 on a 28-day cycle), the ovulatory window
  // spans ovulationDay..+2 (days 14-16), luteal starts the next day.
  if (day < ovulationDay) return 'follicular';
  if (day <= ovulationDay + 2) return 'ovulatory';
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
  const pauses = []; // v1.12.0: 'cycle_tracking_off' pause bookmarks
  (cycleEntries || []).forEach((e) => {
    const d = e.entryDate instanceof Date ? e.entryDate : parseYmd(e.entryDate);
    if (!d) return;
    if (e.entryKind === 'missed_cycle') missed.push(d);
    else if (e.entryKind === 'cycle_tracking_off') pauses.push(d);
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

  // v1.12.0: one integrated tracking toggle. OFF inserts a dated
  // 'cycle_tracking_off' bookmark — it covers both "I don't track" and
  // "I'm on a hormonal contraceptive" (the pill changes the hormone patterns
  // this guidance is built on). ON removes the bookmark, and a later period
  // start resumes tracking by itself. While paused, UIs hide phase guidance,
  // the LOW-H indicator and the welfare interpretation of missing periods.
  pauses.sort((a, b) => a - b);
  const trackingPaused = pauses.length > 0
    && diffDays(pauses[pauses.length - 1], lastStart) >= 0;

  return {
    lastStart,
    cycleLength,
    cycleDay,
    phase,
    status,
    trackingPaused,
    isLowHormone: phase === 'menstrual' && !trackingPaused,
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

// Evidence-informed INFORMATION for load planning, phrased for coaches.
// v1.12.0: deliberately informational, never prescriptive — no RPE targets
// anywhere. Numeric phase targets get applied every day by enthusiastic
// coaches and athletes alike; the honest hierarchy is that the weekly plan
// and the athlete's own wellness/RPE data decide the dose, while this
// explains the physiology behind it. Pauses while tracking is paused.
export function getTrainingGuidance(ctx) {
  if (!ctx || ctx.trackingPaused) return null;
  const s = PHASE_STATUS[ctx.status] || {};
  const guidance = {
    low: {
      headline: 'Menstrual — hormones at their lowest.',
      detail: 'Estrogen and progesterone bottom out early in the cycle, and day-to-day responses vary widely — the population-average curves are orientation only. The athlete\'s own wellness scores and how she reports feeling are the primary signal. Iron status is worth monitoring across heavy training blocks.',
    },
    rising: {
      headline: 'Late follicular — hormones rising.',
      detail: 'Estrogen climbs toward its peak and recovery capacity is at its best in the population-average data — physiologically the most sustainable window for demanding sessions. The weekly plan, not the calendar, decides the dose.',
    },
    peak: {
      headline: 'Ovulatory — peak power window, highest reported injury risk.',
      detail: 'Estrogen and testosterone peak together: the highest power output of the cycle on average. The literature also associates this window with greater joint laxity and higher injury rates in landing and change-of-direction actions — worth factoring into session design.',
    },
    high: {
      headline: 'Luteal — progesterone high, effort reads higher.',
      detail: 'Core temperature and perceived effort run up, so the same session reads harder even when the work is right. Premenstrual days can pull wellness scores down — read those scores first rather than the calendar.',
    },
    falling: {
      headline: 'Late luteal — premenstrual window.',
      detail: 'The pre-period dip: mood, sleep and soreness can wobble. Daily wellness scores are the primary signal in this window.',
    },
  };
  const flags = [];
  if (ctx.irregular) flags.push('Cycle intervals vary widely — phase estimates are rough. Encourage consistent logging.');
  if (ctx.missedFlagged) flags.push('Athlete flagged this cycle as delayed/absent. In training athletes this can signal over-training or low energy availability — worth a supportive check-in.');
  else if (ctx.noCycle) flags.push(`No period logged in ${ctx.cycleDay}+ days. In training athletes this can signal over-training or low energy availability — worth a supportive check-in.`);
  else if (ctx.overdue) flags.push('Period is later than her usual pattern. Could be nothing — or an early irregularity signal. The athlete has been prompted to update.');
  return { ...guidance[ctx.status], statusLabel: s.label, flags };
}
