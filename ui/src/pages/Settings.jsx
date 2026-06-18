import React, { useState } from 'react';
import { useStore } from '../store';
import { Settings as SettingsIcon, Save, Info, Globe, Percent } from 'lucide-react';

export default function Settings() {
  const { family, updateConfig } = useStore();
  const currentConfig = family?.config || { baseCurrency: 'INR', taxRates: { indiaSTCG: 20, indiaLTCG: 12.5, usSTCG: 30, usLTCG: 20 } };

  const [config, setConfig] = useState(currentConfig);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    updateConfig(config);
    setTimeout(() => setIsSaving(false), 400); // Visual feedback
  };

  const handleTaxChange = (key, value) => {
    setConfig(prev => ({
      ...prev,
      taxRates: {
        ...prev.taxRates,
        [key]: parseFloat(value) || 0
      }
    }));
  };

  return (
    <div style={{ padding: '32px', maxWidth: 800, margin: '0 auto', color: 'var(--text-primary)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}>
            <SettingsIcon size={24} color="var(--accent-gold)" /> Master Configuration
          </h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>Configure taxation logic and localization for the family dashboard.</p>
        </div>
        <button 
          onClick={handleSave}
          style={{
            background: isSaving ? 'var(--accent-green)' : 'var(--accent-gold)',
            color: '#080E1E',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'var(--transition)'
          }}
        >
          <Save size={18} /> {isSaving ? 'Saved!' : 'Save Config'}
        </button>
      </header>

      {/* ── Base Currency ── */}
      <section style={{ background: 'var(--surface-2)', padding: 24, borderRadius: 'var(--radius-md)', marginBottom: 24, border: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={18} color="var(--text-muted)" /> Localization
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Base Display Currency</label>
          <select 
            value={config.baseCurrency}
            onChange={(e) => setConfig({ ...config, baseCurrency: e.target.value })}
            style={{ 
              background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', 
              padding: '10px 14px', borderRadius: 'var(--radius-sm)', width: 200, outline: 'none' 
            }}
          >
            <option value="INR">Indian Rupee (₹)</option>
            <option value="USD">US Dollar ($)</option>
          </select>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Used to aggregate total portfolio value.</p>
        </div>
      </section>

      {/* ── Taxation Rules ── */}
      <section style={{ background: 'var(--surface-2)', padding: 24, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Percent size={18} color="var(--text-muted)" /> Capital Gains Taxation
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          {/* India */}
          <div>
            <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>India (IND_EQUITY & MF)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Short Term (STCG) %</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="number" step="0.1" 
                    value={config.taxRates?.indiaSTCG || ''} 
                    onChange={e => handleTaxChange('indiaSTCG', e.target.value)}
                    style={{ background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', padding: '10px 14px', paddingRight: 30, borderRadius: 'var(--radius-sm)', width: '100%', outline: 'none' }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: 10, color: 'var(--text-muted)' }}>%</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Long Term (LTCG) %</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="number" step="0.1" 
                    value={config.taxRates?.indiaLTCG || ''} 
                    onChange={e => handleTaxChange('indiaLTCG', e.target.value)}
                    style={{ background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', padding: '10px 14px', paddingRight: 30, borderRadius: 'var(--radius-sm)', width: '100%', outline: 'none' }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: 10, color: 'var(--text-muted)' }}>%</span>
                </div>
              </div>
            </div>
          </div>

          {/* USA */}
          <div>
            <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>United States (US_EQUITY)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Short Term (STCG) %</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="number" step="0.1" 
                    value={config.taxRates?.usSTCG || ''} 
                    onChange={e => handleTaxChange('usSTCG', e.target.value)}
                    style={{ background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', padding: '10px 14px', paddingRight: 30, borderRadius: 'var(--radius-sm)', width: '100%', outline: 'none' }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: 10, color: 'var(--text-muted)' }}>%</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Long Term (LTCG) %</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="number" step="0.1" 
                    value={config.taxRates?.usLTCG || ''} 
                    onChange={e => handleTaxChange('usLTCG', e.target.value)}
                    style={{ background: 'var(--surface-3)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', padding: '10px 14px', paddingRight: 30, borderRadius: 'var(--radius-sm)', width: '100%', outline: 'none' }}
                  />
                  <span style={{ position: 'absolute', right: 12, top: 10, color: 'var(--text-muted)' }}>%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, padding: 12, background: 'var(--accent-blue-dim)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent-blue)' }} />
          <div>
            Holding period classification is calculated dynamically per holding based on its Buy Date. Indian assets default to 365 days for LTCG.
          </div>
        </div>
      </section>
    </div>
  );
}
