import { useState, useEffect } from 'react';
import { Database, Play, AlertCircle, Table2, Key, LayoutTemplate, TerminalSquare, ChevronDown, ChevronRight } from 'lucide-react';
import { executeSqlQuery, getDatabaseMetadata } from '../data/userManager';
import { ReactFlow, Controls, Background, useNodesState, useEdgesState, Handle, Position, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

// Custom Node for ER Diagram with Column-Level Handles
const TableNode = ({ data }) => {
  return (
    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border-light)', borderRadius: '8px', minWidth: '240px', fontSize: '12px' }}>
      <div style={{ padding: '8px 12px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border-light)', fontWeight: 600, borderTopLeftRadius: '8px', borderTopRightRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Table2 size={14} color="var(--accent-purple)" />
        {data.tableName}
      </div>
      <div style={{ padding: '4px 0' }}>
        {data.columns.map(col => {
          const isPK = data.primaryKeys?.includes(col.column_name);
          return (
            <div key={col.column_name} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '4px 12px', color: 'var(--text-secondary)' }}>
              <Handle 
                type="target" 
                position={Position.Left} 
                id={col.column_name + '-target'} 
                style={{ top: '50%', left: -4, width: 8, height: 8, background: 'var(--text-muted)' }} 
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {isPK ? <Key size={12} color="var(--accent-yellow)" /> : <span style={{width: 12}}/>}
                {col.column_name}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{col.data_type}</span>
              <Handle 
                type="source" 
                position={Position.Right} 
                id={col.column_name + '-source'} 
                style={{ top: '50%', right: -4, width: 8, height: 8, background: 'var(--text-muted)' }} 
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const nodeTypes = { tableNode: TableNode };

// Asynchronous Layout function using ELK
const getLayoutedElements = async (nodes, edges) => {
  const elkNodes = nodes.map(n => ({
    id: n.id,
    width: 260,
    height: 40 + (n.data.columns.length * 24) + 20,
    ports: n.data.columns.map(col => [
      { id: `${n.id}-${col.column_name}-target`, properties: { side: 'WEST' } },
      { id: `${n.id}-${col.column_name}-source`, properties: { side: 'EAST' } }
    ]).flat()
  }));

  const elkEdges = edges.map(e => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target]
  }));

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.spacing.nodeNode': '80',
      'elk.separateConnectedComponents': 'true'
    },
    children: elkNodes,
    edges: elkEdges,
  };

  const layoutedGraph = await elk.layout(graph);
  
  const layoutedNodes = nodes.map((node) => {
    const layoutNode = layoutedGraph.children.find(c => c.id === node.id);
    return { ...node, position: { x: layoutNode.x, y: layoutNode.y } };
  });

  return { nodes: layoutedNodes, edges };
};

// Subcomponent to use ReactFlow hooks
function ERDiagramFlow({ meta }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!meta || meta.tables.length === 0) return;

    const initialNodes = meta.tables.map((t) => {
      const tCols = meta.columns.filter(c => c.table_name === t);
      // Rough attempt to identify primary keys based on name heuristics
      const primaryKeys = tCols.filter(c => c.column_name === 'id' || c.column_name.endsWith('_id')).map(c => c.column_name);
      
      return {
        id: t,
        type: 'tableNode',
        data: { tableName: t, columns: tCols, primaryKeys },
        position: { x: 0, y: 0 }
      };
    });
    
    const initialEdges = meta.foreignKeys.map((fk, idx) => ({
      id: `e-${fk.table_name}-${fk.foreign_table_name}-${idx}`,
      source: fk.table_name,
      target: fk.foreign_table_name,
      sourceHandle: fk.column_name + '-source',
      targetHandle: fk.foreign_column_name + '-target',
      type: 'smoothstep',
      animated: true,
      style: { stroke: 'var(--accent-purple)', strokeWidth: 2 }
    }));

    getLayoutedElements(initialNodes, initialEdges).then((layouted) => {
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      
      // Auto center after a brief delay to allow ReactFlow to render DOM nodes
      setTimeout(() => {
        fitView({ duration: 800, padding: 0.2 });
      }, 100);
    }).catch(err => {
      console.error("ELK Layout Error: ", err);
    });
  }, [meta, setNodes, setEdges, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      colorMode="dark"
      minZoom={0.1}
    >
      <Background color="#333" gap={16} />
      <Controls style={{ background: 'var(--surface-1)', border: '1px solid var(--border-light)' }} />
    </ReactFlow>
  );
}

export default function DatabaseExplorer() {
  const [query, setQuery] = useState('SELECT * FROM holdings LIMIT 10;');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  
  const [meta, setMeta] = useState({ databases: [], tables: [], columns: [], foreignKeys: [] });
  const [metaLoading, setMetaLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('er'); // 'er' or 'query'
  const [selectedDb, setSelectedDb] = useState('stock_pilot');
  const [expandedTables, setExpandedTables] = useState({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMetaLoading(true);
    getDatabaseMetadata(selectedDb).then(data => {
      setMeta(data);
      setMetaLoading(false);
    }).catch(err => {
      console.error(err);
      setMetaLoading(false);
    });
  }, [selectedDb]);

  const handleRunQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await executeSqlQuery(query, selectedDb);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const toggleTable = (tableName) => {
    setExpandedTables(prev => ({...prev, [tableName]: !prev[tableName]}));
  };

  return (
    <div className="page-content page-fade" style={{ display: 'flex', flexDirection: 'row', height: 'calc(100vh - 64px)', padding: 0 }}>
      {/* Sidebar */}
      <div style={{ width: '280px', borderRight: '1px solid var(--border-light)', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-light)' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Database size={20} color="var(--accent-purple)" /> Explorer
          </h1>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {metaLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading schema...</div>
          ) : (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.5px' }}>Databases</div>
                {meta.databases.map(db => (
                  <div 
                    key={db} 
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px', background: selectedDb === db ? 'var(--surface-2)' : 'transparent' }}
                    onClick={() => setSelectedDb(db)}
                    className="hover-bg-surface-2"
                  >
                    <Database size={14} color={selectedDb === db ? "var(--accent-purple)" : "var(--text-muted)"} />
                    {db} {selectedDb === db && <span style={{fontSize:'10px', background:'var(--surface-3)', padding:'2px 4px', borderRadius:'4px'}}>Connected</span>}
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px', letterSpacing: '0.5px' }}>Tables</div>
                {meta.tables.map(table => (
                  <div key={table} style={{ marginBottom: '4px' }}>
                    <div 
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: '4px', background: expandedTables[table] ? 'var(--surface-2)' : 'transparent' }}
                      onClick={() => toggleTable(table)}
                      className="hover-bg-surface-2"
                    >
                      {expandedTables[table] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <Table2 size={14} color="var(--accent-purple)" />
                      {table}
                    </div>
                    {expandedTables[table] && (
                      <div style={{ paddingLeft: '28px', marginTop: '4px' }}>
                        {meta.columns.filter(c => c.table_name === table).map(col => (
                          <div key={col.column_name} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{col.column_name}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{col.data_type}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-color)' }}>
        
        {/* Top Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', padding: '0 16px', background: 'var(--surface-1)' }}>
          <div 
            style={{ padding: '16px 20px', cursor: 'pointer', borderBottom: activeTab === 'er' ? '2px solid var(--accent-purple)' : '2px solid transparent', color: activeTab === 'er' ? 'var(--text-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500 }}
            onClick={() => setActiveTab('er')}
          >
            <LayoutTemplate size={16} /> ER Diagram
          </div>
          <div 
            style={{ padding: '16px 20px', cursor: 'pointer', borderBottom: activeTab === 'query' ? '2px solid var(--accent-purple)' : '2px solid transparent', color: activeTab === 'query' ? 'var(--text-primary)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 500 }}
            onClick={() => setActiveTab('query')}
          >
            <TerminalSquare size={16} /> SQL Editor
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'er' ? (
            <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
              <ReactFlowProvider>
                <ERDiagramFlow meta={meta} />
              </ReactFlowProvider>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
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
                      minHeight: '160px',
                      background: '#1a1a1a',
                      color: '#d4d4d4',
                      fontFamily: 'var(--font-mono)',
                      padding: '16px',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      resize: 'vertical',
                      fontSize: '14px',
                      lineHeight: '1.6'
                    }}
                    placeholder="Enter SQL query here..."
                    spellCheck="false"
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Press <kbd style={{background:'var(--surface-2)', padding:'2px 6px', borderRadius:'4px'}}>Cmd</kbd> + <kbd style={{background:'var(--surface-2)', padding:'2px 6px', borderRadius:'4px'}}>Enter</kbd> to run</span>
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
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
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
          )}
        </div>
      </div>
    </div>
  );
}
