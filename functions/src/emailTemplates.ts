// Email templates for SendGrid transactional emails

// Prevent XSS by escaping user-supplied strings before embedding in HTML
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const HIPAA_FOOTER = `
  <p style="margin-top:16px;padding:12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;font-size:11px;color:#92400e">
    ⚠️ <strong>HIPAA Notice:</strong> This notification does not contain patient health information.
    Log in to view full details securely.
  </p>`;

export function criticalSnapEmail(opts: {
  recipientEmail: string;
  pluginName: string;
  category: string;
  pageUrl: string;
  dashboardUrl: string;
  hipaaMode?: boolean;
}): { to: string; subject: string; html: string } {
  const pluginName = escapeHtml(opts.pluginName);
  const category = escapeHtml(opts.category);
  const pageUrl = escapeHtml(opts.pageUrl);
  const pageSection = opts.hipaaMode
    ? ''
    : `<p style="margin:0 0 20px;color:#374151"><strong>Page:</strong> <a href="${pageUrl}" style="color:#dc2626">${pageUrl}</a></p>`;
  return {
    to: opts.recipientEmail,
    subject: `🚨 [Snap4Knack] CRITICAL snap: ${opts.category} — ${opts.pluginName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#dc2626;padding:16px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">🚨 Critical Snap Submitted</h1>
        </div>
        <div style="background:#fff5f5;padding:24px;border:2px solid #dc2626;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin:0 0 12px;color:#991b1b;font-weight:600">A snap marked <strong>Critical</strong> priority has been submitted and requires immediate attention.</p>
          <p style="margin:0 0 12px;color:#374151"><strong>Plugin:</strong> ${pluginName}</p>
          <p style="margin:0 0 12px;color:#374151"><strong>Category:</strong> ${category}</p>
          ${pageSection}
          <a href="${escapeHtml(opts.dashboardUrl)}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            View Snap Now →
          </a>
          ${opts.hipaaMode ? HIPAA_FOOTER : ''}
        </div>
        <p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center">
          Snap4Knack · Unsubscribe in your account settings
        </p>
      </div>
    `,
  };
}

export function snapNotificationEmail(opts: {
  recipientEmail: string;
  pluginName: string;
  category: string;
  pageUrl: string;
  dashboardUrl: string;
  hipaaMode?: boolean;
}): { to: string; subject: string; html: string } {
  const pluginName = escapeHtml(opts.pluginName);
  const category = escapeHtml(opts.category);
  const pageUrl = escapeHtml(opts.pageUrl);
  const pageSection = opts.hipaaMode
    ? ''
    : `<p style="margin:0 0 20px;color:#374151"><strong>Page:</strong> <a href="${pageUrl}" style="color:#2563eb">${pageUrl}</a></p>`;
  return {
    to: opts.recipientEmail,
    subject: `[Snap4Knack] New snap: ${opts.category} — ${opts.pluginName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#2563eb;padding:16px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">📸 New Snap Submitted</h1>
        </div>
        <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin:0 0 12px;color:#374151"><strong>Plugin:</strong> ${pluginName}</p>
          <p style="margin:0 0 12px;color:#374151"><strong>Category:</strong> ${category}</p>
          ${pageSection}
          <a href="${escapeHtml(opts.dashboardUrl)}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            View Snap →
          </a>
          ${opts.hipaaMode ? HIPAA_FOOTER : ''}
        </div>
        <p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center">
          Snap4Knack · Unsubscribe in your account settings
        </p>
      </div>
    `,
  };
}


export function clientInvitationEmail(opts: {
  recipientEmail: string;
  tenantName: string;
  inviteUrl: string;
}): { to: string; subject: string; html: string } {
  const tenantName = escapeHtml(opts.tenantName);
  return {
    to: opts.recipientEmail,
    subject: `You've been invited to view feedback on Snap4Knack`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#2563eb;padding:16px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">🎉 You're Invited</h1>
        </div>
        <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin:0 0 12px;color:#374151">
            <strong>${tenantName}</strong> has invited you to view and comment on feedback submissions using Snap4Knack.
          </p>
          <p style="margin:0 0 20px;color:#374151">Click the button below to create your account and get started.</p>
          <a href="${escapeHtml(opts.inviteUrl)}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            Accept Invitation →
          </a>
          <p style="margin-top:16px;font-size:12px;color:#6b7280">This invite link expires in 7 days.</p>
        </div>
        <p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center">
          Snap4Knack · Fine Mountain LLC
        </p>
      </div>
    `,
  };
}

export function newTenantWelcomeEmail(opts: {
  recipientEmail: string;
  companyName: string;
  displayName: string;
  loginUrl: string;
}): { to: string; subject: string; html: string } {
  const displayName = escapeHtml(opts.displayName);
  const companyName = escapeHtml(opts.companyName);
  return {
    to: opts.recipientEmail,
    subject: `Welcome to Snap4Knack — Set up your account`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#2563eb;padding:16px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">👋 Welcome to Snap4Knack</h1>
        </div>
        <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin:0 0 12px;color:#374151">Hi ${displayName},</p>
          <p style="margin:0 0 12px;color:#374151">
            Your Snap4Knack account has been created for <strong>${companyName}</strong>.
          </p>
          <p style="margin:0 0 20px;color:#374151">
            Click the button below to set your password and log in for the first time.
          </p>
          <a href="${escapeHtml(opts.loginUrl)}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            Set Your Password →
          </a>
          <p style="margin-top:16px;font-size:12px;color:#6b7280">This link expires in 24 hours. If you didn't expect this email, you can safely ignore it.</p>
        </div>
        <p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center">
          Snap4Knack · Fine Mountain Consulting LLC
        </p>
      </div>
    `,
  };
}

export function commentNotificationEmail(opts: {
  recipientEmail: string;
  authorName: string;
  commentText: string;
  snapNumber?: number;
  snapCategory?: string;
  dashboardUrl: string;
  hipaaMode?: boolean;
}): { to: string; subject: string; html: string } {
  const authorName = escapeHtml(opts.authorName);
  const snapCategory = opts.snapCategory ? escapeHtml(opts.snapCategory) : undefined;
  const snapLabel = opts.snapNumber != null
    ? `#${opts.snapNumber}${snapCategory ? ` — ${snapCategory}` : ''}`
    : (snapCategory || 'Snap');
  const commentSection = opts.hipaaMode
    ? `<p style="margin:0 0 20px;color:#374151">A new comment has been added. Log in to view it securely.</p>`
    : `<blockquote style="border-left:3px solid #2563eb;margin:0 0 20px;padding:8px 16px;background:#eff6ff;color:#1e40af;border-radius:0 6px 6px 0">
            ${escapeHtml(opts.commentText)}
          </blockquote>`;
  return {
    to: opts.recipientEmail,
    subject: `[Snap4Knack] New comment on ${snapLabel} from ${opts.authorName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#2563eb;padding:16px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">💬 New Comment on ${snapLabel}</h1>
        </div>
        <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin:0 0 8px;color:#374151"><strong>${authorName}</strong> commented:</p>
          ${commentSection}
          <a href="${escapeHtml(opts.dashboardUrl)}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            View Thread →
          </a>
          ${opts.hipaaMode ? HIPAA_FOOTER : ''}
        </div>
      </div>
    `,
  };
}
