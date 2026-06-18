import React, { useState } from 'react';
import { Database, Play, AlertCircle } from 'lucide-react';
import { executeSqlQuery } from '../data/userManager';

export default function DatabaseExplorer() {
  const [query, setQuery] = useState('SELECT * FROM holdings LIMIT 10;');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleRunQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await executeSqlQuery(query);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-content page-fade" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <Database size={24} color="var(--accent-purple)" /> SQL Explorer
      </h1>

      <div className="card" style={{ flexShrink: 0, marginBottom: '16px' }}>
        <div style={{ padding: '16px' }}>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                handleRunQuery();
              }
            }}
            style={{
              width: '100%',
              minHeight: '120px',
              background: '#1a1a1a',
              color: '#d4d4d4',
              fontFamily: 'var(--font-mono)',
              padding: '12px',
              border: '1px solid var(--border-light)',
              borderRadius: '6px',
              resize: 'vertical',
              fontSize: '13px',
              lineHeight: '1.5'
            }}
            placeholder="Enter SQL query here..."
            spellCheck="false"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Press <kbd style={{background:'var(--surface-2)', padding:'2px 4px', borderRadius:'4px'}}>Cmd</kbd> + <kbd style={{background:'var(--surface-2)', padding:'2px 4px', borderRadius:'4px'}}>Enter</kbd> to run</span>
            <button 
              className="btn btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={handleRunQuery}
              disabled={loading}
            >
              {loading ? (
                <><div className="spinner" style={{width: 14, height: 14, borderWidth: 2}}/> Executing...</>
              ) : (
                <><Play size={16} fill="currentColor" /> Run Query</>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--accent-red-dim)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', padding: '16px', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px', flexShrink: 0 }}>
          <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
            {error}
          </div>
        </div>
      )}

      {result && (
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card-header" style={{ padding: '16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between' }}>
            <div className="card-title">Results</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {result.command} • {result.rowCount} rows returned
            </div>
          </div>
          
          <div className="holdings-table-wrap" style={{ flex: 1, overflow: 'auto' }}>
            {result.fields && result.fields.length > 0 ? (
              <table style={{ minWidth: '100%' }}>
                <thead>
                  <tr>
                    {result.fields.map((f, i) => (
                      <th key={i} style={{ whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-1)' }}>{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {result.fields.map((f, j) => {
                        let val = row[f];
                        if (val === null) val = <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>NULL</span>;
                        else if (typeof val === 'object') val = JSON.stringify(val);
                        else val = String(val);
                        
                        return (
                          <td key={j} style={{ whiteSpace: 'nowrap', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {result.rows.length === 0 && (
                    <tr>
                      <td colSpan={result.fields.length} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                        Success. No rows returned.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Query executed successfully.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
