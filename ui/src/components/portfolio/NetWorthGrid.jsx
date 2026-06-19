import { 
  Building2, Globe, PieChart, Briefcase, Car, PiggyBank, 
  Landmark, ScrollText, CreditCard, Award
} from 'lucide-react';

const ASSET_CATEGORIES = [
  { id: 'IND_EQUITY', label: 'IND Stocks', icon: Building2, color: 'var(--accent-blue)' },
  { id: 'US_EQUITY', label: 'US Stocks', icon: Globe, color: 'var(--accent-purple)' },
  { id: 'MF', label: 'Mutual Funds', icon: PieChart, color: 'var(--accent-green)' },
  { id: 'NPS', label: 'NPS', icon: Briefcase, color: 'var(--accent-amber)' },
  { id: 'VEHICLE', label: 'Vehicle', icon: Car, color: 'var(--text-muted)' },
  { id: 'EPF', label: 'EPF', icon: PiggyBank, color: 'var(--accent-green)' },
  { id: 'BONDS', label: 'Bonds', icon: ScrollText, color: 'var(--text-secondary)' },
  { id: 'PPF', label: 'PPF', icon: Landmark, color: 'var(--accent-blue)' },
  { id: 'ESOP', label: 'ESOPs / RSUs', icon: Award, color: 'var(--accent-gold)' },
  { id: 'BANK', label: 'Bank Accounts', icon: Landmark, color: 'var(--text-primary)' },
];

const LIABILITY_CATEGORIES = [
  { id: 'CREDIT_CARD', label: 'Credit Cards', icon: CreditCard, color: 'var(--accent-red)' },
];

function fmtVal(n, currency, rate) {
  if (currency === 'INR') {
    if (Math.abs(n) >= 1e7) return `₹${(n/1e7).toFixed(2)}Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n/1e5).toFixed(2)}L`;
    return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  } else {
    const v = n / rate;
    if (Math.abs(v) >= 1e6) return `$${(v/1e6).toFixed(2)}M`;
    if (Math.abs(v) >= 1e3) return `$${(v/1e3).toFixed(2)}K`;
    return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
}

function CategoryCard({ category, total, currency, rate, isLiability }) {
  if (total === 0) return null; // Don't show empty buckets

  const Icon = category.icon;
  
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      transition: 'var(--transition)',
      cursor: 'default',
      position: 'relative',
      overflow: 'hidden'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = category.color;
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = `0 8px 24px -8px ${category.color}40`;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = 'var(--border)';
      e.currentTarget.style.transform = 'none';
      e.currentTarget.style.boxShadow = 'none';
    }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '4px', height: '100%',
        background: category.color, opacity: 0.8
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
        <Icon size={16} color={category.color} />
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{category.label}</span>
      </div>
      
      <div style={{ 
        fontFamily: 'var(--font-sans)', 
        fontSize: '24px', 
        fontWeight: 700, 
        color: isLiability ? 'var(--accent-red)' : 'var(--text-primary)' 
      }}>
        {fmtVal(total, currency, rate)}
      </div>
    </div>
  );
}

export default function NetWorthGrid({ holdings, currency, rate }) {
  // Aggregate totals
  const totals = {};
  
  holdings.forEach(h => {
    const val = (h.cmp || h.avgBuy) * h.qty;
    totals[h.assetClass] = (totals[h.assetClass] || 0) + val;
  });

  return (
    <div style={{ marginBottom: '32px' }}>
      
      {/* ASSETS */}
      <h2 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Assets
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {ASSET_CATEGORIES.map(cat => (
          <CategoryCard 
            key={cat.id} 
            category={cat} 
            total={totals[cat.id] || 0} 
            currency={currency} 
            rate={rate} 
          />
        ))}
      </div>

      {/* LIABILITIES */}
      {(totals['CREDIT_CARD'] !== undefined && totals['CREDIT_CARD'] !== 0) && (
        <>
          <h2 style={{ fontSize: '14px', color: 'var(--accent-red)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Liabilities
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            {LIABILITY_CATEGORIES.map(cat => (
              <CategoryCard 
                key={cat.id} 
                category={cat} 
                total={totals[cat.id] || 0} 
                currency={currency} 
                rate={rate} 
                isLiability
              />
            ))}
          </div>
        </>
      )}

    </div>
  );
}
