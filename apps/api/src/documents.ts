import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { Router } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { db } from "./db.js";
import { now } from "./domain.js";
import { audit, holdClient, HttpError, owned, permit } from "./security.js";
export const s3 = new S3Client({
  region: config.S3_REGION,
  endpoint: config.S3_ENDPOINT || undefined,
  forcePathStyle: !!config.S3_ENDPOINT,
  ...(config.S3_ACCESS_KEY && config.S3_SECRET_KEY
    ? {
        credentials: {
          accessKeyId: config.S3_ACCESS_KEY,
          secretAccessKey: config.S3_SECRET_KEY,
        },
      }
    : {}),
});
export const documents = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
documents.post(
  "/clients/:id/documents",
  permit("operate"),
  upload.single("file"),
  async (req, res) => {
    const c = await owned("client", String(req.params.id), req);
    if (!config.S3_BUCKET)
      throw new HttpError(503, "Private document storage is not configured");
    const f = req.file;
    if (!f)
      throw new HttpError(
        400,
        "Choose a PDF, JPEG, or PNG file (maximum 10 MB)",
      );
    const detected = await fileTypeFromBuffer(f.buffer);
    const ext = f.originalname.split(".").pop()?.toLowerCase();
    const allowed: Record<string, string[]> = {
      "application/pdf": ["pdf"],
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
    };
    if (!detected || !allowed[detected.mime]?.includes(ext || ""))
      throw new HttpError(
        400,
        "File extension and detected content must match PDF, JPEG, or PNG",
      );
    const purpose = req.body.purpose === "Photo" ? "Photo" : "Document";
    if (purpose === "Photo" && !detected.mime.startsWith("image/"))
      throw new HttpError(422, "A profile photo must be JPEG or PNG");
    const key = `${req.auth.organizationId}/${randomUUID()}.${detected.ext}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: key,
        Body: f.buffer,
        ContentType: detected.mime,
      }),
    );
    try {
      const doc = await db.transaction(async (tx) => {
        await holdClient(tx, c.id, req);
        const d = await tx.document.create({
          data: {
            organizationId: req.auth.organizationId,
            clientId: c.id,
            key,
            name: f.originalname
              .replace(/[^\p{L}\p{N} ._-]/gu, "")
              .slice(0, 150),
            size: f.size,
            purpose,
            contentType: detected.mime,
            uploadedBy: req.auth.userId,
          },
        });
        await tx.job.create({
          data: {
            organizationId: req.auth.organizationId,
            key: `scan-${d.id}`,
            type: "scan",
            payload: { documentId: d.id },
            runAt: now(),
          },
        });
        await audit(
          tx,
          req,
          "upload",
          "Document",
          d.id,
          "Document uploaded to quarantine",
        );
        return d;
      });
      res
        .status(201)
        .json({ data: { id: doc.id, name: doc.name, status: doc.status } });
    } catch (e) {
      await s3.send(
        new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
      );
      throw e;
    }
  },
);
documents.get("/documents/:id/download", async (req, res) => {
  const d = await owned("document", String(req.params.id), req);
  if (d.status !== "Available")
    throw new HttpError(
      409,
      "This file is quarantined until the security scan completes",
    );
  if (!config.S3_BUCKET)
    throw new HttpError(503, "Private document storage is not configured");
  let file;
  try {
    file = await s3.send(
      new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: d.key }),
    );
  } catch (e: any) {
    if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404)
      throw new HttpError(404, "The stored file could not be found");
    throw e;
  }
  await audit(db, req, "download", "Document", d.id, "Document downloaded");
  res.type(d.contentType).attachment(d.name);
  res.setHeader("Cache-Control", "private, no-store");
  // pipeline destroys the S3 stream if the client goes away and surfaces a mid-stream failure
  // as a rejection instead of an unhandled 'error' event that would take the process down.
  try {
    await pipeline(file.Body as Readable, res);
  } catch {
    if (!res.headersSent) throw new HttpError(502, "File download failed");
    res.destroy();
  }
});
