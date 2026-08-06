/**
 * Frontend Email & Action Task Notification Service
 * Communicates with backend Express SMTP server (Hostinger: admin@samyakinternational.in)
 */

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

export const sendERPEmailNotification = async ({ to, subject, html, text }) => {
  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, subject, html, text }),
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
const buildEmailTemplate = ({ title, badgeText, badgeBg = '#0284c7', contentHtml }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #0f172a; }
    .container { max-width: 640px; margin: 24px auto; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .header { background: #0f172a; color: #ffffff; padding: 24px; text-align: center; border-bottom: 3px solid #0284c7; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.3px; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #94a3b8; }
    .body-content { padding: 28px; }
    .badge { display: inline-block; padding: 5px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #ffffff; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .title { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 16px; line-height: 1.3; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .data-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    .data-table th { background: #f1f5f9; text-align: left; padding: 8px 12px; color: #475569; font-weight: 700; border-bottom: 1px solid #cbd5e1; }
    .data-table td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; line-height: 1.6; }
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
      <strong>Samyak International Ltd • Indore Packaging Division</strong><br/>
      Kheda Industrial Area, Sector 3, Pithampur, MP | GSTIN: 23AABCM3526F1ZY<br/>
      Automated Notification Engine • Hostinger Secure SMTP Server
    </div>
  </div>
</body>
</html>
`;

/**
 * 1. ACTION TASK: New Order Punched
 */
export const notifyOrderPunched = async (order, to = 'admin@samyakinternational.in') => {
  const title = `📦 New Job Order Punched: ${order.jobName}`;
  const badgeText = "Action Task: Order Created";
  const html = buildEmailTemplate({
    title,
    badgeText,
    badgeBg: '#0284c7',
    contentHtml: `
      <p style="font-size: 14px; color: #334155;">A new job order has been punched into the ERP system and queued for raw material allocation and cylinder scheduling.</p>
      <div class="info-card">
        <table style="width: 100%; font-size: 13px;">
          <tr><td><strong>Order ID:</strong></td><td>${order.id}</td></tr>
          <tr><td><strong>Job Name:</strong></td><td>${order.jobName}</td></tr>
          <tr><td><strong>Client Name:</strong></td><td>${order.clientName}</td></tr>
          <tr><td><strong>Order Quantity:</strong></td><td>${(order.orderQtyKg || 0).toLocaleString()} kg</td></tr>
          <tr><td><strong>Substrate Structure:</strong></td><td>${order.structure || 'Custom Layer'}</td></tr>
          <tr><td><strong>Target Delivery Date:</strong></td><td>${order.targetDeliveryDate || 'N/A'}</td></tr>
        </table>
      </div>
      <p style="font-size: 13px; color: #64748b;">Please review material requirements in the Production Scheduler.</p>
    `
  });

  return await sendERPEmailNotification({
    to,
    subject: `📦 Order Punched: ${order.jobName} (${order.id})`,
    html,
    text: `New order ${order.id} for ${order.jobName} (${order.orderQtyKg} kg) has been punched into SamyakFlexi ERP.`
  });
};

/**
 * 2. ACTION TASK: Production Record Submitted for Approval
 */
export const notifyProductionRecordSubmitted = async (record, to = 'admin@samyakinternational.in') => {
  const title = `📋 Production Record Submitted: ${record.jobName}`;
  const badgeText = "Action Task: Admin Approval Required";
  const html = buildEmailTemplate({
    title,
    badgeText,
    badgeBg: '#d97706',
    contentHtml: `
      <p style="font-size: 14px; color: #334155;">Plant Manager has submitted a new production record. Administrative approval is required to finalize costings and job completion.</p>
      <div class="info-card">
        <table style="width: 100%; font-size: 13px;">
          <tr><td><strong>Record ID:</strong></td><td>${record.id}</td></tr>
          <tr><td><strong>Order ID:</strong></td><td>${record.orderId}</td></tr>
          <tr><td><strong>Job Name:</strong></td><td>${record.jobName}</td></tr>
          <tr><td><strong>Dispatch Ready Qty:</strong></td><td><strong>${(record.totalProductionQtyKg || 0).toLocaleString()} kg</strong></td></tr>
          <tr><td><strong>Total Ingredients Cost:</strong></td><td>₹ ${(record.totalMaterialCostRs || 0).toLocaleString()}</td></tr>
          <tr><td><strong>Final Cost of Production:</strong></td><td><strong style="color: #047857;">₹ ${(record.finalProductionCostRs || 0).toLocaleString()}</strong></td></tr>
          <tr><td><strong>Total Scrap Logged:</strong></td><td>${(record.totalScrapQtyKg || 0).toFixed(1)} kg</td></tr>
          <tr><td><strong>Submitted By:</strong></td><td>${record.filledBy}</td></tr>
        </table>
      </div>
      <p style="font-size: 13px; color: #64748b;">Log into the ERP Admin Dashboard to approve or reject this production record.</p>
    `
  });

  return await sendERPEmailNotification({
    to,
    subject: `📋 Approval Required: Production Record for ${record.jobName} (${record.orderId})`,
    html,
    text: `Production record for ${record.jobName} (${record.orderId}) submitted by ${record.filledBy}. Pending Admin Approval.`
  });
};

/**
 * 3. ACTION TASK: Production Record Approved
 */
export const notifyProductionRecordApproved = async (record, to = 'plant.manager@plant.com') => {
  const title = `✅ Production Record Approved: ${record.jobName}`;
  const badgeText = "Action Task: Approved by Admin";
  const html = buildEmailTemplate({
    title,
    badgeText,
    badgeBg: '#059669',
    contentHtml: `
      <p style="font-size: 14px; color: #334155;">The production record for job <strong>${record.jobName}</strong> has been officially reviewed and APPROVED by the Admin.</p>
      <div class="info-card">
        <table style="width: 100%; font-size: 13px;">
          <tr><td><strong>Record ID:</strong></td><td>${record.id}</td></tr>
          <tr><td><strong>Job Name:</strong></td><td>${record.jobName}</td></tr>
          <tr><td><strong>Produced Dispatch Qty:</strong></td><td>${(record.totalProductionQtyKg || 0).toLocaleString()} kg</td></tr>
          <tr><td><strong>Final Production Cost:</strong></td><td>₹ ${(record.finalProductionCostRs || 0).toLocaleString()}</td></tr>
          <tr><td><strong>Approved By:</strong></td><td>${record.approvedBy}</td></tr>
          <tr><td><strong>Approval Date:</strong></td><td>${record.approvalDate}</td></tr>
        </table>
      </div>
    `
  });

  return await sendERPEmailNotification({
    to,
    subject: `✅ Production Record Approved: ${record.jobName}`,
    html,
    text: `Production Record ${record.id} for ${record.jobName} approved by ${record.approvedBy}.`
  });
};

/**
 * 4. ACTION TASK: Purchase Indent Raised
 */
export const notifyPurchaseIndentCreated = async (indent, to = 'admin@samyakinternational.in') => {
  const title = `📝 New Purchase Indent Requisition: ${indent.indentNo}`;
  const badgeText = "Action Task: Material Indent Raised";
  const html = buildEmailTemplate({
    title,
    badgeText,
    badgeBg: '#7c3aed',
    contentHtml: `
      <p style="font-size: 14px; color: #334155;">A new material purchase indent requisition has been raised for plant consumables / raw materials.</p>
      <div class="info-card">
        <table style="width: 100%; font-size: 13px;">
          <tr><td><strong>Indent No:</strong></td><td>${indent.indentNo || indent.id}</td></tr>
          <tr><td><strong>Department:</strong></td><td>${indent.department}</td></tr>
          <tr><td><strong>Priority Level:</strong></td><td><strong style="color: ${indent.priority === 'High' ? '#dc2626' : '#2563eb'};">${indent.priority}</strong></td></tr>
          <tr><td><strong>Items Requested:</strong></td><td>${(indent.items || []).length} item(s)</td></tr>
          <tr><td><strong>Remarks:</strong></td><td>${indent.remarks || 'None'}</td></tr>
        </table>
      </div>
    `
  });

  return await sendERPEmailNotification({
    to,
    subject: `📝 Material Indent Raised: ${indent.indentNo} (${indent.priority} Priority)`,
    html,
    text: `Material Indent Requisition ${indent.indentNo} raised by ${indent.department} department.`
  });
};

/**
 * 5. ACTION TASK: Purchase Order Issued
 */
export const notifyPurchaseOrderIssued = async (po, to = 'purchase@samyakinternational.in') => {
  const title = `🛒 Purchase Order Issued: ${po.poNumber}`;
  const badgeText = "Action Task: PO Issued to Vendor";
  const html = buildEmailTemplate({
    title,
    badgeText,
    badgeBg: '#2563eb',
    contentHtml: `
      <p style="font-size: 14px; color: #334155;">A official Purchase Order has been generated and dispatched to the supplier.</p>
      <div class="info-card">
        <table style="width: 100%; font-size: 13px;">
          <tr><td><strong>PO Number:</strong></td><td>${po.poNumber}</td></tr>
          <tr><td><strong>Vendor / Supplier:</strong></td><td>${po.supplierName || po.vendorName}</td></tr>
          <tr><td><strong>Indent Ref:</strong></td><td>${po.indentNumber || 'Direct PO'}</td></tr>
          <tr><td><strong>Item Name:</strong></td><td>${po.itemName}</td></tr>
          <tr><td><strong>Order Quantity:</strong></td><td>${po.qty} ${po.unit || 'kg'}</td></tr>
          <tr><td><strong>Total PO Amount:</strong></td><td><strong>₹ ${(po.totalAmount || 0).toLocaleString()}</strong></td></tr>
        </table>
      </div>
    `
  });

  return await sendERPEmailNotification({
    to,
    subject: `🛒 Purchase Order Issued: ${po.poNumber} - ${po.supplierName}`,
    html,
    text: `PO ${po.poNumber} issued to ${po.supplierName} for ${po.itemName} (${po.qty} ${po.unit}).`
  });
};

/**
 * 6. ACTION TASK: Low Stock Alert Triggered
 */
export const notifyLowStockAlert = async (stockItem, to = 'admin@samyakinternational.in') => {
  const title = `⚠️ Low Inventory Alert: ${stockItem.name}`;
  const badgeText = "Action Task: Inventory Alert";
  const html = buildEmailTemplate({
    title,
    badgeText,
    badgeBg: '#dc2626',
    contentHtml: `
      <p style="font-size: 14px; color: #334155;">Plant store stock level for item <strong>${stockItem.name}</strong> has fallen below the safety reorder threshold.</p>
      <div class="info-card">
        <table style="width: 100%; font-size: 13px;">
          <tr><td><strong>Item Code:</strong></td><td>${stockItem.itemCode || stockItem.id}</td></tr>
          <tr><td><strong>Item Name:</strong></td><td>${stockItem.name}</td></tr>
          <tr><td><strong>Current In-Stock:</strong></td><td><strong style="color: #dc2626;">${stockItem.stockQty} ${stockItem.unit || 'kg'}</strong></td></tr>
          <tr><td><strong>Minimum Reorder Level:</strong></td><td>${stockItem.reorderLevel || 100} ${stockItem.unit || 'kg'}</td></tr>
          <tr><td><strong>Location / Rack:</strong></td><td>${stockItem.location || 'Store A'}</td></tr>
        </table>
      </div>
      <p style="font-size: 13px; color: #64748b;">Immediate purchase requisition is recommended to avoid shop-floor downtime.</p>
    `
  });

  return await sendERPEmailNotification({
    to,
    subject: `⚠️ Low Stock Warning: ${stockItem.name} (${stockItem.stockQty} left)`,
    html,
    text: `Inventory Alert: ${stockItem.name} stock level is low (${stockItem.stockQty} ${stockItem.unit} remaining).`
  });
};

/**
 * 7. ACTION TASK: New User Onboarded
 */
export const notifyUserCreated = async (user, to) => {
  const targetEmail = to || user.email;
  const title = `🎉 Welcome to SamyakFlexi ERP, ${user.name}!`;
  const badgeText = "Action Task: User Onboarding";
  const html = buildEmailTemplate({
    title,
    badgeText,
    badgeBg: '#059669',
    contentHtml: `
      <p style="font-size: 14px; color: #334155;">Your user account has been created on the SamyakFlexi ERP platform.</p>
      <div class="info-card">
        <table style="width: 100%; font-size: 13px;">
          <tr><td><strong>Full Name:</strong></td><td>${user.name}</td></tr>
          <tr><td><strong>Login Email:</strong></td><td>${user.email}</td></tr>
          <tr><td><strong>Assigned Role:</strong></td><td><strong>${user.role}</strong></td></tr>
          <tr><td><strong>Department:</strong></td><td>${user.department}</td></tr>
          <tr><td><strong>Default Password:</strong></td><td><code>${user.password || 'password123'}</code></td></tr>
        </table>
      </div>
      <p style="font-size: 13px; color: #64748b;">Please log in at <a href="https://app.samyakinternational.in">app.samyakinternational.in</a> and update your password.</p>
    `
  });

  return await sendERPEmailNotification({
    to: targetEmail,
    subject: `🎉 Account Created — SamyakFlexi ERP (${user.role})`,
    html,
    text: `Welcome ${user.name}! Your account has been created with role ${user.role}. Login with ${user.email}.`
  });
};
