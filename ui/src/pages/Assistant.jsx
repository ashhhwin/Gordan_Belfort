import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  Bot,
  User,
  Brain,
  Wrench,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  AlertCircle,
  MessageSquare,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Database,
  BarChart3,
  Activity,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";

const API_BASE = "http://localhost:8000";

const SUGGESTIONS = [
  {
    text: "📊 Backtest SMA crossover on RELIANCE",
    msg: "Run a backtest on RELIANCE using the SMA crossover strategy with 20/50 day windows",
  },
  {
    text: "🎲 Monte Carlo forecast for TCS",
    msg: "Run a Monte Carlo simulation on TCS with 1000 paths for the next 90 days",
  },
  {
    text: "💰 Show my portfolio overview",
    msg: "Show me my complete portfolio with holdings, P&L, and asset allocation",
  },
  {
    text: "🧠 Markov chain analysis on NIFTY",
    msg: "Run a Markov chain regime analysis on NIFTY to identify market regimes and transition probabilities",
  },
];

// ── Helper: format relative time ──
function timeAgo(ts) {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── ThinkingAccordion Component ──
function ThinkingAccordion({ steps, isThinking, route }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="thinking-container">
      <button
        className={`thinking-toggle ${!isThinking ? "done" : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        {isThinking ? (
          <Brain size={15} className="thinking-icon" />
        ) : (
          <Check size={15} />
        )}
        <span>
          {isThinking ? "Thinking..." : `Thought for ${steps.length} steps`}
        </span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <div className={`thinking-steps ${expanded ? "expanded" : ""}`}>
        {steps.map((step, i) => (
          <div key={i} className="thinking-step">
            {step}
          </div>
        ))}
        {route && (
          <div
            className="thinking-step"
            style={{
              color: "var(--accent-blue)",
              borderColor: "var(--accent-blue)",
            }}
          >
            → Routed to: <strong>{route}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ToolCard Component ──
function ToolCard({ name, args, result, status }) {
  const [showResult, setShowResult] = useState(false);
  const Icon =
    status === "running" ? Loader2 : status === "success" ? Check : AlertCircle;

  return (
    <div>
      <div
        className={`tool-card ${status}`}
        onClick={() => result && setShowResult(!showResult)}
      >
        <div className="tool-card-icon">
          <Icon size={14} className={status === "running" ? "spin" : ""} />
        </div>
        <div className="tool-card-info">
          <div className="tool-card-name">🔧 {name}</div>
          {args && <div className="tool-card-args">{args}</div>}
        </div>
      </div>
      {showResult && result && <div className="tool-card-result">{result}</div>}
    </div>
  );
}

// ── Message Content Renderer ──
function MessageContent({ content }) {
  // Split on base64 image markers
  const parts = content.split(/(\[\[IMAGE_BASE64:.*?\]\])/g);

  return (
    <div className="ai-markdown">
      {parts.map((part, index) => {
        if (part.startsWith("[[IMAGE_BASE64:") && part.endsWith("]]")) {
          const base64 = part.replace("[[IMAGE_BASE64:", "").replace("]]", "");
          return (
            <div
              key={index}
              style={{
                margin: "14px 0",
                borderRadius: "10px",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <img
                src={`data:image/png;base64,${base64}`}
                alt="Generated Chart"
                style={{ width: "100%", display: "block" }}
              />
            </div>
          );
        }
        if (!part.trim()) return null;
        return (
          <ReactMarkdown
            key={index}
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p>{children}</p>,
              pre: ({ children }) => <pre>{children}</pre>,
              code: ({ inline, children, ...props }) =>
                inline ? (
                  <code {...props}>{children}</code>
                ) : (
                  <code {...props}>{children}</code>
                ),
              table: ({ children }) => <table>{children}</table>,
              th: ({ children }) => <th>{children}</th>,
              td: ({ children }) => <td>{children}</td>,
              img: ({ src, alt }) => (
                <div
                  style={{
                    margin: "14px 0",
                    borderRadius: "10px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <img
                    src={src}
                    alt={alt}
                    style={{ width: "100%", display: "block" }}
                  />
                </div>
              ),
            }}
          >
            {part}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN ASSISTANT COMPONENT
// ══════════════════════════════════════════════════════════════

export default function Assistant() {
  // ── State ──
  const [conversations, setConversations] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [backendConnected, setBackendConnected] = useState(false);

  // Thinking & tool state (per-response)
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingRoute, setThinkingRoute] = useState(null);
  const [activeTools, setActiveTools] = useState([]);

  // Selectors
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState("gordan_belfort");

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingSteps, activeTools, isTyping]);

  // ── Initialize: fetch conversations, models, personas, check health ──
  useEffect(() => {
    fetchConversations();
    fetchModels();
    fetchPersonas();
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkHealth() {
    try {
      const resp = await fetch(`${API_BASE}/health`);
      setBackendConnected(resp.ok);
    } catch {
      setBackendConnected(false);
    }
  }

  async function fetchConversations() {
    try {
      const resp = await fetch(`${API_BASE}/conversations`);
      if (resp.ok) {
        const data = await resp.json();
        setConversations(data.conversations || []);
      }
    } catch {
      /* backend not up yet */
    }
  }

  async function fetchModels() {
    try {
      const resp = await fetch(`${API_BASE}/models`);
      if (resp.ok) {
        const data = await resp.json();
        setModels(data.models || []);
        if (data.models?.length > 0 && !selectedModel) {
          setSelectedModel(data.models[0].name);
        }
      }
    } catch {
      /* */
    }
  }

  async function fetchPersonas() {
    try {
      const resp = await fetch(`${API_BASE}/personas`);
      if (resp.ok) {
        const data = await resp.json();
        setPersonas(data.personas || []);
        setSelectedPersona(data.default || "gordan_belfort");
      }
    } catch {
      /* */
    }
  }

  // ── Create New Conversation ──
  const createNewConversation = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New Conversation",
          persona: selectedPersona,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setActiveThreadId(data.thread_id);
        setMessages([]);
        setThinkingSteps([]);
        setActiveTools([]);
        setIsThinking(false);
        setThinkingRoute(null);
        fetchConversations();
      }
    } catch {
      // Offline: create a local thread
      const id = crypto.randomUUID();
      setActiveThreadId(id);
      setMessages([]);
    }
  }, [selectedPersona]);

  // ── Switch Conversation ──
  const switchConversation = useCallback(async (threadId) => {
    setActiveThreadId(threadId);
    setMessages([]);
    setThinkingSteps([]);
    setActiveTools([]);
    setIsThinking(false);
    setThinkingRoute(null);

    try {
      const resp = await fetch(`${API_BASE}/conversations/${threadId}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.messages?.length > 0) {
          setMessages(
            data.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          );
        }
      }
    } catch {
      /* */
    }
  }, []);

  // ── Delete Conversation ──
  const deleteConversation = useCallback(
    async (threadId, e) => {
      e.stopPropagation();
      try {
        await fetch(`${API_BASE}/conversations/${threadId}`, {
          method: "DELETE",
        });
        if (activeThreadId === threadId) {
          setActiveThreadId(null);
          setMessages([]);
        }
        fetchConversations();
      } catch {
        /* */
      }
    },
    [activeThreadId],
  );

  // ── Send Message ──
  const handleSend = async (overrideMsg) => {
    const userMessage = (overrideMsg || input).trim();
    if (!userMessage || isTyping) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "44px";

    // Ensure we have a thread
    let threadId = activeThreadId;
    if (!threadId) {
      threadId = crypto.randomUUID();
      setActiveThreadId(threadId);
    }

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsTyping(true);
    setThinkingSteps([]);
    setIsThinking(true);
    setThinkingRoute(null);
    setActiveTools([]);

    // Add empty assistant message to stream into
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", isStreaming: true },
    ]);

    try {
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          session_id: threadId,
          persona: selectedPersona,
          model: selectedModel || undefined,
        }),
      });

      if (!response.ok) throw new Error("Backend connection failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.replace("data: ", "").trim();
          if (!dataStr) continue;

          try {
            const payload = JSON.parse(dataStr);

            switch (payload.type) {
              case "thinking_start":
                setIsThinking(true);
                setThinkingSteps((prev) => [...prev, payload.content]);
                break;

              case "thinking_step":
                setThinkingSteps((prev) => [...prev, payload.content]);
                break;

              case "thinking_end":
                setIsThinking(false);
                setThinkingRoute(payload.route || null);
                setThinkingSteps((prev) => [...prev, payload.content]);
                break;

              case "thought":
                setThinkingSteps((prev) => [...prev, payload.content]);
                break;

              case "tool_start":
                setActiveTools((prev) => [
                  ...prev,
                  {
                    name: payload.tool_name,
                    args: payload.args_preview,
                    status: "running",
                    result: null,
                  },
                ]);
                break;

              case "tool_end":
                setActiveTools((prev) => {
                  const updated = [...prev];
                  const idx = updated.findLastIndex(
                    (t) =>
                      t.name === payload.tool_name && t.status === "running",
                  );
                  if (idx >= 0) {
                    updated[idx] = {
                      ...updated[idx],
                      status: "success",
                      result: payload.result_preview,
                    };
                  }
                  return updated;
                });
                break;

              case "token":
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  const lastIdx = newMsgs.length - 1;
                  newMsgs[lastIdx] = {
                    ...newMsgs[lastIdx],
                    content: newMsgs[lastIdx].content + payload.content,
                  };
                  return newMsgs;
                });
                break;

              case "error":
                toast.error(payload.content || "Agent encountered an error");
                break;

              case "end":
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = {
                    ...newMsgs[newMsgs.length - 1],
                    isStreaming: false,
                  };
                  return newMsgs;
                });
                break;
            }
          } catch (err) {
            console.error("SSE parse error", err, dataStr);
          }
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(
        "Connection failed. Is the FastAPI backend running on :8000?",
      );
    } finally {
      setIsTyping(false);
      setIsThinking(false);
      setMessages((prev) => {
        const newMsgs = [...prev];
        if (newMsgs.length > 0) {
          newMsgs[newMsgs.length - 1] = {
            ...newMsgs[newMsgs.length - 1],
            isStreaming: false,
          };
        }
        return newMsgs;
      });
      fetchConversations();
    }
  };

  // ── Textarea auto-resize ──
  const handleTextareaChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = "44px";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  // ── Filter conversations ──
  const filteredConvos = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ── Group conversations by date ──
  const groupedConvos = {};
  const now = Date.now() / 1000;
  filteredConvos.forEach((c) => {
    const age = now - c.updated_at;
    let group = "Older";
    if (age < 86400) group = "Today";
    else if (age < 172800) group = "Yesterday";
    else if (age < 604800) group = "This Week";
    if (!groupedConvos[group]) groupedConvos[group] = [];
    groupedConvos[group].push(c);
  });

  const hasMessages = messages.length > 0;

  return (
    <div className="page-content" style={{ padding: 0, overflow: "hidden" }}>
      <div className="chat-layout">
        {/* ════════════ SIDEBAR ════════════ */}
        <div className={`chat-sidebar ${sidebarOpen ? "" : "collapsed"}`}>
          <div className="chat-sidebar-header">
            <h3>Conversations</h3>
            <button
              className="chat-new-btn"
              onClick={createNewConversation}
              title="New conversation"
            >
              <Plus size={16} />
            </button>
          </div>

          <input
            className="chat-sidebar-search"
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="chat-sidebar-list">
            {Object.entries(groupedConvos).map(([group, convos]) => (
              <div key={group}>
                <div className="chat-sidebar-date">{group}</div>
                {convos.map((c) => (
                  <div
                    key={c.thread_id}
                    className={`chat-sidebar-item ${activeThreadId === c.thread_id ? "active" : ""}`}
                    onClick={() => switchConversation(c.thread_id)}
                  >
                    <MessageSquare
                      size={14}
                      style={{ flexShrink: 0, opacity: 0.5 }}
                    />
                    <span className="chat-sidebar-item-title">{c.title}</span>
                    <span className="chat-sidebar-item-meta">
                      {timeAgo(c.updated_at)}
                    </span>
                    <div className="chat-sidebar-item-actions">
                      <button
                        onClick={(e) => deleteConversation(c.thread_id, e)}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {filteredConvos.length === 0 && (
              <div
                style={{
                  padding: "20px 16px",
                  textAlign: "center",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                No conversations yet
              </div>
            )}
          </div>
        </div>

        {/* ════════════ MAIN CHAT ════════════ */}
        <div className="chat-main">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-left">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  padding: "4px",
                }}
              >
                {sidebarOpen ? (
                  <PanelLeftClose size={18} />
                ) : (
                  <PanelLeftOpen size={18} />
                )}
              </button>
              <div>
                <div style={{ fontSize: "16px", fontWeight: 600 }}>
                  Gordan Belfort
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  LangGraph 2.0 · Qwen 3 · 16+ Tools
                </div>
              </div>
            </div>
            <div className="chat-header-right">
              {/* Model Selector */}
              {models.length > 0 && (
                <select
                  className="chat-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  title="Select model"
                >
                  {models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Persona Selector */}
              <select
                className="chat-select"
                value={selectedPersona}
                onChange={(e) => setSelectedPersona(e.target.value)}
                title="Select persona"
              >
                {personas.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
                {personas.length === 0 && (
                  <option value="gordan_belfort">Gordan Belfort</option>
                )}
              </select>

              {/* Status */}
              <div
                className={`chat-status-badge ${backendConnected ? "connected" : "disconnected"}`}
              >
                <Activity size={12} />
                {backendConnected ? "Connected" : "Offline"}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {!hasMessages && (
              <div className="chat-empty-state">
                <div className="chat-empty-icon">
                  <Sparkles size={28} color="#BF5AF2" />
                </div>
                <div className="chat-empty-title">Gordan Belfort AI</div>
                <div className="chat-empty-subtitle">
                  Your elite quantitative finance copilot. Backtesting, Monte
                  Carlo simulations, ML models, portfolio analysis, and more —
                  all powered by 16+ specialized tools.
                </div>
                <div className="chat-suggestion-grid">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      className="chat-suggestion"
                      onClick={() => handleSend(s.msg)}
                    >
                      {s.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                <div
                  className={`chat-avatar ${msg.role === "user" ? "user-avatar" : "ai-avatar"}`}
                >
                  {msg.role === "user" ? (
                    <User size={16} color="#fff" />
                  ) : (
                    <Bot size={16} color="#fff" />
                  )}
                </div>
                <div
                  className={`chat-bubble ${msg.role === "user" ? "user-bubble" : "ai-bubble"}`}
                >
                  {msg.role === "user" ? (
                    msg.content
                  ) : (
                    <>
                      {/* Show thinking accordion for the first AI message that follows thinking */}
                      {i === messages.length - 1 &&
                        thinkingSteps.length > 0 && (
                          <ThinkingAccordion
                            steps={thinkingSteps}
                            isThinking={isThinking}
                            route={thinkingRoute}
                          />
                        )}

                      {/* Show tool cards for the latest AI message */}
                      {i === messages.length - 1 && activeTools.length > 0 && (
                        <div style={{ marginBottom: "12px" }}>
                          {activeTools.map((tool, j) => (
                            <ToolCard key={j} {...tool} />
                          ))}
                        </div>
                      )}

                      {/* Message content */}
                      {msg.content && <MessageContent content={msg.content} />}

                      {/* Streaming cursor */}
                      {msg.isStreaming && !msg.content && (
                        <span className="pulsing-cursor" />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="chat-input-area">
            {isTyping && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px 16px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--text-muted)",
                marginBottom: "4px"
              }}>
                {isThinking ? (
                  <>
                    <Brain className="spin" size={14} style={{ color: "var(--accent-blue)" }} />
                    <span style={{ color: "var(--accent-blue)" }}>AI is thinking deeply...</span>
                  </>
                ) : activeTools.length > 0 ? (
                  <>
                    <Wrench className="spin" size={14} style={{ color: "var(--accent-yellow)" }} />
                    <span style={{ color: "var(--accent-yellow)" }}>Running tools: {activeTools.map(t => t.tool_name).join(', ')}...</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="spin" size={14} style={{ color: "var(--accent-green)" }} />
                    <span style={{ color: "var(--accent-green)" }}>Generating response...</span>
                  </>
                )}
              </div>
            )}
            <div className="chat-input-container">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={isTyping ? "Please wait for the AI to finish..." : "Ask me to run a backtest, analyze risk, forecast prices, or query your portfolio..."}
                rows={1}
              />
              <button
                className={`chat-send-btn ${input.trim() && !isTyping ? "active" : "inactive"}`}
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping}
              >
                <Send size={16} style={{ marginLeft: "2px" }} />
              </button>
            </div>
            <div className="chat-input-meta">
              <div className="chat-input-meta-item">
                <Brain size={12} /> Chain-of-Thought
              </div>
              <div className="chat-input-meta-item">
                <Wrench size={12} /> 16+ Tools
              </div>
              <div className="chat-input-meta-item">
                <Database size={12} /> Memory
              </div>
              <div className="chat-input-meta-item">
                <BarChart3 size={12} /> Charts
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
