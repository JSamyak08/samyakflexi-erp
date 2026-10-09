/**
 * Frontend Email & Action Task Notification Service
 * Communicates with backend Express SMTP server (Hostinger: admin@samyakinternational.in)
 * Uses dynamic configurable Email Templates from settingsService.js
 */

import { getEmailTemplates, interpolateTemplate } from './settingsService';

/**
 * Internal Email Safety Guard
 * Ensures NO emails are sent to Customer or Vendor email addresses.
 * Communication is strictly restricted to internal ERP email addresses.
 */
export const filterInternalRecipientsOnly = (emailInput, defaultInternal = 'admin@samyakinternational.in') => {
  if (!emailInput) return defaultInternal;

  // Allowed internal email domains
  const internalDomainRegex = /@(samyakinternational\.in|plant\.com|samyak\.com|samyakflexi\.com)$/i;

  const emails = String(emailInput)
    .split(/[,;]/)
    .map(e => e.trim())
    .filter(Boolean);

  const internalOnly = emails.filter(e => {
    const clean = e.toLowerCase();
    // Exclude customer/vendor email hints
    if (clean.includes('vendor') || clean.includes('customer') || clean.includes('client') || clean.includes('supplier')) {
      return false;
    }
    return internalDomainRegex.test(clean);
  });

  return internalOnly.length > 0 ? internalOnly.join(', ') : defaultInternal;
};

export const requestPasswordRecovery = async (email) => {
  const sanitizedEmail = filterInternalRecipientsOnly(email, 'admin@samyakinternational.in');
  try {
    const response = await fetch('/api/recover-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: sanitizedEmail }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Password recovery service error:', error);
    return {
      success: false,
      message: 'Unable to connect to email recovery server. Please ensure backend server is running.',
      error: error.message
    };
  }
};

export const sendERPEmailNotification = async ({ to, cc, subject, html, text }) => {
  const sanitizedTo = filterInternalRecipientsOnly(to, 'admin@samyakinternational.in');
  const sanitizedCc = cc ? filterInternalRecipientsOnly(cc, '') : '';

  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: sanitizedTo, cc: sanitizedCc, subject, html, text }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('ERP email notification error:', error);
    return {
      success: false,
      message: 'Failed to dispatch email notification.',
      error: error.message
    };
  }
};

/**
 * Base HTML Template Generator for ERP Action Emails
 */
export const buildEmailTemplate = ({ title, badgeText, badgeBg = '#0284c7', contentHtml, footerNote }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #0f172a; }
    .container { max-width: 640px; margin: 24px auto; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .header { background: #0f172a; color: #ffffff; padding: 24px; text-align: center; border-bottom: 3px solid ${badgeBg || '#0284c7'}; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.3px; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #94a3b8; }
    .body-content { padding: 28px; }
    .badge { display: inline-block; padding: 5px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #ffffff; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .title { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 16px; line-height: 1.3; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .data-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    .data-table th { background: #f1f5f9; text-align: left; padding: 8px 12px; color: #475569; font-weight: 700; border-bottom: 1px solid #cbd5e1; }
    .data-table td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; line-height: 1.6; white-space: pre-line; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Samyak International Ltd</h1>
      <p>Flexible Packaging Manufacturing ERP • Action Task Notification System</p>
    </div>
    <div class="body-content">
      <div class="badge" style="background-color: ${badgeBg};">${badgeText}</div>
      <h2 class="title">${title}</h2>
      ${contentHtml}
    </div>
    <div class="footer">
      ${footerNote ? footerNote : `<strong>Samyak International Ltd • Indore Packaging Division</strong><br/>Kheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY<br/>Automated Notification Engine • Hostinger Secure SMTP Server`}
    </div>
  </div>
</body>
</html>
`;

/**
 * Helper to get active template with variable interpolation
 */
const getActiveTemplate = (templateKey, vars = {}) => {
  const templates = getEmailTemplates();
  const tmpl = templates[templateKey];
  if (!tmpl) return null;

  return {
    ...tmpl,
    eventTitle: interpolateTemplate(tmpl.eventTitle || '', vars),
    subject: interpolateTemplate(tmpl.subject || '', vars),
    badgeText: interpolateTemplate(tmpl.badgeText || '', vars),
    contentHtml: interpolateTemplate(tmpl.contentHtml || '', vars),
    footerNote: interpolateTemplate(tmpl.footerNote || '', vars),
    toEmail: interpolateTemplate(tmpl.toEmail || '', vars),
    ccEmail: interpolateTemplate(tmpl.ccEmail || '', vars)
  };
};

/**
 * 1. ACTION TASK: New Order Punched
 */
export const notifyOrderPunched = async (order, customTo) => {
  const vars = {
    orderId: order.id || '',
    jobName: order.jobName || '',
    clientName: order.clientName || '',
    orderQtyKg: (order.orderQtyKg || 0).toLocaleString(),
    structure: order.structure || 'Custom Layer',
    targetDeliveryDate: order.targetDeliveryDate || 'N/A'
  };

  const tmpl = getActiveTemplate('order_punched', vars);
  if (!tmpl || tmpl.enabled === false) return { success: false, message: 'Notification disabled.' };

  const targetEmail = customTo || tmpl.toEmail || 'admin@samyakinternational.in';

  const html = buildEmailTemplate({
    title: tmpl.eventTitle,
    badgeText: tmpl.badgeText,
    badgeBg: tmpl.badgeBgColor || '#0284c7',
    contentHtml: tmpl.contentHtml,
    footerNote: tmpl.footerNote
  });

  return await sendERPEmailNotification({
    to: targetEmail,
    cc: tmpl.ccEmail,
    subject: tmpl.subject,
    html,
    text: `New order ${order.id} for ${order.jobName} (${order.orderQtyKg} kg) has been punched into SamyakFlexi ERP.`
  });
};

/**
 * 2. ACTION TASK: Production Record Submitted for Approval
 */
export const notifyProductionRecordSubmitted = async (record, customTo) => {
  const vars = {
    recordId: record.id || '',
    orderId: record.orderId || '',
    jobName: record.jobName || '',
    totalProductionQtyKg: (record.totalProductionQtyKg || 0).toLocaleString(),
    totalMaterialCostRs: (record.totalMaterialCostRs || 0).toLocaleString(),
    finalProductionCostRs: (record.finalProductionCostRs || 0).toLocaleString(),
    totalScrapQtyKg: (record.totalScrapQtyKg || 0).toFixed(1),
    filledBy: record.filledBy || 'Plant Manager'
  };

  const tmpl = getActiveTemplate('production_submitted', vars);
  if (!tmpl || tmpl.enabled === false) return { success: false, message: 'Notification disabled.' };

  const targetEmail = customTo || tmpl.toEmail || 'admin@samyakinternational.in';

  const html = buildEmailTemplate({
    title: tmpl.eventTitle,
    badgeText: tmpl.badgeText,
    badgeBg: tmpl.badgeBgColor || '#d97706',
    contentHtml: tmpl.contentHtml,
    footerNote: tmpl.footerNote
  });

  return await sendERPEmailNotification({
    to: targetEmail,
    cc: tmpl.ccEmail,
    subject: tmpl.subject,
    html,
    text: `Production record for ${record.jobName} (${record.orderId}) submitted by ${record.filledBy}. Pending Admin Approval.`
  });
};

/**
 * 3. ACTION TASK: Production Record Approved
 */
export const notifyProductionRecordApproved = async (record, customTo) => {
  const vars = {
    recordId: record.id || '',
    jobName: record.jobName || '',
    totalProductionQtyKg: (record.totalProductionQtyKg || 0).toLocaleString(),
    finalProductionCostRs: (record.finalProductionCostRs || 0).toLocaleString(),
    approvedBy: record.approvedBy || 'Admin',
    approvalDate: record.approvalDate || new Date().toISOString().split('T')[0]
  };

  const tmpl = getActiveTemplate('production_approved', vars);
  if (!tmpl || tmpl.enabled === false) return { success: false, message: 'Notification disabled.' };

  const targetEmail = customTo || tmpl.toEmail || 'plant.manager@plant.com';

  const html = buildEmailTemplate({
    title: tmpl.eventTitle,
    badgeText: tmpl.badgeText,
    badgeBg: tmpl.badgeBgColor || '#059669',
    contentHtml: tmpl.contentHtml,
    footerNote: tmpl.footerNote
  });

  return await sendERPEmailNotification({
    to: targetEmail,
    cc: tmpl.ccEmail,
    subject: tmpl.subject,
    html,
    text: `Production Record ${record.id} for ${record.jobName} approved by ${record.approvedBy}.`
  });
};

/**
 * 4. ACTION TASK: Purchase Indent Raised
 */
export const notifyPurchaseIndentCreated = async (indent, customTo) => {
  const vars = {
    indentNo: indent.indentNo || indent.id || '',
    department: indent.department || 'Production Store',
    priority: indent.priority || 'Normal',
    itemCount: (indent.items || []).length,
    remarks: indent.remarks || 'None'
  };

  const tmpl = getActiveTemplate('indent_created', vars);
  if (!tmpl || tmpl.enabled === false) return { success: false, message: 'Notification disabled.' };

  const targetEmail = customTo || tmpl.toEmail || 'admin@samyakinternational.in';

  const html = buildEmailTemplate({
    title: tmpl.eventTitle,
    badgeText: tmpl.badgeText,
    badgeBg: tmpl.badgeBgColor || '#7c3aed',
    contentHtml: tmpl.contentHtml,
    footerNote: tmpl.footerNote
  });

  return await sendERPEmailNotification({
    to: targetEmail,
    cc: tmpl.ccEmail,
    subject: tmpl.subject,
    html,
    text: `Material Indent Requisition ${indent.indentNo} raised by ${indent.department} department.`
  });
};

/**
 * 5. ACTION TASK: Purchase Order Issued
 */
export const notifyPurchaseOrderIssued = async (po, customTo) => {
  const vars = {
    poNumber: po.poNumber || '',
    supplierName: po.supplierName || po.vendorName || '',
    indentNumber: po.indentNumber || 'Direct PO',
    itemName: po.itemName || '',
    qty: po.qty || 0,
    unit: po.unit || 'kg',
    totalAmount: (po.totalAmount || 0).toLocaleString()
  };

  const tmpl = getActiveTemplate('po_issued', vars);
  if (!tmpl || tmpl.enabled === false) return { success: false, message: 'Notification disabled.' };

  const targetEmail = customTo || tmpl.toEmail || 'purchase@samyakinternational.in';

  const html = buildEmailTemplate({
    title: tmpl.eventTitle,
    badgeText: tmpl.badgeText,
    badgeBg: tmpl.badgeBgColor || '#2563eb',
    contentHtml: tmpl.contentHtml,
    footerNote: tmpl.footerNote
  });

  return await sendERPEmailNotification({
    to: targetEmail,
    cc: tmpl.ccEmail,
    subject: tmpl.subject,
    html,
    text: `PO ${po.poNumber} issued to ${po.supplierName} for ${po.itemName} (${po.qty} ${po.unit}).`
  });
};

/**
 * 6. ACTION TASK: Low Stock Alert Triggered
 */
export const notifyLowStockAlert = async (stockItem, customTo) => {
  const vars = {
    itemCode: stockItem.itemCode || stockItem.id || '',
    itemName: stockItem.name || '',
    stockQty: stockItem.stockQty || 0,
    unit: stockItem.unit || 'kg',
    reorderLevel: stockItem.reorderLevel || 100,
    location: stockItem.location || 'Store A'
  };

  const tmpl = getActiveTemplate('low_stock', vars);
  if (!tmpl || tmpl.enabled === false) return { success: false, message: 'Notification disabled.' };

  const targetEmail = customTo || tmpl.toEmail || 'admin@samyakinternational.in';

  const html = buildEmailTemplate({
    title: tmpl.eventTitle,
    badgeText: tmpl.badgeText,
    badgeBg: tmpl.badgeBgColor || '#dc2626',
    contentHtml: tmpl.contentHtml,
    footerNote: tmpl.footerNote
  });

  return await sendERPEmailNotification({
    to: targetEmail,
    cc: tmpl.ccEmail,
    subject: tmpl.subject,
    html,
    text: `Inventory Alert: ${stockItem.name} stock level is low (${stockItem.stockQty} ${stockItem.unit} remaining).`
  });
};

/**
 * 7. ACTION TASK: New User Onboarded
 */
export const notifyUserCreated = async (user, customTo) => {
  const vars = {
    userName: user.name || '',
    userEmail: user.email || '',
    userRole: user.role || '',
    userDepartment: user.department || 'Operations',
    userPassword: user.password || 'password123'
  };

  const tmpl = getActiveTemplate('user_created', vars);
  if (!tmpl || tmpl.enabled === false) return { success: false, message: 'Notification disabled.' };

  const targetEmail = customTo || user.email || tmpl.toEmail;

  const html = buildEmailTemplate({
    title: tmpl.eventTitle,
    badgeText: tmpl.badgeText,
    badgeBg: tmpl.badgeBgColor || '#059669',
    contentHtml: tmpl.contentHtml,
    footerNote: tmpl.footerNote
  });

  return await sendERPEmailNotification({
    to: targetEmail,
    cc: tmpl.ccEmail,
    subject: tmpl.subject,
    html,
    text: `Welcome ${user.name}! Your account has been created with role ${user.role}. Login with ${user.email}.`
  });
};

/**
 * 8. ACTION TASK: Over Wastage Alert (Pre-costing Threshold Exceeded)
 */
export const notifyOverWastageAlert = async ({ record, order, allowedWastagePct, customTo }) => {
  const actualWastageKg = Number(record.totalScrapQtyKg || 0);
  const actualWastagePct = Number(record.overallScrapPctOfDispatch || record.overallScrapPctOfOutput || 0);
  const targetWastagePct = Number(allowedWastagePct || order?.calculationDetails?.wastagePct || order?.wastagePct || 5);
  const variancePct = Number((actualWastagePct - targetWastagePct).toFixed(1));

  // Build HTML table for stage-wise wastage breakdown
  const breakdownRows = [
    { label: 'Printing Plain Setting', val: record.printingPlainSettingWastageKg },
    { label: 'Printing Process Wastage', val: record.printingWastageKg },
    { label: 'Lamination Plain Substrate', val: record.laminationPlainSubstrateWastageKg },
    { label: 'Printed Film Wastage', val: record.printedWastageKg },
    { label: 'Laminate Roll Wastage', val: record.laminateWastageKg },
    { label: 'Slitting Side Trim Wastage', val: record.trimWastageKg }
  ].filter(item => Number(item.val || 0) > 0);

  const breakdownTableHtml = breakdownRows.length > 0 ? `
    <table class="data-table">
      <thead>
        <tr><th>Process Stage Scrap Category</th><th style="text-align: right;">Wastage Qty (kg)</th></tr>
      </thead>
      <tbody>
        ${breakdownRows.map(r => `<tr><td>${r.label}</td><td style="text-align: right; font-weight: 700; color: #dc2626;">${Number(r.val).toFixed(1)} kg</td></tr>`).join('')}
      </tbody>
    </table>
  ` : '<p style="font-size: 12px; color: #64748b;">No stage-wise wastage breakdown recorded.</p>';

  const prodDateTime = record.recordedAt 
    ? new Date(record.recordedAt).toLocaleString('en-IN')
    : `${record.dateFilled || new Date().toISOString().split('T')[0]} ${new Date().toLocaleTimeString('en-IN')}`;

  const vars = {
    jobName: record.jobName || order?.jobName || 'Packaging Job',
    orderId: record.orderId || order?.id || 'ORD-000',
    productionDateTime: prodDateTime,
    orderQtyKg: (order?.orderQtyKg || record.totalProductionQtyKg || 0).toLocaleString(),
    totalProductionQtyKg: (record.totalProductionQtyKg || 0).toLocaleString(),
    allowedWastagePct: targetWastagePct.toFixed(1),
    actualWastagePct: actualWastagePct.toFixed(1),
    actualWastageKg: actualWastageKg.toFixed(1),
    wastageVariancePct: variancePct > 0 ? `+${variancePct}` : `${variancePct}`,
    wastageBreakdownHtml: breakdownTableHtml
  };

  const tmpl = getActiveTemplate('over_wastage', vars);
  if (!tmpl || tmpl.enabled === false) return { success: false, message: 'Notification disabled.' };

  const targetEmail = customTo || tmpl.toEmail || 'admin@samyakinternational.in';

  const html = buildEmailTemplate({
    title: tmpl.eventTitle,
    badgeText: tmpl.badgeText,
    badgeBg: tmpl.badgeBgColor || '#dc2626',
    contentHtml: tmpl.contentHtml,
    footerNote: tmpl.footerNote
  });

  return await sendERPEmailNotification({
    to: targetEmail,
    cc: tmpl.ccEmail,
    subject: tmpl.subject,
    html,
    text: `OVER WASTAGE WARNING: Job ${vars.jobName} recorded ${actualWastagePct}% scrap wastage vs ${targetWastagePct}% pre-costing target.`
  });
};

/**
 * Helper to dynamically resolve email addresses by system roles from user list
 */
export const getEmailsForRoles = (users = [], targetRoles = [], defaultEmail = 'admin@samyakinternational.in') => {
  if (!Array.isArray(users) || users.length === 0) return defaultEmail;

  const matchedEmails = new Set();

  users.forEach(u => {
    if (!u || u.status === 'Inactive') return;
    const userRole = String(u.role || '').trim().toLowerCase();
    const userDept = String(u.department || '').trim().toLowerCase();
    const email = u.email?.trim();

    if (!email) return;

    const matches = targetRoles.some(roleKey => {
      const key = roleKey.toLowerCase();
      if (key === 'quality' || key === 'qc' || key === 'qc chemist' || key === 'quality manager') {
        return userRole.includes('qc') || userRole.includes('quality') || userDept.includes('quality') || userDept.includes('qc');
      }
      if (key === 'admin') {
        return userRole.includes('admin');
      }
      if (key === 'plant manager') {
        return userRole.includes('plant manager') || userRole === 'plant manager';
      }
      if (key === 'production manager') {
        return userRole.includes('production manager') || userRole === 'production manager';
      }
      return userRole === key || userRole.includes(key);
    });

    if (matches) {
      matchedEmails.add(email);
    }
  });

  if (matchedEmails.size === 0) return defaultEmail;
  return Array.from(matchedEmails).join(', ');
};

/**
 * 9. ACTION TASK: GRN Inward Pending QC Approval Notification (Sent to QC / Quality User)
 */
export const notifyGRNPendingQC = async ({ grn, users = [], customTo }) => {
  const qcTargetEmails = getEmailsForRoles(users, ['QC Chemist', 'Quality Manager', 'Quality', 'QC'], 'quality@samyakinternational.in');
  const targetEmail = customTo || qcTargetEmails;

  const barcodeListStr = Array.isArray(grn.barcodes) && grn.barcodes.length > 0
    ? grn.barcodes.join(', ')
    : (grn.barcodeId || 'N/A');

  const unitCount = grn.rollsReceived || (Array.isArray(grn.itemsBreakdown) ? grn.itemsBreakdown.length : 1);
  const netQty = Number(grn.netWeightKg || grn.receivedQtyKg || 0).toLocaleString();

  const vars = {
    grnNo: grn.grnNo || grn.id || '',
    vendorName: grn.vendorName || 'Supplier',
    invoiceNo: grn.invoiceNo || 'N/A',
    receivedDate: grn.receivedDate || new Date().toISOString().split('T')[0],
    itemName: grn.itemName || 'Raw Material Inward',
    category: grn.category || 'Film Substrates',
    unitCount: `${unitCount} ${unitCount === 1 ? 'Unit/Roll' : 'Units/Rolls'}`,
    netWeightKg: `${netQty} ${grn.unit || 'Kg'}`,
    batchNo: grn.batchNo || 'N/A',
    storeManager: grn.storeManager || 'Store Manager',
    barcodes: barcodeListStr
  };

  const tmpl = getActiveTemplate('grn_pending_qc', vars) || {
    eventTitle: `🧪 Inward GRN Pending Quality Inspection: #${vars.grnNo}`,
    subject: `🧪 Action Required: Inward GRN #${vars.grnNo} Pending QC Approval — ${vars.vendorName}`,
    badgeText: 'Action Task: Pending QC Inspection',
    badgeBgColor: '#d97706',
    enabled: true
  };

  if (tmpl.enabled === false) return { success: false, message: 'Notification disabled.' };

  const contentHtml = `
    <p style="font-size: 14px; color: #334155;">
      A new Goods Receipt Note (GRN) has been inwarded at the plant store and is currently <strong>Pending Quality Control (QC) Inspection & Approval</strong>.
    </p>
    <div class="info-card">
      <table style="width: 100%; font-size: 13px;">
        <tr><td><strong>GRN Document No:</strong></td><td><strong>${vars.grnNo}</strong></td></tr>
        <tr><td><strong>Supplier / Vendor:</strong></td><td>${vars.vendorName}</td></tr>
        <tr><td><strong>Invoice No & Date:</strong></td><td>${vars.invoiceNo} (${vars.receivedDate})</td></tr>
        <tr><td><strong>Material Category:</strong></td><td>${vars.category}</td></tr>
        <tr><td><strong>Item Name:</strong></td><td>${vars.itemName}</td></tr>
        <tr><td><strong>Inward Net Quantity:</strong></td><td><strong>${vars.netWeightKg}</strong></td></tr>
        <tr><td><strong>Packages / Rolls Received:</strong></td><td>${vars.unitCount}</td></tr>
        <tr><td><strong>Supplier Batch No:</strong></td><td>${vars.batchNo}</td></tr>
        <tr><td><strong>Inwarded By (Store):</strong></td><td>${vars.storeManager}</td></tr>
        <tr><td><strong>Generated Barcodes:</strong></td><td><code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${vars.barcodes}</code></td></tr>
      </table>
    </div>
    <p style="font-size: 13px; color: #475569;">
      <strong>Action Required:</strong> Please perform physical quality sampling and parameter verification (Micron gauge, Dyne level, Tensile/Bond test) in the <strong>Inventory & Quality Control</strong> module to release material into active plant inventory.
    </p>
  `;

  const html = buildEmailTemplate({
    title: tmpl.eventTitle,
    badgeText: tmpl.badgeText,
    badgeBg: tmpl.badgeBgColor || '#d97706',
    contentHtml,
    footerNote: tmpl.footerNote
  });

  return await sendERPEmailNotification({
    to: targetEmail,
    cc: tmpl.ccEmail || 'admin@samyakinternational.in',
    subject: tmpl.subject,
    html,
    text: `ACTION REQUIRED: GRN #${vars.grnNo} for ${vars.itemName} (${vars.netWeightKg}) from ${vars.vendorName} is pending QC approval.`
  });
};

/**
 * 10. ACTION TASK: GRN Pending QC > 12 Hours Escalation Alert (Sent to Admin, Plant Manager, Production Manager, Quality)
 */
export const notifyGRNQCEscalation12h = async ({ grn, hoursPending = 12, users = [], customTo }) => {
  // Escalation alert sent dynamically to Admin, Plant Manager, Production Manager, and Quality roles
  const escalationEmails = getEmailsForRoles(
    users, 
    ['Admin', 'Plant Manager', 'Production Manager', 'Quality Manager', 'QC Chemist', 'Quality', 'QC'], 
    'admin@samyakinternational.in, plant.manager@plant.com, quality@samyakinternational.in'
  );

  const targetEmail = customTo || escalationEmails;

  const unitCount = grn.rollsReceived || (Array.isArray(grn.itemsBreakdown) ? grn.itemsBreakdown.length : 1);
  const netQty = Number(grn.netWeightKg || grn.receivedQtyKg || 0).toLocaleString();

  const vars = {
    grnNo: grn.grnNo || grn.id || '',
    vendorName: grn.vendorName || 'Supplier',
    invoiceNo: grn.invoiceNo || 'N/A',
    receivedDate: grn.receivedDate || new Date().toISOString().split('T')[0],
    itemName: grn.itemName || 'Raw Material Inward',
    category: grn.category || 'Film Substrates',
    netWeightKg: `${netQty} ${grn.unit || 'Kg'}`,
    batchNo: grn.batchNo || 'N/A',
    hoursPending: `${hoursPending}`,
    storeManager: grn.storeManager || 'Store Manager'
  };

  const tmpl = getActiveTemplate('grn_qc_escalation_12h', vars) || {
    eventTitle: `🚨 SLA URGENT ALERT: QC Approval Overdue (>12 Hours) — GRN #${vars.grnNo}`,
    subject: `🚨 OVERDUE QC APPROVAL ALERT (>12 hrs): GRN #${vars.grnNo} — ${vars.vendorName}`,
    badgeText: '🚨 SLA Escalation Alert: QC Overdue',
    badgeBgColor: '#dc2626',
    enabled: true
  };

  if (tmpl.enabled === false) return { success: false, message: 'Notification disabled.' };

  const contentHtml = `
    <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <h3 style="color: #991b1b; font-size: 16px; margin: 0 0 6px 0;">🚨 12-Hour Quality Inspection SLA Exceeded</h3>
      <p style="color: #7f1d1d; font-size: 13px; margin: 0;">
        Goods Receipt Note <strong>#${vars.grnNo}</strong> has been pending Quality Control (QC) clearance for 
        <strong style="color: #dc2626; font-size: 15px;">${vars.hoursPending} hours</strong> without sign-off.
      </p>
    </div>

    <div class="info-card">
      <table style="width: 100%; font-size: 13px;">
        <tr><td><strong>GRN Document No:</strong></td><td><strong>${vars.grnNo}</strong></td></tr>
        <tr><td><strong>Supplier / Vendor:</strong></td><td>${vars.vendorName}</td></tr>
        <tr><td><strong>Invoice No & Date:</strong></td><td>${vars.invoiceNo} (${vars.receivedDate})</td></tr>
        <tr><td><strong>Material Description:</strong></td><td>${vars.itemName} (${vars.category})</td></tr>
        <tr><td><strong>Inward Net Quantity:</strong></td><td><strong>${vars.netWeightKg}</strong></td></tr>
        <tr><td><strong>Batch Number:</strong></td><td>${vars.batchNo}</td></tr>
        <tr><td><strong>Time Inwarded:</strong></td><td>${vars.receivedDate}</td></tr>
        <tr><td><strong>Total SLA Delay:</strong></td><td><strong style="color: #dc2626;">${vars.hoursPending} Hours</strong></td></tr>
        <tr><td><strong>Inwarded By:</strong></td><td>${vars.storeManager}</td></tr>
      </table>
    </div>

    <div style="background: #f8fafc; border-left: 4px solid #dc2626; padding: 12px 16px; margin-top: 16px;">
      <p style="font-size: 13px; color: #1e293b; margin: 0; font-weight: 600;">
        Escalated Roles Notified: Admin, Plant Manager, Production Manager, Quality Head.
      </p>
      <p style="font-size: 12px; color: #64748b; margin: 4px 0 0 0;">
        Immediate quality inspection and sign-off are required to release this raw material for shop-floor printing & lamination job scheduling.
      </p>
    </div>
  `;

  const html = buildEmailTemplate({
    title: tmpl.eventTitle,
    badgeText: tmpl.badgeText,
    badgeBg: tmpl.badgeBgColor || '#dc2626',
    contentHtml,
    footerNote: tmpl.footerNote
  });

  return await sendERPEmailNotification({
    to: targetEmail,
    cc: tmpl.ccEmail || 'admin@samyakinternational.in',
    subject: tmpl.subject,
    html,
    text: `URGENT QC OVERDUE ALERT: GRN #${vars.grnNo} for ${vars.itemName} has been pending QC approval for ${vars.hoursPending} hours (>12h SLA limit).`
  });
};

