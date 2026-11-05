import nodemailer from "nodemailer";
import type { ValidPractitioner } from "@/lib/practitioners";
import { SITE_URL } from "@/lib/siteUrl";

/** Gmail's existing OAuth connection is read-only; use an owner's SMTP account. */
export async function notifyPractitionerApplication(
  application: ValidPractitioner & { email: string; userId: string },
): Promise<void> {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!user || !pass?.trim()) {
    console.warn(
      "Practitioner notification skipped: SMTP_USER and SMTP_PASS are required.",
    );
    return;
  }

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  try {
    await transport.sendMail({
      from: user,
      to:
        process.env.ADMIN_EMAIL?.trim() ||
        process.env.ADMIN_NOTIFY_EMAIL?.trim() ||
        "ishibashm@gmail.com",
      subject: "【Cloud Palette】鑑定士掲載の申請（承認待ち）",
      text: [
        "鑑定士掲載の申請・更新が届きました。",
        `掲載名: ${application.displayName}`,
        `紹介文: ${application.headline}`,
        `メール: ${application.email}`,
        `ユーザーID: ${application.userId}`,
        `対応地域: ${application.area}`,
        `得意分野: ${application.specialties.join("、")}`,
        `URL: ${application.websiteUrl || "なし"}`,
        "本文:",
        application.profile,
        "",
        `確認・承認: ${SITE_URL}/admin/practitioners`,
      ].join("\n"),
    });
  } finally {
    transport.close();
  }
}
