import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outbound email, provider-agnostic like billing. Phase 1 only needs
 * renewal reminders, so the interface is deliberately small:
 *   EMAIL_PROVIDER=log    (default) print to server logs, send nothing
 *   EMAIL_PROVIDER=resend  send via Resend (needs RESEND_API_KEY + EMAIL_FROM)
 *   EMAIL_PROVIDER=smtp    send via SMTP, e.g. Google Workspace
 *                          (needs SMTP_USER + SMTP_PASS + EMAIL_FROM)
 */

export interface RenewalMail {
  to: string;
  planName: string;
  /** Days left, 0 = access paused today. */
  daysLeft: number;
  /** Display date of the period end, e.g. "12 Oct 2026". */
  periodEndDubai: string;
  /** Price line, e.g. "AED 30.00/month". */
  amountLine: string;
  payUrl: string;
}

export interface Mailer {
  sendRenewalReminder(mail: RenewalMail): Promise<void>;
  sendAccessPaused(mail: RenewalMail): Promise<void>;
}

function reminderText(m: RenewalMail): { subject: string; text: string } {
  const dayWord = m.daysLeft === 1 ? "day" : "days";
  return {
    subject: `Your Boasis plan ends in ${m.daysLeft} ${dayWord}`,
    text:
      `Hello,\n\n` +
      `Your ${m.planName} plan ends on ${m.periodEndDubai}.\n` +
      `To keep using the portal without a break, please pay ${m.amountLine} before that date.\n\n` +
      `Pay here: ${m.payUrl}\n\n` +
      `If you already paid, please ignore this email.\n\n` +
      `Boasis`,
  };
}

function pausedText(m: RenewalMail): { subject: string; text: string } {
  return {
    subject: "Your Boasis access is paused",
    text:
      `Hello,\n\n` +
      `Your ${m.planName} plan ended on ${m.periodEndDubai}, so your portal access is now paused.\n` +
      `Your data is safe. Pay ${m.amountLine} to unlock the portal again immediately.\n\n` +
      `Pay here: ${m.payUrl}\n\n` +
      `If you already paid, please ignore this email.\n\n` +
      `Boasis`,
  };
}

/** Default: log only. Safe in dev, staging and demos. */
class LogMailer implements Mailer {
  async sendRenewalReminder(mail: RenewalMail): Promise<void> {
    console.log("[mail:reminder]", JSON.stringify({ ...reminderText(mail), to: mail.to }));
  }
  async sendAccessPaused(mail: RenewalMail): Promise<void> {
    console.log("[mail:paused]", JSON.stringify({ ...pausedText(mail), to: mail.to }));
  }
}

/** Resend via plain fetch — no extra dependency. */
class ResendMailer implements Mailer {
  private readonly apiKey: string;
  private readonly from: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      throw new Error("EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM");
    }
    this.apiKey = apiKey;
    this.from = from;
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: this.from, to, subject, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`resend failed (${res.status}): ${detail.slice(0, 200)}`);
    }
  }

  async sendRenewalReminder(mail: RenewalMail): Promise<void> {
    const { subject, text } = reminderText(mail);
    await this.send(mail.to, subject, text);
  }
  async sendAccessPaused(mail: RenewalMail): Promise<void> {
    const { subject, text } = pausedText(mail);
    await this.send(mail.to, subject, text);
  }
}

/** Plain SMTP — used with Google Workspace (same setup as boasis.ae forms). */
class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT ?? "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.EMAIL_FROM;
    if (!user || !pass || !from) {
      throw new Error("EMAIL_PROVIDER=smtp needs SMTP_USER, SMTP_PASS and EMAIL_FROM");
    }
    this.from = from;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }

  async sendRenewalReminder(mail: RenewalMail): Promise<void> {
    const { subject, text } = reminderText(mail);
    await this.send(mail.to, subject, text);
  }
  async sendAccessPaused(mail: RenewalMail): Promise<void> {
    const { subject, text } = pausedText(mail);
    await this.send(mail.to, subject, text);
  }
}

export function getMailer(): Mailer {
  const id = process.env.EMAIL_PROVIDER ?? "log";
  if (id === "resend") return new ResendMailer();
  if (id === "smtp") return new SmtpMailer();
  if (id === "log") return new LogMailer();
  throw new Error(`email provider "${id}" is not configured`);
}
