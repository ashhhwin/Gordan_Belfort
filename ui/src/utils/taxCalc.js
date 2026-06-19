import { differenceInDays, parseISO } from 'date-fns';

/**
 * Calculates tax implications and net post-tax profit for a holding.
 * 
 * @param {Object} holding - The holding object from userManager
 * @param {Object} config - The master family config containing taxRates
 * @returns {Object} - Tax metrics: { holdingPeriodDays, taxType, taxRate, taxAmount, netProfit, netProfitPct, isLongTerm }
 */
export function calculateTaxMetrics(holding, config) {
  const { qty, avgBuy, cmp, buyDate, assetClass } = holding;
  
  const investedValue = qty * avgBuy;
  // If CMP is not available (e.g. proxy removed), fallback to avgBuy so profit is 0
  const currentPrice = cmp !== undefined ? cmp : avgBuy;
  const currentValue = qty * currentPrice;
  const grossProfit = currentValue - investedValue;
  
  if (!buyDate || !config || !config.taxRates) {
    return {
      holdingPeriodDays: 0,
      taxType: 'Unknown',
      taxRate: 0,
      taxAmount: 0,
      netProfit: grossProfit,
      netProfitPct: investedValue ? (grossProfit / investedValue) * 100 : 0,
      isLongTerm: false
    };
  }

  const daysHeld = differenceInDays(new Date(), parseISO(buyDate));
  
  // Define holding period thresholds
  let isLongTerm;
  let stcgRate;
  let ltcgRate;

  switch (assetClass) {
    case 'IND_EQUITY':
    case 'MF':
      isLongTerm = daysHeld >= 365; // 1 year for Indian equity
      stcgRate = config.taxRates.indiaSTCG || 20;
      ltcgRate = config.taxRates.indiaLTCG || 12.5;
      break;
    case 'US_EQUITY':
      isLongTerm = daysHeld >= 365; // 1 year for US equity
      stcgRate = config.taxRates.usSTCG || 30;
      ltcgRate = config.taxRates.usLTCG || 20;
      break;
    case 'CRYPTO':
      isLongTerm = false; // Usually flat rate
      stcgRate = 30; // Hardcoded flat 30% for crypto MVP
      ltcgRate = 30;
      break;
    default:
      isLongTerm = daysHeld >= 365;
      stcgRate = config.taxRates.indiaSTCG || 20;
      ltcgRate = config.taxRates.indiaLTCG || 12.5;
  }

  const taxRate = isLongTerm ? ltcgRate : stcgRate;
  const taxType = isLongTerm ? 'LTCG' : 'STCG';
  
  // Tax is only applicable on profit
  const taxAmount = grossProfit > 0 ? grossProfit * (taxRate / 100) : 0;
  
  const netProfit = grossProfit - taxAmount;
  const netProfitPct = investedValue ? (netProfit / investedValue) * 100 : 0;

  return {
    holdingPeriodDays: daysHeld,
    taxType,
    taxRate,
    taxAmount,
    netProfit,
    netProfitPct,
    isLongTerm
  };
}
