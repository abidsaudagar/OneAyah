import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DRAG_CAP_PX, SIZE_MAX, SIZE_MIN, SWIPE_MAX_MS, SWIPE_MIN_PX,
  clampSize, drag, isTap, pinchSize, swipe, tapZone,
} from '../src/core/gesture.ts';

const at = (x: number, y = 0) => ({ x, y });

describe('swipe', () => {
  it('reads a rightward flick as forward, the way a mushaf turns', () => {
    assert.equal(swipe(at(100), at(200), 200), 'next');
  });

  it('reads a leftward flick as back', () => {
    assert.equal(swipe(at(200), at(100), 200), 'prev');
  });

  it('ignores anything shorter than the threshold', () => {
    assert.equal(swipe(at(100), at(100 + SWIPE_MIN_PX - 1), 200), 'none');
    assert.equal(swipe(at(100), at(100 + SWIPE_MIN_PX), 200), 'next');
  });

  it('ignores a drag too slow to be a flick', () => {
    // 70px is past the distance threshold, but 700ms makes it 0.1 px/ms.
    assert.equal(swipe(at(0), at(70), 700), 'none');
    assert.equal(swipe(at(0), at(70), 300), 'next');
  });

  it('ignores a gesture that has been running too long, however fast it ends', () => {
    assert.equal(swipe(at(0), at(400), SWIPE_MAX_MS + 1), 'none');
  });

  it('leaves a scroll alone, however far sideways it wandered', () => {
    // A thumb flicking the translation: 80px down, 65px across.
    assert.equal(swipe(at(0, 0), at(65, 80), 200), 'none');
  });

  it('still turns the page for a flick that is merely untidy', () => {
    assert.equal(swipe(at(0, 0), at(120, 40), 200), 'next');
  });

  it('never acts on a purely vertical gesture', () => {
    assert.equal(swipe(at(0, 0), at(0, 300), 200), 'none');
    assert.equal(swipe(at(0, 0), at(0, -300), 200), 'none');
  });
});

describe('drag', () => {
  it('follows a small movement almost exactly', () => {
    assert.ok(Math.abs(drag(6) - 6) < 0.5);
  });

  it('never travels past the cap, however far the finger goes', () => {
    for (const dx of [50, 200, 2000, 100_000]) {
      assert.ok(Math.abs(drag(dx)) <= DRAG_CAP_PX);
    }
  });

  it('is nearly spent by the time the swipe threshold is crossed', () => {
    // The point of the damping: "as far as it will go" and "far enough to
    // count" should be the same feeling under the thumb.
    assert.ok(Math.abs(drag(SWIPE_MIN_PX)) > DRAG_CAP_PX * 0.85);
  });

  it('keeps the direction the finger went', () => {
    assert.ok(drag(30) > 0);
    assert.ok(drag(-30) < 0);
    assert.equal(drag(0), 0);
  });

  it('is monotonic, so the ayah never backs up under a forward finger', () => {
    let last = 0;
    for (let dx = 1; dx <= 300; dx += 7) {
      const now = drag(dx);
      assert.ok(now > last);
      last = now;
    }
  });

  it('moves nothing when there is no room to move in', () => {
    assert.equal(drag(100, 0), 0);
  });
});

describe('tapZone', () => {
  it('sends the right of the frame forward and the left of it back', () => {
    assert.equal(tapZone(380, 400), 'next');
    assert.equal(tapZone(20, 400), 'prev');
  });

  it('does nothing in the middle, so a resting thumb costs nothing', () => {
    assert.equal(tapZone(200, 400), 'none');
  });

  it('keeps the dead band centred', () => {
    // 16% of 400 is 64px: 168..232 is dead, and either side of it is live.
    assert.equal(tapZone(167, 400), 'prev');
    assert.equal(tapZone(169, 400), 'none');
    assert.equal(tapZone(231, 400), 'none');
    assert.equal(tapZone(233, 400), 'next');
  });

  it('ignores a point outside the frame', () => {
    assert.equal(tapZone(-1, 400), 'none');
    assert.equal(tapZone(401, 400), 'none');
  });

  it('ignores a frame with no width, rather than dividing by it', () => {
    assert.equal(tapZone(0, 0), 'none');
  });
});

describe('isTap', () => {
  it('accepts a finger that barely moved', () => {
    assert.ok(isTap(at(100, 100), at(103, 98), 90));
  });

  it('rejects one that travelled', () => {
    assert.ok(!isTap(at(100, 100), at(140, 100), 90));
  });

  it('rejects a press, which is a different gesture', () => {
    assert.ok(!isTap(at(100, 100), at(100, 100), 600));
  });
});

describe('pinchSize', () => {
  it('scales from where the gesture started', () => {
    assert.equal(pinchSize(60, 1.5), 90);
    assert.equal(pinchSize(60, 0.5), 30);
  });

  it('returns to the size it began at when the fingers do', () => {
    assert.equal(pinchSize(64, 1), 64);
  });

  it('holds the same floor and ceiling the keyboard does', () => {
    assert.equal(pinchSize(100, 0.01), SIZE_MIN);
    assert.equal(pinchSize(100, 100), SIZE_MAX);
  });

  it('survives a scale the browser could not compute', () => {
    assert.equal(pinchSize(64, 0), 64);
    assert.equal(pinchSize(64, Number.NaN), 64);
    assert.equal(pinchSize(64, Number.POSITIVE_INFINITY), 64);
  });
});

describe('clampSize', () => {
  it('holds the range and lands on whole pixels', () => {
    assert.equal(clampSize(64.4), 64);
    assert.equal(clampSize(0), SIZE_MIN);
    assert.equal(clampSize(9999), SIZE_MAX);
  });
});
