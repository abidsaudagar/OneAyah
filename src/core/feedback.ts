/**
 * When to ask a reader what they think, and what to show them if they say yes.
 *
 * PURE: no DOM, no clipboard, no network. One Ayah sends nothing anywhere on its
 * own -- there is no backend to send it to -- so "collecting feedback" here
 * means composing a block of numbers the reader can read in full and choose to
 * paste into a form. Nothing leaves the browser without a copy and a paste.
 */
import type { PersistedState, SessionLen } from '../types.ts';
import type { Snapshot } from './state.ts';
import { SCRIPT_OF } from '../types.ts';
import type { DayMap } from './streak.ts';

/**
 * Goal-met days before the ask appears. Three, because the question worth
 * asking -- would you miss this? -- needs a reader who has actually formed the
 * beginning of a habit, and because a first-day reader has nothing to say yet.
 */
export const ASK_AFTER_GOAL_DAYS = 3;

/** Days on which the goal in force was actually hit. */
export function goalMetDays(days: DayMap): number {
  let n = 0;
  for (const rec of Object.values(days)) if (rec.v > 0 && rec.v >= rec.g) n++;
  return n;
}

/**
 * Whether the reader should be asked for feedback right now.
 *
 * Asked once ever: `dismissed` is set when the panel is opened as well as when
 * the line is waved off, so answering does not leave the ask standing.
 */
export function shouldAsk(days: DayMap, dismissed: boolean): boolean {
  if (dismissed) return false;
  return goalMetDays(days) >= ASK_AFTER_GOAL_DAYS;
}

/** Everything about the machine that the reader's own state cannot say. */
export interface ReportContext {
  /** The commit the bundle was built from. */
  build: string;
  /** navigator.userAgent, trimmed to something a person can read. */
  agent: string;
  /** Viewport as "1440x900" -- a layout complaint needs it. */
  viewport: string;
}

export type ReportRow = readonly [label: string, value: string];

const sessionText = (len: SessionLen): string => `${len}s`;

/**
 * The numbers a reader can choose to hand over with their words. Everything in
 * here is already on their own screen somewhere -- this only saves them the
 * transcription. There is no id, no name and nothing that identifies the
 * device beyond the browser it runs in.
 */
export function report(state: PersistedState, snap: Snapshot, ctx: ReportContext): ReportRow[] {
  const s = state.settings;
  const hours = (state.totals.seconds / 3600).toFixed(1);
  return [
    ['build', ctx.build],
    ['days read', `${snap.streak.daysRead} of ${snap.streak.daysSinceStart}`],
    ['goal days', String(goalMetDays(state.days))],
    ['streak', `${snap.streak.current} now, ${snap.streak.longest} longest`],
    ['goal', `${state.goal} verses, unlocked to ${state.unlockedMax}`],
    ['verses', `${state.totals.verses} total, ${snap.versesToday} today`],
    ['time read', `${hours}h total`],
    ['position', `${state.position.surah}:${state.position.ayah}`],
    ['script', `${SCRIPT_OF[s.arabicFont]} · ${s.arabicFont} · ${s.arabicSize}px`],
    ['translation', s.showTranslation ? `on · ${s.translationSize}px` : 'off'],
    ['session', `${sessionText(s.sessionLen)} · auto-advance ${
      s.autoAdvanceSec === null ? 'off' : `${s.autoAdvanceSec}s`}`],
    ['theme', `${s.theme} · ${s.accent}`],
    ['screen', ctx.viewport],
    ['browser', ctx.agent],
  ];
}

/** The same rows as one pasteable block, labels padded into a column. */
export function reportText(rows: readonly ReportRow[]): string {
  const width = rows.reduce((w, [label]) => Math.max(w, label.length), 0);
  return rows.map(([label, value]) => `${label.padEnd(width)}  ${value}`).join('\n');
}
