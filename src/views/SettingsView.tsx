import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/context';
import { SectionGuidePopover } from '../components/SectionGuidePopover';
import { AI_PROVIDERS, fetchModelList, callAI, autoModel, readModelCache } from '../services/ai';
import { todayISO, fmtDate } from '../utils/date';
import { ConfirmModal } from '../components/ConfirmModal';
import { auth, submitTrxUpgradeRequest, fetchPendingUpgradeRequests, reviewUpgradeRequest, fetchPricingConfig, updatePricingConfig } from '../services/firebase';
import { isOwnerEmail } from '../utils/auth';
import { TrxUpgradeRequest, PricingConfig } from '../types';
import { requestNotificationPermission, sendLocalReminderNotification, getDueRemindersSummary } from '../services/notifications';
import { ApkShareModal } from '../components/ApkShareModal';
import { isProUser } from '../utils/tierLimits';

const CURRENCIES = ['৳', '₹', 'Rs ', '$', '£', '€', 'RM ', 'SAR '];

export const SettingsView: React.FC = () => {
  const {
    state,
    billingState,
    updateSettings,
    updateAI,
    loadDemoData,
    eraseAllData,
    exportBackup,
    updateProfile,
    importBackup,
    downloadFile,
    toast,
    user,
  } = useStore();

  const isPro = isProUser(billingState, user?.email);

  const [tutorName, setTutorName] = useState(state.settings.tutorName || '');
  const [credentials, setCredentials] = useState(state.profile?.credentials || '');
  const [brandTitle, setBrandTitle] = useState(state.profile?.brandTitle || '');
  const [showPrintHeader, setShowPrintHeader] = useState(state.profile?.showPrintHeader ?? true);
  const [showPrintWatermark, setShowPrintWatermark] = useState(state.profile?.showPrintWatermark ?? true);
  const [currency, setCurrency] = useState(state.settings.currency || '৳');
  const [notificationsEnabled, setNotificationsEnabled] = useState(state.profile?.notificationsEnabled ?? false);
  const [feeReminderNotifications, setFeeReminderNotifications] = useState(state.profile?.feeReminderNotifications ?? true);
  const [classReminderNotifications, setClassReminderNotifications] = useState(state.profile?.classReminderNotifications ?? true);
  const [pushStatus, setPushStatus] = useState<string>('Not Enabled');

  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setPushStatus('Enabled');
      } else if (Notification.permission === 'denied') {
        setPushStatus('Blocked');
      }
    }
  }, []);
  const [provider, setProvider] = useState(state.ai.provider);
  const [apiKey, setApiKey] = useState(state.ai.keys[provider] || '');
  const [selectedModel, setSelectedModel] = useState(state.ai.models[provider] || '');
  const [includeKeysInBackup, setIncludeKeysInBackup] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [eraseConfirmOpen, setEraseConfirmOpen] = useState(false);
  const [demoConfirmOpen, setDemoConfirmOpen] = useState(false);
  const [apkModalOpen, setApkModalOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<{id: string, name: string}[]>([]);
  const [modelsLoadedMsg, setModelsLoadedMsg] = useState('');
  const apiKeyTimeout = useRef<number | null>(null);

  const [upgradeMethod, setUpgradeMethod] = useState<'bkash' | 'nagad' | 'rocket'>('bkash');
  const [senderPhone, setSenderPhone] = useState('');
  const [trxId, setTrxId] = useState('');
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{code: string; discountPercent: number} | null>(null);
  const [promoError, setPromoError] = useState('');


  const [adminRequests, setAdminRequests] = useState<TrxUpgradeRequest[]>([]);
  const isOwner = auth?.currentUser?.email ? isOwnerEmail(auth.currentUser.email) : false;

  const [pricingConfig, setPricingConfig] = useState<PricingConfig | null>(null);
  const [pricingForm, setPricingForm] = useState<PricingConfig>({
    monthlyPriceBdt: 99,
    yearlyPriceBdt: 999,
    promoCodes: [],
    bkashNumber: '',
    nagadNumber: '',
    rocketNumber: '',
    promoText: '',
    updatedAt: 0,
  });
  const [planTerm, setPlanTerm] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    fetchPricingConfig().then(config => {
      setPricingConfig(config);
      setPricingForm(config);
    }).catch(console.error);
  }, []);


  const pConfig = AI_PROVIDERS[provider];

  useEffect(() => {
    const cache = readModelCache()[provider];
    if (cache && Array.isArray(cache.list)) {
      setAvailableModels(cache.list.map((m: any) => typeof m === 'object' && m !== null ? m : { id: String(m), name: String(m) }));
    } else {
      setAvailableModels([{ id: AI_PROVIDERS[provider].fallback, name: AI_PROVIDERS[provider].fallback }]);
    }
    setModelsLoadedMsg('');
  }, [provider]);

  useEffect(() => {
    if (apiKeyTimeout.current) window.clearTimeout(apiKeyTimeout.current);
    if (!apiKey.trim()) return;
    apiKeyTimeout.current = window.setTimeout(() => {
      handleRefreshModels(false);
    }, 1000);
    return () => { if (apiKeyTimeout.current) window.clearTimeout(apiKeyTimeout.current); };
  }, [apiKey]);

  useEffect(() => {
    if (isOwner) {
      fetchPendingUpgradeRequests().then(reqs => setAdminRequests(reqs)).catch(err => {
        console.error("Failed to load admin requests:", err);
      });
    }
  }, [isOwner]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      tutorName: tutorName.trim(),
      currency,
    });
    updateProfile({
      credentials: credentials.trim(),
      brandTitle: brandTitle.trim(),
      showPrintHeader,
      showPrintWatermark,
      notificationsEnabled,
      feeReminderNotifications,
      classReminderNotifications,
    });
    toast('Profile saved', 'success');
  };

  const handleEnablePushNotifications = async () => {
    try {
      const permission = await requestNotificationPermission();
      if (permission === 'granted') {
        setPushStatus('Enabled');
        setNotificationsEnabled(true);
        updateProfile({ notificationsEnabled: true });

        if (auth?.currentUser) {
          // If using FCM in a full setup, this would save the token.
          // Even without FCM, local SW notifications will work.
          // await registerFcmToken(auth.currentUser.uid);
        }

        toast('Push notifications enabled!', 'success');
      } else {
        setPushStatus('Blocked');
        toast('Notification permission denied by user', 'error');
      }
    } catch (e) {
      toast('Failed to request notification permission', 'error');
    }
  };

  const handleTestNotification = async () => {
    const summary = getDueRemindersSummary(state.students, state.batches || [], state.contracts, state.payments);
    const body = `${summary.classesToday} classes scheduled today. ${summary.pendingFees} pending fees.`;
    const sent = await sendLocalReminderNotification('Tuitrix Reminder', body);
    if (sent) {
      toast('Test notification sent', 'success');
    } else {
      toast('Could not send notification. Ensure they are enabled.', 'error');
    }
  };


  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updatePricingConfig(pricingForm);
      setPricingConfig(pricingForm);
      toast('Pricing configuration saved successfully', 'success');
    } catch (err) {
      toast('Failed to save pricing configuration', 'error');
    }
  };

  const handleProviderChange = (newP: typeof provider) => {
    setProvider(newP);
    setApiKey(state.ai.keys[newP] || '');
    setSelectedModel(state.ai.models[newP] || '');
    updateAI({ provider: newP });
  };

  const handleSaveAI = (e: React.FormEvent) => {
    e.preventDefault();
    updateAI({
      provider,
      keys: { ...state.ai.keys, [provider]: apiKey.trim() },
      models: { ...state.ai.models, [provider]: selectedModel.trim() },
    });
    toast('AI configuration saved', 'success');
  };

  const handleTestAI = async () => {
    const updatedAI = {
      provider,
      keys: { ...state.ai.keys, [provider]: apiKey.trim() },
      models: { ...state.ai.models, [provider]: selectedModel.trim() },
    };
    updateAI(updatedAI);

    if (provider !== 'ollama' && !apiKey.trim()) {
      toast('Enter an API key first', 'error');
      return;
    }

    setTestingAI(true);
    try {
      const res = await callAI('You are a connection test.', 'Reply with exactly: OK', {
        ...state,
        ai: updatedAI,
      }, { maxTokens: 10, temperature: 0, onFallback: (msg) => toast(msg, 'info') });
      toast(`Connected to ${pConfig.name}: "${res.trim()}"`, 'success');
    } catch (err: any) {
      toast(`Connection test failed: ${err.message}`, 'error');
    } finally {
      setTestingAI(false);
    }
  };

  const handleRefreshModels = async (showToast: boolean = true) => {
    setRefreshingModels(true);
    setModelsLoadedMsg('Loading models...');
    try {
      const { list, tier } = await fetchModelList(provider, {
        ...state,
        ai: {
          ...state.ai,
          provider,
          keys: { ...state.ai.keys, [provider]: apiKey.trim() },
        },
      });
      setAvailableModels(list);

      if (provider === 'gemini') {
        const tierMsg = tier === 'free' ? 'Free Tier API key detected' : 'Paid Tier API key detected';
        const displayMsg = tier === 'free' ? 'free-tier compatible models' : 'models';
        setModelsLoadedMsg(`${tierMsg} — showing ${list.length} ${displayMsg}`);
      } else {
        setModelsLoadedMsg(`Loaded ${list.length} available models for your API key`);
      }

      if (showToast) toast(`Found ${list.length} models for ${pConfig.name}`, 'success');
    } catch (err: any) {
      setAvailableModels([{ id: AI_PROVIDERS[provider].fallback, name: AI_PROVIDERS[provider].fallback }]);
      setModelsLoadedMsg('Using default fallback models');
      if (showToast) toast(`Could not load models: ${err.message}`, 'error');
    } finally {
      setRefreshingModels(false);
    }
  };

  const handleBackupDownload = () => {
    const content = exportBackup(includeKeysInBackup);
    downloadFile(`tuitrix-backup-${todayISO()}.json`, content, 'application/json');
    updateSettings({ lastBackup: new Date().toISOString() });
    toast('Backup file downloaded', 'success');
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importBackup(reader.result as string);
        toast('Backup restored successfully!', 'success');
      } catch (err: any) {
        toast(err.message || 'Failed to restore backup', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleUpgradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth?.currentUser) {
      toast('Please log in first to upgrade', 'error');
      return;
    }

    const phone = senderPhone.trim();
    if (!/^01[3-9]\d{8}$/.test(phone)) {
      toast('Please enter a valid 11-digit BD phone number', 'error');
      return;
    }

    const tid = trxId.trim().toUpperCase();
    if (tid.length < 6) {
      toast('Please enter a valid Transaction ID', 'error');
      return;
    }

    setIsSubmittingUpgrade(true);
    try {
      const baseAmount = planTerm === 'monthly' ? (pricingConfig?.monthlyPriceBdt || 99) : (pricingConfig?.yearlyPriceBdt || 999);
      let finalAmount = baseAmount;
      let discountAmount = 0;
      if (appliedPromo) {
        discountAmount = Math.round(baseAmount * (appliedPromo.discountPercent / 100));
        finalAmount = Math.max(0, baseAmount - discountAmount);
      }

      await submitTrxUpgradeRequest(
        auth.currentUser.uid,
        auth.currentUser.email!,
        auth.currentUser.displayName || undefined,
        {
          method: upgradeMethod,
          senderPhone: phone || 'N/A',
          trxId: finalAmount === 0 ? 'FREE_SCHOLARSHIP' : tid,
          amount: baseAmount,
          planTerm,
          billingCycle: planTerm,
          promoCodeUsed: appliedPromo?.code,
          discountAmountBdt: discountAmount,
          finalAmountBdt: finalAmount
        }
      );
      toast('Upgrade request submitted successfully! Waiting for verification.', 'success');
    } catch (err) {
      toast('Failed to submit request', 'error');
    }
    setIsSubmittingUpgrade(false);
  };

  const handleApplyPromo = () => {
    setPromoError('');
    if (!promoInput.trim()) return;
    const code = promoInput.trim().toUpperCase();
    const found = pricingConfig?.promoCodes?.find(p => p.code.toUpperCase() === code && p.active);
    if (found) {
      setAppliedPromo({ code: found.code, discountPercent: found.discountPercent });
      setPromoError('');
      toast('Promo code applied!', 'success');
    } else {
      setAppliedPromo(null);
      setPromoError('Invalid or expired promo code');
    }
  };

  const getSubtotal = () => planTerm === 'monthly' ? (pricingConfig?.monthlyPriceBdt || 99) : (pricingConfig?.yearlyPriceBdt || 999);
  const getDiscount = () => appliedPromo ? Math.round(getSubtotal() * (appliedPromo.discountPercent / 100)) : 0;
  const getTotal = () => Math.max(0, getSubtotal() - getDiscount());

  const handleReviewRequest = async (id: string, uid: string, action: 'approved' | 'rejected', planTerm?: 'monthly' | 'yearly', amount?: number) => {
    try {
      await reviewUpgradeRequest(id, uid, action, planTerm, amount);
      setAdminRequests(prev => prev.filter(r => r.id !== id));
      toast(`Request ${action}`, 'success');
    } catch (err) {
      toast('Failed to update request', 'error');
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1>Settings</h1>
            <SectionGuidePopover sectionKey="settings" />
          </div>
          <div className="sub">Tutor profile, AI engines, data backup & publishing setup</div>

          <button className="btn outline" onClick={() => window.location.href = window.location.pathname + '?landing=1'}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{marginRight: '8px'}}>
              <path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z"/>
            </svg>
            About Tuitrix
          </button>
        </div>
      </div>


      <div className="grid">
        {/* Admin Dashboard */}
        {isOwner && (
          <div className="card" style={{ gridColumn: '1 / -1', border: '2px solid var(--accent)' }}>
            <h2 style={{ color: 'var(--accent)' }}>👑 Owner Admin — TrxID Approvals</h2>
            {adminRequests.length === 0 ? (
              <p className="muted small">No pending upgrade requests.</p>
            ) : (
              <table className="table" style={{ marginTop: '8px', fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Details</th>
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
                        <div><strong>M:</strong> {req.method.toUpperCase()}</div>
                        <div><strong>TrxID:</strong> <code style={{background:'var(--bg)', padding:'2px 4px', borderRadius:'4px'}}>{req.trxId}</code></div>
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
                        <button className="btn primary small" onClick={() => handleReviewRequest(req.id, req.uid, 'approved', req.planTerm, req.finalAmountBdt || req.amount)} style={{ marginRight: '4px', marginBottom: '4px' }}>Approve</button>
                        <button className="btn danger small" onClick={() => handleReviewRequest(req.id, req.uid, 'rejected')}>Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}


        {isOwner && (
          <div className="card" style={{ gridColumn: '1 / -1', border: '2px solid var(--accent)' }}>
            <h2 style={{ color: 'var(--accent)' }}>👑 Owner Admin — Pricing & Payment Numbers</h2>
            <form className="form" onSubmit={handleSavePricing} style={{ marginTop: '12px' }}>
              <div className="form-row">
                <label className="field">
                  Monthly Price (৳)
                  <input type="number" value={pricingForm.monthlyPriceBdt} onChange={e => setPricingForm({ ...pricingForm, monthlyPriceBdt: Number(e.target.value) })} required />
                </label>
                <label className="field">
                  Yearly Price (৳)
                  <input type="number" value={pricingForm.yearlyPriceBdt} onChange={e => setPricingForm({ ...pricingForm, yearlyPriceBdt: Number(e.target.value) })} required />
                </label>
              </div>

              <div style={{ marginTop: '16px', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <h4>Promo Codes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                  {pricingForm.promoCodes?.map((promo, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        value={promo.code}
                        onChange={e => {
                          const newPromos = [...(pricingForm.promoCodes || [])];
                          newPromos[idx].code = e.target.value.toUpperCase();
                          setPricingForm({ ...pricingForm, promoCodes: newPromos });
                        }}
                        placeholder="CODE"
                        style={{ flex: 1 }}
                      />
                      <input
                        type="number"
                        value={promo.discountPercent}
                        onChange={e => {
                          const newPromos = [...(pricingForm.promoCodes || [])];
                          newPromos[idx].discountPercent = Number(e.target.value);
                          setPricingForm({ ...pricingForm, promoCodes: newPromos });
                        }}
                        placeholder="%"
                        style={{ width: '80px' }}
                      />
                      <label className="check" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={promo.active}
                          onChange={e => {
                            const newPromos = [...(pricingForm.promoCodes || [])];
                            newPromos[idx].active = e.target.checked;
                            setPricingForm({ ...pricingForm, promoCodes: newPromos });
                          }}
                        />
                        Active
                      </label>
                      <button type="button" className="btn danger small" onClick={() => {
                        const newPromos = [...(pricingForm.promoCodes || [])];
                        newPromos.splice(idx, 1);
                        setPricingForm({ ...pricingForm, promoCodes: newPromos });
                      }}>X</button>
                    </div>
                  ))}
                  <button type="button" className="btn outline small" onClick={() => {
                    const newPromos = [...(pricingForm.promoCodes || [])];
                    newPromos.push({ code: '', discountPercent: 10, active: true });
                    setPricingForm({ ...pricingForm, promoCodes: newPromos });
                  }}>+ Add Promo Code</button>
                </div>
              </div>
              <div className="form-row">
                <label className="field">
                  bKash Number
                  <input value={pricingForm.bkashNumber} onChange={e => setPricingForm({ ...pricingForm, bkashNumber: e.target.value })} required />
                </label>
                <label className="field">
                  Nagad Number
                  <input value={pricingForm.nagadNumber} onChange={e => setPricingForm({ ...pricingForm, nagadNumber: e.target.value })} required />
                </label>
                <label className="field">
                  Rocket Number
                  <input value={pricingForm.rocketNumber} onChange={e => setPricingForm({ ...pricingForm, rocketNumber: e.target.value })} required />
                </label>
              </div>
              <label className="field" style={{ marginTop: '8px' }}>
                Promo Text (optional, displayed above payment)
                <input value={pricingForm.promoText} onChange={e => setPricingForm({ ...pricingForm, promoText: e.target.value })} placeholder="e.g. 50% OFF for the first 100 users!" />
              </label>
              <button type="submit" className="btn primary" style={{ marginTop: '12px' }}>Save Pricing Config</button>
            </form>
          </div>
        )}

        {/* Billing Card */}
        <div className="card" id="upgrade-section">
          <h2>Subscription & Plan</h2>
          {auth?.currentUser ? (
            <div>
              <p>Current Plan: <strong>{isPro ? 'Pro Tier' : 'Free Tier'}</strong></p>
              {isPro && billingState?.proUntil && (
                <p>Pro Until: {fmtDate(new Date(billingState.proUntil).toISOString())}</p>
              )}
              {!isPro && (!billingState || billingState.plan === 'free') && (
                <p>AI Credits: <strong>{billingState?.credits || 0}</strong></p>
              )}

              {!isPro && billingState?.pendingRequest && billingState.pendingRequest.status === 'pending' && (
                <div style={{ marginTop: '24px', padding: '20px', background: 'var(--card2)', borderRadius: '8px', borderLeft: '4px solid var(--accent)' }}>
                  <h4 style={{ marginBottom: '16px' }}>⏳ Verification Tracker</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      ● Step 1: Payment Details Submitted (TrxID: {billingState.pendingRequest.trxId})
                    </div>
                    <div style={{ color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                      <span className="pulse">◉</span> Step 2: Admin Verification in Progress (Typically 15–60 mins)
                    </div>
                    <div style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      ○ Step 3: Tuitrix Pro Unlocked
                    </div>
                  </div>
                  <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg)', borderRadius: '4px', fontSize: '0.9rem' }}>
                    <div><strong>Method:</strong> {billingState.pendingRequest.method.toUpperCase()}</div>
                    <div><strong>Amount:</strong> ৳{billingState.pendingRequest.finalAmountBdt || billingState.pendingRequest.amount}</div>
                    {billingState.pendingRequest.promoCodeUsed && <div><strong>Promo:</strong> {billingState.pendingRequest.promoCodeUsed}</div>}
                    <div><strong>Submitted:</strong> {fmtDate(billingState.pendingRequest.createdAt)}</div>
                  </div>
                  <button
                    className="btn primary"
                    style={{ marginTop: '16px', width: '100%', background: '#25D366', color: '#fff' }}
                    onClick={() => {
                      const msg = `Hi! I just submitted an upgrade request for Tuitrix Pro.\nEmail: ${auth?.currentUser?.email}\nPlan: ${billingState.pendingRequest?.planTerm}\nAmount: ৳${billingState.pendingRequest?.finalAmountBdt || billingState.pendingRequest?.amount}\nTrxID: ${billingState.pendingRequest?.trxId}`;
                      window.open(`https://wa.me/88${pricingConfig?.bkashNumber}?text=${encodeURIComponent(msg)}`, '_blank');
                    }}
                  >
                    Need Instant Activation? Send TrxID via WhatsApp 💬
                  </button>
                </div>
              )}

              {!isPro && (!billingState?.pendingRequest || billingState.pendingRequest.status !== 'pending') && (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <h3 style={{ fontSize: '1.3rem', marginBottom: '16px' }}>🚀 Upgrade to Tuitrix Pro</h3>

                  {/* Step A: Plan Toggle */}
                  <div style={{ marginBottom: '24px' }}>
                    <h4>Step A: Select Plan</h4>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                      <div
                        onClick={() => setPlanTerm('monthly')}
                        style={{ flex: 1, padding: '16px', border: planTerm === 'monthly' ? '2px solid var(--accent)' : '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}
                      >
                        <strong>Monthly Pro</strong>
                        <div style={{ fontSize: '1.2rem', marginTop: '8px' }}>৳{pricingConfig?.monthlyPriceBdt || 99} <span className="small muted">/mo</span></div>
                      </div>
                      <div
                        onClick={() => setPlanTerm('yearly')}
                        style={{ flex: 1, padding: '16px', border: planTerm === 'yearly' ? '2px solid var(--accent)' : '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', position: 'relative' }}
                      >
                        <div style={{ position: 'absolute', top: '-10px', right: '10px', background: 'var(--green)', color: '#fff', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>Save ~17%</div>
                        <strong>Yearly Pro</strong>
                        <div style={{ fontSize: '1.2rem', marginTop: '8px' }}>৳{pricingConfig?.yearlyPriceBdt || 999} <span className="small muted">/yr</span></div>
                      </div>
                    </div>
                    <ul className="small muted" style={{ marginTop: '12px', paddingLeft: '20px', lineHeight: '1.6' }}>
                      <li>Unlimited Students & Batches</li>
                      <li>Cloud Sync across devices</li>
                      <li>AI Exam & Lecture Sheet PDF Generator</li>
                      <li>Live Parent Portal</li>
                      <li>0 Ads</li>
                    </ul>
                  </div>

                  {/* Step B: Promo & Summary */}
                  <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--card2)', borderRadius: '8px' }}>
                    <h4>Step B: Have a Promo or Scholarship Code?</h4>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <input
                        placeholder="Enter code"
                        value={promoInput}
                        onChange={e => setPromoInput(e.target.value)}
                        disabled={!!appliedPromo}
                        style={{ flex: 1 }}
                      />
                      {appliedPromo ? (
                        <button className="btn outline" onClick={() => { setAppliedPromo(null); setPromoInput(''); }}>Remove</button>
                      ) : (
                        <button className="btn" onClick={handleApplyPromo}>Apply</button>
                      )}
                    </div>
                    {promoError && <div style={{ color: 'var(--red)', fontSize: '0.85rem', marginTop: '4px' }}>{promoError}</div>}
                    {appliedPromo && <div style={{ color: 'var(--green)', fontSize: '0.85rem', marginTop: '4px', fontWeight: 'bold' }}>✓ Code applied! You saved ৳{getDiscount()} ({appliedPromo.discountPercent}% OFF)</div>}

                    <div style={{ marginTop: '16px', padding: '12px', border: '1px dashed var(--border)', borderRadius: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span>Plan Subtotal:</span>
                        <span>৳{getSubtotal()}</span>
                      </div>
                      {appliedPromo && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: 'var(--green)' }}>
                          <span>Promo Discount ({appliedPromo.code}):</span>
                          <span>-৳{getDiscount()}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        <span>Total Payable Today:</span>
                        <span>৳{getTotal()}</span>
                      </div>
                    </div>
                  </div>

                  {getTotal() === 0 ? (
                    <button className="btn primary" onClick={handleUpgradeSubmit} disabled={isSubmittingUpgrade} style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}>
                      {isSubmittingUpgrade ? 'Activating...' : 'Activate Free Pro Scholarship Now 🚀'}
                    </button>
                  ) : (
                    <div style={{ marginBottom: '24px' }}>
                      <h4>Step C: Payment & Verification</h4>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', marginBottom: '16px' }}>
                        <button className="btn" style={{ flex: 1, background: upgradeMethod === 'bkash' ? '#E2136E' : 'var(--card2)', color: upgradeMethod === 'bkash' ? '#fff' : 'inherit' }} onClick={() => setUpgradeMethod('bkash')}>bKash</button>
                        <button className="btn" style={{ flex: 1, background: upgradeMethod === 'nagad' ? '#F7941D' : 'var(--card2)', color: upgradeMethod === 'nagad' ? '#fff' : 'inherit' }} onClick={() => setUpgradeMethod('nagad')}>Nagad</button>
                        <button className="btn" style={{ flex: 1, background: upgradeMethod === 'rocket' ? '#8C3494' : 'var(--card2)', color: upgradeMethod === 'rocket' ? '#fff' : 'inherit' }} onClick={() => setUpgradeMethod('rocket')}>Rocket</button>
                      </div>

                      <div style={{ padding: '16px', background: 'var(--card2)', borderRadius: '8px', marginBottom: '16px' }}>
                        <ol style={{ paddingLeft: '20px', margin: 0, lineHeight: '1.6' }}>
                          <li>Open your <strong>{upgradeMethod.charAt(0).toUpperCase() + upgradeMethod.slice(1)}</strong> app and tap <strong>Send Money</strong> (Personal).</li>
                          <li style={{ marginTop: '8px' }}>
                            Send exact amount: <strong>৳{getTotal()}</strong> to:
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                              <code style={{ fontSize: '1.2rem', padding: '4px 8px', background: 'var(--bg)', borderRadius: '4px' }}>
                                {upgradeMethod === 'bkash' ? pricingConfig?.bkashNumber : upgradeMethod === 'nagad' ? pricingConfig?.nagadNumber : pricingConfig?.rocketNumber}
                              </code>
                              <button className="btn outline small" onClick={() => {
                                const num = upgradeMethod === 'bkash' ? pricingConfig?.bkashNumber : upgradeMethod === 'nagad' ? pricingConfig?.nagadNumber : pricingConfig?.rocketNumber;
                                navigator.clipboard.writeText(num || '');
                                toast('Copied! ✓', 'success');
                              }}>Copy Number</button>
                            </div>
                          </li>
                        </ol>
                      </div>

                      <form className="form" onSubmit={handleUpgradeSubmit}>
                        <div className="form-row">
                          <label className="field">
                            Sender Phone Number
                            <input placeholder="017..." value={senderPhone} onChange={e => setSenderPhone(e.target.value)} required />
                          </label>
                          <label className="field">
                            Transaction ID (TrxID)
                            <input placeholder="e.g. BJM82K9L0P" value={trxId} onChange={e => setTrxId(e.target.value.toUpperCase())} required />
                          </label>
                        </div>
                        <button type="submit" className="btn primary" disabled={isSubmittingUpgrade} style={{ marginTop: '12px', width: '100%', padding: '12px', fontSize: '1.1rem' }}>
                          {isSubmittingUpgrade ? 'Submitting...' : 'Submit Payment Details'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {billingState?.transactions && billingState.transactions.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <h3>Transaction History</h3>
                  <table className="table" style={{ marginTop: '8px' }}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Plan</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingState.transactions.map((t: any) => (
                        <tr key={t.id}>
                          <td>{fmtDate(new Date(t.created_at).toISOString())}</td>
                          <td>{t.plan}</td>
                          <td>{state.settings.currency}{t.amount}</td>
                          <td>
                            <span className={`badge ${t.status === 'paid' ? 'green' : t.status === 'pending' ? 'yellow' : 'red'}`}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p>Current Plan: <strong>Free (BYOK)</strong></p>
              <p className="muted small">Login or create an account to use the built-in AI credits, or use your own API keys below.</p>
            </div>
          )}
        </div>

        {/* Notifications & Reminders Card */}
        <div className="card">
          <h2>Push Notifications & Daily Reminders</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            Receive automated push notifications for daily classes and pending tuition fees.
          </p>

          <div className="form" style={{ marginBottom: '16px' }}>
            <div className="field">
              <label>Status: <strong>{pushStatus}</strong></label>
              {pushStatus !== 'Enabled' && (
                <button type="button" onClick={handleEnablePushNotifications} className="btn primary small" style={{ marginTop: '8px' }}>
                  Enable Push Notifications
                </button>
              )}
            </div>

            {pushStatus === 'Enabled' && (
              <>
                <label className="checkbox" style={{ marginTop: '12px' }}>
                  <input type="checkbox" checked={notificationsEnabled} onChange={e => setNotificationsEnabled(e.target.checked)} />
                  Master Toggle: Enable Daily Notifications
                </label>

                {notificationsEnabled && (
                  <div style={{ marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    <label className="checkbox">
                      <input type="checkbox" checked={feeReminderNotifications} onChange={e => setFeeReminderNotifications(e.target.checked)} />
                      Pending Fee Reminders
                    </label>
                    <label className="checkbox">
                      <input type="checkbox" checked={classReminderNotifications} onChange={e => setClassReminderNotifications(e.target.checked)} />
                      Daily Class Schedule Reminders
                    </label>
                  </div>
                )}

                <button type="button" onClick={handleTestNotification} className="btn outline small" style={{ marginTop: '16px', display: 'block' }}>
                  🔔 Send Test Reminder
                </button>
              </>
            )}

            {(notificationsEnabled || feeReminderNotifications || classReminderNotifications) && (
               <button type="button" onClick={handleSaveProfile} className="btn primary small" style={{ marginTop: '16px' }}>Save Notification Preferences</button>
            )}
          </div>
        </div>

        {/* Appearance Settings */}
        <div className="card">
          <h2>Appearance</h2>
          <div className="form">
            <label className="field">
              Theme
              <div className="seg" style={{ display: 'inline-flex', alignSelf: 'flex-start', marginTop: '4px' }}>
                <button
                  type="button"
                  className={state.settings.theme === 'light' ? 'active' : ''}
                  onClick={() => updateSettings({ theme: 'light' })}
                >
                  ☀️ Light Mode
                </button>
                <button
                  type="button"
                  className={state.settings.theme !== 'light' ? 'active' : ''}
                  onClick={() => updateSettings({ theme: 'dark' })}
                >
                  🌙 Dark Mode
                </button>
              </div>
            </label>
          </div>
        </div>

        {/* Profile Card */}
        <div className="card">
          <h2>Tutor Profile</h2>
          <form className="form" onSubmit={handleSaveProfile}>
            <div className="form-row">
              <label className="field">
                Your name
                <input
                  value={tutorName}
                  onChange={e => setTutorName(e.target.value)}
                  placeholder="Shown in parent payment reminders"
                />
              </label>
              <label className="field">
                Currency symbol
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                >
                  {CURRENCIES.map(c => (
                    <option key={c} value={c}>
                      {c.trim()}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form-row">
              <label className="field">
                Academic Credentials / Subtitle (Optional)
                <input
                  value={credentials}
                  onChange={e => setCredentials(e.target.value)}
                  placeholder="e.g. B.Sc. in CSE, North South University"
                />
              </label>
              <label className="field">
                Custom Coaching / Header Title (Optional)
                <input
                  value={brandTitle}
                  onChange={e => setBrandTitle(e.target.value)}
                  placeholder="e.g. Sazid's Physics & Math Care"
                />
              </label>
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={showPrintHeader}
                onChange={e => setShowPrintHeader(e.target.checked)}
              />{' '}
              Show Branded Header on Printed Sheets
            </label>

            <label className="check" style={{ marginTop: '8px', marginBottom: '16px' }}>
              <input
                type="checkbox"
                checked={showPrintWatermark}
                onChange={e => setShowPrintWatermark(e.target.checked)}
              />{' '}
              Show Diagonal Watermark on Printed Sheets
            </label>

            <div className="form-actions">
              <button type="submit" className="btn primary">
                Save profile
              </button>
            </div>
          </form>
        </div>

        {/* AI Provider configuration */}
        <div className="card">
          <h2>AI Configuration</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            Lesson plans and exams are generated using free-tier AI keys. Your students' names, phone numbers, and financial details are never transmitted.
          </p>

          <form className="form" onSubmit={handleSaveAI}>
            <label className="field">
              AI Provider
              <select
                value={provider}
                onChange={e => handleProviderChange(e.target.value as any)}
              >
                {Object.entries(AI_PROVIDERS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="notice">
              {pConfig.note}{' '}
              {pConfig.needsKey ? (
                <a href={pConfig.keyUrl} target="_blank" rel="noopener noreferrer">
                  Get your free API key
                </a>
              ) : (
                <a href={pConfig.keyUrl} target="_blank" rel="noopener noreferrer">
                  Download Ollama
                </a>
              )}
            </div>

            {pConfig.needsKey && (
              <label className="field">
                API Key
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={`Paste your ${pConfig.name} API key`}
                  autoComplete="off"
                />
              </label>
            )}

            <label className="field">
              Model
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
              >
                <option value="">Auto default ({autoModel(provider, state)})</option>
                {availableModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                  </option>
                ))}
              </select>
            </label>

            {modelsLoadedMsg && (
              <p className="muted small" style={{ marginTop: '-8px', marginBottom: '16px' }}>
                {modelsLoadedMsg}
              </p>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => handleRefreshModels(true)}
                disabled={refreshingModels}
              >
                {refreshingModels ? 'Loading models...' : 'Refresh model list'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleTestAI}
                disabled={testingAI}
              >
                {testingAI ? 'Testing…' : 'Test connection'}
              </button>
              <button type="submit" className="btn primary">
                Save AI settings
              </button>
            </div>
          </form>
        </div>

        {/* Legal, Privacy & Security */}
        <div className="card">
          <h2>⚖️ Legal, Privacy & Security</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            Review our public policies or copy the link to share.
          </p>
          <div className="actions" style={{ marginBottom: '12px' }}>
            <button className="btn outline" onClick={() => window.location.href = '?legal=privacy'}>Privacy Policy</button>
            <button className="btn outline" onClick={() => window.location.href = '?legal=terms'}>Terms of Service</button>
            <button className="btn outline" onClick={() => window.location.href = '?legal=billing'}>Billing & Refund</button>
            <button className="btn outline" onClick={() => window.location.href = '?legal=security'}>Security</button>
          </div>
          <button className="btn" onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/?legal=privacy`);
            toast('Privacy Policy link copied', 'success');
          }}>
            Copy Public Privacy Policy Link
          </button>
        </div>

        {/* Backup and Data */}
        <div className="card">
          <h2>Backup & Storage</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            {state.settings.lastBackup
              ? `Last backup saved: ${fmtDate(state.settings.lastBackup.slice(0, 10))}.`
              : 'No backup downloaded yet.'}{' '}
            Download a backup file to keep in Google Drive or restore on any phone, laptop, or new browser.
          </p>

          <div className="actions">
            <button className="btn primary" onClick={handleBackupDownload}>
              Download backup JSON
            </button>
            <label className="btn">
              Restore from backup
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={handleRestoreFile}
              />
            </label>
            <button className="btn ghost" onClick={() => setDemoConfirmOpen(true)}>
              Load demo sample data
            </button>
            <button className="btn danger" onClick={() => setEraseConfirmOpen(true)}>
              Erase all data
            </button>
          </div>

          <label className="check" style={{ marginTop: '12px' }}>
            <input
              type="checkbox"
              checked={includeKeysInBackup}
              onChange={e => setIncludeKeysInBackup(e.target.checked)}
            />{' '}
            Include AI keys in backup file
          </label>
        </div>

        {/* Data Management / Account Deletion */}
        <div className="card">
          <h2>Data Management</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            Permanently delete your account and all associated cloud data. This action cannot be undone.
          </p>
          <button className="btn danger" onClick={async () => {
            const confirmed = window.confirm("Are you sure you want to permanently delete your account and all data? This cannot be undone.");
            if (confirmed) {
              const { auth } = await import('../services/firebase');
              if (auth?.currentUser) {
                const { deleteTutorAccountAndData } = await import('../services/firebase');
                try {
                  await deleteTutorAccountAndData(auth.currentUser.uid);
                  eraseAllData();
                  toast('Account and data deleted successfully', 'success');
                } catch (e: any) {
                  if (e.message && e.message.includes('requires-recent-login')) {
                    alert('Please log out and log back in to verify your identity before deleting your account.');
                  } else {
                    alert(`Error deleting account: ${e.message}`);
                  }
                }
              } else {
                eraseAllData();
                toast('Local data erased successfully', 'success');
              }
            }
          }}>
            🗑️ Delete Account & All Data
          </button>
        </div>


        {/* Help, Support & Feedback */}
        <div className="card">
          <h2>💬 Help, Support & Feedback</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            Need help configuring your batch, resolving billing issues, or reporting a bug? We are here to assist.
          </p>
          <div className="actions">
            <a href={`mailto:abdullahsazid109@gmail.com?subject=Tuitrix Support Request&body=App Version: 1.0.0%0D%0APlan: ${isPro ? "Pro" : "Free"}%0D%0ADevice: ${navigator.userAgent}`} className="btn primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
              📧 Email Support / Report Issue
            </a>
            <button className="btn" onClick={() => {
              alert("Billing & Upgrade Help:\n\nIf you paid via bKash/Nagad and submitted your TrxID but are not seeing Pro features, please wait 15-30 minutes for manual verification.\n\nFor immediate assistance, please use the Email Support option.");
            }}>
              💬 Billing & Upgrade Help
            </button>
          </div>
        </div>

        {/* Android App & Share */}
        <div className="card">
          <h2>📲 Android App & Share QR Code</h2>
          <p className="muted small" style={{ marginBottom: '12px' }}>
            Install the Tuitrix Android app directly or share a QR code for your students and fellow tutors to scan.
          </p>
          <button className="btn primary" onClick={() => setApkModalOpen(true)}>
            📱 Get Android APK / Scan QR
          </button>
        </div>


        <p className="muted small" style={{ textAlign: 'center', marginTop: '12px' }}>
          {state.students.length} students · {state.lessons.length} logged classes ·{' '}
          {state.payments.length} payments · {state.docs.length} saved AI documents
        </p>
      </div>

      <ConfirmModal
        isOpen={eraseConfirmOpen}
        title="Erase all data?"
        message="This will delete all students, classes, fee contracts, and payments saved in this browser. Ensure you have downloaded a backup first."
        confirmLabel="Erase everything"
        isDanger
        onConfirm={() => {
          eraseAllData();
          toast('All data erased', 'info');
        }}
        onClose={() => setEraseConfirmOpen(false)}
      />

      <ConfirmModal
        isOpen={demoConfirmOpen}
        title="Load demo data?"
        message="This adds 3 sample students with realistic schedules, contracts, and attendance history alongside your existing data."
        confirmLabel="Load demo"
        onConfirm={() => {
          loadDemoData();
          toast('Demo data loaded', 'success');
        }}
        onClose={() => setDemoConfirmOpen(false)}
      />

      <ApkShareModal isOpen={apkModalOpen} onClose={() => setApkModalOpen(false)} />
    </div>
  );
};
