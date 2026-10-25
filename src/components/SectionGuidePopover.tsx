import React, { useState, useEffect } from 'react';
import { SectionGuideKey, sectionGuides, getNextSlideIndex, getPrevSlideIndex, Lang } from '../utils/sectionGuides';

interface SectionGuidePopoverProps {
  sectionKey: SectionGuideKey;
}

export function SectionGuidePopover({ sectionKey }: SectionGuidePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    const savedLang = localStorage.getItem('tuitrix_guide_lang') as Lang;
    if (savedLang === 'en' || savedLang === 'bn') {
      setLang(savedLang);
    }
  }, []);

  const handleLangToggle = () => {
    const newLang = lang === 'en' ? 'bn' : 'en';
    setLang(newLang);
    localStorage.setItem('tuitrix_guide_lang', newLang);
  };

  const guide = sectionGuides[sectionKey];
  const totalSlides = guide.slides.length;
  const slide = guide.slides[currentSlide];
  const slideContent = slide[lang];

  const handleNext = () => {
    setCurrentSlide(prev => getNextSlideIndex(prev, totalSlides));
  };

  const handlePrev = () => {
    setCurrentSlide(prev => getPrevSlideIndex(prev, totalSlides));
  };

  const isLast = currentSlide === totalSlides - 1;
  const isFirst = currentSlide === 0;

  const handleClose = () => {
    setIsOpen(false);
    // Reset back to first slide when re-opened
    setTimeout(() => setCurrentSlide(0), 300);
  };

  return (
    <>
      <button
        className="guide-info-btn"
        onClick={() => setIsOpen(true)}
        title="How to use this section"
        aria-label="Section Guide"
      >
        ℹ️
      </button>

      {isOpen && (
        <div className="guide-popover-overlay" onClick={handleClose}>
          <div className="guide-popover-card" onClick={e => e.stopPropagation()}>
            <div className="guide-header">
              <div className="guide-header-title">
                {sectionKey.toUpperCase()} GUIDE
              </div>
              <div className="guide-header-actions">
                <button className="guide-lang-btn" onClick={handleLangToggle}>
                  {lang === 'en' ? 'EN | বাংলা' : 'বাংলা | EN'}
                </button>
                <button className="guide-close-btn" onClick={handleClose}>✕</button>
              </div>
            </div>

            <div className="guide-body">
              <div className="guide-badge">Step {currentSlide + 1} of {totalSlides}</div>
              <div className="guide-icon">{slide.icon}</div>
              <h3 className="guide-title">{slideContent.title}</h3>
              <p className="guide-desc">{slideContent.desc}</p>

              <div className="guide-tip">
                <strong>💡 Tip:</strong> {slideContent.tip}
              </div>
            </div>

            <div className="guide-footer">
              <div className="guide-dots">
                {guide.slides.map((_, idx) => (
                  <span
                    key={idx}
                    className={`guide-dot ${idx === currentSlide ? 'active' : ''}`}
                    onClick={() => setCurrentSlide(idx)}
                  >
                    {idx === currentSlide ? '●' : '○'}
                  </span>
                ))}
              </div>

              <div className="guide-controls">
                <button
                  className="guide-nav-btn"
                  onClick={handlePrev}
                  disabled={isFirst}
                  style={{ opacity: isFirst ? 0 : 1, pointerEvents: isFirst ? 'none' : 'auto' }}
                >
                  ← Prev
                </button>
                {isLast ? (
                  <button className="guide-nav-btn primary" onClick={handleClose}>
                    Got It ✓
                  </button>
                ) : (
                  <button className="guide-nav-btn primary" onClick={handleNext}>
                    Next →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
