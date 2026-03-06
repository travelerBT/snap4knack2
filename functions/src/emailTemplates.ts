// Email templates for SendGrid transactional emails

export function criticalSnapEmail(opts: {
  recipientEmail: string;
  pluginName: string;
  category: string;
  pageUrl: string;
  dashboardUrl: string;
}): { to: string; subject: string; html: string } {
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
          <p style="margin:0 0 12px;color:#374151"><strong>Plugin:</strong> ${opts.pluginName}</p>
          <p style="margin:0 0 12px;color:#374151"><strong>Category:</strong> ${opts.category}</p>
          <p style="margin:0 0 20px;color:#374151"><strong>Page:</strong> <a href="${opts.pageUrl}" style="color:#dc2626">${opts.pageUrl}</a></p>
          <a href="${opts.dashboardUrl}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            View Snap Now →
          </a>
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
}): { to: string; subject: string; html: string } {
  return {
    to: opts.recipientEmail,
    subject: `[Snap4Knack] New snap: ${opts.category} — ${opts.pluginName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#2563eb;padding:16px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">📸 New Snap Submitted</h1>
        </div>
        <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin:0 0 12px;color:#374151"><strong>Plugin:</strong> ${opts.pluginName}</p>
          <p style="margin:0 0 12px;color:#374151"><strong>Category:</strong> ${opts.category}</p>
          <p style="margin:0 0 20px;color:#374151"><strong>Page:</strong> <a href="${opts.pageUrl}" style="color:#2563eb">${opts.pageUrl}</a></p>
          <a href="${opts.dashboardUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            View Snap →
          </a>
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
            <strong>${opts.tenantName}</strong> has invited you to view and comment on feedback submissions using Snap4Knack.
          </p>
          <p style="margin:0 0 20px;color:#374151">Click the button below to create your account and get started.</p>
          <a href="${opts.inviteUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
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

export function commentNotificationEmail(opts: {
  recipientEmail: string;
  authorName: string;
  commentText: string;
  snapNumber?: number;
  snapCategory?: string;
  dashboardUrl: string;
}): { to: string; subject: string; html: string } {
  const snapLabel = opts.snapNumber != null
    ? `#${opts.snapNumber}${opts.snapCategory ? ` — ${opts.snapCategory}` : ''}`
    : (opts.snapCategory || 'Snap');
  return {
    to: opts.recipientEmail,
    subject: `[Snap4Knack] New comment on ${snapLabel} from ${opts.authorName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="background:#2563eb;padding:16px 24px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">💬 New Comment on ${snapLabel}</h1>
        </div>
        <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
          <p style="margin:0 0 8px;color:#374151"><strong>${opts.authorName}</strong> commented:</p>
          <blockquote style="border-left:3px solid #2563eb;margin:0 0 20px;padding:8px 16px;background:#eff6ff;color:#1e40af;border-radius:0 6px 6px 0">
            ${opts.commentText}
          </blockquote>
          <a href="${opts.dashboardUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
            View Thread →
          </a>
        </div>
      </div>
    `,
  };
}
