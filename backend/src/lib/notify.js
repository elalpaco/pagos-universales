import prisma from "./prisma.js";
import { config } from "../config.js";

let transporterPromise = null;

async function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporterPromise) {
    transporterPromise = import("nodemailer").then(({ default: nodemailer }) =>
      nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      })
    );
  }
  return transporterPromise;
}

// Crea una notificación in-app y, si hay SMTP configurado y el usuario lo permite, envía email.
export async function notify(userId, { type, title, body }) {
  const notification = await prisma.notification.create({
    data: { userId, type, title, body },
  });

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.notifyEmail && config.smtp.host) {
      const transporter = await getTransporter();
      if (transporter) {
        await transporter.sendMail({
          from: config.smtp.from,
          to: user.email,
          subject: title,
          text: body,
        });
      }
    }
  } catch (err) {
    console.error("No se pudo enviar email de notificación:", err?.message || err);
  }

  return notification;
}
