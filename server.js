import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";
import crypto from "crypto";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const COLLEGE_CODE = process.env.COLLEGE_CODE || "COLL";
const VERIFICATION_BASE_URL =
  process.env.VERIFICATION_BASE_URL || "https://college.example.com/verify";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "password";
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || "change-me";

const ADMIN_TOKEN = crypto
  .createHash("sha256")
  .update(`${ADMIN_USER}:${ADMIN_PASS}:${ADMIN_TOKEN_SECRET}`)
  .digest("hex");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));
app.use("/inpts", express.static("inpts"));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}
const pdfDir = path.join(uploadsDir, "certificates");
if (!existsSync(pdfDir)) {
  mkdirSync(pdfDir, { recursive: true });
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// In-memory store
let requests = [];
const certificateSequenceByYear = new Map();

// Basic admin auth helpers
const parseCookies = (req) => {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [key, ...v] = part.trim().split("=");
    acc[key] = decodeURIComponent(v.join("="));
    return acc;
  }, {});
};

const isAdminAuthenticated = (req) => {
  const cookies = parseCookies(req);
  return cookies.admin_token === ADMIN_TOKEN;
};

const requireAdmin = (req, res, next) => {
  if (!isAdminAuthenticated(req)) {
    return res.redirect("/admin-login.html");
  }
  next();
};

// Admin auth + protected pages
app.get("/admin-login.html", (req, res) => {
  if (isAdminAuthenticated(req)) {
    return res.redirect("/admin-dashboard.html");
  }
  res.sendFile(path.join(__dirname, "public", "admin-login.html"));
});

app.post("/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.setHeader(
      "Set-Cookie",
      `admin_token=${ADMIN_TOKEN}; HttpOnly; Path=/; SameSite=Lax`
    );
    return res.redirect("/admin-dashboard.html");
  }
  res.status(401).send("Invalid credentials");
});

app.get("/admin-dashboard.html", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-dashboard.html"));
});

app.get("/admin-review.html", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-review.html"));
});

// Legacy admin page redirect
app.get("/admin.html", (req, res) => {
  res.redirect("/admin-dashboard.html");
});

app.get("/admin/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    "admin_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0"
  );
  res.redirect("/admin-login.html");
});

// Admin: generate/download certificate PDF
app.get("/admin/certificates/:certificateId/pdf", requireAdmin, async (req, res) => {
  const certificateId = decodeURIComponent(req.params.certificateId);
  const record = requests.find(
    (r) => r?.certificate?.certificateId && r.certificate.certificateId === certificateId
  );

  if (!record || record.certificate?.status !== "VERIFIED") {
    return res.status(404).json({ error: "Certificate not found or not verified" });
  }

  const fileName = `${sanitizeFilename(certificateId)}.pdf`;
  const pdfPath = path.join(pdfDir, fileName);

  try {
    const origin = `${req.protocol}://${req.get("host")}`;
    const certUrl = `${origin}/certificate.html?certificateId=${encodeURIComponent(certificateId)}`;

    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto(certUrl, { waitUntil: "networkidle0" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
    await browser.close();

    return res.download(pdfPath, fileName);
  } catch (error) {
    console.error("PDF generation failed:", error);
    return res.status(500).json({ error: "Unable to generate PDF" });
  }
});

// Helpers for certificate generation
const sanitizeDocType = (docType = "DOC") =>
  String(docType)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "-")
    .replace(/-+/g, "-");

const nextSequenceForYear = (year) => {
  const current = certificateSequenceByYear.get(year) || 0;
  const next = current + 1;
  certificateSequenceByYear.set(year, next);
  return next;
};

const generateCertificateId = (docType) => {
  const year = new Date().getFullYear();
  const sequence = String(nextSequenceForYear(year)).padStart(4, "0");
  const docSegment = sanitizeDocType(docType);
  return `${COLLEGE_CODE}/${year}/${docSegment}/${sequence}`;
};

const buildVerificationUrl = (certificateId) =>
  `${VERIFICATION_BASE_URL}/${encodeURIComponent(certificateId)}`;

const sanitizeFilename = (name) =>
  String(name || "file")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const buildCertificateRecord = (payload = {}) => ({
  certificateId: null,
  issuedOn: null,
  validUntil: payload.validUntil || null,
  department: payload.department || null,
  program: payload.program || null,
  academicYear: payload.academicYear || null,
  enrollmentNumber: payload.enrollmentNumber || null,
  approvedBy: {
    name: payload.approvedBy?.name || null,
    designation: payload.approvedBy?.designation || null,
    office: payload.approvedBy?.office || null,
  },
  status: "PROVISIONAL",
  verificationUrl: null,
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Student submits form
app.post("/submit", upload.single("signature"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Signature file is required" });
    }
    
    const { name, roll, docType } = req.body;
    if (!name || !roll || !docType) {
      return res.status(400).json({ error: "Name, roll number, and document type are required" });
    }
    
    const signaturePath = `/uploads/${req.file.filename}`;
    const newReq = {
      id: Date.now(),
      name,
      roll,
      docType,
      signature: signaturePath,
      requestStatus: "Pending",
      certificate: buildCertificateRecord(req.body),
    };
    requests.push(newReq);
    res.json({ message: "Request submitted!", data: newReq });
  } catch (error) {
    console.error("Error submitting request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin fetch all requests
app.get("/requests", (req, res) => {
  res.json(requests);
});

// Approve request
app.patch("/approve/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = requests.find((x) => x.id === id);
    if (!r) {
      return res.status(404).json({ error: "Not found" });
    }

    // Validate required fields for certificate issuance
    const requiredFields = [
      { key: "name", value: r.name },
      { key: "roll", value: r.roll },
      { key: "docType", value: r.docType },
      { key: "signature", value: r.signature },
      { key: "department", value: req.body.department ?? r.certificate?.department },
      { key: "program", value: req.body.program ?? r.certificate?.program },
      { key: "academicYear", value: req.body.academicYear ?? r.certificate?.academicYear },
      { key: "enrollmentNumber", value: req.body.enrollmentNumber ?? r.certificate?.enrollmentNumber },
      { key: "approvedBy.name", value: req.body.approvedBy?.name ?? r.certificate?.approvedBy?.name },
      {
        key: "approvedBy.designation",
        value: req.body.approvedBy?.designation ?? r.certificate?.approvedBy?.designation,
      },
      { key: "approvedBy.office", value: req.body.approvedBy?.office ?? r.certificate?.approvedBy?.office },
    ];

    const missing = requiredFields
      .filter((f) => !f.value)
      .map((f) => f.key);

    if (missing.length) {
      return res.status(400).json({ error: "Missing required fields", fields: missing });
    }

    // Merge any updated academic details provided at approval time
    r.certificate = {
      ...buildCertificateRecord(),
      ...r.certificate,
      department: req.body.department ?? r.certificate?.department ?? null,
      program: req.body.program ?? r.certificate?.program ?? null,
      academicYear: req.body.academicYear ?? r.certificate?.academicYear ?? null,
      enrollmentNumber: req.body.enrollmentNumber ?? r.certificate?.enrollmentNumber ?? null,
      validUntil: req.body.validUntil ?? r.certificate?.validUntil ?? null,
      approvedBy: {
        name: req.body.approvedBy?.name ?? r.certificate?.approvedBy?.name ?? null,
        designation:
          req.body.approvedBy?.designation ?? r.certificate?.approvedBy?.designation ?? null,
        office: req.body.approvedBy?.office ?? r.certificate?.approvedBy?.office ?? null,
      },
    };

    // Only generate certificateId once
    if (!r.certificate.certificateId) {
      const certificateId = generateCertificateId(r.docType);
      r.certificate.certificateId = certificateId;
      r.certificate.issuedOn = new Date().toISOString();
      r.certificate.verificationUrl = buildVerificationUrl(certificateId);
    }

    r.certificate.status = "VERIFIED";
    r.requestStatus = "Approved";
    res.json(r);
  } catch (error) {
    console.error("Error approving request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Deny request
app.patch("/deny/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = requests.find((x) => x.id === id);
    if (!r) {
      return res.status(404).json({ error: "Not found" });
    }
    r.requestStatus = "Denied";
    if (r.certificate) {
      r.certificate.status = "REVOKED";
    }
    res.json(r);
  } catch (error) {
    console.error("Error denying request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fetch certificate by certificateId
app.get("/certificates/:certificateId", (req, res) => {
  const certificateId = decodeURIComponent(req.params.certificateId);
  const record = requests.find(
    (r) => r?.certificate?.certificateId && r.certificate.certificateId === certificateId
  );
  if (!record || record.certificate?.status !== "VERIFIED") {
    return res.status(404).json({ error: "Certificate not found" });
  }
  res.json(record);
});

// 404 handler for unknown routes (after all routes)
app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.originalUrl });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
});
