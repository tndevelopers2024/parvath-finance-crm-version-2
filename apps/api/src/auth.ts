import { Router } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { randomBytes, createHash } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { db } from "./db.js";
import { config } from "./config.js";
import { HttpError, requireAuth } from "./security.js";
import { integrations } from "./integrations.js";
export const auth = Router();
auth.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    skip: (req) => req.method === "GET",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new HttpError(429, "Too many account changes. Please try again later."),
      ),
  }),
);
auth.get("/csrf", (req, res) => {
  req.session.csrf ||= randomBytes(32).toString("hex");
  res.json({ data: { csrf: req.session.csrf } });
});
auth.post(
  "/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    // An office behind one address must not lock itself out by signing in normally.
    skipSuccessfulRequests: true,
    handler: (_req, _res, next) =>
      next(
        new HttpError(
          429,
          "Too many sign-in attempts. Please try again later.",
        ),
      ),
  }),
  async (req, res) => {
    const { email, password } = z
      .object({ email: z.email(), password: z.string().min(1).max(200) })
      .parse(req.body);
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { memberships: true },
    });
    const dummy =
      "$argon2id$v=19$m=65536,t=3,p=4$ZXhhbXBsZXNhbHQxMjM0NQ$k+3UDWu+bVEPXXJIEze02SYAb/YsJiJCgeYzSp7WJBw";
    const valid = await argon2
      .verify(user?.passwordHash || dummy, password)
      .catch(() => false);
    if (!user || !valid || !user.active || !user.memberships.length)
      throw new HttpError(401, "Email or password is incorrect");
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = user.id;
    req.session.organizationId = user.memberships[0].organizationId;
    req.session.csrf = randomBytes(32).toString("hex");
    res.json({ data: { csrf: req.session.csrf } });
  },
);
auth.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("parvath.sid");
    res.json({ data: { success: true } });
  });
});
auth.get("/me", requireAuth, async (req, res) => {
  const u = await db.user.findUniqueOrThrow({
    where: { id: req.auth.userId },
    select: { id: true, name: true, email: true },
  });
  res.json({
    data: {
      ...u,
      ...req.auth,
      csrf: req.session.csrf,
      demoDate: config.DEMO_DATE || null,
      integrations: integrations(req.auth.role === "Administrator"),
    },
  });
});
auth.patch("/account", requireAuth, async (req, res) => {
  const v = z
    .object({
      name: z.string().trim().min(2).max(100),
      currentPassword: z.string().min(1),
      newPassword: z.string().min(12).max(128).optional(),
    })
    .parse(req.body);
  const u = await db.user.findUniqueOrThrow({ where: { id: req.auth.userId } });
  if (!(await argon2.verify(u.passwordHash, v.currentPassword)))
    throw new HttpError(400, "Current password is incorrect");
  await db.user.update({
    where: { id: u.id },
    data: {
      name: v.name,
      ...(v.newPassword
        ? { passwordHash: await argon2.hash(v.newPassword) }
        : {}),
    },
  });
  if (v.newPassword)
    await db.native
      .collection<any>("sessions")
      .deleteMany({ "session.userId": u.id, _id: { $ne: req.sessionID } });
  res.json({ data: { success: true } });
});
auth.post(
  "/forgot-password",
  rateLimit({
    windowMs: 3600000,
    limit: 5,
    handler: (_req, _res, next) =>
      next(
        new HttpError(429, "Too many reset requests. Please try again later."),
      ),
  }),
  async (req, res) => {
    const { email } = z.object({ email: z.email() }).parse(req.body);
    if (!config.SMTP_URL)
      throw new HttpError(
        503,
        "Password reset email is not configured. Contact your workspace administrator.",
      );
    const u = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (u) {
      const token = randomBytes(32).toString("hex");
      await db.passwordReset.create({
        data: {
          userId: u.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          expiresAt: new Date(Date.now() + 1800000),
        },
      });
      const nodemailer = await import("nodemailer");
      await nodemailer.default.createTransport(config.SMTP_URL).sendMail({
        from: config.MAIL_FROM,
        to: u.email,
        subject: "Reset your Parvath FinServ password",
        text: `Use this link within 30 minutes: ${config.APP_ORIGIN}/reset-password?token=${token}`,
      });
    }
    res.json({
      data: {
        message: "If the account exists, a reset link has been emailed.",
      },
    });
  },
);
auth.post("/reset-password", async (req, res) => {
  const v = z
    .object({
      token: z.string().length(64),
      password: z.string().min(12).max(128),
    })
    .parse(req.body);
  const hash = createHash("sha256").update(v.token).digest("hex");
  await db.transaction(async (tx) => {
    const reset = await tx.passwordReset.findUnique({
      where: { tokenHash: hash },
    });
    if (!reset || reset.usedAt || reset.expiresAt < new Date())
      throw new HttpError(400, "Reset link is invalid or expired");
    const result = await tx.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (!result.count)
      throw new HttpError(409, "Reset link has already been used");
    await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash: await argon2.hash(v.password) },
    });
    await tx.native
      .collection("sessions")
      .deleteMany({ "session.userId": reset.userId }, { session: tx.session });
  });
  res.json({ data: { success: true } });
});
