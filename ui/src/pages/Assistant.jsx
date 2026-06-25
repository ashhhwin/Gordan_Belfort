import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Bot, User, Brain, Wrench, Plus, Trash2, ChevronDown,
  ChevronRight, Loader2, Check, AlertCircle, MessageSquare,
  Sparkles, PanelLeftClose, PanelLeftOpen, Database, BarChart3,
  Activity, Copy, CheckCheck, Zap, TrendingUp, Shield,
  ZoomIn, X, Maximize2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import toast from "react-hot-toast";

// Dynamic imports with fallbacks
let mermaid = null;
let SyntaxHighlighter = null;
let atomOneDark = null;

// Lazy-load mermaid
const loadMermaid = async () => {
  if (mermaid) return mermaid;
  try {
    const mod = await import("mermaid");
    mermaid = mod.default;
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      themeVariables: {
        background: "#0D1117",
        primaryColor: "#0A84FF",
        primaryTextColor: "#ffffff",
        primaryBorderColor: "#30363D",
        secondaryColor: "#161B22",
        tertiaryColor: "#1C2026",
        lineColor: "#8E8E93",
        fontSize: "14px",
      },
    });
    return mermaid;
  } catch { return null; }
};

// Lazy-load syntax highlighter
const loadHighlighter = async () => {
  if (SyntaxHighlighter) return SyntaxHighlighter;
  try {
    const mod = await import("react-syntax-highlighter");
    const theme = await import("react-syntax-highlighter/dist/esm/styles/hljs");
    SyntaxHighlighter = mod.Prism || mod.default;
    atomOneDark = theme.atomOneDark;
    return SyntaxHighlighter;
  } catch { return null; }
};

const API_BASE = "http://localhost:8001";

const SUGGESTIONS = [
  { text: "📊 Backtest SMA crossover on TRENT", msg: "Run a backtest on TRENT using the SMA crossover strategy with 20/50 day windows" },
  { text: "🎲 Monte Carlo forecast for RELIANCE", msg: "Run a 500-path Monte Carlo simulation on RELIANCE for 90 days" },
  { text: "💼 Show my full portfolio P&L", msg: "Show me my complete portfolio overview — IBKR US holdings and India holdings with P&L breakdown" },
  { text: "🔥 Today's volume anomalies", msg: "What are the biggest volume anomalies on NSE today? Show stocks with >200% above average volume" },
  { text: "📈 Technical indicators for PARAS", msg: "Show me RSI, MACD, Bollinger Bands and technical signals for PARAS" },
  { text: "🧠 Optimize my India portfolio", msg: "Run Markowitz mean-variance optimization on my top India equity holdings. Suggest optimal weights and show the efficient frontier." },
];

// ── Helpers ───────────────────────────────────────────────────

function timeAgo(ts) {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => toast.success("Copied!", { duration: 1500 }));
}

// ── Mermaid Diagram ───────────────────────────────────────────

function MermaidDiagram({ code }) {
  const ref = useRef(null);
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadMermaid().then(async (m) => {
      if (!m || cancelled) return;
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await m.render(id, code.trim());
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setErr("Diagram parse error");
      }
    });
    return () => { cancelled = true; };
  }, [code]);

  if (err) return <div style={{ color: "#FF453A", fontSize: "12px", padding: "8px" }}>⚠ {err}</div>;
  if (!svg) return <div style={{ color: "#8E8E93", fontSize: "12px", padding: "8px" }}>Loading diagram...</div>;
  return (
    <div
      style={{ background: "#0D1117", borderRadius: "10px", padding: "16px", overflowX: "auto",
               border: "1px solid #30363D", margin: "12px 0" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// ── Code Block & Dynamic Artifact Renderer ──────────────────────

function CodeBlock({ language, children }) {
  const [copied, setCopied] = useState(false);
  // Collapse python/sql code by default, but leave artifacts open
  const [collapsed, setCollapsed] = useState(language !== "html" && language !== "mermaid");
  const [viewMode, setViewMode] = useState("preview"); // "preview" | "code"
  const code = String(children).trimEnd();

  if (language === "mermaid") return <MermaidDiagram code={code} />;

  const handleCopy = (e) => {
    e.stopPropagation();
    copyToClipboard(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isArtifact = language === "html";

  return (
    <div style={{ position: "relative", margin: "16px 0", borderRadius: "12px", border: "1px solid #30363D", overflow: "hidden", background: "#0D1117" }}>
      
      {/* Header */}
      <div 
        onClick={() => setCollapsed(!collapsed)}
        style={{ 
          padding: "10px 14px", background: "#161B22", cursor: "pointer", 
          display: "flex", justifyContent: "space-between", alignItems: "center",
          borderBottom: collapsed ? "none" : "1px solid #30363D",
          userSelect: "none", transition: "all 0.2s"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 600, color: "#E0E0E0" }}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          {isArtifact ? "✨ Dynamic Artifact" : `${language || "Code"} Snippet`}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }} onClick={(e) => e.stopPropagation()}>
          {isArtifact && !collapsed && (
            <div style={{ display: "flex", background: "#0D1117", borderRadius: "6px", border: "1px solid #30363D", overflow: "hidden" }}>
              <button onClick={() => setViewMode("preview")} style={{ padding: "4px 8px", fontSize: "10px", fontWeight: 600, border: "none", cursor: "pointer", background: viewMode === "preview" ? "#0A84FF33" : "transparent", color: viewMode === "preview" ? "#0A84FF" : "#8E8E93" }}>Preview</button>
              <button onClick={() => setViewMode("code")} style={{ padding: "4px 8px", fontSize: "10px", fontWeight: 600, border: "none", borderLeft: "1px solid #30363D", cursor: "pointer", background: viewMode === "code" ? "#0A84FF33" : "transparent", color: viewMode === "code" ? "#0A84FF" : "#8E8E93" }}>Code</button>
            </div>
          )}
          <button onClick={handleCopy} style={{ background: "#1C2026", border: "1px solid #30363D",
            borderRadius: "4px", padding: "3px 7px", cursor: "pointer", color: copied ? "#30D158" : "#8E8E93",
            display: "flex", alignItems: "center", gap: "4px", fontSize: "11px" }}>
            {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{ padding: "0" }}>
          {isArtifact && viewMode === "preview" ? (
            <iframe 
              srcDoc={code}
              sandbox="allow-scripts allow-popups"
              style={{ width: "100%", height: "450px", border: "none", display: "block", background: "#0D1117" }}
              title="Dynamic Artifact"
            />
          ) : (
            <pre style={{ background: "#0D1117", padding: "16px", overflowX: "auto", margin: 0,
                         fontSize: "13px", lineHeight: "1.6", color: "#E8EAF0", fontFamily: "monospace" }}>
              <code>{code}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Image Lightbox ────────────────────────────────────────────

function ImageLightbox({ src, alt, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(8px)",
    }}>
      <button onClick={onClose} style={{ position: "absolute", top: "20px", right: "20px",
        background: "#1C2026", border: "1px solid #30363D", borderRadius: "50%",
        width: "36px", height: "36px", cursor: "pointer", color: "white",
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <X size={16} />
      </button>
      <img onClick={(e) => e.stopPropagation()} src={src} alt={alt}
        style={{ maxWidth: "92vw", maxHeight: "92vh", borderRadius: "12px",
                 boxShadow: "0 25px 80px rgba(0,0,0,0.8)" }} />
    </div>
  );
}

// ── Chart Display ─────────────────────────────────────────────

function ChartDisplay({ base64 }) {
  const [lightbox, setLightbox] = useState(false);
  const src = `data:image/png;base64,${base64}`;

  return (
    <>
      <div style={{ position: "relative", margin: "14px 0", borderRadius: "12px",
                   overflow: "hidden", border: "1px solid #30363D", cursor: "pointer" }}
        onClick={() => setLightbox(true)}>
        <img src={src} alt="Analysis Chart" style={{ width: "100%", display: "block" }} />
        <div style={{ position: "absolute", top: "10px", right: "10px", background: "rgba(13,17,23,0.8)",
                     borderRadius: "6px", padding: "4px 8px", display: "flex", alignItems: "center", gap: "4px",
                     color: "#8E8E93", fontSize: "11px", backdropFilter: "blur(4px)" }}>
          <Maximize2 size={12} /> Click to expand
        </div>
      </div>
      {lightbox && <ImageLightbox src={src} alt="Analysis Chart" onClose={() => setLightbox(false)} />}
    </>
  );
}

// ── Message Content Renderer ──────────────────────────────────

function MessageContent({ content }) {
  // Parse string into blocks: text, image, artifact
  const blocks = [];
  let currentIndex = 0;

  while (currentIndex < content.length) {
    const nextImageIdx = content.indexOf("[[IMAGE_BASE64:", currentIndex);
    const nextArtifactIdx = content.indexOf("<artifact", currentIndex);

    let nextIdx = -1;
    let isImage = false;
    let isArtifact = false;

    if (nextImageIdx !== -1 && nextArtifactIdx !== -1) {
      if (nextImageIdx < nextArtifactIdx) {
        nextIdx = nextImageIdx;
        isImage = true;
      } else {
        nextIdx = nextArtifactIdx;
        isArtifact = true;
      }
    } else if (nextImageIdx !== -1) {
      nextIdx = nextImageIdx;
      isImage = true;
    } else if (nextArtifactIdx !== -1) {
      nextIdx = nextArtifactIdx;
      isArtifact = true;
    }

    if (nextIdx === -1) {
      blocks.push({ type: "text", content: content.slice(currentIndex) });
      break;
    }

    if (nextIdx > currentIndex) {
      blocks.push({ type: "text", content: content.slice(currentIndex, nextIdx) });
    }

    if (isImage) {
      const endIdx = content.indexOf("]]", nextIdx);
      if (endIdx !== -1) {
        blocks.push({ type: "image", base64: content.slice(nextIdx + 15, endIdx) });
        currentIndex = endIdx + 2;
      } else {
        blocks.push({ type: "text", content: content.slice(nextIdx) });
        break;
      }
    } else if (isArtifact) {
      const tagEndIdx = content.indexOf(">", nextIdx);
      if (tagEndIdx === -1) {
        blocks.push({ type: "text", content: content.slice(nextIdx) });
        break;
      }
      const openTag = content.slice(nextIdx, tagEndIdx + 1);
      const typeMatch = openTag.match(/type="([^"]+)"/);
      const artifactType = typeMatch ? typeMatch[1] : "code";
      const closeIdx = content.indexOf("</artifact>", tagEndIdx);
      
      if (closeIdx !== -1) {
        blocks.push({ type: "artifact", artifactType, content: content.slice(tagEndIdx + 1, closeIdx) });
        currentIndex = closeIdx + 11;
      } else {
        // Streaming incomplete artifact
        blocks.push({ type: "artifact", artifactType, content: content.slice(tagEndIdx + 1) });
        break;
      }
    }
  }

  return (
    <div className="ai-markdown">
      {blocks.map((block, index) => {
        if (block.type === "image") {
          return <ChartDisplay key={index} base64={block.base64} />;
        }
        if (block.type === "artifact") {
          return <CodeBlock key={index} language={block.artifactType}>{block.content}</CodeBlock>;
        }
        if (!block.content.trim()) return null;
        
        return (
          <ReactMarkdown
            key={index}
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                const lang = match ? match[1] : "";
                if (inline) return <code style={{ background: "#1C2026", padding: "2px 6px",
                  borderRadius: "4px", fontFamily: "monospace", fontSize: "0.88em",
                  color: "#FF9F0A" }}>{children}</code>;
                return <CodeBlock language={lang}>{children}</CodeBlock>;
              },
              p: ({ children }) => <div style={{ margin: "6px 0", lineHeight: 1.7, display: "block" }}>{children}</div>,
              h1: ({ children }) => <h1 style={{ color: "white", margin: "16px 0 10px", borderBottom: "1px solid #30363D", paddingBottom: "8px" }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ color: "white", margin: "14px 0 8px" }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ color: "#E0E0E0", margin: "12px 0 6px" }}>{children}</h3>,
              blockquote: ({ children }) => (
                <blockquote style={{ borderLeft: "3px solid #0A84FF", paddingLeft: "12px",
                  color: "#8E8E93", margin: "10px 0", fontStyle: "italic" }}>{children}</blockquote>
              ),
              table: ({ children }) => (
                <div style={{ overflowX: "auto", margin: "12px 0" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
                    {children}
                  </table>
                </div>
              ),
              th: ({ children }) => <th style={{ background: "#161B22", border: "1px solid #30363D",
                padding: "8px 12px", textAlign: "left", color: "#E0E0E0", fontWeight: 600 }}>{children}</th>,
              td: ({ children }) => <td style={{ border: "1px solid #1C2026", padding: "7px 12px",
                color: "#C9D1D9" }}>{children}</td>,
              img: ({ src, alt }) => <ChartDisplay base64={src?.replace("data:image/png;base64,", "")} />,
              a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer"
                style={{ color: "#0A84FF", textDecoration: "none" }}>{children}</a>,
              ul: ({ children }) => <ul style={{ paddingLeft: "20px", margin: "6px 0" }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ paddingLeft: "20px", margin: "6px 0" }}>{children}</ol>,
              li: ({ children }) => <li style={{ margin: "3px 0", lineHeight: 1.6 }}>{children}</li>,
              strong: ({ children }) => <strong style={{ color: "white", fontWeight: 600 }}>{children}</strong>,
              em: ({ children }) => <em style={{ color: "#BF5AF2" }}>{children}</em>,
              hr: () => <hr style={{ border: "none", borderTop: "1px solid #30363D", margin: "14px 0" }} />,
            }}
          >
            {block.content}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}

// ── Thinking Accordion ────────────────────────────────────────

function ThinkingAccordion({ steps, isThinking, route }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="thinking-container">
      <button
        className={`thinking-toggle ${!isThinking ? "done" : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        {isThinking ? <Brain size={15} className="thinking-icon" /> : <Check size={15} />}
        <span>{isThinking ? "Thinking..." : `Thought for ${steps.length} steps`}</span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <div className={`thinking-steps ${expanded ? "expanded" : ""}`}>
        {steps.map((step, i) => (
          <div key={i} className="thinking-step">{step}</div>
        ))}
        {route && (
          <div className="thinking-step" style={{ color: "var(--accent-blue)", borderColor: "var(--accent-blue)" }}>
            → Routed to: <strong>{route}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool Timeline ─────────────────────────────────────────────

const TOOL_ICON_MAP = {
  get_ibkr_portfolio: TrendingUp,
  get_india_holdings: Database,
  get_portfolio_summary: BarChart3,
  run_backtest: BarChart3,
  monte_carlo_simulation: Zap,
  calculate_technical_indicators: Activity,
  calculate_garch_volatility: Activity,
  optimize_portfolio_weights: Brain,
  train_price_predictor: Brain,
  train_lstm_price_model: Brain,
  send_telegram_alert: Zap,
  save_to_memory: Database,
  search_memory: Database,
  generate_candlestick_chart: BarChart3,
  run_readonly_sql: Database,
  execute_python_code: Wrench,
  get_volume_anomalies: Activity,
  get_52w_extremes: TrendingUp,
  get_alpha_signals: Sparkles,
  calculate_portfolio_var_real: Shield,
};

function ToolTimeline({ tools }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!tools || tools.length === 0) return null;

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ fontSize: "11px", color: "#8E8E93", marginBottom: "8px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        Tool Executions
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {tools.map((tool, i) => {
          const IconComp = TOOL_ICON_MAP[tool.name] || Wrench;
          const isExpanded = expandedIndex === i;
          return (
            <div key={i}>
              <div
                onClick={() => tool.result && setExpandedIndex(isExpanded ? null : i)}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "7px 10px", borderRadius: "8px",
                  background: "#161B22", border: "1px solid",
                  borderColor: tool.status === "running" ? "#0A84FF40" : tool.status === "success" ? "#30D15840" : "#FF453A40",
                  cursor: tool.result ? "pointer" : "default",
                  transition: "all 0.15s",
                }}>
                <div style={{
                  width: "22px", height: "22px", borderRadius: "6px", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  background: tool.status === "running" ? "#0A84FF20" : tool.status === "success" ? "#30D15820" : "#FF453A20",
                }}>
                  {tool.status === "running" ? (
                    <Loader2 size={12} style={{ color: "#0A84FF", animation: "spin 1s linear infinite" }} />
                  ) : tool.status === "success" ? (
                    <IconComp size={12} style={{ color: "#30D158" }} />
                  ) : (
                    <AlertCircle size={12} style={{ color: "#FF453A" }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#E0E0E0", fontFamily: "monospace" }}>
                    {tool.name}
                  </div>
                  {tool.args && (
                    <div style={{ fontSize: "11px", color: "#8E8E93", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tool.args}
                    </div>
                  )}
                </div>
                {tool.status === "running" && (
                  <div style={{ width: "40px", height: "3px", background: "#30363D", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ width: "60%", height: "100%", background: "#0A84FF",
                      animation: "progressSlide 1.2s ease-in-out infinite" }} />
                  </div>
                )}
                {tool.result && <ChevronDown size={12} style={{ color: "#8E8E93", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />}
              </div>
              {isExpanded && tool.result && (
                <div style={{ background: "#0D1117", border: "1px solid #30363D", borderTop: "none",
                  borderRadius: "0 0 8px 8px", padding: "10px 12px", fontSize: "11px",
                  fontFamily: "monospace", color: "#8E8E93", maxHeight: "200px", overflowY: "auto",
                  whiteSpace: "pre-wrap" }}>
                  {tool.result}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Agent Pipeline Indicator ──────────────────────────────────

function AgentPipeline({ sender, isTyping }) {
  if (!isTyping && !sender) return null;

  const agents = [
    { id: "data_agent", label: "Data", icon: Database },
    { id: "quant_agent", label: "Quant", icon: BarChart3 },
    { id: "judge_agent", label: "Judge", icon: Shield },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 0 8px",
                 marginBottom: "8px" }}>
      {agents.map((agent, i) => {
        const Icon = agent.icon;
        const isActive = sender === agent.id;
        const isDone = sender && agents.findIndex(a => a.id === sender) > i;
        return (
          <div key={agent.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 8px",
              borderRadius: "100px", fontSize: "11px", fontWeight: 500, transition: "all 0.2s",
              background: isActive ? "#0A84FF20" : isDone ? "#30D15815" : "#1C2026",
              border: "1px solid", borderColor: isActive ? "#0A84FF60" : isDone ? "#30D15840" : "#30363D",
              color: isActive ? "#0A84FF" : isDone ? "#30D158" : "#8E8E93" }}>
              <Icon size={10} />
              {agent.label}
              {isActive && <div style={{ width: "5px", height: "5px", borderRadius: "50%",
                background: "#0A84FF", animation: "pulse 1s ease-in-out infinite" }} />}
              {isDone && <Check size={10} />}
            </div>
            {i < agents.length - 1 && (
              <div style={{ width: "20px", height: "1px", background: isDone ? "#30D15840" : "#30363D" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN ASSISTANT COMPONENT
// ══════════════════════════════════════════════════════════════

export default function Assistant() {
  const [conversations, setConversations] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [backendConnected, setBackendConnected] = useState(false);
  const [llmProvider, setLlmProvider] = useState("");

  // Thinking & tool state
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingRoute, setThinkingRoute] = useState(null);
  const [activeTools, setActiveTools] = useState([]);
  const [currentSender, setCurrentSender] = useState(null);

  // Model selector only (no persona)
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinkingSteps, activeTools, isTyping]);

  useEffect(() => {
    fetchConversations();
    fetchModels();
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  async function checkHealth() {
    try {
      const resp = await fetch(`${API_BASE}/health`);
      setBackendConnected(resp.ok);
      if (resp.ok) {
        const data = await resp.json();
        setLlmProvider(data.provider || "");
        if (data.provider === "openrouter") {
          setSelectedModel(data.model || "claude-3-5-sonnet");
        }
      }
    } catch { setBackendConnected(false); }
  }

  async function fetchConversations() {
    try {
      const resp = await fetch(`${API_BASE}/conversations`);
      if (resp.ok) {
        const data = await resp.json();
        setConversations(data.conversations || []);
      }
    } catch { /* backend not up yet */ }
  }

  async function fetchModels() {
    try {
      const resp = await fetch(`${API_BASE}/models`);
      if (resp.ok) {
        const data = await resp.json();
        const available = data.models || [];
        setModels(available);
        if (available.length > 0 && llmProvider !== "openrouter") {
          setSelectedModel(available[0].name);
        }
      }
    } catch { /* API not up */ }
  }

  const createNewConversation = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Conversation" }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setActiveThreadId(data.thread_id);
        setMessages([]);
        setThinkingSteps([]); setActiveTools([]); setIsThinking(false);
        setThinkingRoute(null); setCurrentSender(null);
        fetchConversations();
      }
    } catch {
      const id = crypto.randomUUID();
      setActiveThreadId(id);
      setMessages([]);
    }
  }, []);

  const switchConversation = useCallback(async (threadId) => {
    setActiveThreadId(threadId);
    setMessages([]); setThinkingSteps([]); setActiveTools([]);
    setIsThinking(false); setThinkingRoute(null); setCurrentSender(null);
    try {
      const resp = await fetch(`${API_BASE}/conversations/${threadId}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.messages?.length > 0) {
          setMessages(data.messages.map((m) => ({ role: m.role, content: m.content })));
        }
      }
    } catch { /* */ }
  }, []);

  const deleteConversation = useCallback(async (threadId, e) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/conversations/${threadId}`, { method: "DELETE" });
      if (activeThreadId === threadId) { setActiveThreadId(null); setMessages([]); }
      fetchConversations();
    } catch { /* */ }
  }, [activeThreadId]);

  const handleSend = async (overrideMsg) => {
    const userMessage = (overrideMsg || input).trim();
    if (!userMessage || isTyping) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "44px";

    let threadId = activeThreadId;
    if (!threadId) {
      threadId = crypto.randomUUID();
      setActiveThreadId(threadId);
    }

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsTyping(true);
    setThinkingSteps([]); setIsThinking(true); setThinkingRoute(null);
    setActiveTools([]); setCurrentSender(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "", isStreaming: true }]);

    try {
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          session_id: threadId,
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
              case "thought":
                setThinkingSteps((prev) => [...prev, payload.content]);
                break;
              case "thinking_end":
                setIsThinking(false);
                setThinkingRoute(payload.route || null);
                if (payload.content) setThinkingSteps((prev) => [...prev, payload.content]);
                break;
              case "agent_start":
                setCurrentSender(payload.agent);
                break;
              case "tool_start":
                setActiveTools((prev) => [...prev, {
                  name: payload.tool_name, args: payload.args_preview,
                  status: "running", result: null,
                }]);
                break;
              case "tool_end":
                setActiveTools((prev) => {
                  const updated = [...prev];
                  const idx = updated.findLastIndex((t) => t.name === payload.tool_name && t.status === "running");
                  if (idx >= 0) updated[idx] = { ...updated[idx], status: "success", result: payload.result_preview };
                  return updated;
                });
                break;
              case "token":
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  const lastIdx = newMsgs.length - 1;
                  newMsgs[lastIdx] = { ...newMsgs[lastIdx], content: newMsgs[lastIdx].content + payload.content };
                  return newMsgs;
                });
                break;
              case "error":
                toast.error(payload.content || "Agent encountered an error");
                break;
              case "fallback":
                toast(payload.content || "Switched to local fallback.", { icon: "⚠️", style: { background: "#FF9F0A", color: "#000" } });
                break;
              case "end":
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], isStreaming: false };
                  return newMsgs;
                });
                break;
            }
          } catch (err) { console.error("SSE parse error", err, dataStr); }
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Connection failed. Is the FastAPI backend running on :8001?");
    } finally {
      setIsTyping(false);
      setIsThinking(false);
      setCurrentSender(null);
      setMessages((prev) => {
        const newMsgs = [...prev];
        if (newMsgs.length > 0) {
          newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], isStreaming: false };
        }
        return newMsgs;
      });
      fetchConversations();
    }
  };

  const handleTextareaChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = "44px";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  const filteredConvos = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
  const isCurrentlyTyping = isTyping;
  const isLastMsgAI = messages.length > 0 && messages[messages.length - 1].role === "assistant";

  return (
    <div className="page-content" style={{ padding: 0, overflow: "hidden" }}>
      <style>{`
        @keyframes progressSlide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
      <div className="chat-layout">

        {/* ════════════ SIDEBAR ════════════ */}
        <div className={`chat-sidebar ${sidebarOpen ? "" : "collapsed"}`}>
          <div className="chat-sidebar-header">
            <h3>Conversations</h3>
            <button className="chat-new-btn" onClick={createNewConversation} title="New conversation">
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
                    <MessageSquare size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
                    <span className="chat-sidebar-item-title">{c.title}</span>
                    <span className="chat-sidebar-item-meta">{timeAgo(c.updated_at)}</span>
                    <div className="chat-sidebar-item-actions">
                      <button onClick={(e) => deleteConversation(c.thread_id, e)} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {filteredConvos.length === 0 && (
              <div style={{ padding: "20px 16px", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
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
              <button onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{ background: "none", border: "none", color: "var(--text-muted)",
                  cursor: "pointer", display: "flex", padding: "4px" }}>
                {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
              </button>
              <div>
                <div style={{ fontSize: "16px", fontWeight: 600 }}>Gordan Belfort AI</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  LangGraph · {llmProvider === "openrouter" ? "OpenRouter Multi-Agent Network" : (selectedModel || "Ollama")} · 35+ Tools · Mem0 Memory
                </div>
              </div>
            </div>
            <div className="chat-header-right">
              {/* Model Selector */}
              {llmProvider === "openrouter" ? (
                <div style={{ background: "#1C2026", padding: "6px 12px", border: "1px solid #30363D", borderRadius: "8px", fontSize: "12px", fontWeight: 500, color: "#E0E0E0" }}>
                  OpenRouter · {selectedModel || "claude-3-5-sonnet"}
                </div>
              ) : models.length > 0 && (
                <select className="chat-select" value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)} title="Select model">
                  {models.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              )}

              {/* Status badge */}
              <div className={`chat-status-badge ${backendConnected ? "connected" : "disconnected"}`}>
                <Activity size={12} />
                {backendConnected ? "Live" : "Offline"}
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
                  Your elite quantitative finance copilot. Backtests, Monte Carlo simulations,
                  GARCH models, ML predictions, portfolio optimization, and real-time NSE + IBKR data.
                  Powered by 35+ specialized tools and semantic memory.
                </div>
                <div className="chat-suggestion-grid">
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} className="chat-suggestion" onClick={() => handleSend(s.msg)}>
                      {s.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                <div className={`chat-avatar ${msg.role === "user" ? "user-avatar" : "ai-avatar"}`}>
                  {msg.role === "user" ? <User size={16} color="#fff" /> : <Bot size={16} color="#fff" />}
                </div>
                <div className={`chat-bubble ${msg.role === "user" ? "user-bubble" : "ai-bubble"}`}>
                  {msg.role === "user" ? (
                    <div style={{ lineHeight: 1.6 }}>{msg.content}</div>
                  ) : (
                    <>
                      {/* Agent pipeline (for latest streaming message) */}
                      {i === messages.length - 1 && isCurrentlyTyping && (
                        <AgentPipeline sender={currentSender} isTyping={isCurrentlyTyping} />
                      )}

                      {/* Thinking accordion */}
                      {i === messages.length - 1 && thinkingSteps.length > 0 && (
                        <ThinkingAccordion steps={thinkingSteps} isThinking={isThinking} route={thinkingRoute} />
                      )}

                      {/* Tool timeline */}
                      {i === messages.length - 1 && activeTools.length > 0 && (
                        <ToolTimeline tools={activeTools} />
                      )}

                      {/* Message content */}
                      {msg.content && (
                        <>
                          <MessageContent content={msg.content} />
                          {/* Copy button */}
                          {!msg.isStreaming && (
                            <button onClick={() => copyToClipboard(msg.content)}
                              style={{ display: "flex", alignItems: "center", gap: "4px",
                                background: "none", border: "1px solid #30363D", borderRadius: "6px",
                                padding: "4px 10px", cursor: "pointer", color: "#8E8E93",
                                fontSize: "11px", marginTop: "8px", transition: "all 0.15s" }}>
                              <Copy size={11} /> Copy response
                            </button>
                          )}
                        </>
                      )}

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
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 16px",
                fontSize: "12px", fontWeight: 500, color: "var(--text-muted)", marginBottom: "4px" }}>
                {isThinking ? (
                  <>
                    <Brain className="spin" size={14} style={{ color: "var(--accent-blue)" }} />
                    <span style={{ color: "var(--accent-blue)" }}>
                      {currentSender ? `${currentSender.replace("_", " ")} is working...` : "AI is thinking..."}
                    </span>
                  </>
                ) : activeTools.filter(t => t.status === "running").length > 0 ? (
                  <>
                    <Wrench className="spin" size={14} style={{ color: "var(--accent-yellow)" }} />
                    <span style={{ color: "var(--accent-yellow)" }}>
                      Running: {activeTools.find(t => t.status === "running")?.name}...
                    </span>
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
                placeholder={isTyping
                  ? "Please wait for the AI to finish..."
                  : "Backtest a strategy, analyze my portfolio, forecast prices, run an ML model..."}
                rows={1}
                disabled={isTyping}
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
              <div className="chat-input-meta-item"><Brain size={12} /> Chain-of-Thought</div>
              <div className="chat-input-meta-item"><Wrench size={12} /> 35+ Tools</div>
              <div className="chat-input-meta-item"><Database size={12} /> Mem0 Memory</div>
              <div className="chat-input-meta-item"><BarChart3 size={12} /> Charts + Mermaid</div>
              <div className="chat-input-meta-item"><Shield size={12} /> Risk Engine</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
