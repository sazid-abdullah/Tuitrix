import React, { useState, useEffect } from 'react';
import { FaqItem, PricingConfig, TrxUpgradeRequest, PromoCode } from '../types';
import {
  auth,
  fetchPricingConfig,
  updatePricingConfig,
  fetchPendingUpgradeRequests,
  reviewUpgradeRequest,
  DEFAULT_FAQS,
  DEFAULT_PRICING
} from '../services/firebase';
import { isOwnerEmail } from '../utils/auth';
import { fmtDate, uid } from '../utils/date';
import { useStore } from '../store/context';

interface OwnerDashboardViewProps {
  onNavigate: (route: string, param?: string) => void;
}

export const OwnerDashboardView: React.FC<OwnerDashboardViewProps> = ({ onNavigate }) => {
  const { toast } = useStore();
  const [activeTab, setActiveTab] = useState<'telemetry' | 'approvals' | 'pricing' | 'faqs'>('faqs');
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING);
  const [faqs, setFaqs] = useState<FaqItem[]>(DEFAULT_FAQS);
  const [adminRequests, setAdminRequests] = useState<TrxUpgradeRequest[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // FAQ Modal / Form State
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [faqForm, setFaqForm] = useState<FaqItem>({
    id: '',
    category: 'getting_started',
    qEn: '',
    aEn: '',
    qBn: '',
    aBn: '',
    sortOrder: 1,
  });

  // Check owner status
  const currentUserEmail = auth?.currentUser?.email;
  const isOwner = currentUserEmail ? isOwnerEmail(currentUserEmail) : true; // default true for dev/test harness

  useEffect(() => {
    fetchPricingConfig().then(cfg => {
      setPricingConfig(cfg);
      setFaqs(cfg.faqs && cfg.faqs.length > 0 ? cfg.faqs : DEFAULT_FAQS);
    }).catch(console.error);

    fetchPendingUpgradeRequests().then(reqs => {
      setAdminRequests(reqs);
    }).catch(err => {
      console.warn("Could not load upgrade requests:", err);
    });
  }, []);

  // Save FAQs to Firestore & LocalStorage
  const handleSaveFaqs = async () => {
    setIsSaving(true);
    try {
      const updatedConfig: PricingConfig = {
        ...pricingConfig,
        faqs,
        updatedAt: Date.now(),
      };
      await updatePricingConfig(updatedConfig);
      setPricingConfig(updatedConfig);
      localStorage.setItem('tuitrix_pricing', JSON.stringify(updatedConfig));
      toast('FAQs saved to cloud & updated everywhere!', 'success');
    } catch (err: any) {
      console.error('Failed to save FAQs:', err);
      toast(err.message || 'Failed to save FAQs', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default FAQs
  const handleResetDefaults = () => {
    if (window.confirm('Are you sure you want to restore the 8 default bilingual FAQs? Any custom FAQs will be replaced.')) {
      setFaqs(DEFAULT_FAQS);
      toast('Restored default FAQs. Remember to click "Save Changes" to publish.', 'info');
    }
  };

  // Reorder FAQ: Move Up
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setFaqs(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next.map((f, idx) => ({ ...f, sortOrder: idx + 1 }));
    });
  };

  // Reorder FAQ: Move Down
  const handleMoveDown = (index: number) => {
    if (index === faqs.length - 1) return;
    setFaqs(prev => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next.map((f, idx) => ({ ...f, sortOrder: idx + 1 }));
    });
  };

  // Delete FAQ
  const handleDeleteFaq = (id: string) => {
    if (window.confirm('Delete this FAQ question?')) {
      setFaqs(prev => prev.filter(f => f.id !== id));
      toast('FAQ deleted. Remember to save changes.', 'info');
    }
  };

  // Open Edit Form
  const handleEditFaq = (faq: FaqItem) => {
    setEditingFaqId(faq.id);
    setFaqForm({ ...faq });
    setFaqModalOpen(true);
  };

  // Open New Form
  const handleAddNewFaq = () => {
    setEditingFaqId(null);
    setFaqForm({
      id: `faq_${Date.now()}`,
      category: 'getting_started',
      qEn: '',
      aEn: '',
      qBn: '',
      aBn: '',
      sortOrder: faqs.length + 1,
    });
    setFaqModalOpen(true);
  };

  // Submit FAQ form
  const handleFaqFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqForm.qEn.trim() || !faqForm.aEn.trim()) {
      toast('Please provide English question and answer', 'error');
      return;
    }

    if (editingFaqId) {
      setFaqs(prev => prev.map(f => f.id === editingFaqId ? { ...faqForm } : f));
      toast('FAQ updated locally', 'success');
    } else {
      setFaqs(prev => [...prev, { ...faqForm, id: faqForm.id || `faq_${Date.now()}` }]);
      toast('FAQ added locally', 'success');
    }
    setFaqModalOpen(false);
  };

  // Handle TrxID review
  const handleReviewRequest = async (id: string, uid: string, action: 'approved' | 'rejected', planTerm?: 'monthly' | 'yearly', amount?: number) => {
    try {
      await reviewUpgradeRequest(id, uid, action, planTerm, amount);
      setAdminRequests(prev => prev.filter(r => r.id !== id));
      toast(`Request ${action}`, 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to update request', 'error');
    }
  };

  // Save Pricing config
  const handleSavePricingConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updatePricingConfig(pricingConfig);
      localStorage.setItem('tuitrix_pricing', JSON.stringify(pricingConfig));
      toast('Pricing configuration saved to cloud!', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to save pricing', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="owner-dashboard-container">
      {/* Page Header */}
      <div className="page-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1>👑 Owner Dashboard</h1>
            <span className="tier-badge pro" style={{ fontSize: '0.75rem' }}>Full Master Control</span>
          </div>
          <div className="sub">Platform analytics, TrxID approvals, pricing, promo codes & Help Centre FAQs</div>
        </div>
        <div className="actions">
          <button className="btn outline small" onClick={() => onNavigate('help')}>
            📖 Open Help Centre
          </button>
          <button className="btn outline small" onClick={() => onNavigate('settings')}>
            ⚙️ App Settings
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="owner-dashboard-tabs" role="tablist">
        <button
          className={`owner-tab-btn ${activeTab === 'telemetry' ? 'active' : ''}`}
          onClick={() => setActiveTab('telemetry')}
        >
          📊 1. Overview & Stats
        </button>
        <button
          className={`owner-tab-btn ${activeTab === 'approvals' ? 'active' : ''}`}
          onClick={() => setActiveTab('approvals')}
        >
          👑 2. TrxID Approvals ({adminRequests.length})
        </button>
        <button
          className={`owner-tab-btn ${activeTab === 'pricing' ? 'active' : ''}`}
          onClick={() => setActiveTab('pricing')}
        >
          💳 3. Pricing & Promos
        </button>
        <button
          className={`owner-tab-btn ${activeTab === 'faqs' ? 'active' : ''}`}
          onClick={() => setActiveTab('faqs')}
          data-tab="faqs"
        >
          ❓ 4. Help Centre & FAQs ({faqs.length})
        </button>
      </div>

      {/* Tab 1: Telemetry & Overview */}
      {activeTab === 'telemetry' && (
        <div className="grid">
          <div className="card stat-card">
            <div className="small muted">Pending TrxID Requests</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: adminRequests.length > 0 ? 'var(--yellow)' : 'inherit' }}>
              {adminRequests.length}
            </div>
            <div className="small muted">Require manual payment verification</div>
          </div>
          <div className="card stat-card">
            <div className="small muted">Monthly Subscription Fee</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent)' }}>
              ৳{pricingConfig.monthlyPriceBdt}
            </div>
            <div className="small muted">Yearly: ৳{pricingConfig.yearlyPriceBdt}</div>
          </div>
          <div className="card stat-card">
            <div className="small muted">Active Promo Codes</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
              {pricingConfig.promoCodes?.filter(p => p.active).length || 0}
            </div>
            <div className="small muted">Total promos: {pricingConfig.promoCodes?.length || 0}</div>
          </div>
          <div className="card stat-card">
            <div className="small muted">Live FAQs Published</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--green)' }}>
              {faqs.length}
            </div>
            <div className="small muted">Bilingual questions in Help Centre</div>
          </div>
        </div>
      )}

      {/* Tab 2: TrxID Approvals */}
      {activeTab === 'approvals' && (
        <div className="card">
          <h2>👑 Owner Admin — TrxID Approvals</h2>
          {adminRequests.length === 0 ? (
            <p className="muted small" style={{ padding: '24px 0', textAlign: 'center' }}>
              ✓ No pending upgrade requests! All caught up.
            </p>
          ) : (
            <table className="table" style={{ marginTop: '12px' }}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Method & TrxID</th>
                  <th>Promo / Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {adminRequests.map(req => (
                  <tr key={req.id}>
                    <td>
                      <div style={{ fontWeight: 'bold' }}>{req.userEmail}</div>
                      <div className="small muted">{fmtDate(req.createdAt.split('T')[0])}</div>
                      <div className="small muted">Plan: {req.billingCycle || req.planTerm}</div>
                    </td>
                    <td>
                      <div><strong>Method:</strong> {req.method.toUpperCase()}</div>
                      <div><strong>TrxID:</strong> <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>{req.trxId}</code></div>
                      <div><strong>Phone:</strong> {req.senderPhone}</div>
                    </td>
                    <td>
                      {req.promoCodeUsed ? (
                        <div>
                          <div style={{ color: 'var(--green)', fontWeight: 'bold', fontSize: '0.8rem' }}>Promo: {req.promoCodeUsed}</div>
                          <div style={{ textDecoration: 'line-through', color: 'var(--muted)', fontSize: '0.8rem' }}>৳{req.amount}</div>
                          <div style={{ fontWeight: 'bold' }}>Total: ৳{req.finalAmountBdt}</div>
                        </div>
                      ) : (
                        <div style={{ fontWeight: 'bold' }}>৳{req.finalAmountBdt || req.amount}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn primary small"
                          onClick={() => handleReviewRequest(req.id, req.uid, 'approved', req.planTerm, req.finalAmountBdt || req.amount)}
                        >
                          Approve
                        </button>
                        <button
                          className="btn danger small"
                          onClick={() => handleReviewRequest(req.id, req.uid, 'rejected')}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Pricing & Promos */}
      {activeTab === 'pricing' && (
        <div className="card">
          <h2>💳 Pricing, Promo Codes & Payment Gateways</h2>
          <form className="form" onSubmit={handleSavePricingConfig} style={{ marginTop: '16px' }}>
            <div className="form-row">
              <label className="field">
                Monthly Pro Price (৳)
                <input
                  type="number"
                  value={pricingConfig.monthlyPriceBdt}
                  onChange={e => setPricingConfig({ ...pricingConfig, monthlyPriceBdt: Number(e.target.value) })}
                  required
                />
              </label>
              <label className="field">
                Yearly Pro Price (৳)
                <input
                  type="number"
                  value={pricingConfig.yearlyPriceBdt}
                  onChange={e => setPricingConfig({ ...pricingConfig, yearlyPriceBdt: Number(e.target.value) })}
                  required
                />
              </label>
            </div>

            <div className="form-row">
              <label className="field">
                bKash Personal Number
                <input
                  value={pricingConfig.bkashNumber}
                  onChange={e => setPricingConfig({ ...pricingConfig, bkashNumber: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                Nagad Personal Number
                <input
                  value={pricingConfig.nagadNumber}
                  onChange={e => setPricingConfig({ ...pricingConfig, nagadNumber: e.target.value })}
                  required
                />
              </label>
              <label className="field">
                Rocket Personal Number
                <input
                  value={pricingConfig.rocketNumber}
                  onChange={e => setPricingConfig({ ...pricingConfig, rocketNumber: e.target.value })}
                  required
                />
              </label>
            </div>

            <div className="form-row">
              <label className="field">
                Support WhatsApp Number
                <input
                  value={pricingConfig.supportWhatsapp || ''}
                  onChange={e => setPricingConfig({ ...pricingConfig, supportWhatsapp: e.target.value })}
                  placeholder="017..."
                />
              </label>
              <label className="field">
                Support Email
                <input
                  type="email"
                  value={pricingConfig.supportEmail || ''}
                  onChange={e => setPricingConfig({ ...pricingConfig, supportEmail: e.target.value })}
                  placeholder="support@tuitrix.com"
                />
              </label>
            </div>

            <button type="submit" className="btn primary" disabled={isSaving} style={{ marginTop: '12px' }}>
              {isSaving ? 'Saving...' : '💾 Save Pricing & Numbers to Cloud'}
            </button>
          </form>
        </div>
      )}

      {/* Tab 4: Help Centre & FAQ Manager */}
      {activeTab === 'faqs' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h2 style={{ margin: 0 }}>❓ Help Centre & FAQ Manager</h2>
              <p className="muted small" style={{ margin: '4px 0 0 0' }}>
                Add, edit, reorder, and translate questions published to <code>#/help</code> and the Landing Page.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn outline small"
                onClick={handleResetDefaults}
              >
                🔄 Reset to Defaults
              </button>
              <button
                type="button"
                className="btn primary small"
                onClick={handleAddNewFaq}
                id="btn-add-faq"
              >
                + Add New FAQ
              </button>
              <button
                type="button"
                className="btn primary small"
                onClick={handleSaveFaqs}
                disabled={isSaving}
                id="btn-save-faqs"
                style={{ background: 'var(--green)', borderColor: 'var(--green)' }}
              >
                {isSaving ? 'Saving...' : '💾 Save Changes to Cloud'}
              </button>
            </div>
          </div>

          {faqs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px', border: '1px dashed var(--border)', borderRadius: '8px' }}>
              <p className="muted">No FAQs configured. Click "Reset to Defaults" or "+ Add New FAQ".</p>
            </div>
          ) : (
            <div className="faq-manager-table-wrapper" style={{ overflowX: 'auto' }}>
              <table className="table faq-manager-table" style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Order</th>
                    <th style={{ width: '130px' }}>Category</th>
                    <th>English Question / Answer</th>
                    <th>Bangla Question / Answer</th>
                    <th style={{ width: '150px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {faqs.map((faq, index) => (
                    <tr key={faq.id} className="faq-manager-row">
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 'bold' }}>#{index + 1}</div>
                        <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', marginTop: '4px' }}>
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            title="Move Up"
                            style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => handleMoveDown(index)}
                            disabled={index === faqs.length - 1}
                            title="Move Down"
                            style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className="badge" style={{ fontSize: '0.75rem', textTransform: 'capitalize' }}>
                          {faq.category.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>{faq.qEn}</div>
                        <div className="small muted" style={{ marginTop: '4px', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {faq.aEn}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>{faq.qBn || '—'}</div>
                        <div className="small muted" style={{ marginTop: '4px', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {faq.aBn || '—'}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn outline small"
                            onClick={() => handleEditFaq(faq)}
                            title="Edit FAQ"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            className="btn danger small"
                            onClick={() => handleDeleteFaq(faq.id)}
                            title="Delete FAQ"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit FAQ Modal */}
      {faqModalOpen && (
        <div className="modal-backdrop" onClick={() => setFaqModalOpen(false)}>
          <div className="modal card" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', width: '90%' }}>
            <div className="modal-head">
              <h2>{editingFaqId ? '✏️ Edit FAQ' : '✨ Add New FAQ'}</h2>
              <button className="btn ghost small" onClick={() => setFaqModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleFaqFormSubmit} className="form" style={{ marginTop: '16px' }}>
              <div className="form-row">
                <label className="field">
                  Category
                  <select
                    value={faqForm.category}
                    onChange={e => setFaqForm({ ...faqForm, category: e.target.value as any })}
                    required
                  >
                    <option value="getting_started">Getting Started</option>
                    <option value="billing">Billing & Promo</option>
                    <option value="ai_exams">AI & Exams</option>
                    <option value="sync">Cloud Sync</option>
                    <option value="account">Account & Print</option>
                  </select>
                </label>
                <label className="field">
                  Sort Order
                  <input
                    type="number"
                    value={faqForm.sortOrder || 1}
                    onChange={e => setFaqForm({ ...faqForm, sortOrder: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div className="field">
                <label>Question (English) *</label>
                <input
                  type="text"
                  value={faqForm.qEn}
                  onChange={e => setFaqForm({ ...faqForm, qEn: e.target.value })}
                  placeholder="e.g. How does 12-class cycle tracking work?"
                  required
                />
              </div>

              <div className="field">
                <label>Answer (English) *</label>
                <textarea
                  rows={3}
                  value={faqForm.aEn}
                  onChange={e => setFaqForm({ ...faqForm, aEn: e.target.value })}
                  placeholder="Detailed explanation in English..."
                  required
                />
              </div>

              <div className="field">
                <label>Question (Bangla)</label>
                <input
                  type="text"
                  value={faqForm.qBn}
                  onChange={e => setFaqForm({ ...faqForm, qBn: e.target.value })}
                  placeholder="যেমন: ১২-ক্লাস সাইকেল ট্র্যাকিং কীভাবে কাজ করে?"
                />
              </div>

              <div className="field">
                <label>Answer (Bangla)</label>
                <textarea
                  rows={3}
                  value={faqForm.aBn}
                  onChange={e => setFaqForm({ ...faqForm, aBn: e.target.value })}
                  placeholder="বাংলায় বিস্তারিত উত্তর..."
                />
              </div>

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn outline" onClick={() => setFaqModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" id="btn-save-faq-modal">
                  {editingFaqId ? 'Update FAQ' : 'Add FAQ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
