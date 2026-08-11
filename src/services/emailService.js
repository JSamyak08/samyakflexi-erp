/**
 * Frontend Email & Action Task Notification Service
 * Communicates with backend Express SMTP server (Hostinger: admin@samyakinternational.in)
 * Uses dynamic configurable Email Templates from settingsService.js
 */

import { getEmailTemplates, interpolateTemplate } from './settingsService';

export const requestPasswordRecovery = async (email) => {
  try {
    const response = await fetch('/api/recover-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
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
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, cc, subject, html, text }),
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
