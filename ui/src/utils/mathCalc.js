export function calculateXIRR(cashFlows) {
  // cashFlows: Array of { amount: number, date: Date }
  // amount < 0 for investments/deposits, amount > 0 for withdrawals/current value
  if (!cashFlows || cashFlows.length < 2) return 0;

  // Filter out any 0 amounts to avoid division by zero or empty impacts
  const validFlows = cashFlows.filter(cf => cf.amount !== 0);
  if (validFlows.length < 2) return 0;

  // Sort by date
  validFlows.sort((a, b) => a.date - b.date);

  const t0 = validFlows[0].date;
  const daysInYear = 365.25;
  const tolerance = 1e-6;
  const maxIterations = 100;
  
  // Check if we have both positive and negative flows
  const hasPos = validFlows.some(f => f.amount > 0);
  const hasNeg = validFlows.some(f => f.amount < 0);
  if (!hasPos || !hasNeg) return 0; // XIRR undefined if flows are all same sign

  // NPV function
  const npv = (r) => {
    return validFlows.reduce((acc, cf) => {
      const days = (cf.date - t0) / (1000 * 60 * 60 * 24);
      return acc + cf.amount / Math.pow(1 + r, days / daysInYear);
    }, 0);
  };

  // Derivative of NPV with respect to r
  const dNpv = (r) => {
    return validFlows.reduce((acc, cf) => {
      const days = (cf.date - t0) / (1000 * 60 * 60 * 24);
      const t = days / daysInYear;
      return acc - (t * cf.amount) / Math.pow(1 + r, t + 1);
    }, 0);
  };

  // Newton-Raphson iteration
  let rate = 0.1; // Initial guess 10%
  for (let i = 0; i < maxIterations; i++) {
    const f = npv(rate);
    const df = dNpv(rate);
    
    // Prevent division by extremely small derivative
    if (Math.abs(df) < 1e-10) {
        break;
    }

    const newRate = rate - f / df;
    
    if (Math.abs(newRate - rate) < tolerance) {
      return newRate * 100; // Return as percentage
    }
    rate = newRate;
  }

  // If failed to converge, fallback to simple CAGR using first and last
  const first = validFlows[0];
  const last = validFlows[validFlows.length - 1];
  const totalInvested = Math.abs(validFlows.filter(f => f.amount < 0).reduce((s, f) => s + f.amount, 0));
  const finalValue = validFlows.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  
  if (totalInvested <= 0) return 0;
  
  const years = (last.date - first.date) / (1000 * 60 * 60 * 24 * 365.25);
  if (years <= 0) return 0;
  
  return (Math.pow(finalValue / totalInvested, 1 / years) - 1) * 100;
}
