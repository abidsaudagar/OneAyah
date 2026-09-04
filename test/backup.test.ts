import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { repair } from '../src/store/persist.ts';
import { initialState, reduce } from '../src/core/state.ts';
import { ARABIC_FONTS, type PersistedState } from '../src/types.ts';

const NOW = Date.UTC(2026, 8, 4, 12);

const withReading = (): PersistedState => {
  let s = initialState(NOW);
  for (let i = 0; i < 6; i++) s = reduce(s, { t: 'creditVerse', id: i, nowMs: NOW });
  return s;
};

describe('backup and repair', () => {
  it('round-trips a real state through JSON unchanged', () => {
    const s = withReading();
    const back = repair(JSON.parse(JSON.stringify(s)), NOW);
    assert.deepEqual(back, s);
  });

  it('rejects anything that is not a qRead backup', () => {
    assert.equal(repair(null, NOW), null);
    assert.equal(repair('a string', NOW), null);
    assert.equal(repair({ hello: 'world' }, NOW), null);
    assert.equal(repair({ version: 99 }, NOW), null);
  });

  it('rebuilds totals rather than trusting the file', () => {
    const s = withReading();
    const tampered = { ...s, totals: { points: 999_999, verses: 42, seconds: 7 } };
    assert.deepEqual(repair(tampered, NOW)!.totals, s.totals);
  });

  it('drops day keys that are not dates, keeping the rest', () => {
    const s = withReading();
    const dirty = { ...s, days: { ...s.days, 'not-a-date': { v: 5, s: 5, g: 5, p: 5 }, '': {} } };
    const out = repair(dirty, NOW)!;
    assert.deepEqual(Object.keys(out.days), Object.keys(s.days));
  });

  it('clamps settings that are out of range or unknown', () => {
    const s = withReading();
    const out = repair({
      ...s,
      settings: {
        ...s.settings, arabicSize: 9999, translationSize: -5,
        sessionLen: 3600, arabicFont: 'comic-sans', autoAdvanceSec: 500,
      },
    }, NOW)!;
    assert.equal(out.settings.arabicSize, 200);
    assert.equal(out.settings.translationSize, 12);
    assert.equal(out.settings.sessionLen, 70);
    assert.equal(out.settings.arabicFont, 'al-qalam-indopak');
    assert.equal(out.settings.autoAdvanceSec, 30);
  });

  it('hands a reader of the retired Noto face to Amiri, not to the default', () => {
    // The default is now Indo-Pak, which is a different orthography. Someone who
    // chose Noto was reading Uthmani; they should still be.
    const s = withReading();
    const out = repair({ ...s, settings: { ...s.settings, arabicFont: 'noto-naskh' } }, NOW)!;
    assert.equal(out.settings.arabicFont, 'amiri-quran');
  });

  it('keeps every font the app actually ships, Indo-Pak included', () => {
    const s = withReading();
    for (const font of ARABIC_FONTS) {
      const out = repair({ ...s, settings: { ...s.settings, arabicFont: font } }, NOW)!;
      assert.equal(out.settings.arabicFont, font);
    }
  });

  it('will not let a backup grant an unearned rung', () => {
    const s = withReading();
    const out = repair({ ...s, goal: 30, unlockedMax: 10 }, NOW)!;
    assert.equal(out.goal, 10, 'goal is clamped to what is actually unlocked');
  });

  it('survives a corrupt coverage string', () => {
    const s = withReading();
    const out = repair({ ...s, coverage: '!!!not base64!!!' }, NOW)!;
    assert.equal(typeof out.coverage, 'string');
  });

  it('keeps negative or fractional counts out of the day records', () => {
    const out = repair({
      ...initialState(NOW),
      days: { '2026-09-01': { v: -3, s: 1.7, g: 5, p: -10 } },
    }, NOW)!;
    assert.deepEqual(out.days['2026-09-01'], { v: 0, s: 1, g: 5, p: 0 });
  });
});
