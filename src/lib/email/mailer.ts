import nodemailer from "nodemailer";
import type { Attachment } from "nodemailer/lib/mailer";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export async function sendReportEmail({
  to, customerName, appointmentDate, jobCategory, technicianName,
  pdfContent, whatsappLink,
}: {
  to: string;
  customerName: string;
  appointmentDate: string;
  jobCategory: string;
  technicianName: string;
  pdfContent?: Uint8Array;
  whatsappLink: string;
}) {
  // Demo copies must never send email unless a developer explicitly opts in.
  if (process.env.ENABLE_EXTERNAL_EMAIL !== "true") return;
  if (!to) return;

  const transporter = createTransport();
  const attachments: Attachment[] = [];

  if (pdfContent) {
    attachments.push({ filename: "service-report.pdf", content: Buffer.from(pdfContent) });
  }

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#151513">Service Report — Megtras</h2>
      <p>Dear <strong>${customerName}</strong>,</p>
      <p>Thank you for choosing Megtras. Your service has been completed.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px;color:#666">Date</td><td style="padding:6px;font-weight:bold">${appointmentDate}</td></tr>
        <tr><td style="padding:6px;color:#666">Service</td><td style="padding:6px;font-weight:bold">${jobCategory}</td></tr>
        <tr><td style="padding:6px;color:#666">Technician</td><td style="padding:6px;font-weight:bold">${technicianName}</td></tr>
      </table>
      ${pdfContent ? "<p>Please find your service report attached.</p>" : ""}
      ${whatsappLink ? `<p><a href="${whatsappLink}" style="color:#25D366">Share via WhatsApp</a></p>` : ""}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="font-size:12px;color:#999">Megtras — Professional Air Conditioning Services</p>
    </div>
  `;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: `Service Report — ${jobCategory} on ${appointmentDate}`,
    html,
    attachments,
  });
}
