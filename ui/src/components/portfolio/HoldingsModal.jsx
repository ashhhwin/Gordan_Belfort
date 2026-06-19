import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { useStore } from '../../store';

export default function HoldingsModal({ isOpen, onClose, editingHolding = null }) {
  const { addHolding, updateHolding } = useStore();

  const [formData, setFormData] = useState({
    assetClass: 'IND_EQUITY',
    symbol: '',
    name: '',
    sector: '',
    qty: '',
    avgBuy: '',
    buyDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (editingHolding) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        assetClass: editingHolding.assetClass || 'IND_EQUITY',
        symbol: editingHolding.symbol || '',
        name: editingHolding.name || '',
        sector: editingHolding.sector || '',
        qty: editingHolding.qty || '',
        avgBuy: editingHolding.avgBuy || '',
        buyDate: editingHolding.buyDate || new Date().toISOString().split('T')[0]
      });
    } else {
      setFormData({
        assetClass: 'IND_EQUITY',
        symbol: '',
        name: '',
        sector: '',
        qty: '',
        avgBuy: '',
        buyDate: new Date().toISOString().split('T')[0]
      });
    }
  }, [editingHolding, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const isNonTradable = ['BANK', 'EPF', 'PPF', 'NPS', 'CREDIT_CARD', 'VEHICLE', 'BONDS'].includes(formData.assetClass);

    const payload = {
      ...formData,
      qty: isNonTradable ? 1 : (parseFloat(formData.qty) || 0),
      avgBuy: parseFloat(formData.avgBuy) || 0,
      cmp: parseFloat(formData.avgBuy) || 0, // Fallback CMP to buy price initially
      symbol: isNonTradable ? formData.assetClass : formData.symbol, // Dummy symbol
      dayChange: 0,
      dayChangePct: 0
    };

    if (editingHolding) {
      updateHolding(editingHolding.id, payload);
    } else {
      addHolding(payload);
    }
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'var(--surface-2)',
        width: 480,
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden'
      }}>
        <div style={{ 
          padding: '20px 24px', 
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
            {editingHolding ? 'Edit Holding' : 'Add New Holding'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Asset Class</label>
              <select name="assetClass" value={formData.assetClass} onChange={handleChange} style={inputStyle}>
                <option value="IND_EQUITY">Indian Equity</option>
                <option value="US_EQUITY">US Equity</option>
                <option value="MF">Mutual Fund</option>
                <option value="CRYPTO">Cryptocurrency</option>
                <option value="BONDS">Bonds</option>
                <option value="ESOP">ESOPs / RSUs</option>
                <option value="NPS">NPS (Retirement)</option>
                <option value="EPF">EPF (Provident Fund)</option>
                <option value="PPF">PPF (Public Provident)</option>
                <option value="BANK">Bank Account</option>
                <option value="VEHICLE">Vehicle (Car/Bike)</option>
                <option value="CREDIT_CARD">Credit Card (Liability)</option>
              </select>
            </div>
            
            {['IND_EQUITY', 'US_EQUITY', 'MF', 'CRYPTO', 'ESOP'].includes(formData.assetClass) && (
              <div>
                <label style={labelStyle}>Ticker Symbol</label>
                <input required name="symbol" value={formData.symbol} onChange={handleChange} style={inputStyle} placeholder="e.g. RELIANCE" />
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>{['BANK', 'CREDIT_CARD'].includes(formData.assetClass) ? 'Bank / Institution Name' : 'Company / Asset Name'}</label>
            <input required name="name" value={formData.name} onChange={handleChange} style={inputStyle} placeholder={['BANK'].includes(formData.assetClass) ? 'e.g. HDFC Savings' : 'e.g. Reliance Industries'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Sector / Category</label>
              <input name="sector" value={formData.sector} onChange={handleChange} style={inputStyle} placeholder="e.g. Energy" />
            </div>
            <div>
              <label style={labelStyle}>Date Acquired / Opened</label>
              <input required type="date" name="buyDate" value={formData.buyDate} onChange={handleChange} style={inputStyle} />
            </div>
          </div>

          {['BANK', 'EPF', 'PPF', 'NPS', 'CREDIT_CARD', 'VEHICLE', 'BONDS'].includes(formData.assetClass) ? (
            <div>
              <label style={labelStyle}>{formData.assetClass === 'CREDIT_CARD' ? 'Current Outstanding Balance (Enter as Negative Number)' : 'Current Balance / Value'}</label>
              <input required type="number" step="0.01" name="avgBuy" value={formData.avgBuy} onChange={handleChange} style={inputStyle} />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Quantity</label>
                <input required type="number" step="0.0001" name="qty" value={formData.qty} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Avg Buy Price</label>
                <input required type="number" step="0.01" name="avgBuy" value={formData.avgBuy} onChange={handleChange} style={inputStyle} />
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="button" onClick={onClose} style={{
              background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)',
              padding: '8px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer'
            }}>Cancel</button>
            <button type="submit" style={{
              background: 'var(--accent-gold)', color: '#080E1E', border: 'none', fontWeight: 600,
              padding: '8px 16px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
            }}>
              <Save size={16} /> Save Holding
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  color: 'var(--text-muted)',
  marginBottom: 6
};

const inputStyle = {
  width: '100%',
  background: 'var(--surface-3)',
  border: '1px solid var(--border-light)',
  color: 'var(--text-primary)',
  padding: '10px 14px',
  borderRadius: 'var(--radius-sm)',
  outline: 'none',
  fontFamily: 'var(--font-sans)',
  fontSize: 14
};
