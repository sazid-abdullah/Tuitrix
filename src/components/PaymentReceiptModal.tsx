import React, { useState } from 'react';
import { Modal } from './Modal';
import { Payment } from '../types';
import { useStore } from '../store/context';
import { fmtDate, fmtN } from '../utils/date';

interface PaymentReceiptModalProps {
  isOpen: boolean;
  payment?: Payment | null;
  onClose: () => void;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  isOpen,
  payment,
  onClose,
}) => {
  const { state } = useStore();
  const [lang, setLang] = useState<'en' | 'bn'>('en');

  if (!isOpen || !payment) return null;

  const student = state.students.find(s => s.id === payment.studentId);
  if (!student) return null;

  const contract = payment.contractId ? state.contracts.find(c => c.id === payment.contractId) : null;

  const receiptId = `#TX-REC-${payment.id.toUpperCase().slice(-6)}`;
  const dateStr = fmtDate(payment.date);
  const amountStr = `${state.settings.currency || '৳'} ${fmtN(payment.amount)}`;
  const tutorName = state.settings.tutorName || 'Tutor';
  const brandTitle = state.profile?.brandTitle || '';

  const generateWhatsAppMessage = () => {
    let msg = '';
    if (lang === 'en') {
      msg = `✅ Payment Received: ${amountStr} for ${student.name} on ${dateStr}. Receipt ${receiptId}. Thank you! — ${tutorName}`;
    } else {
      msg = `✅ পেমেন্ট গৃহীত হয়েছে: ${student.name}-এর জন্য ${dateStr} তারিখে ${amountStr}। রশিদ ${receiptId}। ধন্যবাদ! — ${tutorName}`;
    }
    return encodeURIComponent(msg);
  };

  const handleWhatsApp = () => {
    const rawPhone = student.guardianPhone || student.phone || '';
    let url = `https://wa.me/`;
    if (rawPhone) {
      const cleanPhone = rawPhone.replace(/[^0-9+]/g, '');
      url += `${cleanPhone}`;
    }
    url += `?text=${generateWhatsAppMessage()}`;
    window.open(url, '_blank');
  };

  return (
    <Modal title="Payment Receipt" isOpen={isOpen} onClose={onClose}>
      <div className="receipt-container" style={{ padding: '20px', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '20px' }} id="printable-receipt">
        <style>
          {`
            @media print {
              body * {
                visibility: hidden;
              }
              #printable-receipt, #printable-receipt * {
                visibility: visible;
              }
              #printable-receipt {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                border: none !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}
        </style>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: '0 0 5px 0' }}>{tutorName}</h2>
          {brandTitle && <div style={{ color: 'var(--text-muted)' }}>{brandTitle}</div>}
          <div style={{ fontWeight: 'bold', marginTop: '10px' }}>OFFICIAL TUITION FEE RECEIPT</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
          <div>
            <strong>Receipt:</strong> {receiptId}<br />
            <strong>Date:</strong> {dateStr}
          </div>
          <div style={{ textAlign: 'right', color: 'green', fontWeight: 'bold', border: '2px solid green', padding: '5px 10px', borderRadius: '4px', transform: 'rotate(-5deg)', display: 'inline-block' }}>
            ✅ PAID & VERIFIED
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong>Student:</strong> {student.name}<br />
          {student.phone && <><small>{student.phone}</small><br/></>}
          {contract && <><strong>Contract:</strong> {contract.title}<br/></>}
          {payment.planTerm && <><strong>Term:</strong> {payment.planTerm || 'Tuition Cycle'}<br/></>}
        </div>

        <div style={{ borderTop: '2px dashed var(--border)', paddingTop: '15px', display: 'flex', justifyContent: 'space-between', fontSize: '1.2em' }}>
          <strong>Amount Paid:</strong>
          <strong>{amountStr}</strong>
        </div>
        {payment.method && (
          <div style={{ textAlign: 'right', fontSize: '0.9em', color: 'var(--text-muted)', marginTop: '5px' }}>
            via {payment.method}
          </div>
        )}
      </div>

      <div className="flex" style={{ gap: '10px', flexWrap: 'wrap' }}>
        <button className="btn no-print" onClick={() => window.print()} style={{ flex: 1 }}>
          🖨️ Print / Save PDF
        </button>

        <div style={{ display: 'flex', flex: 2, gap: '5px' }} className="no-print">
          <button
            className="btn primary"
            onClick={handleWhatsApp}
            style={{ flex: 1 }}
          >
            💬 WhatsApp ({lang === 'en' ? 'EN' : 'বাংলা'})
          </button>
          <button
            className="btn"
            onClick={() => setLang(lang === 'en' ? 'bn' : 'en')}
            title="Toggle Language"
          >
            🌐
          </button>
        </div>
      </div>
    </Modal>
  );
};
