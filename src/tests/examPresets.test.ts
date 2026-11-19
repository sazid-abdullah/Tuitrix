import { describe, it, expect } from 'vitest';
import { BOARD_EXAM_PRESETS, getPresetById } from '../utils/examPresets';
import { examMarks } from '../services/ai';

describe('Board Exam Presets', () => {
  it('contains exactly 5 presets with unique IDs', () => {
    expect(BOARD_EXAM_PRESETS).toHaveLength(5);
    const ids = BOARD_EXAM_PRESETS.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(5);
  });

  it('matches each preset expected total marks using examMarks()', () => {
    const expectedTotals: Record<string, number> = {
      'ssc-science-75': 75,
      'hsc-science-75': 75,
      'board-general-100': 100,
      'mcq-drill-25': 25,
      'cq-chapter-30': 30,
    };

    for (const preset of BOARD_EXAM_PRESETS) {
      const expected = expectedTotals[preset.id];
      expect(expected).toBeDefined();
      expect(examMarks(preset)).toBe(expected);
    }
  });

  it('retrieves preset by ID with getPresetById', () => {
    const hsc = getPresetById('hsc-science-75');
    expect(hsc).toBeDefined();
    expect(hsc?.label).toBe('HSC Science (75 Marks)');
    expect(hsc?.curriculum).toBe('NCTB (HSC)');
    expect(hsc?.format).toBe('board');
    expect(hsc?.cqCount).toBe(8);
    expect(hsc?.cqAnswer).toBe(5);
    expect(hsc?.mcqCount).toBe(25);
    expect(hsc?.duration).toBe(180);

    const unknown = getPresetById('unknown');
    expect(unknown).toBeUndefined();
  });
});
