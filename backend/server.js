const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const { PrismaClient, FileCategory } = require("@prisma/client");

const app = express();
const PORT = 5000;
const SECRET = "queen-dinah-rules-seattle";

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
const prisma = new PrismaClient();

// Setup file uploads
const upload = multer({ 
    dest: "uploads/",
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
    fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(fa|fasta)$/i)) {
            return cb(new Error("Only FASTA files (.fa, .fasta) are allowed"));
        }
        cb(null, true);
    }
});

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
    const { username, password } = req.body;

    if (!username || !password){
        return res.status(400).json({ error: "Username and password required" });
    }

    const normalizedUsername = username.trim().toLowerCase();

    try {
        const existing = await prisma.user.findUnique({ where: { username: normalizedUsername } });
        if (existing) {
            return res.status(400).json({ error: "User already exists" });
        }

        const hashed = bcrypt.hashSync(password, 10);
        const user = await prisma.user.create({
            data: {
                username: normalizedUsername,
                password: hashed,
            }
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

const fsp = fs.promises;

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

        res.json({ primer, genomic });
    } catch (err) {
        console.error("Error fetching files:", err);
        res.status(500).json({ error: "Failed to fetch files" });
    }
});

app.post("/upload", authenticateToken, upload.single("file"), async (req, res) => {
    const { category } = req.body;
    const file = req.file;
    const userId = req.user?.userId;
    
    if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    const normalizedName = file.originalname.trim().toLowerCase();

    const disallowed = /\.(exe|sh|js|bat)$/i;
    if(disallowed.test(normalizedName)) {
        return res.status(400).json({ error: "Disallowed file type" });
    }

    if (!["genomic", "primer"].includes(category)) {
        return res.status(400).json({ error: "Invalid category. Use 'genomic' or 'primer'" });
    }


    const existing = await prisma.file.findFirst({
        where: {
            filename: normalizedName,
            userId,
        },
    });

    if (existing) {
        // Clean up orphaned file
        await fs.promises.unlink(file.path).catch(console.error);

        return res.status(400).json({
            error: `File ${normalizedName} already exists`,
        });
    }

    // Rename and organize by category
    const targetDir = path.join(__dirname, "uploads", String(userId), category);
    const targetPath = path.join(targetDir, normalizedName);

    await fs.promises.mkdir(targetDir, { recursive: true });
    await fs.promises.rename(file.path, targetPath);

    try {
        const categoryEnumMap = {
            genomic: FileCategory.GENOMIC,
            primer: FileCategory.PRIMER,
            fastq: FileCategory.FASTQ,
        };

        const fileCategory = categoryEnumMap[category];

        if (!fileCategory) {
            return res.status(400).json({ error: "Invalid category." });
        }
        const newFile = await prisma.file.create({
            data: {
                filename: normalizedName,
                path: targetPath,
                category: fileCategory,
                userId,
            },
        });

        res.json({ message: "Upload saved", fileId: newFile.id, filename: newFile.filename, category: newFile.category });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Failed to save file" });
    }

});

app.get("/download/:fileId", authenticateToken, async (req, res) => {
    const { fileId } = req.params;

    try {
        const file = await prisma.file.findUnique({ where: { id: parseInt(fileId) } });
        if (!file) return res.status(404).json({ error: "File not found" });

        const filePath = file.path;

        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found." });

        res.download(filePath, file.filename);
    } catch (err) {
        console.error("Download error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.delete("/delete/:fileId", async (req, res) => {
    const { fileId } = req.params;

    try {
        const file = await prisma.file.findUnique({ where: { id: parseInt(fileId) } });
        if (!file) return res.status(404).json({ error: "File not found" });

        const filePath = file.path;

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath); // Remove from disk
        }

        await prisma.file.delete({ where: {id: parseInt(fileId) } }); // Remove from DB

        res.json({ message: "file deleted successfully" });
    } catch (err) {
        console.error("Delete error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.delete("/delete-fastq-analysis/:id", authenticateToken, async (req, res) => {
    const userId = req.user?.userId;
    const analysisId = parseInt(req.params.id, 10);

    try {
        const analysis = await prisma.fastqAnalysis.findUnique({
            where: { id: analysisId },
            include: {
                fastqFileR1: true,
                fastqFileR2: true,
            },
        });

        if (!analysis || analysis.userId !== userId) {
            return res.status(404).json({ error: "Analysis not found" });
        }

        const fileIdsToDelete = [
            analysis.fastqFileR1Id,
            analysis.fastqFileR2Id,
        ];

        // Delete the analysis first to avoid foreign key constraint errors
        await prisma.fastqAnalysis.delete({
            where: { id: analysisId },
        });

        // Now delete the associated files
        await prisma.file.deleteMany({
            where: {
                id: { in: fileIdsToDelete },
            },
        });

        try{
        fs.unlinkSync(analysis.fastqFileR1.path);
        } catch (e) {
            console.warn("R1 file already missing: ${analysis.fastqFileR1.path}")
        }
        try{
        fs.unlinkSync(analysis.fastqFileR2.path);
        } catch (e) {
            console.warn("R2 file already missing: ${analysis.fastqFileR2.path}")
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

        const fastaPath = path.join(__dirname, "uploads", String(userId), fastaFile.category, fastaFile.filename);
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
        
        const primerPath = path.join(__dirname, "uploads", String(userId), primerFile.category, primerFile.filename);
        const referencePath = path.join(__dirname, "uploads", String(userId), referenceFile.category, referenceFile.filename);
        const outputDir = path.join(__dirname, "uploads", String(userId), "fastq");
        const scriptPath = path.join(__dirname, "scripts", "create_fastq.py");
        const venvPython = path.join(__dirname, "venv", "Scripts", "python.exe");

        fs.mkdirSync(outputDir, { recursive: true });

        const args = [
            scriptPath,
            "--primer_path", primerPath,
            "--reference_path", referencePath,
            "--output_dir", outputDir,
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