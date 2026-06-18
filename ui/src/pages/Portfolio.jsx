import React, { useState, useEffect, useRef } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, Percent,
  ArrowUpRight, ArrowDownRight, ChevronUp, ChevronDown, Users, RefreshCw, Plus, Edit2, Trash2
} from 'lucide-react';
import { Chart, registerables } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { useStore } from '../store';
import HoldingsModal from '../components/portfolio/HoldingsModal';
import NetWorthGrid from '../components/portfolio/NetWorthGrid';
import { calculateTaxMetrics } from '../utils/taxCalc';

Chart.register(...registerables);

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtINR(n) {
  if (Math.abs(n) >= 1e7) return `₹${(n/1e7).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n/1e5).toFixed(2)}L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function fmtUSD(n, rate) {
  const v = n / rate;
  if (Math.abs(v) >= 1e6) return `$${(v/1e6).toFixed(2)}M`;
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtVal(n, currency, rate) {
  return currency === 'INR' ? fmtINR(n) : fmtUSD(n, rate);
}

// ─── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, positive }) {
  const ref = useRef();
  useEffect(() => {
    if (!data || data.length === 0) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v,i) => ({
      x: (i / (data.length-1)) * w,
      y: h - ((v - min) / range) * h * 0.8 - h*0.1,
    }));
    ctx.clearRect(0,0,w,h);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = positive ? 'var(--accent-green)' : 'var(--accent-red)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [data, positive]);

  return <canvas ref={ref} width={80} height={30} className="sparkline-cell" />;
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ icon: Icon, label, value, delta, deltaLabel, glowColor, iconBg, breakdown }) {
  const isPos = delta >= 0;
  return (
    <div className="kpi-card">
      <div className="kpi-card-glow" style={{ background: glowColor }} />
      <div className="kpi-icon" style={{ background: iconBg }}>
        <Icon size={18} color={glowColor} strokeWidth={2} />
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">
        <span className={`kpi-delta ${isPos ? 'pos' : 'neg'}`}>
          {isPos ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>}
          {Math.abs(delta).toFixed(2)}%
        </span>
        <span className="text-muted" style={{fontSize:11}}>{deltaLabel}</span>
      </div>
      {breakdown && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {breakdown.map(b => (
            <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: b.color }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{b.name}: {b.val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Holdings Table ────────────────────────────────────────────────────────────
function HoldingsTable({ holdings, currency, rate, isFamilyMode, config, onEdit, onDelete }) {
  const [sort, setSort] = useState({ key: 'pnl', dir: -1 });

  const rows = [...holdings]
    .map(h => {
      const taxData = calculateTaxMetrics(h, config);
      return {
        ...h,
        invested: h.avgBuy * h.qty,
        currentVal: h.cmp * h.qty,
        pnl: (h.cmp - h.avgBuy) * h.qty,
        pnlPct: ((h.cmp - h.avgBuy) / h.avgBuy) * 100,
        taxData
      };
    })
    .sort((a,b) => (a[sort.key] > b[sort.key] ? sort.dir : -sort.dir));

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: -1 });
  }

  const renderCol = (k, label, right = false) => {
    return (
      <th key={k} onClick={() => toggleSort(k)} style={{ textAlign: right ? 'right' : 'left', cursor: 'pointer' }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
          {label} 
          {sort.key !== k ? <ChevronUp size={11} style={{opacity:0.2}} /> : (sort.dir === 1 ? <ChevronUp size={11}/> : <ChevronDown size={11}/>)}
        </span>
      </th>
    );
  };

  return (
    <div className="card" style={{ padding:'20px 0' }}>
      <div className="card-header" style={{ padding:'0 20px', marginBottom:12 }}>
        <div className="card-title">{isFamilyMode ? 'Combined Family Holdings' : 'Holdings'}</div>
        <div style={{ fontSize:12, color:'var(--text-muted)' }}>{holdings.length} positions</div>
      </div>
      <div className="holdings-table-wrap">
        <table>
          <thead>
            <tr>
              {renderCol("symbol", "Symbol")}
              {isFamilyMode && <th>Owner</th>}
              {renderCol("cmp", "CMP", true)}
              {renderCol("qty", "Qty", true)}
              {renderCol("invested", "Invested", true)}
              {renderCol("currentVal", "Mkt Value", true)}
              {renderCol("pnl", "P&L", true)}
              {renderCol("pnlPct", "Return %", true)}
              {renderCol("taxData.netProfit", "Net Post-Tax", true)}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(h => {
              const pos = h.pnl >= 0;
              return (
                <tr key={h.id}>
                  <td>
                    <div className="td-symbol">{h.symbol}</div>
                    <div className="td-company">{h.name}</div>
                  </td>
                  {isFamilyMode && (
                    <td>
                      <div className="owner-badge">
                        <div className="owner-dot" style={{ background: h._user.color }}>{h._user.initials}</div>
                        <span style={{ color: 'var(--text-secondary)' }}>{h._user.name.split(' ')[0]}</span>
                      </div>
                    </td>
                  )}
                  <td style={{ textAlign:'right' }}>
                    {currency === 'INR'
                      ? `₹${h.cmp.toLocaleString('en-IN')}`
                      : `$${(h.cmp/rate).toFixed(2)}`
                    }
                    {h.dayChange !== undefined && (
                      <div style={{ fontSize:10.5, marginTop:2 }}>
                        <span style={{ color: h.dayChange>=0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {h.dayChange >= 0 ? '+' : ''}{h.dayChangePct?.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign:'right' }}>{h.qty}</td>
                  <td style={{ textAlign:'right' }}>{fmtVal(h.invested, currency, rate)}</td>
                  <td style={{ textAlign:'right' }}>{fmtVal(h.currentVal, currency, rate)}</td>
                  <td style={{ textAlign:'right' }}>
                    <span className={`badge-gain ${pos?'pos':'neg'}`}>
                      {pos ? '+' : ''}{fmtVal(h.pnl, currency, rate)}
                    </span>
                  </td>
                  <td style={{ textAlign:'right' }}>
                    <span style={{ color: pos ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight:600 }}>
                      {pos ? '+' : ''}{h.pnlPct.toFixed(2)}%
                    </span>
                  </td>
                  <td style={{ textAlign:'right' }}>
                    <div style={{ color: h.taxData.netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight:600 }}>
                      {h.taxData.netProfit >= 0 ? '+' : ''}{fmtVal(h.taxData.netProfit, currency, rate)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {h.taxData.taxType} ({h.taxData.taxRate}%)
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button onClick={() => onEdit(h)} style={iconBtnStyle} title="Edit"><Edit2 size={14} /></button>
                      <button onClick={() => onDelete(h.id)} style={{...iconBtnStyle, color: 'var(--accent-red)'}} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sector Donut ──────────────────────────────────────────────────────────────
const SECTOR_COLORS = ['#4B7BEC','#00D4A1','#F7B731','#FF4D6A','#9B59B6','#1ABC9C','#E67E22','#E74C3C'];

function SectorDonut({ holdings }) {
  const sectors = {};
  holdings.forEach(h => {
    const val = h.cmp * h.qty;
    sectors[h.sector || 'Other'] = (sectors[h.sector || 'Other'] || 0) + val;
  });
  const labels = Object.keys(sectors);
  const data = Object.values(sectors);
  const total = data.reduce((a,b) => a+b, 0);

  const chartData = {
    labels,
    datasets: [{
      data,
      backgroundColor: SECTOR_COLORS.slice(0, labels.length),
      borderColor: 'var(--surface)',
      borderWidth: 3,
      hoverBorderWidth: 4,
    }],
  };

  const opts = {
    cutout: '68%',
    plugins: { legend: { display: false }, tooltip: { padding: 10 } },
    animation: { animateScale: true, duration: 800 },
  };

  return (
    <div className="card" style={{ height:'100%' }}>
      <div className="card-header"><div className="card-title">Sector Allocation</div></div>
      <div style={{ position:'relative', width:180, height:180, margin:'0 auto 16px' }}>
        <Doughnut data={chartData} options={opts} />
        <div style={{
          position:'absolute', inset:0, display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center', pointerEvents:'none',
        }}>
          <div style={{ fontSize:11, color:'var(--text-muted)' }}>Total</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:16, fontWeight:700 }}>
            {fmtINR(total)}
          </div>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight: 150, overflowY: 'auto' }}>
        {labels.map((l,i) => (
          <div key={l} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:SECTOR_COLORS[i], flexShrink:0 }} />
            <span style={{ fontSize:12, color:'var(--text-secondary)', flex:1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--text-muted)' }}>
              {((data[i]/total)*100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const iconBtnStyle = { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 4 };

import NetWorthChart from '../components/portfolio/NetWorthChart';
import PortfolioFilters from '../components/portfolio/PortfolioFilters';

// ─── Portfolio Page ────────────────────────────────────────────────────────────
export default function Portfolio() {
  const { 
    currency, usdInr: rate, activeUser, holdings, 
    isFamilyMode, toggleFamilyMode, users, 
    family, deleteHolding
  } = useStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState(null);
  const [filters, setFilters] = useState({ userId: 'ALL', assetClass: 'ALL', performance: 'ALL' });

  const config = family?.config;

  const filteredHoldings = holdings.filter(h => {
    if (isFamilyMode && filters.userId !== 'ALL' && h.user_id !== filters.userId) return false;
    if (filters.assetClass !== 'ALL' && h.assetClass !== filters.assetClass) return false;
    const pnl = (h.cmp - h.avgBuy) * h.qty;
    if (filters.performance === 'GAINERS' && pnl <= 0) return false;
    if (filters.performance === 'LOSERS' && pnl >= 0) return false;
    return true;
  });

  const totalAssets = filteredHoldings
    .filter(h => h.assetClass !== 'CREDIT_CARD')
    .reduce((s, h) => s + (h.cmp || h.avgBuy) * h.qty, 0);

  const totalLiabilities = Math.abs(filteredHoldings
    .filter(h => h.assetClass === 'CREDIT_CARD')
    .reduce((s, h) => s + (h.cmp || h.avgBuy) * h.qty, 0));

  const netWorth = totalAssets - totalLiabilities;
  
  // Traditional equity PNL (excluding non-tradables for these metrics)
  const tradableHoldings = filteredHoldings.filter(h => ['IND_EQUITY', 'US_EQUITY', 'MF', 'CRYPTO'].includes(h.assetClass));
  const totalInvested = tradableHoldings.reduce((s,h) => s + h.avgBuy * h.qty, 0);
  const totalCurrent  = tradableHoldings.reduce((s,h) => s + h.cmp  * h.qty, 0);
  const totalPnl      = totalCurrent - totalInvested;
  const totalPnlPct   = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  
  const dayGain       = tradableHoldings.reduce((s,h) => s + (h.dayChange || 0) * h.qty, 0);
  const dayGainPct    = totalCurrent - dayGain > 0 ? (dayGain / (totalCurrent - dayGain)) * 100 : 0;
  
  const calculateXIRR = () => {
    if (!tradableHoldings || tradableHoldings.length === 0 || totalInvested <= 0) return 0;
    
    const today = new Date();
    let totalDaysHeldWeighted = 0;
    
    tradableHoldings.forEach(h => {
      const investDate = new Date(h.buyDate || Date.now());
      const daysHeld = Math.max(1, (today - investDate) / (1000 * 60 * 60 * 24));
      const weight = (h.avgBuy * h.qty) / totalInvested;
      totalDaysHeldWeighted += daysHeld * weight;
    });

    const averageDaysHeld = totalDaysHeldWeighted || 365;
    const totalReturnMultiple = totalCurrent / totalInvested;
    const annualizedReturn = Math.pow(totalReturnMultiple, 365 / averageDaysHeld) - 1;
    return annualizedReturn * 100;
  };

  const xirr = calculateXIRR();

  // Generate Family Breakdown for KPIs if in Family Mode
  let valueBreakdown = null;
  if (isFamilyMode && users.length > 0) {
    valueBreakdown = users.map(u => {
      const uHoldings = filteredHoldings.filter(h => h.user_id === u.id);
      const uVal = uHoldings.reduce((s, h) => s + h.cmp * h.qty, 0);
      return { name: u.name.split(' ')[0], color: u.color, val: fmtVal(uVal, currency, rate) };
    });
  }

  return (
    <div className="page-content page-fade">
      
      {/* ── Admin Family Toggle ── */}
      {activeUser?.role === 'admin' && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <button
              onClick={() => isFamilyMode && toggleFamilyMode()}
              style={{
                padding: '6px 20px', borderRadius: 'var(--radius-sm)', border: 'none',
                background: !isFamilyMode ? 'var(--surface)' : 'transparent',
                color: !isFamilyMode ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: !isFamilyMode ? 'var(--shadow-sm)' : 'none',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13, transition: 'all 0.2s'
              }}
            >
              My Portfolio
            </button>
            <button
              onClick={() => !isFamilyMode && toggleFamilyMode()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 20px', borderRadius: 'var(--radius-sm)', border: 'none',
                background: isFamilyMode ? 'var(--surface)' : 'transparent',
                color: isFamilyMode ? 'var(--accent-blue)' : 'var(--text-muted)',
                boxShadow: isFamilyMode ? 'var(--shadow-sm)' : 'none',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13, transition: 'all 0.2s'
              }}
            >
              <Users size={14} /> Family Aggregate
            </button>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
              <div style={{width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-green)'}} /> Offline Mode
            </div>
            {!isFamilyMode && (
              <button
                onClick={() => { setEditingHolding(null); setIsModalOpen(true); }}
                style={{
                  background: 'var(--accent-gold)', color: '#080E1E', border: 'none', padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13
                }}
              >
                <Plus size={14} /> Add Holding
              </button>
            )}
          </div>
        </div>
      )}

      <PortfolioFilters filters={filters} setFilters={setFilters} availableUsers={users} />
      <NetWorthChart filters={filters} />

      {/* ── Net Worth Grid ── */}
      <NetWorthGrid holdings={filteredHoldings} currency={currency} rate={rate} />

      {/* KPI Row (Now focuses on Tradable Equity Portfolio Performance + Net Worth) */}
      <h2 style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Portfolio Performance
      </h2>
      <div className="kpi-grid">
        <KPICard
          icon={Wallet}
          label="Total Net Worth"
          value={fmtVal(netWorth, currency, rate)}
          delta={0} // Hide delta for net worth in MVP
          deltaLabel="Assets - Liabilities"
          glowColor="var(--accent-blue)"
          iconBg="var(--accent-blue-dim)"
          breakdown={valueBreakdown}
        />
        <KPICard
          icon={dayGain >= 0 ? TrendingUp : TrendingDown}
          label="Day Gain"
          value={fmtVal(Math.abs(dayGain), currency, rate)}
          delta={dayGainPct}
          deltaLabel="today"
          glowColor={dayGain >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
          iconBg={dayGain >= 0 ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)'}
        />
        <KPICard
          icon={totalPnl >= 0 ? ArrowUpRight : ArrowDownRight}
          label="Total P&L"
          value={fmtVal(Math.abs(totalPnl), currency, rate)}
          delta={totalPnlPct}
          deltaLabel="vs invested"
          glowColor={totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
          iconBg={totalPnl >= 0 ? 'var(--accent-green-dim)' : 'var(--accent-red-dim)'}
        />
        <KPICard
          icon={Percent}
          label="XIRR"
          value={`${xirr.toFixed(1)}%`}
          delta={xirr}
          deltaLabel="annualised"
          glowColor="var(--accent-amber)"
          iconBg="var(--accent-amber-dim)"
        />
      </div>

      {/* Holdings Table */}
      <HoldingsTable 
        holdings={filteredHoldings} 
        currency={currency} 
        rate={rate} 
        isFamilyMode={isFamilyMode} 
        config={config}
        onEdit={(h) => { setEditingHolding(h); setIsModalOpen(true); }}
        onDelete={(id) => deleteHolding(id)}
      />

      {/* Holdings Modal */}
      <HoldingsModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        editingHolding={editingHolding} 
      />

      <div className="bottom-grid" style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '32px' }}>
        <div style={{ width: '400px' }}>
          <SectorDonut holdings={filteredHoldings.filter(h => ['IND_EQUITY', 'US_EQUITY', 'MF'].includes(h.assetClass))} />
        </div>
      </div>
    </div>
  );
}
