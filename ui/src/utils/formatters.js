export function fmtINR(n) {
  if (!n) return "₹0.00";
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function fmtUSD(n, rate) {
  if (!n) return "$0.00";
  const v = n / rate;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function fmtVal(n, currency, rate) {
  return currency === "INR" ? fmtINR(n) : fmtUSD(n, rate);
}
