import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as Handlebars from 'handlebars';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  private readonly templates: Record<string, string> = {
    welcome: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px}
.card{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.hero{background:linear-gradient(135deg,#1e40af,#3b82f6);padding:40px;text-align:center;color:#fff}
.hero h1{margin:0 0 8px;font-size:28px;font-weight:700}
.hero p{margin:0;opacity:.85;font-size:16px}
.body{padding:40px}
.body h2{color:#0f172a;font-size:20px;margin:0 0 16px}
.body p{color:#475569;line-height:1.6;margin:0 0 16px}
.btn{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px}
.feature{display:flex;gap:12px;margin-bottom:16px;align-items:flex-start}
.feature-icon{width:36px;height:36px;border-radius:8px;background:#eff6ff;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.feature-text{color:#475569;line-height:1.5}
.feature-text strong{color:#0f172a;display:block;margin-bottom:2px}
.footer{background:#f8fafc;padding:24px 40px;text-align:center;color:#94a3b8;font-size:13px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="card">
  <div class="hero">
    <h1>Welcome to RFPilot 🚀</h1>
    <p>Your AI-Powered Proposal Engine is ready</p>
  </div>
  <div class="body">
    <h2>Hi {{name}},</h2>
    <p>You're now on the <strong>{{plan}} plan</strong>{{#if trialDays}} with a {{trialDays}}-day free trial{{/if}}. Here's how to get started:</p>
    <div class="feature">
      <div class="feature-icon">📄</div>
      <div class="feature-text"><strong>Import your RFP</strong>Upload the solicitation document to auto-extract requirements</div>
    </div>
    <div class="feature">
      <div class="feature-icon">🤖</div>
      <div class="feature-text"><strong>Generate with AI</strong>Use the War Room to draft compelling proposal sections</div>
    </div>
    <div class="feature">
      <div class="feature-icon">✅</div>
      <div class="feature-text"><strong>Check Compliance</strong>Run the scanner to ensure all requirements are addressed</div>
    </div>
    <div class="feature">
      <div class="feature-icon">📊</div>
      <div class="feature-text"><strong>Track Win Score</strong>Monitor your proposal strength in real time</div>
    </div>
    <p style="text-align:center;margin-top:32px">
      <a href="{{appUrl}}" class="btn">Open RFPilot →</a>
    </p>
  </div>
  <div class="footer">
    <p>RFPilot — AI-Powered Proposal Engine<br>
    <a href="{{appUrl}}/unsubscribe" style="color:#94a3b8">Unsubscribe</a> · 
    <a href="{{appUrl}}/privacy" style="color:#94a3b8">Privacy Policy</a></p>
  </div>
</div></body></html>`,

    ai_draft_complete: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:20px}
.card{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.hero{background:linear-gradient(135deg,#065f46,#10b981);padding:32px;text-align:center;color:#fff}
.hero h1{margin:0 0 8px;font-size:24px}
.body{padding:36px}
.body p{color:#475569;line-height:1.6;margin:0 0 16px}
.meta-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0}
.meta-item{display:flex;justify-content:space-between;padding:4px 0;color:#166534}
.btn{display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600}
.footer{text-align:center;padding:24px;color:#94a3b8;font-size:13px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="card">
  <div class="hero">
    <h1>✅ AI Draft Complete</h1>
    <p>Your section has been generated</p>
  </div>
  <div class="body">
    <p>Hi {{name}}, your AI-generated draft for <strong>{{sectionTitle}}</strong> in <strong>{{projectName}}</strong> is ready for review.</p>
    <div class="meta-box">
      <div class="meta-item"><span>Section</span><strong>{{sectionTitle}}</strong></div>
      <div class="meta-item"><span>Project</span><strong>{{projectName}}</strong></div>
      <div class="meta-item"><span>Tokens Used</span><strong>{{tokensUsed}}</strong></div>
      <div class="meta-item"><span>Cost</span><strong>${{cost}}</strong></div>
    </div>
    <p>Review the draft, refine with the co-pilot, and mark it as final when ready.</p>
    <p style="text-align:center"><a href="{{actionUrl}}" class="btn">Review Draft →</a></p>
  </div>
  <div class="footer">RFPilot · <a href="{{appUrl}}/settings/notifications" style="color:#94a3b8">Manage Notifications</a></div>
</div></body></html>`,

    compliance_alert: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:20px}
.card{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.hero{background:linear-gradient(135deg,#7c2d12,#ef4444);padding:32px;text-align:center;color:#fff}
.hero h1{margin:0 0 8px;font-size:24px}
.body{padding:36px}
.body p{color:#475569;line-height:1.6;margin:0 0 16px}
.alert-box{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0}
.alert-item{padding:8px 0;border-bottom:1px solid #fee2e2;color:#991b1b;font-size:14px}
.alert-item:last-child{border-bottom:none}
.btn{display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600}
.footer{text-align:center;padding:24px;color:#94a3b8;font-size:13px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="card">
  <div class="hero">
    <h1>⚠️ Compliance Alert</h1>
    <p>{{criticalCount}} critical requirement(s) need attention</p>
  </div>
  <div class="body">
    <p>Hi {{name}}, the compliance scan for <strong>{{projectName}}</strong> found {{criticalCount}} critical gaps that must be addressed before submission.</p>
    <div class="alert-box">
      {{#each requirements}}<div class="alert-item">🔴 {{this}}</div>{{/each}}
    </div>
    <p>Use the <strong>Auto-Fix</strong> feature to generate AI-powered content addressing each gap, or resolve them manually in the War Room.</p>
    <p style="text-align:center"><a href="{{actionUrl}}" class="btn">Fix Compliance Gaps →</a></p>
  </div>
  <div class="footer">RFPilot · <a href="{{appUrl}}/settings/notifications" style="color:#94a3b8">Manage Notifications</a></div>
</div></body></html>`,

    payment_receipt: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:20px}
.card{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.hero{background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px;text-align:center;color:#fff}
.hero h1{margin:0 0 8px;font-size:24px}
.body{padding:36px}
.body p{color:#475569;line-height:1.6;margin:0 0 16px}
.receipt{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0}
.line{display:flex;justify-content:space-between;padding:6px 0;color:#475569}
.line.total{border-top:2px solid #e2e8f0;margin-top:8px;padding-top:12px;color:#0f172a;font-weight:700;font-size:16px}
.btn{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600}
.footer{text-align:center;padding:24px;color:#94a3b8;font-size:13px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="card">
  <div class="hero">
    <h1>💳 Payment Receipt</h1>
    <p>Thank you for your payment</p>
  </div>
  <div class="body">
    <p>Hi {{name}}, here's your payment receipt for the {{plan}} plan.</p>
    <div class="receipt">
      <div class="line"><span>Plan</span><span>{{plan}}</span></div>
      <div class="line"><span>Period</span><span>{{period}}</span></div>
      <div class="line"><span>Date</span><span>{{date}}</span></div>
      <div class="line total"><span>Total Charged</span><span>${{amount}}</span></div>
    </div>
    <p>Your invoice is available in your billing dashboard. If you have questions, contact <a href="mailto:billing@rfpilot.io">billing@rfpilot.io</a>.</p>
    <p style="text-align:center"><a href="{{appUrl}}/billing" class="btn">View Invoice →</a></p>
  </div>
  <div class="footer">RFPilot · This is an automated receipt. Do not reply to this email.</div>
</div></body></html>`,

    invitation: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:20px}
.card{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.hero{background:linear-gradient(135deg,#4c1d95,#8b5cf6);padding:32px;text-align:center;color:#fff}
.hero h1{margin:0 0 8px;font-size:24px}
.body{padding:36px}
.body p{color:#475569;line-height:1.6;margin:0 0 16px}
.invite-box{background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:20px;margin:20px 0;text-align:center}
.org-name{font-size:22px;font-weight:700;color:#4c1d95;margin-bottom:4px}
.role{color:#7c3aed;font-size:14px}
.btn{display:inline-block;background:#8b5cf6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px}
.expires{color:#94a3b8;font-size:12px;margin-top:12px}
.footer{text-align:center;padding:24px;color:#94a3b8;font-size:13px;border-top:1px solid #e2e8f0}
</style></head><body>
<div class="card">
  <div class="hero">
    <h1>You've Been Invited!</h1>
    <p>Join your team on RFPilot</p>
  </div>
  <div class="body">
    <p>Hi {{inviteeName}}, <strong>{{inviterName}}</strong> has invited you to join their team on RFPilot.</p>
    <div class="invite-box">
      <div class="org-name">{{organizationName}}</div>
      <div class="role">Role: {{role}}</div>
    </div>
    <p>RFPilot is an AI-powered proposal engine for government contractors. Collaborate on winning RFP responses in real time.</p>
    <p style="text-align:center">
      <a href="{{inviteUrl}}" class="btn">Accept Invitation →</a>
      <div class="expires">This invitation expires in 7 days</div>
    </p>
  </div>
  <div class="footer">RFPilot · If you didn't expect this invitation, you can safely ignore this email.</div>
</div></body></html>`,

    trial_expiring: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;background:#f8fafc;margin:0;padding:20px}
.card{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.hero{background:linear-gradient(135deg,#b45309,#f59e0b);padding:32px;text-align:center;color:#fff}
.hero h1{margin:0 0 8px;font-size:24px}
.body{padding:36px}
.btn{display:inline-block;background:#f59e0b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;margin-right:12px}
.btn-secondary{display:inline-block;background:#64748b;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px}
</style></head><body>
<div class="card">
  <div class="hero">
    <h1>⏳ Trial Expires in {{daysLeft}} Days</h1>
    <p>Don't lose access to your proposals</p>
  </div>
  <div class="body">
    <p>Hi {{name}}, your free trial of RFPilot ends in {{daysLeft}} day(s). Your current plan: <strong>{{plan}}</strong></p>
    <p>Upgrade now to keep unlimited AI generation, compliance scanning, and win score tracking.</p>
    <p style="text-align:center;margin-top:24px">
      <a href="{{appUrl}}/billing/upgrade" class="btn">Upgrade Now →</a>
      <a href="{{appUrl}}/billing" class="btn-secondary">View Plans</a>
    </p>
  </div>
  <div class="footer" style="background:#f8fafc;padding:24px;text-align:center;color:#94a3b8;font-size:13px;border-top:1px solid #e2e8f0">RFPilot · <a href="{{appUrl}}/settings/notifications" style="color:#94a3b8">Manage Notifications</a></div>
</div></body></html>`,
  };

  constructor(private configService: ConfigService) {
    const sendgridKey = this.configService.get('SENDGRID_API_KEY');

    if (sendgridKey) {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: { user: 'apikey', pass: sendgridKey },
      });
    } else {
      this.transporter = nodemailer.createTransport({ host: 'localhost', port: 1025 });
      this.logger.warn('No SENDGRID_API_KEY — email disabled. Configure SMTP for production.');
    }
  }

  private compile(templateName: string, data: Record<string, any>): string {
    const template = this.templates[templateName];
    if (!template) throw new Error(`Email template not found: ${templateName}`);
    return Handlebars.compile(template)({
      ...data,
      appUrl: this.configService.get('APP_URL', 'https://app.rfpilot.io'),
    });
  }

  async send(to: string, subject: string, templateName: string, data: Record<string, any>): Promise<void> {
    const html = this.compile(templateName, data);
    const fromEmail = this.configService.get('FROM_EMAIL', 'noreply@rfpilot.io');

    try {
      await this.transporter.sendMail({
        from: `RFPilot <${fromEmail}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent: ${templateName} → ${to}`);
    } catch (err) {
      this.logger.error(`Email send failed to ${to}: ${err.message}`);
    }
  }

  async sendWelcome(email: string, name: string, plan: string, trialDays?: number) {
    await this.send(email, '🚀 Welcome to RFPilot — Your Proposal Engine is Ready', 'welcome', { name, plan, trialDays });
  }

  async sendAiDraftComplete(email: string, name: string, data: {
    projectName: string; sectionTitle: string; tokensUsed: number; cost: string; actionUrl: string;
  }) {
    await this.send(email, `✅ AI Draft Ready — ${data.sectionTitle}`, 'ai_draft_complete', { name, ...data });
  }

  async sendComplianceAlert(email: string, name: string, data: {
    projectName: string; criticalCount: number; requirements: string[]; actionUrl: string;
  }) {
    await this.send(email, `⚠️ ${data.criticalCount} Compliance Gaps Found — ${data.projectName}`, 'compliance_alert', { name, ...data });
  }

  async sendPaymentReceipt(email: string, name: string, data: {
    plan: string; amount: string; period: string; date: string;
  }) {
    await this.send(email, 'Your RFPilot Payment Receipt', 'payment_receipt', { name, ...data });
  }

  async sendInvitation(email: string, data: {
    inviteeName: string; inviterName: string; organizationName: string; role: string; inviteUrl: string;
  }) {
    await this.send(email, `${data.inviterName} invited you to join ${data.organizationName} on RFPilot`, 'invitation', data);
  }

  async sendTrialExpiring(email: string, name: string, data: {
    plan: string; daysLeft: number;
  }) {
    await this.send(email, `⏳ Your RFPilot trial expires in ${data.daysLeft} day(s)`, 'trial_expiring', { name, ...data });
  }
}
