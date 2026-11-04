import React, { useState, useEffect, useMemo } from 'react';
import { FaqItem, PricingConfig } from '../types';
import { fetchPricingConfig, DEFAULT_FAQS } from '../services/firebase';

interface HelpCenterViewProps {
  onNavigate: (route: string, param?: string) => void;
}

type FaqCategory = 'all' | 'getting_started' | 'billing' | 'ai_exams' | 'sync' | 'account';

export const HelpCenterView: React.FC<HelpCenterViewProps> = ({ onNavigate }) => {
  const [lang, setLang] = useState<'EN' | 'BN'>(() => {
    return (localStorage.getItem('tuitrix_lang') as 'EN' | 'BN') || 'EN';
  });

  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory>('all');
  const [expandedFaqIds, setExpandedFaqIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPricingConfig().then(config => {
      setPricingConfig(config);
    }).catch(console.error);

    const handleLangChange = (e: any) => {
      if (e.detail && (e.detail === 'EN' || e.detail === 'BN')) {
        setLang(e.detail);
      }
    };
    window.addEventListener('tuitrix_lang_change', handleLangChange);
    return () => window.removeEventListener('tuitrix_lang_change', handleLangChange);
  }, []);

  const allFaqs: FaqItem[] = useMemo(() => {
    const list = pricingConfig?.faqs && pricingConfig.faqs.length > 0
      ? pricingConfig.faqs
      : DEFAULT_FAQS;
    return [...list].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [pricingConfig]);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allFaqs.length,
      getting_started: 0,
      billing: 0,
      ai_exams: 0,
      sync: 0,
      account: 0,
    };
    for (const faq of allFaqs) {
      if (counts[faq.category] !== undefined) {
        counts[faq.category]++;
      }
    }
    return counts;
  }, [allFaqs]);

  // Filter FAQs based on active category & real-time search
  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allFaqs.filter(faq => {
      const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      const haystack = `${faq.qEn} ${faq.aEn} ${faq.qBn} ${faq.aBn} ${faq.category}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [allFaqs, selectedCategory, searchQuery]);

  const toggleAccordion = (id: string) => {
    setExpandedFaqIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleLang = () => {
    const nextLang = lang === 'EN' ? 'BN' : 'EN';
    setLang(nextLang);
    localStorage.setItem('tuitrix_lang', nextLang);
    window.dispatchEvent(new CustomEvent('tuitrix_lang_change', { detail: nextLang }));
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const categories: { key: FaqCategory; labelEn: string; labelBn: string }[] = [
    { key: 'all', labelEn: 'All', labelBn: 'সব' },
    { key: 'getting_started', labelEn: 'Getting Started', labelBn: 'শুরু করা' },
    { key: 'billing', labelEn: 'Billing & Promo', labelBn: 'ফি ও বিলিং' },
    { key: 'ai_exams', labelEn: 'AI & Exams', labelBn: 'এআই ও পরীক্ষা' },
    { key: 'sync', labelEn: 'Cloud Sync', labelBn: 'ক্লাউড সিঙ্ক' },
    { key: 'account', labelEn: 'Account & Print', labelBn: 'অ্যাকাউন্ট ও প্রিন্ট' },
  ];

  const supportEmail = pricingConfig?.supportEmail || 'abdullahsazid109@gmail.com';
  const rawWa = pricingConfig?.supportWhatsapp || pricingConfig?.bkashNumber || '01700000000';
  const cleanedWa = rawWa.replace(/\D/g, '');
  const waPhone = cleanedWa.length === 11 && cleanedWa.startsWith('01') ? '88' + cleanedWa : cleanedWa;
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(
    lang === 'BN'
      ? 'হ্যালো টুইট্রিক্স সাপোর্ট, আমার সহায়তা প্রয়োজন।'
      : 'Hello Tuitrix Support, I need assistance with...'
  )}`;

  return (
    <div className="help-center-container">
      {/* Page Header / Hero */}
      <div className="help-center-hero card">
        <div className="help-hero-top">
          <button
            className="btn outline small"
            onClick={() => onNavigate('home')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            ← {lang === 'BN' ? 'হোমে ফিরে যান' : 'Back to Home'}
          </button>
          <button
            type="button"
            className="btn outline small help-lang-badge"
            onClick={handleToggleLang}
          >
            {lang === 'BN' ? '🇧🇩 বাংলা' : '🌐 English'}
          </button>
        </div>

        <h1 className="help-hero-title">
          {lang === 'BN' ? '❓ সহায়তা কেন্দ্র ও সাধারণ প্রশ্নোত্তর' : '❓ Help Centre & FAQ'}
        </h1>
        <p className="help-hero-subtitle muted">
          {lang === 'BN'
            ? 'টিউশন ট্র্যাকিং, ফি ও বিলিং, এআই প্রশ্ন তৈরি এবং ক্লাউড ব্যাকআপ সংক্রান্ত সাধারণ প্রশ্নোত্তর'
            : 'Answers to common questions about tuition cycles, billing, AI exams, and cloud synchronization'}
        </p>

        {/* Real-time Search Box */}
        <div className="help-search-box">
          <svg className="help-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="help-search-input"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={
              lang === 'BN'
                ? 'প্রশ্ন, বিষয়, বিলিং বা এআই লিখে খুঁজুন...'
                : 'Search questions, keywords, billing, promo, AI exams...'
            }
          />
          {searchQuery && (
            <button
              type="button"
              className="help-clear-btn"
              onClick={handleClearSearch}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="faq-pills-scroll">
        <div className="faq-pills" role="tablist">
          {categories.map(cat => {
            const isActive = selectedCategory === cat.key;
            const count = categoryCounts[cat.key] || 0;
            return (
              <button
                key={cat.key}
                type="button"
                className={`faq-pill ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.key)}
                role="tab"
                aria-selected={isActive}
              >
                <span>{lang === 'BN' ? cat.labelBn : cat.labelEn}</span>
                <span className="faq-pill-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Self-Service Action Cards */}
      <div className="help-quick-cards">
        <div className="card help-quick-card">
          <div className="help-card-icon">🎟️</div>
          <h3>{lang === 'BN' ? 'প্রো আপগ্রেড ও প্রোমো' : 'Upgrade & Promo Code'}</h3>
          <p className="muted small">
            {lang === 'BN'
              ? 'আনলিমিটেড স্টুডেন্ট, এআই এক্সাম এবং ক্লাউড সিঙ্ক ফিচার আনলক করুন।'
              : 'Unlock unlimited students, AI exams & cross-device cloud sync.'}
          </p>
          <button
            className="btn primary small"
            onClick={() => {
              onNavigate('settings');
              setTimeout(() => {
                const el = document.getElementById('upgrade-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 150);
            }}
          >
            {lang === 'BN' ? 'আপগ্রেড বা প্রোমো কোড দিন →' : 'Upgrade / Enter Promo →'}
          </button>
        </div>

        <div className="card help-quick-card">
          <div className="help-card-icon">✨</div>
          <h3>{lang === 'BN' ? 'এআই স্টুডিও ও প্রশ্ন তৈরি' : 'AI Exam & Paper Studio'}</h3>
          <p className="muted small">
            {lang === 'BN'
              ? 'লেকচার শিট, সৃজনশীল ও বহুনির্বাচনী প্রশ্ন তৈরি বা .docx ইমপোর্ট করুন।'
              : 'Generate question papers, lecture notes, or run interactive exams.'}
          </p>
          <button
            className="btn small"
            onClick={() => onNavigate('ai')}
          >
            {lang === 'BN' ? 'এআই স্টুডিও চালু করুন →' : 'Launch AI Studio →'}
          </button>
        </div>

        <div className="card help-quick-card">
          <div className="help-card-icon">💾</div>
          <h3>{lang === 'BN' ? 'অফলাইন ডাটা ব্যাকআপ' : 'Download Data Backup'}</h3>
          <p className="muted small">
            {lang === 'BN'
              ? 'আপনার ক্লাউড বা অফলাইন সব ডাটা JSON ফাইলে সংরক্ষণ করে রাখুন।'
              : 'Export offline JSON backup to keep your tuition logs 100% safe.'}
          </p>
          <button
            className="btn small"
            onClick={() => onNavigate('settings')}
          >
            {lang === 'BN' ? 'ব্যাকআপ সেটিংস খুলুন →' : 'Open Backup Settings →'}
          </button>
        </div>
      </div>

      {/* FAQ Accordion List */}
      <div className="faq-accordion-section">
        <div className="faq-section-header">
          <h2>
            {lang === 'BN'
              ? `প্রশ্নোত্তর তালিকা (${filteredFaqs.length})`
              : `Frequently Asked Questions (${filteredFaqs.length})`}
          </h2>
          {searchQuery && (
            <button className="btn ghost small" onClick={handleClearSearch}>
              {lang === 'BN' ? 'সার্চ মুছুন' : 'Clear Search'}
            </button>
          )}
        </div>

        {filteredFaqs.length === 0 ? (
          <div className="card empty-faq-state" style={{ textAlign: 'center', padding: '36px 16px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔍</div>
            <h3>{lang === 'BN' ? 'কোনো ফলাফল পাওয়া যায়নি' : 'No matching questions found'}</h3>
            <p className="muted small" style={{ maxWidth: '420px', margin: '0 auto 16px' }}>
              {lang === 'BN'
                ? `"${searchQuery}" সম্পর্কিত কোনো উত্তর পাওয়া যায়নি। অন্য শব্দ দিয়ে খুঁজুন অথবা সরাসরি আমাদের সাপোর্টে যোগাযোগ করুন।`
                : `We couldn't find any FAQs matching "${searchQuery}". Try a different keyword or contact direct support below.`}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button className="btn outline small" onClick={handleClearSearch}>
                {lang === 'BN' ? 'সব প্রশ্ন দেখুন' : 'Show All Questions'}
              </button>
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn primary small" style={{ textDecoration: 'none' }}>
                💬 {lang === 'BN' ? 'হোয়াটসঅ্যাপে প্রশ্ন করুন' : 'Ask on WhatsApp'}
              </a>
            </div>
          </div>
        ) : (
          <div className="faq-accordion">
            {filteredFaqs.map(faq => {
              const isExpanded = expandedFaqIds.has(faq.id);
              const question = (lang === 'BN' && faq.qBn?.trim()) ? faq.qBn : faq.qEn;
              const answer = (lang === 'BN' && faq.aBn?.trim()) ? faq.aBn : faq.aEn;

              return (
                <div
                  key={faq.id}
                  className={`faq-card ${isExpanded ? 'expanded' : ''}`}
                >
                  <button
                    type="button"
                    className="faq-header"
                    onClick={() => toggleAccordion(faq.id)}
                    aria-expanded={isExpanded}
                  >
                    <div className="faq-header-left">
                      <span className="faq-q-badge" aria-hidden="true">Q</span>
                      <span className="faq-question-text">{question}</span>
                    </div>
                    <svg
                      className={`faq-chevron ${isExpanded ? 'rotate' : ''}`}
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="faq-answer">
                      <p>{answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Support & Contact Banner */}
      <div className="help-contact-banner card">
        <div className="help-contact-info">
          <h3>
            {lang === 'BN' ? '💬 এখনও সমাধান খুঁজে পাননি?' : '💬 Still have questions?'}
          </h3>
          <p className="muted small">
            {lang === 'BN'
              ? 'আমাদের ডেডিকেটেড সাপোর্ট টিম সরাসরি আপনাকে সাহায্য করার জন্য প্রস্তুত।'
              : 'Our dedicated support team is ready to assist you directly with billing, AI, or account issues.'}
          </p>
          <div className="help-response-time">
            <span>⏱️</span>
            <span>
              {lang === 'BN' ? 'গড় রেসপন্স সময়: ২ ঘণ্টার মধ্যে' : 'Average response time: under 2 hours'}
            </span>
          </div>
        </div>

        <div className="help-contact-actions">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn primary"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span>💬</span>
            <span>{lang === 'BN' ? 'হোয়াটসঅ্যাপে যোগাযোগ' : 'WhatsApp Support'}</span>
          </a>
          <a
            href={`mailto:${supportEmail}?subject=Tuitrix Support Request`}
            className="btn outline"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span>📧</span>
            <span>{lang === 'BN' ? 'ইমেইল সাপোর্ট' : 'Email Support'}</span>
          </a>
        </div>
      </div>
    </div>
  );
};
