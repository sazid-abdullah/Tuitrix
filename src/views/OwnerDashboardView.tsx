import React, { useState, useEffect, useMemo } from 'react';
import { FaqItem, PricingConfig, TrxUpgradeRequest, PromoCode, PlatformTelemetry } from '../types';
import {
  auth,
  onAuthStateChanged,
  fetchPricingConfig,
  updatePricingConfig,
  fetchAllUpgradeRequests,
  reviewUpgradeRequest,
  evaluatePromoCode,
  fetchPlatformTelemetry,
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
  const [isAuthorizedOwner, setIsAuthorizedOwner] = useState<boolean>(() => {
    return isOwnerEmail(auth?.currentUser?.email) || !auth;
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'pricing' | 'promos' | 'faqs'>('overview');
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING);
  const [faqs, setFaqs] = useState<FaqItem[]>(DEFAULT_FAQS);
  const [allRequests, setAllRequests] = useState<TrxUpgradeRequest[]>([]);
  const [telemetry, setTelemetry] = useState<PlatformTelemetry | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // TrxID Filter State
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Pricing Form State
  const [pricingForm, setPricingForm] = useState<PricingConfig>(DEFAULT_PRICING);

  // Promo Modal & Edit State
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [editingPromoIndex, setEditingPromoIndex] = useState<number | null>(null);
  const [promoForm, setPromoForm] = useState<PromoCode>({
    code: '',
    discountType: 'percent',
    discountValue: 20,
    discountPercent: 20,
    maxUses: 0,
    usedCount: 0,
    expiresAt: '',
    active: true,
    description: '',
  });

  // Promo Simulator State
  const [simBasePrice, setSimBasePrice] = useState<number>(99);
  const [simSelectedCode, setSimSelectedCode] = useState<string>('');

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

  const loadData = async () => {
    setIsLoading(true);
    try {
      const cfg = await fetchPricingConfig();
      setPricingConfig(cfg);
      setPricingForm(cfg);
      setFaqs(cfg.faqs && cfg.faqs.length > 0 ? cfg.faqs : DEFAULT_FAQS);

      const telem = await fetchPlatformTelemetry(cfg);
      setTelemetry(telem);
      setAllRequests(telem.allRequests || []);

      if (cfg.promoCodes?.length > 0 && !simSelectedCode) {
        setSimSelectedCode(cfg.promoCodes[0].code);
      }
    } catch (err) {
      console.error('Failed to load owner telemetry:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!auth || typeof onAuthStateChanged !== 'function') return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthorizedOwner(isOwnerEmail(user.email));
      } else {
        setIsAuthorizedOwner(isOwnerEmail(auth?.currentUser?.email) || !auth);
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Filtered TrxID requests
  const filteredRequests = useMemo(() => {
    return allRequests.filter(req => {
      if (statusFilter !== 'all' && req.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchEmail = (req.userEmail || '').toLowerCase().includes(q);
        const matchTrx = (req.trxId || '').toLowerCase().includes(q);
        const matchPhone = (req.senderPhone || '').toLowerCase().includes(q);
        const matchPromo = (req.promoCodeUsed || '').toLowerCase().includes(q);
        return matchEmail || matchTrx || matchPhone || matchPromo;
      }
      return true;
    });
  }, [allRequests, statusFilter, searchQuery]);

  // Review TrxID request (Approve / Reject)
  const handleReviewRequest = async (id: string, uidStr: string, action: 'approved' | 'rejected', planTerm?: 'monthly' | 'yearly', amount?: number) => {
    try {
      await reviewUpgradeRequest(id, uidStr, action, planTerm, amount);
      toast(`Upgrade request ${action}!`, 'success');
      // Refresh telemetry
      await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to update request', 'error');
    }
  };

  // Save Pricing Form
  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated: PricingConfig = {
        ...pricingConfig,
        monthlyPriceBdt: Number(pricingForm.monthlyPriceBdt) || 99,
        yearlyPriceBdt: Number(pricingForm.yearlyPriceBdt) || 999,
        freeStudentLimit: Math.max(1, Number(pricingForm.freeStudentLimit) || 5),
        bkashNumber: pricingForm.bkashNumber.trim(),
        nagadNumber: pricingForm.nagadNumber.trim(),
        rocketNumber: pricingForm.rocketNumber.trim(),
        supportWhatsapp: pricingForm.supportWhatsapp?.trim() || '',
        supportEmail: pricingForm.supportEmail?.trim() || '',
        promoText: pricingForm.promoText?.trim() || '',
        updatedAt: Date.now(),
      };
      await updatePricingConfig(updated);
      setPricingConfig(updated);
      setPricingForm(updated);
      toast('Pricing configuration saved & published to cloud!', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to save pricing', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Promo Code Operations
  const handleOpenNewPromo = () => {
    setEditingPromoIndex(null);
    setPromoForm({
      code: '',
      discountType: 'percent',
      discountValue: 25,
      discountPercent: 25,
      maxUses: 0,
      usedCount: 0,
      expiresAt: '',
      active: true,
      description: '',
    });
    setPromoModalOpen(true);
  };

  const handleEditPromo = (promo: PromoCode, index: number) => {
    setEditingPromoIndex(index);
    setPromoForm({ ...promo });
    setPromoModalOpen(true);
  };

  const handleTogglePromoActive = async (index: number) => {
    const updatedPromos = [...(pricingConfig.promoCodes || [])];
    updatedPromos[index] = {
      ...updatedPromos[index],
      active: !updatedPromos[index].active,
    };
    const updatedConfig = { ...pricingConfig, promoCodes: updatedPromos, updatedAt: Date.now() };
    setPricingConfig(updatedConfig);
    try {
      await updatePricingConfig(updatedConfig);
      toast(`Promo code ${updatedPromos[index].active ? 'activated' : 'deactivated'}`, 'info');
    } catch (err: any) {
      toast('Failed to update promo status', 'error');
    }
  };

  const handleDeletePromo = async (index: number) => {
    const target = pricingConfig.promoCodes[index];
    if (window.confirm(`Delete promo code "${target.code}"?`)) {
      const updatedPromos = pricingConfig.promoCodes.filter((_, i) => i !== index);
      const updatedConfig = { ...pricingConfig, promoCodes: updatedPromos, updatedAt: Date.now() };
      setPricingConfig(updatedConfig);
      try {
        await updatePricingConfig(updatedConfig);
        toast(`Promo code "${target.code}" deleted`, 'info');
      } catch (err: any) {
        toast('Failed to delete promo code', 'error');
      }
    }
  };

  const handleSavePromoModal = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = promoForm.code.trim().toUpperCase();
    if (!cleanCode) {
      toast('Please enter a promo code', 'error');
      return;
    }

    const val = Number(promoForm.discountValue) || 0;
    const isPercent = promoForm.discountType === 'percent';
    const computedPercent = isPercent ? Math.min(100, Math.max(0, val)) : Math.min(100, Math.max(0, Math.round((val / (pricingConfig.monthlyPriceBdt || 99)) * 100)));

    const cleanDesc = promoForm.description?.trim();
    const liveUsedCount = Math.max(promoForm.usedCount || 0, telemetry?.promoUsageMap[cleanCode]?.count || 0);

    const item: PromoCode = {
      code: cleanCode,
      discountType: promoForm.discountType || 'percent',
      discountValue: val,
      discountPercent: computedPercent,
      active: promoForm.active,
      usedCount: liveUsedCount,
      ...(Number(promoForm.maxUses) > 0 ? { maxUses: Number(promoForm.maxUses) } : {}),
      ...(promoForm.expiresAt ? { expiresAt: promoForm.expiresAt } : {}),
      ...(cleanDesc ? { description: cleanDesc } : {}),
    };

    let updatedPromos = [...(pricingConfig.promoCodes || [])];
    if (editingPromoIndex !== null && editingPromoIndex >= 0) {
      updatedPromos[editingPromoIndex] = item;
    } else {
      if (updatedPromos.some(p => p.code.toUpperCase() === cleanCode)) {
        toast(`Promo code "${cleanCode}" already exists!`, 'error');
        return;
      }
      updatedPromos.push(item);
    }

    const updatedConfig = { ...pricingConfig, promoCodes: updatedPromos, updatedAt: Date.now() };
    setPricingConfig(updatedConfig);
    setPromoModalOpen(false);

    try {
      await updatePricingConfig(updatedConfig);
      toast('Promo codes updated & saved to cloud!', 'success');
      loadData();
    } catch (err: any) {
      toast('Failed to save promo codes to cloud', 'error');
    }
  };

  // Live Simulator Evaluation
  const simEvaluation = useMemo(() => {
    if (!simSelectedCode) return null;
    const promo = pricingConfig.promoCodes?.find(p => p.code.toUpperCase() === simSelectedCode.toUpperCase());
    return evaluatePromoCode(promo, Number(simBasePrice) || 0);
  }, [simSelectedCode, simBasePrice, pricingConfig.promoCodes]);

  // Save FAQs & Support Contacts
  const handleSaveFaqs = async () => {
    setIsSaving(true);
    try {
      const updatedConfig: PricingConfig = {
        ...pricingConfig,
        faqs,
        supportWhatsapp: pricingForm.supportWhatsapp?.trim() || '',
        supportEmail: pricingForm.supportEmail?.trim() || '',
        updatedAt: Date.now(),
      };
      await updatePricingConfig(updatedConfig);
      setPricingConfig(updatedConfig);
      toast('FAQs & support contacts saved to cloud & updated everywhere!', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to save FAQs', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Restore the 8 default bilingual FAQs? Custom FAQs will be replaced.')) {
      setFaqs(DEFAULT_FAQS);
      toast('Restored default FAQs. Click "Save Changes" to publish.', 'info');
    }
  };

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

  const handleDeleteFaq = (id: string) => {
    if (window.confirm('Delete this FAQ question?')) {
      setFaqs(prev => prev.filter(f => f.id !== id));
      toast('FAQ deleted. Remember to save changes.', 'info');
    }
  };

  const handleEditFaq = (faq: FaqItem) => {
    setEditingFaqId(faq.id);
    setFaqForm({ ...faq });
    setFaqModalOpen(true);
  };

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

  if (!isAuthorizedOwner) {
    return (
      <div className="card" style={{ maxWidth: '500px', margin: '40px auto', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🔒</div>
        <h2>Access Denied</h2>
        <p className="muted small" style={{ margin: '12px 0 24px 0' }}>
          This dashboard is restricted to authorized platform owners.
        </p>
        <button className="btn primary" onClick={() => onNavigate('home')}>
          🏠 Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="owner-dashboard-container">
      {/* Header */}
      <div className="page-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1>👑 Owner Dashboard</h1>
            <span className="badge green" style={{ fontSize: '0.75rem' }}>Master Telemetry & Admin</span>
          </div>
          <div className="sub">Platform analytics, TrxID approvals, dynamic pricing & promo studio</div>
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

      {/* Tabs */}
      <div className="owner-dashboard-tabs" role="tablist">
        <button
          className={`owner-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          data-tab="overview"
          id="owner-tab-overview"
        >
          📊 1. Overview & Usage
        </button>
        <button
          className={`owner-tab-btn ${activeTab === 'pricing' ? 'active' : ''}`}
          onClick={() => setActiveTab('pricing')}
          data-tab="pricing"
          id="owner-tab-pricing"
        >
          💳 2. Pricing & Numbers
        </button>
        <button
          className={`owner-tab-btn ${activeTab === 'promos' ? 'active' : ''}`}
          onClick={() => setActiveTab('promos')}
          data-tab="promos"
          id="owner-tab-promos"
        >
          🎟️ 3. Promo Studio ({pricingConfig.promoCodes?.length || 0})
        </button>
        <button
          className={`owner-tab-btn ${activeTab === 'faqs' ? 'active' : ''}`}
          onClick={() => setActiveTab('faqs')}
          data-tab="faqs"
          id="owner-tab-faqs"
        >
          ❓ 4. Help Centre & FAQs ({faqs.length})
        </button>
      </div>

      {/* TAB 1: OVERVIEW & USAGE */}
      {activeTab === 'overview' && (
        <div>
          {/* 4 KPI Cards */}
          <div className="owner-kpi-grid">
            <div className="owner-kpi-card">
              <span className="owner-kpi-label">Registered Tutors / Users</span>
              <span className="owner-kpi-value">{telemetry?.totalUsers ?? '...'}</span>
              <span className="owner-kpi-sub">
                Pro: <strong>{telemetry?.proUsers ?? 0}</strong> · Free: <strong>{telemetry?.freeUsers ?? 0}</strong>
              </span>
            </div>

            <div className="owner-kpi-card green">
              <span className="owner-kpi-label">Total Verified Revenue</span>
              <span className="owner-kpi-value" style={{ color: 'var(--green)' }}>
                ৳{telemetry?.totalRevenueBdt ? telemetry.totalRevenueBdt.toLocaleString() : '0'}
              </span>
              <span className="owner-kpi-sub">
                {telemetry?.approvedCount ?? 0} approved upgrade orders
              </span>
            </div>

            <div className="owner-kpi-card">
              <span className="owner-kpi-label">Promo Redemptions</span>
              <span className="owner-kpi-value">{telemetry?.totalPromoRedemptions ?? 0}</span>
              <span className="owner-kpi-sub">
                Across {pricingConfig.promoCodes?.length || 0} configured campaigns
              </span>
            </div>

            <div className={`owner-kpi-card ${(telemetry?.pendingCount || 0) > 0 ? 'yellow' : ''}`}>
              <span className="owner-kpi-label">Pending TrxID Orders</span>
              <span className="owner-kpi-value" style={{ color: (telemetry?.pendingCount || 0) > 0 ? 'var(--yellow)' : 'inherit' }}>
                {telemetry?.pendingCount ?? 0}
              </span>
              <span className="owner-kpi-sub">
                {(telemetry?.pendingCount || 0) > 0 ? 'Action required in table below' : 'All caught up!'}
              </span>
            </div>
          </div>

          {/* Promo Usage Breakdown Table */}
          <div className="card" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0 }}>🎟️ Promo Code Usage & Financial Telemetry</h3>
                <p className="muted small" style={{ margin: '4px 0 0 0' }}>
                  Live tracking of redemptions, revenue generated, and discounts granted per promo.
                </p>
              </div>
              <button className="btn outline small" onClick={() => setActiveTab('promos')}>
                Open Promo Studio →
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th>Promo Code</th>
                    <th>Discount</th>
                    <th>Usage (Used / Max)</th>
                    <th>Revenue Generated</th>
                    <th>Discount Given</th>
                    <th>Expires</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(pricingConfig.promoCodes || []).map(p => {
                    const stats = telemetry?.promoUsageMap[p.code.toUpperCase()] || {
                      count: p.usedCount || 0,
                      totalDiscountBdt: 0,
                      revenueGeneratedBdt: 0,
                    };
                    const usedCount = stats.count ?? (p.usedCount || 0);
                    const maxDisplay = p.maxUses && p.maxUses > 0 ? p.maxUses : '∞';
                    const isExhausted = Boolean(p.maxUses && p.maxUses > 0 && usedCount >= p.maxUses);

                    return (
                      <tr key={p.code}>
                        <td>
                          <strong>{p.code}</strong>
                          {p.description && <div className="small muted">{p.description}</div>}
                        </td>
                        <td>
                          {p.discountType === 'flat' ? `৳${p.discountValue || p.discountPercent} flat` : `${p.discountValue || p.discountPercent}%`}
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{usedCount}</span> / {maxDisplay}
                          {isExhausted && <span className="badge red" style={{ marginLeft: '6px' }}>Cap Reached</span>}
                        </td>
                        <td style={{ fontWeight: 'bold', color: 'var(--green)' }}>
                          ৳{stats.revenueGeneratedBdt.toLocaleString()}
                        </td>
                        <td style={{ color: 'var(--muted)' }}>
                          ৳{stats.totalDiscountBdt.toLocaleString()}
                        </td>
                        <td>{p.expiresAt || 'Never'}</td>
                        <td>
                          <span className={`badge ${p.active ? 'green' : 'red'}`}>
                            {p.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {(!pricingConfig.promoCodes || pricingConfig.promoCodes.length === 0) && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                        No promo codes found. Create one in the Promo Studio tab.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Filterable TrxID Approval Table */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ margin: 0 }}>👑 TrxID Verification & Approvals</h3>
                <p className="muted small" style={{ margin: '4px 0 0 0' }}>
                  Review sender phone, bKash/Nagad/Rocket TrxID, and verify subscription upgrades.
                </p>
              </div>

              {/* Filter Pills & Search */}
              <div className="owner-filter-bar" style={{ margin: 0 }}>
                <div className="owner-filter-group">
                  <button
                    className={`owner-filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('all')}
                  >
                    All ({allRequests.length})
                  </button>
                  <button
                    className={`owner-filter-btn ${statusFilter === 'pending' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('pending')}
                  >
                    Pending ({telemetry?.pendingCount ?? 0})
                  </button>
                  <button
                    className={`owner-filter-btn ${statusFilter === 'approved' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('approved')}
                  >
                    Approved ({telemetry?.approvedCount ?? 0})
                  </button>
                  <button
                    className={`owner-filter-btn ${statusFilter === 'rejected' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('rejected')}
                  >
                    Rejected ({telemetry?.rejectedCount ?? 0})
                  </button>
                </div>
                <input
                  type="text"
                  className="owner-search-input"
                  placeholder="Search by Email, TrxID, Phone..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {filteredRequests.length === 0 ? (
              <p className="muted small" style={{ padding: '32px 0', textAlign: 'center' }}>
                No upgrade requests found matching criteria.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th>Tutor Email / Account</th>
                      <th>Method & TrxID</th>
                      <th>Promo & Amount</th>
                      <th>Submitted Date</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequests.map(req => {
                      const isPending = req.status === 'pending';
                      return (
                        <tr key={req.id}>
                          <td>
                            <div style={{ fontWeight: 'bold' }}>{req.userEmail}</div>
                            <div className="small muted">Cycle: {req.billingCycle || req.planTerm || 'Monthly'}</div>
                          </td>
                          <td>
                            <div>
                              <span className="badge" style={{ textTransform: 'uppercase', marginRight: '6px' }}>{req.method}</span>
                              <code style={{ background: 'var(--surface)', padding: '2px 6px', borderRadius: '4px' }}>
                                {req.trxId}
                              </code>
                            </div>
                            <div className="small muted" style={{ marginTop: '2px' }}>Sender: {req.senderPhone}</div>
                          </td>
                          <td>
                            {req.promoCodeUsed ? (
                              <div>
                                <div style={{ color: 'var(--green)', fontWeight: 'bold', fontSize: '0.8rem' }}>Promo: {req.promoCodeUsed}</div>
                                <div style={{ textDecoration: 'line-through', color: 'var(--muted)', fontSize: '0.8rem' }}>৳{req.amount}</div>
                                <div style={{ fontWeight: 'bold' }}>৳{req.finalAmountBdt}</div>
                              </div>
                            ) : (
                              <div style={{ fontWeight: 'bold' }}>৳{req.finalAmountBdt || req.amount}</div>
                            )}
                          </td>
                          <td className="small muted">
                            {fmtDate(req.createdAt ? req.createdAt.split('T')[0] : '')}
                          </td>
                          <td>
                            <span className={`badge ${req.status === 'approved' ? 'green' : req.status === 'pending' ? 'yellow' : 'red'}`}>
                              {req.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {isPending ? (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
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
                            ) : (
                              <span className="small muted">Completed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: PRICING & NUMBERS */}
      {activeTab === 'pricing' && (
        <div className="card">
          <h2>💳 Dynamic Pricing & Payment Gateway Numbers</h2>
          <p className="muted small">
            Update monthly/yearly subscription fees and official payment numbers. Changes publish immediately to all tutors.
          </p>

          <form onSubmit={handleSavePricing} className="form" style={{ marginTop: '20px' }}>
            <div className="form-row">
              <label className="field">
                Monthly Pro Price (৳) *
                <input
                  type="number"
                  value={pricingForm.monthlyPriceBdt === 0 ? '' : String(Number(pricingForm.monthlyPriceBdt))}
                  onChange={e => setPricingForm({ ...pricingForm, monthlyPriceBdt: Number(e.target.value) })}
                  required
                />
              </label>
              <label className="field">
                Yearly Pro Price (৳) *
                <input
                  type="number"
                  value={pricingForm.yearlyPriceBdt === 0 ? '' : String(Number(pricingForm.yearlyPriceBdt))}
                  onChange={e => setPricingForm({ ...pricingForm, yearlyPriceBdt: Number(e.target.value) })}
                  required
                />
              </label>
              <label className="field">
                Free Tier Student Limit *
                <input
                  type="number"
                  min={1}
                  value={pricingForm.freeStudentLimit === 0 ? '' : String(Number(pricingForm.freeStudentLimit ?? 5))}
                  onChange={e => setPricingForm({ ...pricingForm, freeStudentLimit: Number(e.target.value) })}
                  required
                />
              </label>
            </div>

            <div className="form-row">
              <label className="field">
                bKash Personal Number (Send Money) *
                <input
                  value={pricingForm.bkashNumber}
                  onChange={e => setPricingForm({ ...pricingForm, bkashNumber: e.target.value })}
                  placeholder="017XXXXXXXX"
                  required
                />
              </label>
              <label className="field">
                Nagad Personal Number (Send Money) *
                <input
                  value={pricingForm.nagadNumber}
                  onChange={e => setPricingForm({ ...pricingForm, nagadNumber: e.target.value })}
                  placeholder="017XXXXXXXX"
                  required
                />
              </label>
              <label className="field">
                Rocket Personal Number (Send Money) *
                <input
                  value={pricingForm.rocketNumber}
                  onChange={e => setPricingForm({ ...pricingForm, rocketNumber: e.target.value })}
                  placeholder="017XXXXXXXX"
                  required
                />
              </label>
            </div>

            <div className="form-row">
              <label className="field">
                Support WhatsApp (optional)
                <input
                  value={pricingForm.supportWhatsapp || ''}
                  onChange={e => setPricingForm({ ...pricingForm, supportWhatsapp: e.target.value })}
                  placeholder="017XXXXXXXX"
                />
              </label>
              <label className="field">
                Support Email (optional)
                <input
                  type="email"
                  value={pricingForm.supportEmail || ''}
                  onChange={e => setPricingForm({ ...pricingForm, supportEmail: e.target.value })}
                  placeholder="support@tuitrix.com"
                />
              </label>
            </div>

            <div className="field">
              <label>Promo Announcement Banner Text (shown above payment in user checkout)</label>
              <input
                value={pricingForm.promoText || ''}
                onChange={e => setPricingForm({ ...pricingForm, promoText: e.target.value })}
                placeholder="e.g. ⚡ Special Semester Launch: 50% OFF with code WELCOME50!"
              />
            </div>

            <button type="submit" className="btn primary" disabled={isSaving} style={{ marginTop: '12px' }}>
              {isSaving ? 'Publishing...' : '💾 Save Pricing & Payment Numbers to Cloud'}
            </button>
          </form>

          {/* Live Preview Card */}
          <div className="owner-live-preview">
            <h4 style={{ margin: '0 0 12px 0', color: 'var(--accent)' }}>👁️ Live Checkout Preview (What tutors see in Settings)</h4>
            {pricingForm.promoText && (
              <div style={{ padding: '10px 14px', background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: '6px', marginBottom: '14px', color: 'var(--accent)', fontWeight: 600 }}>
                {pricingForm.promoText}
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, padding: '14px', background: 'var(--card)', border: '2px solid var(--accent)', borderRadius: '8px' }}>
                <div className="small muted">Monthly Pro</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>৳{pricingForm.monthlyPriceBdt} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>/ month</span></div>
              </div>
              <div style={{ flex: 1, padding: '14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <div className="small muted">Yearly Pro (Best Value)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>৳{pricingForm.yearlyPriceBdt} <span style={{ fontSize: '0.8rem', fontWeight: 400 }}>/ year</span></div>
              </div>
            </div>
            <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Official payment receivers: bKash: <strong>{pricingForm.bkashNumber || 'Not set'}</strong> · Nagad: <strong>{pricingForm.nagadNumber || 'Not set'}</strong> · Rocket: <strong>{pricingForm.rocketNumber || 'Not set'}</strong>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PROMO STUDIO */}
      {activeTab === 'promos' && (
        <div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ margin: 0 }}>🎟️ Promo & Scholarship Code Studio</h2>
                <p className="muted small" style={{ margin: '4px 0 0 0' }}>
                  Create percentage or flat ৳ discounts, set usage caps, and define expiry dates.
                </p>
              </div>
              <button className="btn primary small" onClick={handleOpenNewPromo} id="btn-add-promo">
                + Create New Promo Code
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Type & Value</th>
                    <th>Usage Cap</th>
                    <th>Used Count</th>
                    <th>Expires At</th>
                    <th>Active</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(pricingConfig.promoCodes || []).map((promo, idx) => {
                    const liveUsedCount = Math.max(promo.usedCount || 0, telemetry?.promoUsageMap[promo.code.toUpperCase()]?.count || 0);
                    const isExhausted = promo.maxUses && promo.maxUses > 0 && liveUsedCount >= promo.maxUses;
                    return (
                      <tr key={promo.code}>
                        <td>
                          <strong>{promo.code}</strong>
                          {promo.description && <div className="small muted">{promo.description}</div>}
                        </td>
                        <td>
                          {promo.discountType === 'flat' ? `৳${promo.discountValue || promo.discountPercent} Flat` : `${promo.discountValue || promo.discountPercent}% Off`}
                        </td>
                        <td>{promo.maxUses && promo.maxUses > 0 ? `${promo.maxUses} uses` : 'Unlimited'}</td>
                        <td>
                          <strong>{liveUsedCount}</strong>
                          {isExhausted && <span className="badge red" style={{ marginLeft: '6px' }}>Cap Reached</span>}
                        </td>
                        <td>{promo.expiresAt || 'Never'}</td>
                        <td>
                          <button
                            type="button"
                            className={`btn small ${promo.active ? 'primary' : 'outline'}`}
                            onClick={() => handleTogglePromoActive(idx)}
                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                          >
                            {promo.active ? 'Active' : 'Inactive'}
                          </button>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="btn outline small"
                              onClick={() => handleEditPromo(promo, idx)}
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              className="btn danger small"
                              onClick={() => handleDeletePromo(idx)}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(!pricingConfig.promoCodes || pricingConfig.promoCodes.length === 0) && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '24px' }} className="muted">
                        No promo codes found. Click "+ Create New Promo Code" above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Interactive Promo Discount Simulator */}
          <div className="owner-simulator-card">
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--accent)' }}>🧮 Interactive Promo Discount Simulator</h3>
            <p className="muted small" style={{ margin: '0 0 16px 0' }}>
              Test any promo code against arbitrary subscription prices to verify mathematical discount accuracy, usage caps, and expiration rules.
            </p>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 1, minWidth: '160px' }}>
                Base Price (৳)
                <input
                  type="number"
                  value={simBasePrice}
                  onChange={e => setSimBasePrice(Number(e.target.value))}
                />
              </label>

              <label className="field" style={{ flex: 1, minWidth: '200px' }}>
                Select Promo Code
                <select
                  value={simSelectedCode}
                  onChange={e => setSimSelectedCode(e.target.value)}
                >
                  <option value="">-- Choose a code --</option>
                  {(pricingConfig.promoCodes || []).map(p => (
                    <option key={p.code} value={p.code}>
                      {p.code} ({p.discountType === 'flat' ? `৳${p.discountValue || p.discountPercent}` : `${p.discountValue || p.discountPercent}%`})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {simEvaluation && (
              <div style={{ marginTop: '16px', padding: '14px', background: 'var(--card)', borderRadius: '8px', border: `1px solid ${simEvaluation.valid ? 'var(--green)' : 'var(--red)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span className={`badge ${simEvaluation.valid ? 'green' : 'red'}`}>
                    {simEvaluation.valid ? '✓ VALID PROMO CODE' : '✕ INVALID / EXPIRED'}
                  </span>
                  {!simEvaluation.valid && <span style={{ color: 'var(--red)', fontSize: '0.85rem' }}>{simEvaluation.error}</span>}
                </div>

                {simEvaluation.valid && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '10px' }}>
                    <div>
                      <div className="small muted">Base Price</div>
                      <div style={{ fontWeight: 600 }}>৳{simBasePrice}</div>
                    </div>
                    <div>
                      <div className="small muted">Discount Amount</div>
                      <div style={{ fontWeight: 700, color: 'var(--green)' }}>-৳{simEvaluation.discountAmount}</div>
                    </div>
                    <div>
                      <div className="small muted">Effective Discount</div>
                      <div style={{ fontWeight: 600 }}>{simEvaluation.discountPercent}% OFF</div>
                    </div>
                    <div>
                      <div className="small muted">Final Payable Today</div>
                      <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.2rem' }}>৳{simEvaluation.finalPrice}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: HELP CENTRE & FAQS */}
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

          {/* Support Contact Info Editor in Tab 4 */}
          <div style={{ marginTop: '24px', padding: '16px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <h4 style={{ margin: '0 0 12px 0', color: 'var(--accent)' }}>📞 Direct Help & Support Contact Details</h4>
            <div className="form-row">
              <label className="field">
                Support WhatsApp Number
                <input
                  value={pricingForm.supportWhatsapp || ''}
                  onChange={e => setPricingForm({ ...pricingForm, supportWhatsapp: e.target.value })}
                  placeholder="017XXXXXXXX"
                />
              </label>
              <label className="field">
                Support Email
                <input
                  type="email"
                  value={pricingForm.supportEmail || ''}
                  onChange={e => setPricingForm({ ...pricingForm, supportEmail: e.target.value })}
                  placeholder="support@tuitrix.com"
                />
              </label>
            </div>
            <p className="muted small" style={{ margin: '4px 0 0 0' }}>
              These support contacts are linked directly in <code>#/help</code> and in Settings. Remember to click "Save Changes to Cloud" above to publish.
            </p>
          </div>
        </div>
      )}

      {/* Add / Edit Promo Modal */}
      {promoModalOpen && (
        <div className="modal-backdrop" onClick={() => setPromoModalOpen(false)}>
          <div className="modal card" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', width: '90%' }}>
            <div className="modal-head">
              <h2>{editingPromoIndex !== null ? '✏️ Edit Promo Code' : '🎟️ Create New Promo Code'}</h2>
              <button className="btn ghost small" onClick={() => setPromoModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSavePromoModal} className="form" style={{ marginTop: '16px' }}>
              <div className="field">
                <label>Promo Code *</label>
                <input
                  type="text"
                  value={promoForm.code}
                  onChange={e => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. WELCOME50 or RAMADAN100"
                  required
                />
              </div>

              <div className="form-row">
                <label className="field">
                  Discount Type
                  <select
                    value={promoForm.discountType || 'percent'}
                    onChange={e => setPromoForm({ ...promoForm, discountType: e.target.value as 'percent' | 'flat' })}
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="flat">Flat Amount (৳)</option>
                  </select>
                </label>
                <label className="field">
                  Discount Value *
                  <input
                    type="number"
                    value={promoForm.discountValue}
                    onChange={e => setPromoForm({ ...promoForm, discountValue: Number(e.target.value) })}
                    required
                  />
                </label>
              </div>

              <div className="form-row">
                <label className="field">
                  Max Usages (0 or empty = unlimited)
                  <input
                    type="number"
                    value={promoForm.maxUses || ''}
                    onChange={e => setPromoForm({ ...promoForm, maxUses: Number(e.target.value) })}
                    placeholder="Unlimited"
                  />
                </label>
                <label className="field">
                  Expires On (optional)
                  <input
                    type="date"
                    value={promoForm.expiresAt || ''}
                    onChange={e => setPromoForm({ ...promoForm, expiresAt: e.target.value })}
                  />
                </label>
              </div>

              <div className="field">
                <label>Campaign Description (optional)</label>
                <input
                  type="text"
                  value={promoForm.description || ''}
                  onChange={e => setPromoForm({ ...promoForm, description: e.target.value })}
                  placeholder="e.g. 50% discount for first 100 subscribers"
                />
              </div>

              <label className="check" style={{ marginTop: '8px' }}>
                <input
                  type="checkbox"
                  checked={promoForm.active}
                  onChange={e => setPromoForm({ ...promoForm, active: e.target.checked })}
                />
                Active & Redeemable by Users
              </label>

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn outline" onClick={() => setPromoModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" id="btn-save-promo-modal">
                  {editingPromoIndex !== null ? 'Update Promo Code' : 'Create Promo Code'}
                </button>
              </div>
            </form>
          </div>
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
