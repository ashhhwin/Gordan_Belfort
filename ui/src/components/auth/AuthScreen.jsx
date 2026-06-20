import { useState, useEffect, useCallback, useRef } from "react";
import { Fingerprint, KeyRound } from "lucide-react";
import { useStore } from "../../store";



// ─── PIN keypad ───────────────────────────────────────────────────────────────
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
function PinKeypad({ onKey, disabled }) {
  return (
    <div className="pin-keypad">
      {KEYS.map((k, i) => (
        <button
          key={i}
          className={`pin-key ${k === "⌫" ? "del" : ""} ${k === "" ? "empty" : ""}`}
          onClick={() => k !== "" && onKey(k)}
          disabled={disabled || k === ""}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

// ─── Dot row ──────────────────────────────────────────────────────────────────
function PinDots({ filled, status }) {
  return (
    <div className="pin-dots">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className={`pin-dot ${i < filled ? (status === "error" ? "error" : "filled") : ""}`}
        />
      ))}
    </div>
  );
}

// ─── Touch ID button ──────────────────────────────────────────────────────────
function TouchIdButton({ status, onClick, disabled }) {
  const color =
    {
      idle: "var(--text-muted)",
      scanning: "var(--accent-blue)",
      success: "var(--accent-green)",
      error: "var(--accent-red)",
    }[status] ?? "var(--text-muted)";

  const ringClass =
    { idle: "idle", scanning: "scanning", success: "success", error: "error" }[
      status
    ] ?? "";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`biometric-ring ${ringClass}`}
      title="Authenticate with Touch ID"
      style={{
        background: "none",
        border: `none`,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <Fingerprint
        size={56}
        color={color}
        strokeWidth={1.2}
        style={{ transition: "color 0.4s ease" }}
      />
    </button>
  );
}

// ─── Particle Background ──────────────────────────────────────────────────────
class Particle {
  constructor(x, y, dx, dy, size, canvasWidth, canvasHeight, mouseRef) {
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.size = size;
    this.baseX = this.x;
    this.baseY = this.y;
    this.density = Math.random() * 30 + 1;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.mouseRef = mouseRef;
  }
  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fill();
  }
  update(ctx) {
    let dx = this.mouseRef.x - this.x;
    let dy = this.mouseRef.y - this.y;
    let distance = Math.sqrt(dx * dx + dy * dy);
    let forceDirectionX = dx / distance;
    let forceDirectionY = dy / distance;
    let maxDistance = this.mouseRef.radius;
    let force = (maxDistance - distance) / maxDistance;
    let directionX = forceDirectionX * force * this.density;
    let directionY = forceDirectionY * force * this.density;

    if (distance < this.mouseRef.radius && this.mouseRef.x !== null) {
      this.x -= directionX;
      this.y -= directionY;
    } else {
      if (this.x !== this.baseX) {
        let dx = this.x - this.baseX;
        this.x -= dx / 15;
      }
      if (this.y !== this.baseY) {
        let dy = this.y - this.baseY;
        this.y -= dy / 15;
      }
    }

    this.baseX += this.dx;
    this.baseY += this.dy;
    if (this.baseX < 0 || this.baseX > this.canvasWidth) this.dx = -this.dx;
    if (this.baseY < 0 || this.baseY > this.canvasHeight) this.dy = -this.dy;

    this.draw(ctx);
  }
}

const ParticleBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    let particles = [];
    let mouse = { x: null, y: null, radius: 100 };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      init();
    };

    const init = () => {
      particles = [];
      let numberOfParticles = (canvas.width * canvas.height) / 10000;
      for (let i = 0; i < numberOfParticles; i++) {
        let x = Math.random() * canvas.width;
        let y = Math.random() * canvas.height;
        let directionX = (Math.random() - 0.5) * 0.5;
        let directionY = (Math.random() - 0.5) * 0.5;
        let size = Math.random() * 2;
        particles.push(
          new Particle(
            x,
            y,
            directionX,
            directionY,
            size,
            canvas.width,
            canvas.height,
            mouse
          )
        );
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        particles[i].update(ctx);
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", (e) => {
      mouse.x = e.x;
      mouse.y = e.y;
    });
    window.addEventListener("mouseout", () => {
      mouse.x = null;
      mouse.y = null;
    });

    resize();
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", null);
      window.removeEventListener("mouseout", null);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas id="particles-canvas" ref={canvasRef} />;
};

// ─── Main AuthScreen ──────────────────────────────────────────────────────────
export default function AuthScreen() {
  const {
    authMode,
    setAuthMode,
    isFirstRun,
    touchIdAvailable,
    registerTouchId,
    verifyTouchId,
    verifyPin,
    setPin,
    authError,
    users,
    activeUser,
    selectUser,
    usdInr,
    syncStatus,
    earnings,
    totalDayGain,
  } = useStore();

  const [pin, setLocalPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStep, setPinStep] = useState("enter");
  const [touchStatus, setTouchStatus] = useState("idle");
  const [hint, setHint] = useState("");
  const [time, setTime] = useState(new Date());
  const [tickerData, setTickerData] = useState(null);
  const [sectorData, setSectorData] = useState([]);
  const [inSectorData, setInSectorData] = useState([]);
  const [weather, setWeather] = useState(null);


  // Clock tick
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Weather
  useEffect(() => {
    async function fetchWeather() {
      try {
        const ipRes = await fetch("https://ipapi.co/json/");
        const ipData = await ipRes.json();
        if (ipData.latitude && ipData.longitude) {
          const wRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${ipData.latitude}&longitude=${ipData.longitude}&current_weather=true&temperature_unit=celsius`,
          );
          const wData = await wRes.json();
          setWeather(wData.current_weather);
        }
      } catch (e) {
        console.error("Weather fetch failed", e);
      }
    }
    fetchWeather();
  }, []);

  const getWeatherIcon = (code) => {
    if (code === 0) return "☀️";
    if (code >= 1 && code <= 3) return "🌤️";
    if (code >= 45 && code <= 48) return "🌫️";
    if (code >= 51 && code <= 67) return "🌧️";
    if (code >= 71 && code <= 77) return "❄️";
    if (code >= 95 && code <= 99) return "⛈️";
    return "☁️";
  };

  // Fetch Live Ticker Data
  useEffect(() => {
    async function fetchTicker() {
      // Added INR=X back to fetch previous close for % calculation
      const symbols = [
        "SPY",
        "QQQ",
        "^IXIC",
        "^RUT",
        "^NSEI",
        "^BSESN",
        "^VIX",
        "GC=F",
        "CL=F",
        "BTC-USD",
        "ETH-USD",
        "INR=X",
      ];
      const labels = {
        SPY: "SPY",
        QQQ: "QQQ",
        "^IXIC": "NASDAQ",
        "^RUT": "RUT 2K",
        "^NSEI": "NIFTY50",
        "^BSESN": "SENSEX",
        "^VIX": "VIX",
        "GC=F": "GOLD",
        "CL=F": "CRUDE",
        "BTC-USD": "BTC",
        "ETH-USD": "ETH",
        "INR=X": "USD/INR",
      };

      try {
        const results = await Promise.all(
          symbols.map(async (sym) => {
            try {
              const res = await fetch(
                `/api/yahoo/v8/finance/chart/${sym}?interval=1d&range=2d`,
              );
              const data = await res.json();
              const result = data?.chart?.result?.[0];
              if (!result) throw new Error("No data");
              const meta = result.meta;

              let price = meta.regularMarketPrice;
              const prev = meta.chartPreviousClose || price;

              // If it's USD/INR, override the current price with the app's global store value
              // so there is no discrepancy, but use Yahoo's prev close to calculate the % change!
              if (sym === "INR=X" && usdInr) {
                price = usdInr;
              }

              const change = price - prev;
              const pct = prev ? (change / prev) * 100 : 0;
              return {
                label: labels[sym],
                price: price,
                pct: pct,
              };
            } catch (e) {
              console.error(`Failed to fetch ${sym}:`, e);
              return null;
            }
          }),
        );

        setTickerData(results.filter((r) => r !== null));

        // Fetch US Sector ETFs for Heatmap
        const usSectorSymbols = [
          "XLK",
          "XLV",
          "XLF",
          "XLY",
          "XLC",
          "XLI",
          "XLP",
          "XLE",
          "XLU",
          "XLRE",
          "XLB",
        ];
        const usSectorLabels = {
          XLK: "TEC",
          XLV: "HEA",
          XLF: "FIN",
          XLY: "CND",
          XLC: "COM",
          XLI: "IND",
          XLP: "STP",
          XLE: "ENE",
          XLU: "UTL",
          XLRE: "REL",
          XLB: "MAT",
        };
        const usResults = await Promise.all(
          usSectorSymbols.map(async (sym) => {
            try {
              const res = await fetch(
                `/api/yahoo/v8/finance/chart/${sym}?interval=1d&range=2d`,
              );
              const data = await res.json();
              const result = data?.chart?.result?.[0];
              if (!result) return null;
              const meta = result.meta;
              const price = meta.regularMarketPrice;
              const prev = meta.chartPreviousClose || price;
              const pct = prev ? ((price - prev) / prev) * 100 : 0;
              return { symbol: sym, label: usSectorLabels[sym], pct };
            } catch {
              return null;
            }
          }),
        );
        setSectorData(usResults.filter((r) => r !== null));

        // Fetch IND Sector Indices for Heatmap
        const inSectorSymbols = [
          "^CNXIT",
          "^CNXAUTO",
          "^CNXFIN",
          "^CNXFMCG",
          "^CNXMETAL",
          "^CNXPHARMA",
          "^CNXPSUBANK",
          "^CNXREALTY",
          "^CNXENERGY",
          "^CNXINFRA",
          "^CNXMEDIA",
        ];
        const inSectorLabels = {
          "^CNXIT": "IT",
          "^CNXAUTO": "AUT",
          "^CNXFIN": "FIN",
          "^CNXFMCG": "FMG",
          "^CNXMETAL": "MET",
          "^CNXPHARMA": "PHA",
          "^CNXPSUBANK": "PSU",
          "^CNXREALTY": "REL",
          "^CNXENERGY": "ENE",
          "^CNXINFRA": "INF",
          "^CNXMEDIA": "MED",
        };
        const inResults = await Promise.all(
          inSectorSymbols.map(async (sym) => {
            try {
              const res = await fetch(
                `/api/yahoo/v8/finance/chart/${sym}?interval=1d&range=2d`,
              );
              const data = await res.json();
              const result = data?.chart?.result?.[0];
              if (!result) return null;
              const meta = result.meta;
              const price = meta.regularMarketPrice;
              const prev = meta.chartPreviousClose || price;
              const pct = prev ? ((price - prev) / prev) * 100 : 0;
              return { symbol: sym, label: inSectorLabels[sym], pct };
            } catch {
              return null;
            }
          }),
        );
        setInSectorData(inResults.filter((r) => r !== null));
      } catch (err) {
        console.error("Ticker fetch failed", err);
      }
    }
    fetchTicker();
    const intv = setInterval(fetchTicker, 60000); // refresh every minute
    return () => clearInterval(intv);
  }, [usdInr]);

  // Auto-login single user
  useEffect(() => {
    if (users && users.length > 0 && !activeUser) {
      selectUser(users[0].id);
    }
  }, [users, activeUser, selectUser]);

  // Update hint based on mode
  useEffect(() => {
    if (authMode === "touchid") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHint(
        isFirstRun
          ? "Press fingerprint to enroll"
          : "Touch fingerprint sensor to unlock",
      );
    } else if (authMode === "pin") {
      setHint(
        isFirstRun
          ? pinStep === "confirm"
            ? "Confirm your PIN"
            : "Set a 6-digit PIN"
          : "Enter Passcode",
      );
    }
  }, [authMode, isFirstRun, pinStep]);

  // Touch ID flow
  const handleTouchId = useCallback(async () => {
    setTouchStatus("scanning");
    setHint(isFirstRun ? "Enrolling Touch ID…" : "Scanning…");

    const result = isFirstRun ? await registerTouchId() : await verifyTouchId();
    if (result.success) {
      setTouchStatus("success");
      setHint("Unlocked");
    } else {
      setTouchStatus("error");
      setHint(result.error || "Authentication failed");
      setTimeout(() => setTouchStatus("idle"), 1400);
    }
  }, [isFirstRun, registerTouchId, verifyTouchId]);

  // Auto-trigger Touch ID if returning user
  useEffect(() => {
    if (authMode === "touchid" && !isFirstRun && touchStatus === "idle") {
      const t = setTimeout(handleTouchId, 800); // slight delay for smooth entry animation
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode, isFirstRun]);

  // PIN flow
  const currentPin = pinStep === "confirm" ? confirmPin : pin;
  async function handlePinKey(k) {
    if (k === "⌫") {
      pinStep === "confirm"
        ? setConfirmPin((p) => p.slice(0, -1))
        : setLocalPin((p) => p.slice(0, -1));
      return;
    }
    const next = currentPin + k;
    if (next.length > 6) return;

    pinStep === "confirm" ? setConfirmPin(next) : setLocalPin(next);

    if (next.length === 6) {
      if (isFirstRun) {
        if (pinStep === "enter") {
          setPinStep("confirm");
        } else {
          if (next === pin) await setPin(pin);
          else {
            setHint("PINs don't match — start over");
            setTimeout(() => {
              setLocalPin("");
              setConfirmPin("");
              setPinStep("enter");
            }, 1200);
          }
        }
      } else {
        const ok = await verifyPin(next);
        if (!ok)
          setTimeout(() => {
            setLocalPin("");
          }, 600);
      }
    }
  }

  // Keyboard support for PIN entry
  useEffect(() => {
    if (authMode !== "pin") return;
    const onKeyDown = (e) => {
      if (e.key >= "0" && e.key <= "9") handlePinKey(e.key);
      if (e.key === "Backspace" || e.key === "Delete") handlePinKey("⌫");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode, pinStep, currentPin, pin]);

  if (!activeUser) {
    return <div className="auth-bg" />;
  }

  const renderTickerItems = () => {
    if (!tickerData) {
      return <div className="ticker-item">CONNECTING TO LIVE FEED...</div>;
    }
    if (tickerData.length === 0) {
      return <div className="ticker-item">LIVE FEED UNAVAILABLE</div>;
    }
    return tickerData.map((t, idx) => (
      <div key={idx} className="ticker-item">
        <span className={t.pct >= 0 ? "ticker-up" : "ticker-down"}>
          {t.pct >= 0 ? "▲" : "▼"}
        </span>{" "}
        {t.label}{" "}
        {t.price < 100
          ? t.price.toFixed(2)
          : t.price.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
        <span
          style={{
            color: t.pct >= 0 ? "var(--accent-green)" : "var(--accent-red)",
            marginLeft: 4,
          }}
        >
          ({t.pct >= 0 ? "+" : ""}
          {t.pct.toFixed(2)}%)
        </span>
      </div>
    ));
  };

  const spyPct = tickerData?.find((t) => t.label === "SPY")?.pct || 0;
  const nseiPct = tickerData?.find((t) => t.label === "NIFTY50")?.pct || 0;

  return (
    <div className="auth-bg">
      <ParticleBackground />
      {/* ── Ambient Aura ── */}
      <div className="ambient-aura" />

      {/* ── System Status (Top Right) ── */}
      <div className="lock-status">
        <div className="lock-status-item">
          AI CONNECTED <div className="status-dot green" />
        </div>
        <div className="lock-status-item">
          DB LIVE <div className="status-dot green" />
        </div>
        <div className="lock-status-item">
          SYNC{" "}
          {syncStatus === "syncing"
            ? "RUNNING"
            : syncStatus === "error"
              ? "WARNING"
              : "HEALTHY"}
          <div
            className={`status-dot ${syncStatus === "error" ? "red" : syncStatus === "syncing" ? "yellow" : "green"}`}
          />
        </div>
      </div>

      {/* ── Market Events (Left Side) ── */}
      <div className="market-events">
        <h4>Today's Earnings</h4>
        {earnings &&
          earnings.slice(0, 3).map((event, idx) => (
            <div key={idx} className="event-card">
              <div className="event-title">{event.symbol || "Unknown"}</div>
              <div className="event-desc">
                {event.company_name || "Market Event"}
              </div>
            </div>
          ))}
        {(!earnings || earnings.length === 0) && (
          <div className="event-card">
            <div className="event-title">No Events</div>
            <div className="event-desc">Quiet day ahead</div>
          </div>
        )}
      </div>

      {/* ── Sector Heatmaps (Right Side) ── */}
      <div className="sector-heatmap-wrapper">
        <div className="sector-heatmap">
          <h4>USA Sectors</h4>
          <div className="heatmap-grid">
            {sectorData.length > 0
              ? sectorData.map((sec, idx) => {
                  const color =
                    sec.pct >= 0
                      ? `rgba(0, 212, 161, ${Math.min(0.2 + sec.pct / 2, 1)})`
                      : `rgba(255, 77, 106, ${Math.min(0.2 + Math.abs(sec.pct) / 2, 1)})`;
                  return (
                    <div
                      key={idx}
                      className="heatmap-square"
                      data-tooltip={`${sec.label}: ${sec.pct > 0 ? "+" : ""}${sec.pct.toFixed(2)}%`}
                      style={{ backgroundColor: color }}
                    >
                      <span className="heatmap-label">{sec.label}</span>
                      <span className="heatmap-val">
                        {sec.pct > 0 ? "+" : ""}
                        {sec.pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })
              : [...Array(11)].map((_, i) => (
                  <div
                    key={i}
                    className="heatmap-square"
                    style={{ backgroundColor: "var(--surface-light)" }}
                  />
                ))}
          </div>
        </div>

        <div className="sector-heatmap">
          <h4>IND Sectors</h4>
          <div className="heatmap-grid">
            {inSectorData.length > 0
              ? inSectorData.map((sec, idx) => {
                  const color =
                    sec.pct >= 0
                      ? `rgba(0, 212, 161, ${Math.min(0.2 + sec.pct / 2, 1)})`
                      : `rgba(255, 77, 106, ${Math.min(0.2 + Math.abs(sec.pct) / 2, 1)})`;
                  return (
                    <div
                      key={idx}
                      className="heatmap-square"
                      data-tooltip={`${sec.label}: ${sec.pct > 0 ? "+" : ""}${sec.pct.toFixed(2)}%`}
                      style={{ backgroundColor: color }}
                    >
                      <span className="heatmap-label">{sec.label}</span>
                      <span className="heatmap-val">
                        {sec.pct > 0 ? "+" : ""}
                        {sec.pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })
              : [...Array(11)].map((_, i) => (
                  <div
                    key={i}
                    className="heatmap-square"
                    style={{ backgroundColor: "var(--surface-light)" }}
                  />
                ))}
          </div>
        </div>
      </div>

      {/* ── Top: Live Clock & Date ── */}
      <div className="auth-header">
        <div className="auth-time-row">
          <div className="auth-time">
            {time.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
          {weather && (
            <div className="weather-widget">
              {getWeatherIcon(weather.weathercode)}{" "}
              {Math.round(weather.temperature)}°
            </div>
          )}
        </div>
        <div className="auth-date">
          {time.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
      </div>

      {/* ── Center: Authentication ── */}
      <div className="auth-center">
        {/* The Expanded Glimpse */}
        <div className="glimpse-badge glimpse-expanded">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--text-muted)" }}>PORTFOLIO:</span>
            <span
              style={{
                color:
                  (totalDayGain || 0) >= 0
                    ? "var(--accent-green)"
                    : "var(--accent-red)",
                fontWeight: 600,
              }}
            >
              {(totalDayGain || 0) >= 0 ? "+" : "-"}$
              {Math.abs(totalDayGain || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="glimpse-separator" />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--text-muted)" }}>USA (SPY):</span>
            <span
              style={{
                color:
                  spyPct >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                fontWeight: 600,
              }}
            >
              {spyPct >= 0 ? "+" : ""}
              {spyPct.toFixed(2)}%
            </span>
          </div>
          <div className="glimpse-separator" />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--text-muted)" }}>IND (NIFTY):</span>
            <span
              style={{
                color:
                  nseiPct >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                fontWeight: 600,
              }}
            >
              {nseiPct >= 0 ? "+" : ""}
              {nseiPct.toFixed(2)}%
            </span>
          </div>
        </div>

        <h2 className="auth-greeting">
          Welcome back, {activeUser.name.split(" ")[0]}
        </h2>

        {authMode === "touchid" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              minHeight: 200,
              zIndex: 10,
            }}
          >
            <TouchIdButton
              status={touchStatus}
              onClick={handleTouchId}
              disabled={touchStatus === "scanning" || touchStatus === "success"}
            />
            <p
              className="auth-touch-hint"
              style={{
                color:
                  touchStatus === "error"
                    ? "var(--accent-red)"
                    : touchStatus === "success"
                      ? "var(--accent-green)"
                      : "var(--text-muted)",
              }}
            >
              {hint}
            </p>
            <button
              onClick={() => setAuthMode("pin")}
              className="auth-switch-btn"
              style={{ marginTop: 32 }}
            >
              <KeyRound size={14} /> Use Passcode
            </button>
          </div>
        )}

        {authMode === "pin" && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              minHeight: 300,
              zIndex: 10,
            }}
          >
            <p
              className="auth-touch-hint"
              style={{
                marginTop: 0,
                marginBottom: 24,
                color: authError ? "var(--accent-red)" : "var(--text-muted)",
              }}
            >
              {hint}
            </p>
            <PinDots
              filled={currentPin.length}
              status={authError ? "error" : "idle"}
            />
            <PinKeypad onKey={handlePinKey} disabled={false} />
            {touchIdAvailable && (
              <button
                onClick={() => {
                  setAuthMode("touchid");
                  setLocalPin("");
                  setConfirmPin("");
                }}
                className="auth-switch-btn"
                style={{ marginTop: 12 }}
              >
                <Fingerprint size={14} /> Use Touch ID
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Quote ── */}
      <div className="quote-text">"Greed is good."</div>

      {/* ── Bottom: Ticker Tape ── */}
      <div className="ticker-wrap" style={{ zIndex: 10 }}>
        <div className="ticker-track">
          {/* Group 1 */}
          {renderTickerItems()}

          {/* Group 2 (Duplicate for infinite seamless scrolling) */}
          {renderTickerItems()}
        </div>
      </div>
    </div>
  );
}
