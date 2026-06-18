import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Activity, Loader2, Image as ImageIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';

export default function Assistant() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I am Gordan Belfort AI. I have access to 300+ financial tools, dynamic plotting, and deep execution logic. How can I assist you?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeThoughts, setActiveThoughts] = useState([]);
  
  const messagesEndRef = useRef(null);
  const sessionId = useRef(crypto.randomUUID());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeThoughts, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);
    setActiveThoughts([]);
    
    // Add a temporary empty assistant message to stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }]);

    try {
      const response = await fetch('http://localhost:8000/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage,
          session_id: sessionId.current 
        })
      });

      if (!response.ok) throw new Error('Failed to connect to AI Brain');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Parse SSE lines
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep the last incomplete chunk in the buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;
            
            try {
              const payload = JSON.parse(dataStr);
              
              if (payload.type === 'thought') {
                setActiveThoughts(prev => [...prev, payload.content]);
              } else if (payload.type === 'token') {
                setMessages(prev => {
                  const newMsgs = [...prev];
                  const lastMsgIndex = newMsgs.length - 1;
                  // Must create a new object to avoid mutating the previous state in-place,
                  // which causes double-appends in React Strict Mode.
                  newMsgs[lastMsgIndex] = { 
                    ...newMsgs[lastMsgIndex], 
                    content: newMsgs[lastMsgIndex].content + payload.content 
                  };
                  return newMsgs;
                });
              } else if (payload.type === 'end') {
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1].isStreaming = false;
                  return newMsgs;
                });
                setActiveThoughts([]);
              }
            } catch (err) {
              console.error('Failed to parse SSE chunk', err, dataStr);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Connection failed. Is the FastAPI backend running?');
    } finally {
      setIsTyping(false);
      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].isStreaming = false;
        return newMsgs;
      });
      setActiveThoughts([]);
    }
  };

  const renderContent = (content) => {
    // Check if there's a base64 image embedded in the text: [[IMAGE_BASE64:xxxx]]
    const parts = content.split(/(\\[\\[IMAGE_BASE64:.*?\\]\\])/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('[[IMAGE_BASE64:') && part.endsWith(']]')) {
        const base64 = part.replace('[[IMAGE_BASE64:', '').replace(']]', '');
        return (
          <div key={index} style={{ margin: '16px 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            <img src={`data:image/png;base64,${base64}`} alt="Generated Plot" style={{ width: '100%', display: 'block', background: '#fff' }} />
          </div>
        );
      }
      // Render normal markdown for everything else
      return (
        <ReactMarkdown 
          key={index}
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({node, ...props}) => <p style={{ margin: '0 0 12px 0', lineHeight: '1.6' }} {...props} />,
            pre: ({node, ...props}) => <pre style={{ background: '#0D1117', padding: '12px', borderRadius: '8px', overflowX: 'auto', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.05)' }} {...props} />,
            code: ({node, inline, ...props}) => inline 
              ? <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.9em' }} {...props} />
              : <code {...props} />,
            table: ({node, ...props}) => <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }} {...props} />,
            th: ({node, ...props}) => <th style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '8px', textAlign: 'left' }} {...props} />,
            td: ({node, ...props}) => <td style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '8px' }} {...props} />
          }}
        >
          {part}
        </ReactMarkdown>
      );
    });
  };

  return (
    <div className="page-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '20px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-0.5px' }}>Gordan Belfort Copilot</h1>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>LangGraph + MCP Orchestrator</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ background: 'var(--accent-green-dim)', padding: '6px 12px', borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--accent-green)' }}>
            <Activity size={14} color="var(--accent-green)" />
            <span style={{ fontSize: '12px', color: 'var(--accent-green)', fontWeight: 500 }}>Backend Connected</span>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        
        {/* Message History */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: '16px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
              
              <div style={{ 
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                background: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--surface-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.1)' : 'none'
              }}>
                {msg.role === 'user' ? <User size={18} color="#fff" /> : <Bot size={18} color="var(--text-primary)" />}
              </div>

              <div style={{ 
                maxWidth: '75%', 
                background: msg.role === 'user' ? 'var(--accent-blue-dim)' : 'transparent',
                border: msg.role === 'user' ? '1px solid var(--accent-blue)' : 'none',
                padding: msg.role === 'user' ? '12px 16px' : '4px 0',
                borderRadius: '12px',
                fontSize: '15px',
                color: 'var(--text-primary)'
              }}>
                {msg.role === 'user' ? msg.content : renderContent(msg.content)}
                
                {/* Typing indicator inside the active streaming message */}
                {msg.isStreaming && <span className="pulsing-cursor" style={{ display: 'inline-block', width: '8px', height: '16px', background: 'var(--accent-blue)', marginLeft: '4px', verticalAlign: 'middle' }}></span>}
              </div>

            </div>
          ))}

          {/* Active Chain of Thought logs stream here */}
          {activeThoughts.length > 0 && (
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ width: '36px', flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '75%' }}>
                {activeThoughts.map((thought, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)', background: 'var(--surface-3)', padding: '6px 12px', borderRadius: '100px', width: 'fit-content', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Loader2 size={14} className="spin" />
                    <span>{thought}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(13, 17, 23, 0.4)' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', background: 'var(--surface-2)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', padding: '4px' }}>
            <textarea 
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask me to run a simulation, plot market data, or summarize your exposure..."
              style={{ 
                flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '15px',
                padding: '12px 16px', resize: 'none', minHeight: '44px', maxHeight: '200px', outline: 'none',
                fontFamily: 'var(--font-sans)', lineHeight: '1.5'
              }}
              rows={1}
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              style={{ 
                margin: '8px', width: '36px', height: '36px', borderRadius: '50%', border: 'none',
                background: input.trim() && !isTyping ? 'var(--accent-blue)' : 'var(--surface-3)',
                color: input.trim() && !isTyping ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s'
              }}
            >
              <Send size={16} style={{ marginLeft: '2px' }} />
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <Bot size={14} /> LangGraph Supervisor
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <ImageIcon size={14} /> Dynamic Plotting
            </div>
          </div>
        </div>

      </div>

      <style>{`
        .spin { animation: spin 2s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .pulsing-cursor { animation: pulse 1s infinite alternate; }
        @keyframes pulse { 0% { opacity: 0.3; } 100% { opacity: 1; } }
      `}</style>

    </div>
  );
}
