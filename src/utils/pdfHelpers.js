import { getCompanyProfile, requireCompanyField } from '../services/companyProfile.js';

/**
 * Converts a number to Indian Currency Words
 * Example: 764994 -> "Seven Lakh, Sixty-Four Thousand, Nine Hundred Ninety-Four Rupees and Zero Paise Only"
 */
export function numberToWords(num) {
  if (num === null || num === undefined || isNaN(num)) return "Zero Rupees and Zero Paise Only";
  
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n) => {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? '-' + a[digit] : '');
  };

  const convert = (n) => {
    if (n === 0) return 'Zero';
    let str = '';
    if (Math.floor(n / 10000000) > 0) {
      str += convert(Math.floor(n / 10000000)) + ' Crore ';
      n %= 10000000;
    }
    if (Math.floor(n / 100000) > 0) {
      str += convert(Math.floor(n / 100000)) + ' Lakh ';
      n %= 100000;
    }
    if (Math.floor(n / 1000) > 0) {
      str += convert(Math.floor(n / 1000)) + ' Thousand ';
      n %= 1000;
    }
    if (Math.floor(n / 100) > 0) {
      str += convert(Math.floor(n / 100)) + ' Hundred ';
      n %= 100;
    }
    if (n > 0) {
      if (str !== '') str += ' ';
      str += inWords(n) + ' ';
    }
    return str.trim();
  };

  const rupees = Math.floor(Math.abs(num));
  const paise = Math.round((Math.abs(num) - rupees) * 100);

  let result = convert(rupees) + ' Rupees';
  if (paise > 0) {
    result += ' and ' + convert(paise) + ' Paise';
  } else {
    result += ' and Zero Paise';
  }
  return result + ' Only';
}

/**
 * Format currency to Indian standard (e.g. ₹7,64,994.00)
 */
export function formatMoney(amount, profile) {
  const source = profile || getCompanyProfile();
  const locale = String(requireCompanyField(source, 'locale'));
  const currency = String(requireCompanyField(source, 'currency'));
  const num = parseFloat(amount) || 0;
  const isNegative = num < 0;
  const formatted = Math.abs(num).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency === 'INR') return `${isNegative ? '- ₹' : '₹'}${formatted}`;
  return `${isNegative ? '-' : ''}${currency} ${formatted}`;
}

export function formatINR(amount) {
  return formatMoney(amount);
}

/**
 * GST from the party GSTIN state code and the plant GSTIN state code.
 * A missing party GSTIN does not guess from city names. Pass taxTypeOverride
 * 'igst' or 'cgst_sgst' when the party has no GSTIN. The rate is required.
 */
export function configuredGstRate(explicit) {
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    const number = Number(explicit);
    if (!Number.isFinite(number) || number < 0) {
      throw new Error('GST rate is not a number. Set defaultGstRatePct on the company profile or a line gstRatePct.');
    }
    return number;
  }
  const rate = Number(requireCompanyField(getCompanyProfile(), 'defaultGstRatePct'));
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error('Company profile is missing defaultGstRatePct. Set it in Document Settings.');
  }
  return rate;
}

export function calculateGSTBreakdown(gstin = '', address = '', taxableAmount = 0, totalGstRatePct, plantGstin = '', taxTypeOverride = 'auto') {
  const taxable = parseFloat(taxableAmount) || 0;
  const ratePct = Number(totalGstRatePct);
  if (!Number.isFinite(ratePct) || ratePct < 0) {
    throw new Error('GST rate is not configured. Set defaultGstRatePct on the company profile or a line gstRatePct.');
  }

  const partyGstinClean = String(gstin || '').trim();
  const partyStateCode = partyGstinClean.substring(0, 2);
  const plant = String(plantGstin || '').trim();
  if (!plant) {
    throw new Error('Company GSTIN is missing. Set the company profile before calculating tax.');
  }
  const plantStateCode = plant.substring(0, 2);

  let isIntraState = false;
  const override = String(taxTypeOverride || 'auto').toLowerCase();

  if (override === 'igst') {
    isIntraState = false;
  } else if (override === 'cgst_sgst' || override === 'cgst') {
    isIntraState = true;
  } else if (/^\d{2}/.test(partyGstinClean)) {
    isIntraState = partyStateCode === plantStateCode;
  } else {
    throw new Error('Party GSTIN is missing. Choose IGST or CGST+SGST explicitly. Place of supply is not guessed from the city.');
  }
  void address;

  if (isIntraState) {
    const halfRate = ratePct / 2;
    const cgstAmount = (taxable * halfRate) / 100;
    const sgstAmount = (taxable * halfRate) / 100;
    const totalGstAmount = cgstAmount + sgstAmount;
    const rawGrandTotal = taxable + totalGstAmount;
    const roundedGrandTotal = Math.round(rawGrandTotal);
    const roundOff = +(roundedGrandTotal - rawGrandTotal).toFixed(2);
    
    return {
      isIntraState: true,
      type: 'INTRA_STATE',
      label: `Intra-State Supply (CGST ${halfRate}% + SGST ${halfRate}%)`,
      cgstRatePct: halfRate,
      cgstAmount: cgstAmount,
      sgstRatePct: halfRate,
      sgstAmount: sgstAmount,
      igstRatePct: 0,
      igstAmount: 0,
      totalGstAmount: totalGstAmount,
      rawGrandTotal: rawGrandTotal,
      roundOff: roundOff,
      grandTotal: roundedGrandTotal
    };
  } else {
    const igstAmount = (taxable * ratePct) / 100;
    const rawGrandTotal = taxable + igstAmount;
    const roundedGrandTotal = Math.round(rawGrandTotal);
    const roundOff = +(roundedGrandTotal - rawGrandTotal).toFixed(2);
    
    return {
      isIntraState: false,
      type: 'INTER_STATE',
      label: 'Inter-State Supply (IGST Interstate Transaction)',
      cgstRatePct: 0,
      cgstAmount: 0,
      sgstRatePct: 0,
      sgstAmount: 0,
      igstRatePct: ratePct,
      igstAmount: igstAmount,
      totalGstAmount: igstAmount,
      rawGrandTotal: rawGrandTotal,
      roundOff: roundOff,
      grandTotal: roundedGrandTotal
    };
  }
}

/**
 * Capitalizes the first letter of every word in a string while preserving all-caps acronyms
 * Example: "RK enterprises" -> "RK Enterprises"
 * Example: "sonu jaljeera shots inner" -> "Sonu Jaljeera Shots Inner"
 */
export function toTitleCase(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str.split(/(\s+)/).map(part => {
    if (/\s+/.test(part)) return part;
    if (part === part.toUpperCase()) return part;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join('');
}

