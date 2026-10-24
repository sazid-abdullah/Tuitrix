import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';

type LegalTab = 'privacy' | 'terms' | 'billing' | 'security';

interface LegalModalProps {
  isOpen: boolean;
  initialTab?: LegalTab;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, initialTab = 'privacy', onClose }) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Legal, Privacy & Security Center">
      <div className="tabs" style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button className={`btn ${activeTab === 'privacy' ? 'primary' : 'outline'}`} onClick={() => setActiveTab('privacy')}>🔒 Privacy Policy</button>
        <button className={`btn ${activeTab === 'terms' ? 'primary' : 'outline'}`} onClick={() => setActiveTab('terms')}>📜 Terms of Service</button>
        <button className={`btn ${activeTab === 'billing' ? 'primary' : 'outline'}`} onClick={() => setActiveTab('billing')}>💳 Billing & Refund</button>
        <button className={`btn ${activeTab === 'security' ? 'primary' : 'outline'}`} onClick={() => setActiveTab('security')}>🛡️ Security</button>
      </div>

      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '8px', fontSize: '0.9rem', lineHeight: '1.5' }}>
        {activeTab === 'privacy' && (
          <div>
            <h3>Privacy Policy</h3>
            <p><strong>1. Data Collection & Multi-Tenant Isolation</strong></p>
            <p>Each tutor's data is isolated under authenticated Cloud Firestore paths (<code>tutors/&#123;uid&#125;</code>) and caching is managed via offline <code>localStorage</code>. Cross-tenant data access is strictly prohibited by security rules.</p>
            <p><strong>2. Strict AI Privacy Guarantee</strong></p>
            <p>Tuitrix explicitly guarantees that it NEVER transmits student names, phone numbers, parent contact details, or tuition fee records (৳) to external AI providers. Only anonymized academic inputs (classLevel, subject, topic) and user-provided study prompts are sent.</p>
            <p><strong>3. Third-Party Services & Rewarded Ads</strong></p>
            <p>We use Google Firebase for Authentication and Firestore. To support Free Tier AI requests (up to 5 per day), we use Google AdSense and AdMob Rewarded Ads, which may employ standard ad cookies as per Google's policies.</p>
            <p><strong>4. Data Retention & Account Deletion</strong></p>
            <p>Tutors can export a full JSON backup of their data or permanently delete their account and all cloud data at any time via <strong>Settings -&gt; Danger Zone / Account Deletion</strong>.</p>
          </div>
        )}

        {activeTab === 'terms' && (
          <div>
            <h3>Terms of Service</h3>
            <p><strong>1. Acceptable Use</strong></p>
            <p>Tuitrix is designed for use by independent tutors and coaching instructors. Users must secure their accounts and not use the platform for unlawful activities.</p>
            <p><strong>2. Free Tier Quotas</strong></p>
            <p>The Free Tier supports up to 15 students, 2 batches, and 5 ad-supported AI requests per day.</p>
            <p><strong>3. Pro Tier Subscriptions</strong></p>
            <p>Pro Tier unlocks unlimited students, unlimited ad-free AI generation, custom branding, and full analytics. Subscriptions are billed per the terms outlined in the billing policy.</p>
          </div>
        )}

        {activeTab === 'billing' && (
          <div>
            <h3>Billing & Refund Policy</h3>
            <p><strong>1. Payment Verification</strong></p>
            <p>Manual upgrades via bKash, Nagad, and Rocket TrxID verification in Bangladeshi Taka (৳) are processed normally within 24 hours.</p>
            <p><strong>2. Referral Discounts</strong></p>
            <p>Promotional terms and referral discounts are applied at the time of purchase according to active campaigns.</p>
            <p><strong>3. Refund Policy</strong></p>
            <p>Refunds are granted primarily for accidental duplicate transfers. Service subscriptions are otherwise non-refundable once activated. Contact support for dispute resolution.</p>
          </div>
        )}

        {activeTab === 'security' && (
          <div>
            <h3>Security & Data Protection</h3>
            <p><strong>1. Encryption in Transit</strong></p>
            <p>All communications between the app and external services are secured via HTTPS/TLS encryption.</p>
            <p><strong>2. Authentication & Data Isolation</strong></p>
            <p>Firebase Authentication is used for identity management. Strict Firestore tenant isolation rules ensure you can only read and write your own data.</p>
            <p><strong>3. Client-Side API Key Privacy</strong></p>
            <p>User-provided AI API keys (BYOK) are stored locally in the browser and never transmitted to our servers or external analytics.</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '20px', textAlign: 'right' }}>
        <button className="btn primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
};
