import { describe, it, expect } from 'vitest';
import { sectionGuides, getNextSlideIndex, getPrevSlideIndex } from '../utils/sectionGuides';

describe('sectionGuides', () => {
  it('defines valid guides for all 7 section keys', () => {
    const keys = ['home', 'students', 'studentDetail', 'classes', 'money', 'ai', 'settings'] as const;

    keys.forEach(key => {
      const guide = sectionGuides[key];
      expect(guide).toBeDefined();
      expect(guide.slides.length).toBeGreaterThanOrEqual(3);

      guide.slides.forEach(slide => {
        expect(slide.icon).toBeTruthy();
        expect(slide.en.title).toBeTruthy();
        expect(slide.en.desc).toBeTruthy();
        expect(slide.en.tip).toBeTruthy();
        expect(slide.bn.title).toBeTruthy();
        expect(slide.bn.desc).toBeTruthy();
        expect(slide.bn.tip).toBeTruthy();
      });
    });
  });

  describe('getNextSlideIndex', () => {
    it('returns the next index when possible', () => {
      expect(getNextSlideIndex(0, 3)).toBe(1);
      expect(getNextSlideIndex(1, 3)).toBe(2);
    });

    it('returns the current index when at the last slide', () => {
      expect(getNextSlideIndex(2, 3)).toBe(2);
    });

    it('handles total <= 0', () => {
      expect(getNextSlideIndex(0, 0)).toBe(0);
      expect(getNextSlideIndex(0, -1)).toBe(0);
    });
  });

  describe('getPrevSlideIndex', () => {
    it('returns the previous index when possible', () => {
      expect(getPrevSlideIndex(2, 3)).toBe(1);
      expect(getPrevSlideIndex(1, 3)).toBe(0);
    });

    it('returns the current index when at the first slide', () => {
      expect(getPrevSlideIndex(0, 3)).toBe(0);
    });

    it('handles total <= 0', () => {
      expect(getPrevSlideIndex(0, 0)).toBe(0);
      expect(getPrevSlideIndex(0, -1)).toBe(0);
    });
  });
});
