import React, { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/context';
import { isProUser } from '../utils/tierLimits';

interface BulkStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BulkStudentModal: React.FC<BulkStudentModalProps> = ({ isOpen, onClose }) => {
  const { state, saveStudent, saveContract, toast, billingState, user } = useStore();
  const [text, setText] = useState('');
  const [batchId, setBatchId] = useState<string>('');

  const parsedStudents = useMemo(() => {
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const parts = line.split(',').map(p => p.trim());
        return {
          name: parts[0],
          phone: parts[1] || '',
          fee: parts[2] ? parseFloat(parts[2]) : undefined,
        };
      })
      .filter(s => s.name.length > 0);
  }, [text]);

  const activeBatches = state.batches?.filter(b => b.active !== false) || [];

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedStudents.length === 0) return;

    const isPro = isProUser(billingState, user?.email);
    const totalStudentsAfterImport = state.students.length + parsedStudents.length;

    if (!isPro && totalStudentsAfterImport > 15) {
      toast('Free tier limited to 15 students. Please upgrade to Pro to add more.', 'error');
      return;
    }

    let importedCount = 0;
    for (const data of parsedStudents) {
      const studentId = saveStudent({
        name: data.name,
        phone: data.phone,
        batchId: batchId || null,
        active: true
      });

      if (data.fee !== undefined && !isNaN(data.fee) && !batchId) {
        saveContract({
          studentId,
          title: 'Monthly Fee',
          fee: data.fee,
          cycleType: 'months',
          cycleLength: 1,
          startDate: new Date().toISOString().split('T')[0],
          billing: 'end',
          status: 'active'
        });
      }
      importedCount++;
    }

    toast(`Successfully imported ${importedCount} students`, 'success');
    setText('');
    setBatchId('');
    onClose();
  };

  return (
    <Modal title="Bulk Add Students" isOpen={isOpen} onClose={onClose}>
      <form className="form" onSubmit={handleImport}>
        <p className="muted small">
          Paste multiple students, one per line. <br/>
          Format: <code>Name, Phone (optional), Fee (optional)</code><br/>
          Example:<br/>
          <code>Tanvir Ahmed, 01712345678, 2500</code><br/>
          <code>Sadia Rahman, , 2000</code>
        </p>

        <label className="field">
          Target Batch (Optional)
          <select value={batchId} onChange={e => setBatchId(e.target.value)}>
            <option value="">-- No Batch (1-on-1) --</option>
            {activeBatches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        <label className="field">
          Student Data
          <textarea
            rows={10}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Tanvir Ahmed, 01712345678, 2500&#10;Sadia Rahman, , 2000"
            required
          />
        </label>

        <div style={{ marginTop: '10px' }}>
          <strong>Preview:</strong> {parsedStudents.length} student(s) to import
        </div>

        <div className="flex" style={{ gap: '10px', marginTop: '20px' }}>
          <button type="button" className="btn" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={parsedStudents.length === 0} style={{ flex: 1 }}>
            Import Students
          </button>
        </div>
      </form>
    </Modal>
  );
};
