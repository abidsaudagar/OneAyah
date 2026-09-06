import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { repair } from '../src/store/persist.ts';
import { DEFAULT_SETTINGS, initialState, reduce } from '../src/core/state.ts';
import {
  ACCENTS, ARABIC_FONTS, AUTO_SPEEDS, SESSION_LENGTHS, THEMES, TRANSLATION_LANGS,
  type PersistedState, type Settings,
} from '../src/types.ts';

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

  it('rejects anything that is not a One Ayah backup', () => {
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
        sessionLen: 3600, arabicFont: 'comic-sans', autoAdvanceSpeed: 500,
      },
    }, NOW)!;
    assert.equal(out.settings.arabicSize, 200);
    assert.equal(out.settings.translationSize, 12);
    assert.equal(out.settings.sessionLen, 70);
    assert.equal(out.settings.arabicFont, 'al-qalam-indopak');
    // Snapped to the top of the ladder, not clamped to some other number: a
    // speed that is not a rung would leave `+` and `-` unable to reach it.
    assert.equal(out.settings.autoAdvanceSpeed, 2.5);
  });

  it('drops the retired fixed-seconds auto-advance rather than carrying it forever', () => {
    const s = withReading();
    const out = repair({ ...s, settings: { ...s.settings, autoAdvanceSec: 12 } }, NOW)!;
    assert.ok(!('autoAdvanceSec' in out.settings));
    assert.equal(out.settings.autoAdvanceSpeed, 1);
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

  /**
   * The reader's side of it: what they set in the panel is what they find on
   * the next visit. `repair(JSON.parse(...))` is exactly the load path -- the
   * store either hands back the string it was given or hands back null.
   */
  describe('settings survive the trip to storage and back', () => {
    /** A state where every field has been moved off its default. */
    const customised = (): PersistedState => {
      const settings: Settings = {
        arabicFont: 'amiri-quran',
        showTranslation: true,
        translationLang: 'ur',
        translationHome: 'ur',
        arabicSize: 96,
        translationSize: 22,
        sessionLen: 140,
        theme: 'dark',
        accent: 'green',
        autoAdvanceSpeed: 1.4,
      };
      // Every field must actually differ, or the test would pass on a build
      // that silently reset the settings to their defaults.
      for (const k of Object.keys(settings) as (keyof Settings)[]) {
        assert.notEqual(settings[k], DEFAULT_SETTINGS[k], `${k} must differ from its default`);
      }
      return { ...withReading(), settings };
    };

    it('brings every changed setting back unchanged', () => {
      const s = customised();
      const back = repair(JSON.parse(JSON.stringify(s)), NOW)!;
      assert.deepEqual(back.settings, s.settings);
    });

    it('brings back every value the panel can actually produce', () => {
      const s = withReading();
      const round = (patch: Partial<Settings>) =>
        repair(JSON.parse(JSON.stringify({ ...s, settings: { ...s.settings, ...patch } })), NOW)!
          .settings;

      for (const theme of THEMES) assert.equal(round({ theme }).theme, theme);
      for (const accent of ACCENTS) assert.equal(round({ accent }).accent, accent);
      for (const sessionLen of SESSION_LENGTHS) assert.equal(round({ sessionLen }).sessionLen, sessionLen);
      for (const arabicFont of ARABIC_FONTS) assert.equal(round({ arabicFont }).arabicFont, arabicFont);
      // The two steppers, at both ends of their range and once in between.
      for (const arabicSize of [24, 128, 200]) assert.equal(round({ arabicSize }).arabicSize, arabicSize);
      for (const translationSize of [12, 18, 40]) {
        assert.equal(round({ translationSize }).translationSize, translationSize);
      }
      // Every rung of the dial, since the panel's steppers can reach all of them.
      for (const autoAdvanceSpeed of AUTO_SPEEDS) {
        assert.equal(round({ autoAdvanceSpeed }).autoAdvanceSpeed, autoAdvanceSpeed);
      }
      for (const showTranslation of [true, false]) {
        assert.equal(round({ showTranslation }).showTranslation, showTranslation);
      }
      // Picking a language in the panel sets both: the one on screen, and the
      // one T comes home to.
      for (const lang of TRANSLATION_LANGS) {
        const back = round({ translationLang: lang, translationHome: lang });
        assert.equal(back.translationLang, lang);
        assert.equal(back.translationHome, lang);
      }
    });

    it('does not let a settings change disturb anything else', () => {
      const s = withReading();
      const back = repair(JSON.parse(JSON.stringify(customised())), NOW)!;
      assert.deepEqual(back.days, s.days);
      assert.deepEqual(back.totals, s.totals);
      assert.equal(back.coverage, s.coverage);
    });

    it('replaces an accent no palette knows about, rather than stamping it', () => {
      const s = withReading();
      const out = repair({ ...s, settings: { ...s.settings, accent: 'chartreuse' } }, NOW)!;
      assert.equal(out.settings.accent, DEFAULT_SETTINGS.accent);
    });

    it('replaces an unknown theme, which would otherwise match no palette rule', () => {
      const s = withReading();
      const out = repair({ ...s, settings: { ...s.settings, theme: 'midnight' } }, NOW)!;
      assert.equal(out.settings.theme, DEFAULT_SETTINGS.theme);
    });
  });

  describe('per-surah places survive the trip too', () => {
    it('round-trips the places map', () => {
      const s: PersistedState = {
        ...withReading(),
        position: { surah: 2, ayah: 5 },
        places: { 1: 7, 2: 5, 36: 12 },
      };
      const back = repair(JSON.parse(JSON.stringify(s)), NOW)!;
      assert.deepEqual(back.places, s.places);
    });

    it('gives a backup written before places existed the place it is standing on', () => {
      const s = withReading();
      const legacy = { ...s, position: { surah: 18, ayah: 60 }, places: undefined };
      const back = repair(JSON.parse(JSON.stringify(legacy)), NOW)!;
      assert.deepEqual(back.places, { 18: 60 });
    });

    it('drops places a hand-edited backup could have put out of range', () => {
      const s = { ...withReading(), position: { surah: 1, ayah: 1 }, places: { 0: 4, 200: 4, 9: 3 } };
      const back = repair(JSON.parse(JSON.stringify(s)), NOW)!;
      assert.deepEqual(back.places, { 1: 1, 9: 3 });
    });
  });
});
