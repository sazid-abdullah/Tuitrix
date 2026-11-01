import React, { useState, useEffect } from 'react';
import { auth, signOut, onAuthStateChanged } from '../services/firebase';
import { User } from 'firebase/auth';
import { useStore } from '../store/context';
import { isProUser } from '../utils/tierLimits';

interface NavbarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  onLoginClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRoute, onNavigate, onLoginClick }) => {
  const { state, updateSettings, billingState, syncStatus, lastSyncedAt } = useStore();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [lang, setLang] = useState<'EN' | 'BN'>(() => {
    return (localStorage.getItem('tuitrix_lang') as 'EN' | 'BN') || 'EN';
  });

  useEffect(() => {
    // Check if already in standalone display mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    if (auth) {
      unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
      });
    }
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail && (e.detail === 'EN' || e.detail === 'BN')) {
        setLang(e.detail);
      }
    };
    window.addEventListener('tuitrix_lang_change', handler);
    return () => window.removeEventListener('tuitrix_lang_change', handler);
  }, []);

  const toggleLanguage = () => {
    const nextLang = lang === 'EN' ? 'BN' : 'EN';
    setLang(nextLang);
    localStorage.setItem('tuitrix_lang', nextLang);
    window.dispatchEvent(new CustomEvent('tuitrix_lang_change', { detail: nextLang }));
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } else {
      // If iOS or not prompted yet, navigate to Settings publishing tab
      onNavigate('settings');
    }
  };

  const navItems = [
    {
      id: 'home',
      label: lang === 'BN' ? 'হোম' : 'Home',
      icon: (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </svg>
      ),
    },
    {
      id: 'students',
      label: lang === 'BN' ? 'শিক্ষার্থী' : 'Students',
      icon: (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="4" />
          <path d="M1 21c0-4 4-6 8-6s8 2 8 6" />
          <path d="M16 4a4 4 0 0 1 0 8M19 15c2.5.7 4 2.7 4 6" />
        </svg>
      ),
    },
    {
      id: 'classes',
      label: lang === 'BN' ? 'ক্লাস' : 'Classes',
      icon: (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4M7 13h4M7 17h8" />
        </svg>
      ),
    },
    {
      id: 'money',
      label: lang === 'BN' ? 'হিসাব' : 'Money',
      icon: (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="20" height="13" rx="2" />
          <circle cx="12" cy="12.5" r="3" />
          <path d="M6 10v5M18 10v5" />
        </svg>
      ),
    },
    {
      id: 'ai',
      label: lang === 'BN' ? 'এআই' : 'AI',
      icon: (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
          <path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: lang === 'BN' ? 'সেটিংস' : 'Settings',
      icon: (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      ),
    },
    {
      id: 'landing',
      label: lang === 'BN' ? 'সম্পর্কে' : 'About',
      icon: (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
    },
  ];

  const username = user?.displayName || (user?.email ? user.email.split('@')[0] : 'User');
  const userInitial = (user?.displayName?.[0] || user?.email?.[0] || 'U').toUpperCase();
  const isPro = user ? isProUser(billingState, user.email) : false;

  return (
    <>
      <header id="topbar">
        {/* Left Zone: Brand + Compact Sync Dot */}
        <div className="header-left nav-zone-left">
          <a
            href="#/"
            onClick={e => {
              e.preventDefault();
              onNavigate('home');
            }}
            className="brand-link"
          >
            <svg width="28" height="28" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="bg_nav" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#161922"/>
                  <stop offset="100%" stopColor="#0b0d14"/>
                </linearGradient>
                <linearGradient id="grad1_nav" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00f2fe"/>
                  <stop offset="100%" stopColor="#4facfe"/>
                </linearGradient>
                <linearGradient id="grad2_nav" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4facfe"/>
                  <stop offset="100%" stopColor="#0015ff"/>
                </linearGradient>
                <linearGradient id="grad3_nav" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#00f2fe"/>
                  <stop offset="100%" stopColor="#0015ff"/>
                </linearGradient>
                <linearGradient id="gradStemRight_nav" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4facfe"/>
                  <stop offset="100%" stopColor="#0015ff"/>
                </linearGradient>
                <linearGradient id="gradStemLeft_nav" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#00f2fe"/>
                  <stop offset="100%" stopColor="#4facfe"/>
                </linearGradient>
              </defs>
              <rect width="512" height="512" rx="112" fill="url(#bg_nav)"/>
              <g transform="translate(256, 216)">
                <path d="M 0 -90 L -130 -90 L -170 -40 L -40 -40 Z" fill="url(#grad1_nav)" opacity="0.8" />
                <path d="M 0 -90 L 130 -90 L 170 -40 L 40 -40 Z" fill="url(#grad2_nav)" opacity="0.9" />
                <path d="M -40 -40 L -170 -40 L -130 10 L 0 10 Z" fill="url(#grad3_nav)" />
                <path d="M 40 -40 L 170 -40 L 130 10 L 0 10 Z" fill="url(#grad2_nav)" />
                <polygon points="0,-70 40,-40 0,10 -40,-40" fill="url(#grad1_nav)" opacity="0.95" />
                <polygon points="0,-45 18,-30 0,-5 -18,-30" fill="#00f2fe" />
                <path d="M 0 10 L -40 10 L -90 150 L 0 150 Z" fill="url(#gradStemLeft_nav)" />
                <path d="M 0 10 L 40 10 L 90 150 L 0 150 Z" fill="url(#gradStemRight_nav)" />
                <polygon points="-90,150 90,150 60,170 -60,170" fill="#00f2fe" opacity="0.8" />
                <polyline points="-130,-90 -170,-40 -130,10" fill="none" stroke="#00f2fe" strokeWidth="3" opacity="0.8" />
                <polyline points="130,-90 170,-40 130,10" fill="none" stroke="#00f2fe" strokeWidth="3" opacity="0.8" />
                <line x1="-90" y1="150" x2="-60" y2="170" stroke="#00f2fe" strokeWidth="3" opacity="0.8" />
                <line x1="90" y1="150" x2="60" y2="170" stroke="#00f2fe" strokeWidth="3" opacity="0.8" />
                <line x1="0" y1="10" x2="0" y2="150" stroke="#00f2fe" strokeWidth="2" opacity="0.4" />
              </g>
            </svg>
            <span className="brand-text">
              Tuitrix
            </span>
          </a>

          {/* Compact Sync Status Pill */}
          <div
            className={`sync-pill ${syncStatus}`}
            title={
              syncStatus === 'synced'
                ? (lastSyncedAt ? `Synced · Last: ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Synced to cloud')
                : syncStatus === 'syncing'
                ? 'Syncing changes to cloud...'
                : syncStatus === 'offline'
                ? 'Offline · Changes saved locally'
                : syncStatus === 'error'
                ? 'Sync error · Check connection'
                : 'Saved locally'
            }
          >
            <span className="sync-dot" />
            <span>
              {syncStatus === 'synced' && (lang === 'BN' ? '☁️ সিঙ্কড' : '☁️ Synced')}
              {syncStatus === 'syncing' && (lang === 'BN' ? '🔄 সিঙ্ক হচ্ছে...' : '🔄 Syncing...')}
              {syncStatus === 'offline' && (lang === 'BN' ? '⚡ অফলাইন (লোকাল)' : '⚡ Offline (Saved Locally)')}
              {syncStatus === 'local' && (lang === 'BN' ? '⚡ লোকালে সেভড' : '⚡ Saved Locally')}
              {syncStatus === 'error' && (lang === 'BN' ? '⚠️ সিঙ্ক ত্রুটি' : '⚠️ Sync Error')}
            </span>
          </div>

          {deferredPrompt && !isInstalled && (
            <button
              onClick={handleInstallClick}
              className="header-install-btn"
              title="Install Tuitrix PWA"
            >
              📲 Install
            </button>
          )}
        </div>

        {/* Center Zone: Navigation Pills */}
        <div className="header-center nav-zone-center">
          {navItems.map(item => {
            const isActive =
              currentRoute === item.id ||
              (item.id === 'students' && currentRoute === 'student');
            return (
              <a
                key={item.id}
                href={`#/${item.id}`}
                onClick={e => {
                  e.preventDefault();
                  onNavigate(item.id);
                }}
                className={`nav-pill-item ${isActive ? 'active' : ''}`}
                data-route={item.id}
              >
                {item.icon}
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>

        {/* Right Zone: Utilities + Compact Account Pill */}
        <div className="header-right nav-zone-right">
          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            className="util-btn"
            title={lang === 'EN' ? 'বাংলায় দেখুন' : 'Switch to English'}
          >
            {lang === 'EN' ? 'বাংলা' : 'EN'}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => updateSettings({ theme: state.settings.theme === 'light' ? 'dark' : 'light' })}
            className="util-btn"
            title={state.settings.theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          >
            {state.settings.theme === 'light' ? '🌙' : '☀️'}
          </button>

          {/* User Account Chip or Login Button */}
          {user ? (
            <div className="user-account-chip">
              {/* Avatar initial circle */}
              <div className="user-avatar-circle">
                {userInitial}
              </div>

              {/* Truncated username with full email tooltip */}
              <span
                className="user-name-text"
                title={user.email || ''}
              >
                {username}
              </span>

              {/* Pro / Upgrade badge */}
              {isPro ? (
                <span className="tier-badge pro">
                  Pro
                </span>
              ) : (
                <button
                  onClick={() => {
                    onNavigate('settings');
                    setTimeout(() => {
                      const el = document.getElementById('upgrade-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className="header-upgrade-btn tier-badge upgrade"
                  title="Upgrade to Pro"
                >
                  {lang === 'BN' ? 'আপগ্রেড ✨' : 'Upgrade ✨'}
                </button>
              )}

              {/* Logout button directly inside the chip */}
              <button
                onClick={() => auth && signOut(auth)}
                className="user-logout-btn"
                title="Logout"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="header-auth-group">
              <span className="header-tier-free">
                {lang === 'BN' ? 'ফ্রি' : 'Free'}
              </span>
              <button
                onClick={onLoginClick}
                className="header-signin-btn"
              >
                {lang === 'BN' ? 'লগইন' : 'Sign In'}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav id="nav" aria-label="Mobile Navigation">
        {navItems.map(item => {
          const isActive =
            currentRoute === item.id ||
            (item.id === 'students' && currentRoute === 'student');
          return (
            <a
              key={item.id}
              href={`#/${item.id}`}
              onClick={e => {
                e.preventDefault();
                onNavigate(item.id);
              }}
              className={isActive ? 'active' : ''}
              data-route={item.id}
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
};
