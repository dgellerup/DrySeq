const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const pLimit = require("p-limit");

require("dotenv").config();

const { PrismaClient, FileCategory, DeletionReason } = require("@prisma/client");

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({ region: process.env.AWS_REGION });

const app = express();
const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET is missing or too weak");
}

const USERDATA_BUCKET = process.env.USERDATA_BUCKET;

// Enable CORS and JSON parsing
const origins = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);                 // Postman/curl
    cb(null, origins.includes(origin));                  // strict allowlist
  },
  credentials: true,                                     // ok even if not using cookies
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  exposedHeaders: ['Content-Disposition','Content-Length','ETag'],
};

app.use(cors(corsOptions));

const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requrests per windowMs
    message: { error: "Too many requests from this IP, please try again later."}
});

app.use(limiter);


app.use(express.json());

app.use((req, _res, next) => {
  if (req.url === '/api') req.url = '/';
  else if (req.url.startsWith('/api/')) req.url = req.url.slice(4);
  next();
});

// Setup file uploads
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const PYTHON_BIN =
    process.env.PYTHON_BIN ||
    (process.platform === 'win32'
        ? path.join(__dirname, 'venv', 'Scripts', 'python.exe')
        : 'python3');

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return res.sendStatus(401);

  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      // Optional hardening if you set these in sign():
      issuer: "dryseq-api",
      audience: "dryseq-frontend",
      clockTolerance: 5, // seconds of skew
    });
    req.user = { userId: payload.userId, username: payload.username };
    next();
  } catch (e) {
    return res.sendStatus(403);
  }
}

const { execFile } = require("child_process");
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        },
    },
});

function validateCategory(req, res, next) {
    const { category } = req.body;
    if (!["genomic", "primer"].includes(category)) {
        return res.status(400).json({ error: "Invalid category. Use 'genomic' or 'primer'"});
    }
    next();
}

function normalizeFilename(name) {
  const base = path.posix.basename(name || "");
  const lower = base.toLowerCase();
  const spaced = lower.replace(/\s+/g, "_");
  return spaced.replace(/[^a-z0-9._-]/g, "_");
}

function tombstoneName(orig) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `${orig}__deleted__${ts}`;
}

async function ensureS3ExistsOrTombstone({ prisma, s3, file }) {
    if (!file.path || !file.path.startsWith("s3://")) return true;

    const { bucket, key } = parseS3Uri(file.path);
    if (!bucket || !key) return NONAME;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3000);

    try {
        const cmd = new HeadObjectCommand({ Bucket: bucket, Key: key});
        await s3.send(cmd, { abortSignal: ac.signal });
        return true; // exists
    } catch (e) {
        const http = e?.$metadata?.httpStatusCode;
        const name = e?.name || e?.Code;

        if (http === 301 || name === "AuthorizationHeaderMalformed") return false;

        if (http === 404 || name === "NotFound" || name === "NoSuchKey") {
            await prisma.file.updateMany({
                where: { id: file.id, deletedAt: null },
                data: { deletedAt: new Date(), deletionReason: DeletionReason.MISSING },
            });
            return false;
        }
        return false;
    } finally {
        clearTimeout(timer);
    }
}

function withTimeout(fn, msTimeout) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), msTimeout);
    return fn(ac.signal).finally(() => clearTimeout(t));
}

async function reconcileUserS3(prisma, s3, userId) {
    const days = 7;
    const cutoff = new Date(Date.now() - (days) * 24 * 60 * 60 * 1000);
    const files = await prisma.file.findMany({
        where: { userId, deletedAt: null, uploadedAt: { lte: cutoff } },
        select: { id: true, path: true, s3Bucket: true, s3Key: true },
    });
    if (!files.length) return { checked: 0, markedDeleted: 0 };

    const limit = pLimit(5); // cap concurrency
    let marked = 0;

    await Promise.all(files.map(f => limit(async () => {
        const isS3 = isS3Uri(f.path);
        if (!isS3 && !f.s3Bucket && !f.s3Key) return;
        
        const bucket = f.s3Bucket ?? parseS3Uri(f.path).bucket;
        const key = f.s3Key ?? parseS3Uri(f.path).key;
        if (!bucket || !key) return;

        try {
            const cmd = new HeadObjectCommand({ Bucket: bucket, Key: key });
            await withTimeout(signal => s3.send(cmd, {abortSignal: signal }), 3000);
        } catch (e) {
            const http = e?.$metadata?.httpStatusCode;
            const name = e?.name || e?.Code;

            if (http === 301 || name === "AuthorizationHeaderMalformed") {
                console.warn("S3 region mismatch during reconciliation", bucket, key);
                return;
            }

            if (http === 404 || name === "NotFound" || name === "NoSuchKey") {
                await prisma.file.updateMany({
                    where: {id: f.id, deletedAt: null },
                    data: { deletedAt: new Date(), deletionReason: DeletionReason.LIFECYCLE },
                });
                marked += 1;
            } else if (name === 'AbortError') {
                console.warn("HEAD timed out for", bucket, key);
            } else {
                console.warn("HEAD fail for", bucket, key, e?.name || e);
            }
        }
    })));

    return { checked: files.length, markedDeleted: marked };
}

const isS3Uri = (p) => typeof p === 'string' && p.startsWith('s3://');

function parseS3Uri(uri) {
    if (!isS3Uri(uri)) throw new Error('Not an S3 URI');
    const rest = uri.slice(5);
    const i = rest.indexOf('/');
    if (i === -1) return { bucket: rest, key: '' };
    return { bucket: rest.slice(0, i), key: rest.slice(i + 1) };
}

// Routes
app.get('/health', (_req, res) => res.json({ ok: true }));

app.post("/register", async (req, res) => {
    const { username, password, inviteCode } = req.body;

    if (!inviteCode) {
        return res.status(400).json({ error: "Invite code is required." });
    }

    const invite = await prisma.inviteCode.findUnique({ where: { code: inviteCode } });
    if (!invite || invite.used) {
        return res.status(403).json({ error: "Invalid or already-used invite code." });
    }

    if (!username || !password){
        return res.status(400).json({ error: "Username and password required" });
    }

    const normalizedUsername = username.trim().toLowerCase();

    try {
        const existing = await prisma.user.findUnique({ where: { username: normalizedUsername } });
        if (existing) {
            return res.status(400).json({ error: "User already exists" });
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username: normalizedUsername,
                password: hashed,
            }
        });

        await prisma.inviteCode.update({
            where: { code: inviteCode },
            data: {
                used: true,
                usedById: user.id,
            },
        });

        return res.status(201).json({ success: true, userId: user.id});
    } catch (err) {
        console.error("Registration error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required "});
    }

    const normalizedUsername = username.trim().toLowerCase();

    try {
        const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });
        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        const ok = await bcrypt.compare(password, user.password); // async compare
        if (!ok) return res.status(401).json({ error: "Invalid credentials" });

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            {
                expiresIn: "1h",
                algorithm: "HS256",
                issuer: "dryseq-api",
                audience: "dryseq-frontend",
            }
        );

        res.json({ token });

        reconcileUserS3(prisma, s3, user.id)
            .then(({ checked, markedDeleted }) => {
                if (markedDeleted) console.log(`Reconciled user ${user.id}: ${markedDeleted}/${checked} missing`);
            })
            .catch(err => console.warn("Reconcile error", err));

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/files", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const primer = await prisma.file.findMany({
            where: { category: FileCategory.PRIMER, userId, deletedAt: null },
            select: { id: true, filename: true }
        });

        const genomic = await prisma.file.findMany({
            where: { category: FileCategory.GENOMIC, userId, deletedAt: null },
            select: { id: true, filename: true }
        });

        const pcr = await prisma.file.findMany({
            where: { category: FileCategory.PCR, userId, deletedAt: null },
            select: { id: true, filename: true}
        })

        res.json({ primer, genomic, pcr });
    } catch (err) {
        console.error("Error fetching files:", err);
        res.status(500).json({ error: "Failed to fetch files" });
    }
});

app.post("/upload", authenticateToken, upload.single("file"), validateCategory, async (req, res) => {
    console.log(req.body);
    const { category } = req.body;
    const userId = req.user?.userId;
    
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const normalizedName = normalizeFilename(req.file.originalname);

    if (!["genomic", "primer"].includes(category)) return res.status(400).json({ error: "Invalid category." });
    if (/\.(exe|sh|js|bat)$/i.test(normalizedName)) return res.status(400).json({ error: "Disallowed file type" });

    const existing = await prisma.file.findFirst({ where: { filename: normalizedName, userId, deletedAt: null } });

    if (existing) {
        // Upload should have been blocked but if racing clean up just-uploaded key
        return res.status(400).json({
            error: `File ${normalizedName} already exists`,
        });
    }

    const file_count = await prisma.file.count({
        where: { userId, deletedAt: null, category: { in: [ FileCategory.PRIMER, FileCategory.GENOMIC] }, },
    });

    if ( file_count > 5 ) {
        return res.status(400).json({ error: 'User already has maximum number of FASTA files (6).', });
    }

    try {

        const s3Key = `${userId}/${category}/${normalizedName}`;

        // ATOMIC put
        await s3.send(new PutObjectCommand({
            Bucket: USERDATA_BUCKET,
            Key: s3Key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype || "application/octet-stream",
            ServerSideEncryption: "AES256",
            IfNoneMatch: "*", // <-- the magic: fail with 412 if object exists
        }));

        const categoryEnumMap = {
            genomic: FileCategory.GENOMIC,
            primer: FileCategory.PRIMER,
            pcr: FileCategory.PCR,
            fastq: FileCategory.FASTQ,
        };

        const fileCategory = categoryEnumMap[category];

        if (!fileCategory) {
            return res.status(400).json({ error: "Invalid category." });
        }

        const s3Uri = `s3://${USERDATA_BUCKET}/${s3Key}`;

        const newFile = await prisma.file.create({
            data: {
                filename: normalizedName,
                path: s3Uri,
                category: fileCategory,
                userId,
            },
        });

        res.json({ message: "Upload saved", fileId: newFile.id, filename: newFile.filename, category: newFile.category });
    } catch (err) {
        // If the object already exists, S3 returns 412
        if (err?.$metadata?.httpStatusCode === 412) {
        return res.status(409).json({ error: "File already exists (not overwritten)" });
        }
        console.error("Upload error:", err);
        return res.status(500).json({ error: "Failed to save file" });
    }
});

app.get("/download/:fileId/url", authenticateToken, async (req, res) => {
    const { fileId } = req.params;

    try {
        const file = await prisma.file.findFirst({ where: { id: parseInt(fileId), deletedAt: null } });
        if (!file) return res.status(404).json({ error: "File not found" });

        if (!isS3Uri(file.path)) {
            return res.json({ url: `${process.env.API_BASE_URL}/download/${fileId}`});
        }

        const ok = await ensureS3ExistsOrTombstone({ prisma, s3, file });
        if (!ok) {
            return res.status(410).json({ error: "File no longer available" });
        }

        const { bucket, key } = parseS3Uri(file.path);

        const cmd = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            ResponseContentDisposition: `attachment; filename="${file.filename}"`,
        })

        const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 5 });

        res.json({ url});
    } catch (err) {
        console.error("Presign error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get('/download-fastq/:analysisId/zip', authenticateToken, async (req, res) => {
    const analysisId = Number(req.params.analysisId);
    const userId = req.user?.userId;

    try {
        const analysis = await prisma.fastqAnalysis.findUnique({
            where: { id: analysisId },
            include: { fastqFileR1: true, fastqFileR2: true }
        });
        if (!analysis || analysis.userId !== userId) {
            return res.status(404).json({ error: 'Analysis not found' });
        }

        const files = [analysis.fastqFileR1, analysis.fastqFileR2].filter(Boolean);
        if (files.length === 0 || files.some(f => f.deletedAt)) return res.status(404).json({ error: 'FASTQ files deleted or unavailable' });

        for (const f of files) {
            if (f.deletedAt) return res.status(410).json({ error: 'FASTQ file deleted' });
            const ok = await ensureS3ExistsOrTombstone({ prisma, s3, file: f });
            if (!ok) return res.status(410).json({ error: 'FASTQ file deleted' });
        }

        const zipName = `${analysis.analysisName || 'fastq'}_${analysis.id}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

        const archive = archiver('zip', { zlib: { level: 9 }});
        archive.on('error', (err) => { console.error(err); res.status(500).end(); });
        archive.pipe(res);

        for (const f of files) {
            const { bucket, key } = parseS3Uri(f.path);
            const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
            const entryName = f.filename || key.split('/').pop();
            archive.append(obj.Body, { name: entryName });
        }

        archive.finalize();
    } catch (err) {
        console.error('ZIP download error:', err);
        res.status(500).json({ error: 'Failed to build ZIP' });
    }
});

async function deleteFromS3(s3Uri) {
  const { bucket, key } = parseS3Uri(s3Uri);
  if (!key) return; // nothing to delete
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    // ignore "not found"; rethrow other errors
    if (err?.$metadata?.httpStatusCode !== 404) throw err;
  }
}

async function deleteManyFromS3(s3Uris = []) {
  const items = s3Uris
    .filter(Boolean)
    .filter(isS3Uri)
    .map(parseS3Uri)
    .reduce((acc, { bucket, key }) => {
      if (!key) return acc;
      (acc[bucket] ||= []).push({ Key: key });
      return acc;
    }, {});

  for (const [bucket, objects] of Object.entries(items)) {
    // DeleteObjects supports up to 1000 keys per call
    for (let i = 0; i < objects.length; i += 1000) {
      const chunk = objects.slice(i, i + 1000);
      try {
        const out = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk, Quiet: false } }));
        console.log('S3 DeleteObjects result', {
            bucket,
            deleted: out.Deleted?.map(d => d.Key) || [],
            errors: out.Errors || [],
        });

        // Fallback: if any errors, try single deletes so you see which one fails
        for (const err of out.Errors || []) {
            try {
                await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: err.Key }));
                console.log('S3 single delete succeeded after batch error', err.Key);
            } catch (e) {
                console.warn('S3 single delete still failing', err.Key, e?.name, e?.message);
            }
        }
      } catch (e) {
        console.error('S3 DeleteObjects exception', bucket, e?.name, e?.message);
      }
    }
  }
}

app.delete("/delete/:fileId", authenticateToken, async (req, res) => {
  const { fileId } = req.params;

  try {
    const file = await prisma.file.findFirst({ where: { id: Number(fileId), deletedAt: null } });

    if (!file) return res.status(404).json({ error: "File not found" });

    const filePath = file.path;

    if (isS3Uri(filePath)) {
      await deleteFromS3(filePath);
    } else {
      // local fallback
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await prisma.file.update({
        where: {
            id: Number(fileId)
        },
        data: {
            deletedAt: new Date(),
            deletionReason: DeletionReason.USER,
            filename: tombstoneName(file.filename),
        }
    });

    res.json({ message: "File deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/delete-fastq-analysis/:id", authenticateToken, async (req, res) => {
  const userId = req.user?.userId;
  const analysisId = Number(req.params.id);

  try {
    const analysis = await prisma.fastqAnalysis.findUnique({
      where: { id: analysisId },
      include: { fastqFileR1: true, fastqFileR2: true },
    });

    if (!analysis || analysis.userId !== userId) {
      return res.status(404).json({ error: "Analysis not found" });
    }

    const filesToDelete = [analysis.fastqFileR1, analysis.fastqFileR2].filter(Boolean);

    await prisma.$transaction(async (tx) => {
        await tx.fastqAnalysis.update({
            where: { id: analysisId },
            data: { deletedAt: new Date() },
        });

        for (const f of filesToDelete) {
            await tx.file.update({
                where: { id: f.id },
                data: {
                    deletedAt: new Date(),
                    deletionReason: DeletionReason.USER,
                    filename: tombstoneName(f.filename),
                },
            });
        }
    });

    // 3) Delete physical objects (S3 or local)
    const paths = file.map(f => f.path);
    const s3Uris = paths.filter(isS3Uri);
    const localPaths = paths.filter((p) => !isS3Uri(p));

    try {
      if (s3Uris.length) await deleteManyFromS3(s3Uris);
    } catch (e) {
      console.warn(`S3 delete warning: ${e?.message || e}`);
    }

    for (const p of localPaths) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) {
        console.warn(`Local file already missing: ${p}`);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to delete analysis:", err);
    res.status(500).json({ error: "Failed to delete analysis" });
  }
});

app.get("/fasta-files", authenticateToken, async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const files = await prisma.file.findMany({
    where: {
        userId,
        category: { in: [FileCategory.GENOMIC, FileCategory.PRIMER, FileCategory.PCR] },
        deletedAt: null,
    },
    include: {
        fastaAnalysis: true,
        producedByPcr: true,
        usedAsPrimerInPcr: {
        include: {
            pcrFile:       { select: { id: true, filename: true, deletedAt: true } },
            primerFile:    { select: { id: true, filename: true } },
            referenceFile: { select: { id: true, filename: true } },
        },
        orderBy: { createdAt: "desc" },
        },
        usedAsReferenceInPcr: {
        include: {
            pcrFile:       { select: { id: true, filename: true, deletedAt: true } },
            primerFile:    { select: { id: true, filename: true } },
            referenceFile: { select: { id: true, filename: true } },
        },
        orderBy: { createdAt: "desc" },
        },
        usedForFastq: {
        where: {
            AND: [
            { fastqFileR1: { deletedAt: null } },
            { fastqFileR2: { deletedAt: null } },
            ],
        },
        include: {
            fastqFileR1: { select: { id: true, filename: true, deletedAt: true } },
            fastqFileR2: { select: { id: true, filename: true, deletedAt: true } },
        },
        },
    },
    });

    const filesWithAnalysis = files.map((file) => ({
        id: file.id,
        filename: file.filename,
        category: file.category,
        uploadedAt: file.uploadedAt,
        
        analysisResult: file.fastaAnalysis?.result ?? null,
        producedByPcr: file.producedByPcr ?? null,
        usedAsPrimerInPcr: file.usedAsPrimerInPcr,
        usedAsReferenceInPcr: file.usedAsReferenceInPcr,
        usedForFastq: file.usedForFastq,
    }));

    res.json(filesWithAnalysis);
});

app.get("/fastq-files", authenticateToken, async (req, res) => {
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const analyses = await prisma.fastqAnalysis.findMany({
        where: {
            userId,
        },
        include: {
            fastqFileR1: { select: { id: true, filename: true, deletedAt: true } },
            fastqFileR2: { select: { id: true, filename: true, deletedAt: true } },
            pcrFile: { select: { id: true, filename: true, deletedAt: true } },
        },
    });

    const hydrated = analyses.map((a) => {
        const r1Deleted = !!a.fastqFileR1?.deletedAt;
        const r2Deleted = !!a.fastqFileR2?.deletedAt;
        const pcrDeleted = !!a.pcrFile?.deletedAt;

        return {
            id: a.id,
            analysisName: a.analysisName,
            sampleName: a.sampleName,
            sequenceCount: a.sequenceCount,
            createdAt: a.createdAt,

            r1: a.fastqFileR1
              ? {
                    id: a.fastqFileR1.id,
                    filename: a.fastqFileR1.filename,
                    deleted: r1Deleted,
                    displayName: r1Deleted
                        ? `${a.fastqFileR1.filename} (Deleted)`
                        : a.fastqFileR1.filename,
                }
            : null,

            r2: a.fastqFileR2
              ? {
                    id: a.fastqFileR2.id,
                    filename: a.fastqFileR2.filename,
                    deleted: r2Deleted,
                    displayName: r2Deleted
                        ? `${a.fastqFileR2.filename} (Deleted)`
                        : a.fastqFileR2.filename,
                }
            : null,

            pcr: a.pcrFile
              ? {
                    id: a.pcrFile.id,
                    filename: a.pcrFile.filename,
                    deleted: pcrDeleted,
                    displayName: pcrDeleted
                        ? `${a.pcrFile.filename} (Deleted)`
                        : a.pcrFile.filename,
              }
            : null,
        };
    });

    res.json(hydrated);
})

app.post("/analyze-fasta", authenticateToken, async (req, res) => {
    const { fileId: fastaFileId } = req.body;
    const userId = req.user?.userId;

    try {
        const fastaFile = await prisma.file.findFirst({
                where: { id: fastaFileId, userId, deletedAt: null },
                select: { id: true, path: true },
        });
        console.log(fastaFile);

        if (!fastaFile) {
            return res.status(404).json({ error: "FASTA file not found."});
        }

        const fastaPath = fastaFile.path;
        const scriptPath = path.join(__dirname, "scripts", "process_fasta.py");

        execFile(PYTHON_BIN, [scriptPath, fastaPath], async (err, stdout, stderr) => {
            if (err) {
                console.error("Python error:", stderr);
                return res.status(500).json({ error: "Processing failed" });
            }

            let result;
            try {
                result = JSON.parse(stdout.trim());
            } catch (e) {
                console.error("Failed to parse JSON from Python script:", stdout);
                return res.status(500).json({ error: "Invalid analysis result format "});
            }

            await prisma.fastaAnalysis.upsert({
                where: {
                    userId_fastaFileId: {
                        userId,
                        fastaFileId: fastaFile.id,
                    },
                },
                update: {
                    result: `Found ${result.sequence_count} sequences.`,
                },
                create: {
                    userId,
                    fastaFileId: fastaFile.id,
                    result: `Found ${result.sequence_count} sequences.`,
                },
            });

            res.json({
                message: "Analysis complete",
                "result": {
                    "sequence_count": result.sequence_count,
                },
            });
        });
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/run-pcr", authenticateToken, async (req, res) => {
    const { primerFileId, referenceFileId, pcrAnalysisName, cyclesCount } = req.body;
    const userId = req.user?.userId;
    console.log(Object.keys(prisma.pcrAnalysis.fields));
    const existing = await prisma.pcrAnalysis.findUnique({
        where: {
            userId_primerFileId_referenceFileId_pcrAnalysisName_cyclesCount: {
                userId,
                primerFileId,
                referenceFileId,
                pcrAnalysisName,
                cyclesCount,
            },
        },
        include: {
            primerFile: true,
            referenceFile: true,
        },
    });

    if (existing) {
        console.log("Existing PCR found:", existing);
        return res.json({
            message: "PCR already exists",
            result: existing.result,
            files: [
                { id: existing.primerFile?.id, filename: existing.primerFile?.filename },
                { id: existing.referenceFile?.id, filename: existing.referenceFile?.filename },
            ],
        });
    }

    try {
        const [primerFile, referenceFile] = await Promise.all([
            prisma.file.findFirst({
                where: { id: primerFileId, userId, deletedAt: null },
                select: { id: true, path: true, filename: true },
            }),
            prisma.file.findFirst({
                where: { id: referenceFileId, userId, deletedAt: null },
                select: { id: true, path: true, filename: true },
            }),
        ]);

        if (!primerFile || !referenceFile) {
            return res.status(404).json({ error: "Primer or reference file not found or not owned by user" });
        }

        const safeName = pcrAnalysisName?.replace(/[^a-zA-Z0-9_\-]/g, "").replace(/\.(fastq|fq)(\.gz)?$/i, "");
        
        const primerPath = primerFile.path;
        const referencePath = referenceFile.path;
        const outputS3Prefix = `s3://${USERDATA_BUCKET}/${userId}/pcr`;
        const scriptPath = path.join(__dirname, "scripts", "pcr.py");

        // create_fastq.py args: --primer_path, --reference_path, --output_s3_prefix, --pcr_analysis_name, --cycle_count

        const args = [
            scriptPath,
            "--primer_path", primerPath,
            "--reference_path", referencePath,
            "--output_s3_prefix", outputS3Prefix,
            "--pcr_analysis_name", safeName,
            "--cycle_count", cyclesCount,
        ];

        try {    
            execFile(PYTHON_BIN, args, async (err, stdout, stderr) => {
                console.log("execFile finished running");
                console.log("STDOUT:", stdout);
                console.error("STDERR:", stderr);
                if (err) {
                    console.error("Python error:", stderr);
                    return res.status(500).json({ error: "Processing failed" });
                }

                let result;
                try {
                    result = JSON.parse(stdout.trim());
                } catch (e) {
                    console.error("Failed to parse JSON from Python script:", stdout);
                    return res.status(500).json({ error: "Invalid analysis result format "});
                }

                console.log("Parsed result:", result);

                if (result.status !== "success") {
                    console.error("Analysis failed:", result.error);
                    return res.status(500).json({ error: result.error || "Unknown failure" });
                }

                try {
                    const filename = path.basename(result.pcr_path);

                    const pcrCreate = await prisma.file.create({
                            data: {
                                filename: filename,
                                path: result.pcr_path,
                                category: FileCategory.PCR,
                                userId,
                            },
                        });

                    await prisma.pcrAnalysis.create({
                        data: {
                            userId,
                            pcrAnalysisName: safeName,
                            cyclesCount,

                            pcrFileId: pcrCreate.id,
                            pcrFilename: pcrCreate.filename,   // <-- correct key

                            primerFileId: primerFile.id,
                            primerFilename: primerFile.filename,

                            referenceFileId: referenceFile.id,
                            referenceFilename: referenceFile.filename,

                            result: JSON.stringify(result),
                        },
                    });
                    
                    res.json({
                        message: "PCR file created successfully",
                        pcrAnalysisName: safeName,
                        file: pcrCreate,
                        path: result.pcr_path,
                        filename: filename,
                    });
                } catch (err) {
                    console.error("Database error:", err);
                    res.status(500).json({ error: "Failed to save PCR file", details: err.message || err});
                }            
            });
        } catch (e) {
            console.error("Unhandled error in execFile callback:", e);
        }
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/create-fastq", authenticateToken, async (req, res) => {
    const { pcrFileId, sampleName, sequenceCount, analysisName } = req.body;
    const userId = req.user?.userId;

    const existing = await prisma.fastqAnalysis.findUnique({
        where: {
            userId_sampleName_pcrFileId_sequenceCount_analysisName: {
                userId,
                sampleName,
                pcrFileId,
                sequenceCount,
                analysisName
            },
        },
        include: {
            fastqFileR1: true,
            fastqFileR2: true,
            pcrFile: true,
        },
    });

    if (existing) {
        console.log("Existing analysis found:", existing);
        return res.json({
            message: "Analysis already exists",
            result: existing.result,
            files: [
                { id: existing.fastqFileR1?.id, filename: existing.fastqFileR1?.filename },
                { id: existing.fastqFileR2?.id, filename: existing.fastqFileR2?.filename },
            ],
        });
    }

    try {
        const pcrFile = await prisma.file.findFirst({
                where: { id: pcrFileId, userId, deletedAt: null },
            });

        if (!pcrFile) {
            return res.status(404).json({ error: "PCR file not found or not owned by user" });
        }

        const safeName = sampleName?.replace(/[^a-zA-Z0-9_\-]/g, "").replace(/\.(fastq|fq)(\.gz)?$/i, "");
        
        const pcrPath = pcrFile.path;
        const outputS3Prefix = `s3://${USERDATA_BUCKET}/${userId}/fastq`
        const scriptPath = path.join(__dirname, "scripts", "create_fastq.py");

        // create_fastq.py args: --pcr_path, --output_s3_prefix, --sample_name, --sequence_count

        const args = [
            scriptPath,
            "--pcr_path", pcrPath,
            "--output_s3_prefix", outputS3Prefix,
            "--sample_name", safeName,
            "--sequence_count", sequenceCount,
        ];

        try {    
            execFile(PYTHON_BIN, args, async (err, stdout, stderr) => {
                console.log("execFile finished running");
                console.log("STDOUT:", stdout);
                console.error("STDERR:", stderr);
                if (err) {
                    console.error("Python error:", stderr);
                    return res.status(500).json({ error: "Processing failed" });
                }

                let result;
                try {
                    result = JSON.parse(stdout.trim());
                } catch (e) {
                    console.error("Failed to parse JSON from Python script:", stdout);
                    return res.status(500).json({ error: "Invalid analysis result format "});
                }

                console.log("Parsed result:", result);

                if (result.status !== "success") {
                    console.error("Analysis failed:", result.error);
                    return res.status(500).json({ error: result.error || "Unknown failure" });
                }

                console.log("Success so far!", result );

                const filenameR1 = path.basename(result.r1_path);
                const filenameR2 = path.basename(result.r2_path);

                try {
                    const [fileR1, fileR2] = await Promise.all([
                        prisma.file.create({
                            data: {
                                filename: filenameR1,
                                path: result.r1_path,
                                category: FileCategory.FASTQ,
                                userId,
                            },
                        }),
                        prisma.file.create({
                            data: {
                                filename: filenameR2,
                                path: result.r2_path,
                                category: FileCategory.FASTQ,
                                userId,
                            },
                        }),
                    ]);

                    await prisma.fastqAnalysis.create({
                        data: {
                            userId,
                            pcrFileId,
                            result: JSON.stringify(result),
                            analysisName,
                            sampleName,
                            sequenceCount,
                            fastqFileR1Id: fileR1.id,
                            fastqFileR2Id: fileR2.id,
                            pcrFilename: pcrFile.filename,
                        },
                    });

                    res.json({
                        message: "FASTQ files created successfully",
                        sampleName: safeName,
                        files: [fileR1, fileR2],
                        paths: { r1: result.r1_path, r2: result.r2_path },
                    });
                } catch (err) {
                    console.error("Database error:", err);
                    res.status(500).json({ error: "Failed to save FASTQ file", details: err.message || err});
                }            
            });
        } catch (e) {
            console.error("Unhandled error in execFile callback:", e);
        }
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/analyses", authenticateToken, async (req, res) => {
    const userId = req.user?.userId;

    const analyses = await prisma.fastaAnalysis.findMany({
        where: { userId },
        include: {
            fastaFile: true,
        },
        orderBy: { createdAt: "desc" },
    });

    res.json(analyses);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

app.use((err, req, res, next) => {
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: "File too large. Max size is 10MB." });
    }
    next(err);
});

process.on("SIGINT", async () => {
    console.log("Shutting down gracefully...");
    await prisma.$disconnect();
    process.exit(0);
});