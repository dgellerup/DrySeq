const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");

const { PrismaClient, FileCategory } = require("@prisma/client");

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({ region: process.env.AWS_REGION });

const app = express();
const PORT = 5000;
const SECRET = "queen-dinah-rules-seattle";
const USERDATA_BUCKET = process.env.USERDATA_BUCKET;

const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requrests per windowMs
    message: { error: "Too many requests from this IP, please try again later."}
});

app.use(limiter);

// Enable CORS and JSON parsing
app.use(cors({}));
app.use(express.json());

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
// Setup file uploads
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Auth middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.sendStatus(401);
    
    jwt.verify(token, SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = { userId: user.userId, username: user.username };
        next();
    });
}

// Routes
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
        const user = await prisma.user.findUnique({
            where: { username: normalizedUsername },
        });

        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            SECRET,
            { expiresIn: "1h"}
        );

        res.json({ token });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/files", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const primer = await prisma.file.findMany({
            where: { category: FileCategory.PRIMER, userId },
            select: { id: true, filename: true }
        });

        const genomic = await prisma.file.findMany({
            where: { category: FileCategory.GENOMIC, userId },
            select: { id: true, filename: true }
        });

        const pcr = await prisma.file.findMany({
            where: { category: FileCategory.PCR, userId },
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

    const existing = await prisma.file.findFirst({ where: { filename: normalizedName, userId } });

    if (existing) {
        // Upload should have been blocked but if racing clean up just-uploaded key
        return res.status(400).json({
            error: `File ${normalizedName} already exists`,
        });
    }

    const file_count = await prisma.file.count({
        where: { userId, category: { in: [ FileCategory.PRIMER, FileCategory.GENOMIC] }, },
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

app.get("/download/:fileId", authenticateToken, async (req, res) => {
    const { fileId } = req.params;

    try {
        const file = await prisma.file.findUnique({ where: { id: parseInt(fileId) } });
        if (!file) return res.status(404).json({ error: "File not found" });

        if (!file.path.startsWith("s3://")) {
            return res.json({ url: `${process.env.API_BASE_URL}/download/${fileId}`});
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
      const Chunk = objects.slice(i, i + 1000);
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: Chunk } }));
    }
  }
}

app.delete("/delete/:fileId", async (req, res) => {
    const { fileId } = req.params;

    try {
        const file = await prisma.file.findUnique({ where: { id: parseInt(fileId) } });
        if (!file) return res.status(404).json({ error: "File not found" });

        const filePath = file.path;

        await deleteFromS3(filePath);

        await prisma.file.delete({ where: {id: parseInt(fileId) } }); // Remove from DB

        res.json({ message: "file deleted successfully" });
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

    const fileIdsToDelete = [analysis.fastqFileR1Id, analysis.fastqFileR2Id].filter(Boolean);
    const paths = [analysis.fastqFileR1?.path, analysis.fastqFileR2?.path].filter(Boolean);

    // 1) Remove analysis first (FK-safe)
    await prisma.fastqAnalysis.delete({ where: { id: analysisId } });

    // 2) Delete files from DB
    if (fileIdsToDelete.length) {
      await prisma.file.deleteMany({ where: { id: { in: fileIdsToDelete } } });
    }

    // 3) Delete physical objects (S3 or local)
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

    const files = await prisma.file.findMany({
        where: {
            userId,
            category: { in: [FileCategory.GENOMIC, FileCategory.PRIMER] },
        },
        include: {
            fastaAnalysis:true,
            primerAnalyses: {
                include: {
                    fastqFileR1: true,
                    fastqFileR2: true,
                },
            },
            referenceAnalyses: {
                include: {
                    fastqFileR1: true,
                    fastqFileR2: true,
                },
            },
        },
    });

    const filesWithAnalysis = files.map((file) => {

        const analysisResult = file.fastaAnalysis?.result ?? null;
        
        return {
            ...file,
            analysisResult,
        };
    });

    res.json(filesWithAnalysis);
});

app.get("/fastq-files", authenticateToken, async (req, res) => {
    const userId = req.user?.userId;

    const analyses = await prisma.fastqAnalysis.findMany({
        where: {
            userId,
        },
        include: {
            fastqFileR1: true,
            fastqFileR2: true,
            primerFile: true,
            referenceFile: true,
        },
    });

    const hydrated = analyses.map((analysis) => ({
        ...analysis,
        primerFilename: analysis.primerFile
            ? analysis.primerFile.filename
            : `${analysis.primerFilename} (Deleted)`,
        
        referenceFilename: analysis.referenceFile
            ? analysis.referenceFile.filename
            : `${analysis.referenceFilename} (Deleted)`
    }));

    res.json(hydrated);
})

app.post("/analyze-fasta", authenticateToken, async (req, res) => {
    const { fileId: fastaFileId } = req.body;
    const userId = req.user?.userId;

    try {
        const fastaFile = await prisma.file.findFirst({
                where: { id: fastaFileId, userId },
        });
        console.log(fastaFile);

        if (!fastaFile) {
            return res.status(404).json({ error: "FASTA file not found."});
        }

        const fastaPath = fastaFile.path;
        const scriptPath = path.join(__dirname, "scripts", "process_fasta.py");
        const venvPython = path.join(__dirname, "venv", "Scripts", "python.exe");

        execFile(venvPython, [scriptPath, fastaPath], async (err, stdout, stderr) => {
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

app.get("/run-pcr", authenticateToken, async (req, rew) => {
    const { primerFileId, referenceFileId, pcrAnalysisName, cycleCount } = req.body;
    const userId = req.user?.userId;

    const existing = await prisma.pcrAnalysis.findUnique({
        where: {
            userId_primerFileId_referenceFileId_pcrAnalysisName_cycleCount: {
                userId,
                primerFileId,
                referenceFileId,
                pcrAnalysisName,
                cycleCount,
            },
        },
        include: {
            primerFile: true,
            referenceFile: true,
            cyclesCount: true,
        },
    });

    if (existing) {
        console.log("Existing PCR found:", existing);
        return res.json({
            message: "PCR already exists",
            result: existing.result,
            files: [
                { id: existing.primerFile?.id, filename: exitsing.primerFile?.filename },
                { id: existing.referenceFile?.id, filename: existing.referenceFile?.filename },
            ],
        });
    }

    try {
        const [primerFile, referenceFile] = await Promise.all([
            prisma.file.findFirst({
                where: { id: primerFileId, userId },
            }),
            prisma.file.findFirst({
                where: { id: referenceFileId, userId },
            }),
        ]);

        if (!primerFile || !referenceFile) {
            return res.status(404).json({ error: "Primer or reference file not found or not owned by user" });
        }

        const safeName = sampleName?.replace(/[^a-zA-Z0-9_\-]/g, "").replace(/\.(fastq|fq)(\.gz)?$/i, "");
        
        const primerPath = primerFile.path;
        const referencePath = referenceFile.path;
        const outputS3Prefix = `${USERDATA_BUCKET}/${userId}/pcr`;
        const scriptPath = path.join(__dirname, "scripts", "pcr.py");
        const venvPython = path.join(__dirname, "venv", "Scripts", "python.exe");

        // create_fastq.py args: --primer_path, --reference_path, --output_s3_prefix, --pcr_analysis_name, --cycle_count

        const args = [
            scriptPath,
            "--primer_path", primerPath,
            "--reference_path", referencePath,
            "--output_s3_prefix", outputS3Prefix,
            "--pcr_analysis_name", safeName,
            "--cycle_count", sequenceCount,
        ];

        try {    
            execFile(venvPython, args, async (err, stdout, stderr) => {
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

                const pcrFilename = path.basename(result.pcr_path);

                try {
                    const pcrCreate = prisma.file.create({
                            data: {
                                filename: pcrFilename,
                                path: result.pcr_path,
                                category: FileCategory.FASTA,
                                userId,
                            },
                        });

                    res.json({
                        message: "PCR files created successfully",
                        pcrAnalysisName: safeName,
                        file: pcrCreate,
                        path: result.pcr_path,
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
    const { primerFileId, referenceFileId, sampleName, sequenceCount, analysisName } = req.body;
    const userId = req.user?.userId;

    const existing = await prisma.fastqAnalysis.findUnique({
        where: {
            userId_sampleName_primerFileId_referenceFileId_sequenceCount_analysisName: {
                userId,
                sampleName,
                primerFileId,
                referenceFileId,
                sequenceCount,
                analysisName
            },
        },
        include: {
            fastqFileR1: true,
            fastqFileR2: true,
            primerFile: true,
            referenceFile: true,
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
        const [primerFile, referenceFile] = await Promise.all([
            prisma.file.findFirst({
                where: { id: primerFileId, userId },
            }),
            prisma.file.findFirst({
                where: { id: referenceFileId, userId },
            }),
        ]);

        if (!primerFile || !referenceFile) {
            return res.status(404).json({ error: "Primer or reference file not found or not owned by user" });
        }

        const safeName = sampleName?.replace(/[^a-zA-Z0-9_\-]/g, "").replace(/\.(fastq|fq)(\.gz)?$/i, "");
        
        const primerPath = primerFile.path;
        const referencePath = referenceFile.path;
        const outputS3Prefix = `${USERDATA_BUCKET}/${userId}/fastq`
        const scriptPath = path.join(__dirname, "scripts", "create_fastq.py");
        const venvPython = path.join(__dirname, "venv", "Scripts", "python.exe");

        // create_fastq.py args: --primer_path, --reference_path, --output_s3_prefix, --sample_name, --sequence_count

        const args = [
            scriptPath,
            "--primer_path", primerPath,
            "--reference_path", referencePath,
            "--output_s3_prefix", outputS3Prefix,
            "--sample_name", safeName,
            "--sequence_count", sequenceCount,
        ];

        try {    
            execFile(venvPython, args, async (err, stdout, stderr) => {
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
                            primerFileId,
                            referenceFileId,
                            result: JSON.stringify(result),
                            analysisName,
                            sampleName,
                            sequenceCount,
                            fastqFileR1Id: fileR1.id,
                            fastqFileR2Id: fileR2.id,
                            primerFilename: primerFile.filename,
                            referenceFilename: referenceFile.filename
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

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
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