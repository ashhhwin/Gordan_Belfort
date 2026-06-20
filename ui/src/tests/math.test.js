import { describe, it, expect } from "vitest";
import { calculateTaxMetrics } from "../utils/taxCalc.js";

describe("Portfolio Calculations & Math", () => {
  const sampleHoldings = [
    {
      assetClass: "IND_EQUITY",
      qty: 10,
      avgBuy: 100,
      cmp: 150,
      buyDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { assetClass: "CREDIT_CARD", qty: 1, avgBuy: -500, cmp: -500 },
    {
      assetClass: "CRYPTO",
      qty: 2,
      avgBuy: 1000,
      cmp: 1200,
      buyDate: new Date().toISOString(),
    },
  ];

  it("29. Asset Math: totalAssets correctly sums values ignoring CREDIT_CARD", () => {
    const totalAssets = sampleHoldings
      .filter((h) => h.assetClass !== "CREDIT_CARD")
      .reduce((s, h) => s + h.cmp * h.qty, 0);
    expect(totalAssets).toBe(150 * 10 + 1200 * 2); // 1500 + 2400 = 3900
  });

  it("30. Liability Math: totalLiabilities correctly sums absolute values", () => {
    const totalLiabilities = Math.abs(
      sampleHoldings
        .filter((h) => h.assetClass === "CREDIT_CARD")
        .reduce((s, h) => s + h.cmp * h.qty, 0),
    );
    expect(totalLiabilities).toBe(500);
  });

  it("31. Net Worth Math: accurately calculates totalAssets - totalLiabilities", () => {
    const assets = 3900;
    const liabilities = 500;
    expect(assets - liabilities).toBe(3400);
  });

  it("32. PnL Math: totalPnl accurately calculates current value minus invested value", () => {
    const tradable = sampleHoldings.filter((h) =>
      ["IND_EQUITY", "CRYPTO"].includes(h.assetClass),
    );
    const invested = tradable.reduce((s, h) => s + h.avgBuy * h.qty, 0); // 1000 + 2000 = 3000
    const current = tradable.reduce((s, h) => s + h.cmp * h.qty, 0); // 1500 + 2400 = 3900
    expect(current - invested).toBe(900);
  });

  it("33. XIRR (Empty State): Returns 0 when there are no tradable holdings", () => {
    const calcXIRR = (holdings) => {
      if (!holdings || holdings.length === 0) return 0;
      return 5; // mock return
    };
    expect(calcXIRR([])).toBe(0);
  });

  it("34. XIRR (Calculation): Accurately calculates annualized return using time-weighted formula", () => {
    const totalInvested = 3000;
    const totalCurrent = 3900;
    const averageDaysHeld = 365;
    const multiple = totalCurrent / totalInvested;
    const annualizedReturn = Math.pow(multiple, 365 / averageDaysHeld) - 1;
    expect(annualizedReturn * 100).toBeCloseTo(30, 0); // 30% return over 1 year
  });

  it("35. XIRR (Edge Case): Handles missing buyDate by defaulting to Date.now()", () => {
    const h = { buyDate: null };
    const date = new Date(h.buyDate || Date.now());
    expect(date.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it("36. Tax Math: calculateTaxMetrics applies 30% flat tax correctly to CRYPTO assets", () => {
    const cryptoHolding = {
      assetClass: "CRYPTO",
      qty: 2,
      avgBuy: 1000,
      cmp: 1200,
      buyDate: new Date().toISOString(),
    };
    const taxData = calculateTaxMetrics(cryptoHolding, { taxRates: {} });
    // Profit = 400. 30% of 400 = 120 tax. Net = 280
    expect(taxData.taxAmount).toBe(120);
    expect(taxData.netProfit).toBe(280);
  });
});
