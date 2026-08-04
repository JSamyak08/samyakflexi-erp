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
export function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Determines Indian GST Applicability & Breakdown based on State Code (MP = "23")
 * Intra-State Supply (Within Madhya Pradesh - State Code 23): CGST 9% + SGST 9%
 * Inter-State Supply (Outside Madhya Pradesh - State Code != 23): IGST 18%
 */
export function calculateGSTBreakdown(gstin = '', address = '', taxableAmount = 0, totalGstRatePct = 18, plantGstin = '23AAACS9988F1Z1') {
  const taxable = parseFloat(taxableAmount) || 0;
  const ratePct = parseFloat(totalGstRatePct) || 18;

  const partyGstinClean = String(gstin || '').trim();
  const partyStateCode = partyGstinClean.substring(0, 2);
  const plantStateCode = String(plantGstin || '23').trim().substring(0, 2);

  const addressUpper = String(address || '').toUpperCase();
  
  // Intra-State check: Party GSTIN starts with plant state code (23) OR address contains MP locations
  let isIntraState = false;
  if (/^\d{2}/.test(partyGstinClean)) {
    isIntraState = partyStateCode === plantStateCode;
  } else {
    // Fallback on Address if GSTIN state code not present
    isIntraState = addressUpper.includes('MADHYA PRADESH') || 
                   addressUpper.includes(' M.P.') || 
                   addressUpper.includes(' MP ') || 
                   addressUpper.includes('PITHAMPUR') || 
                   addressUpper.includes('INDORE') || 
                   addressUpper.includes('BHOPAL') ||
                   addressUpper.includes('UJJAIN');
  }

  if (isIntraState) {
    const halfRate = ratePct / 2;
    const cgstAmount = (taxable * halfRate) / 100;
    const sgstAmount = (taxable * halfRate) / 100;
    const totalGstAmount = cgstAmount + sgstAmount;
    
    return {
      isIntraState: true,
      type: 'INTRA_STATE',
      label: 'Intra-State Supply (Within Madhya Pradesh)',
      cgstRatePct: halfRate,
      cgstAmount: cgstAmount,
      sgstRatePct: halfRate,
      sgstAmount: sgstAmount,
      igstRatePct: 0,
      igstAmount: 0,
      totalGstAmount: totalGstAmount,
      grandTotal: taxable + totalGstAmount
    };
  } else {
    const igstAmount = (taxable * ratePct) / 100;
    
    return {
      isIntraState: false,
      type: 'INTER_STATE',
      label: 'Inter-State Supply (Out of State)',
      cgstRatePct: 0,
      cgstAmount: 0,
      sgstRatePct: 0,
      sgstAmount: 0,
      igstRatePct: ratePct,
      igstAmount: igstAmount,
      totalGstAmount: igstAmount,
      grandTotal: taxable + igstAmount
    };
  }
}
