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
app.use(cors());
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

    if (!["genomic", "primer"].includes(category)) {
        return res.status(400).json({ error: "Invalid category. Use 'genomic' or 'primer'" });
    }

    // Rename and organize by category
    const targetDir = path.join(__dirname, "uploads", category);
    const targetPath = path.join(targetDir, file.originalname);

    fs.mkdirSync(targetDir, { recursive: true });
    fs.renameSync(file.path, targetPath);


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
                filename: file.originalname,
                path: targetPath,
                category: fileCategory,
                userId,
            },
        });

        res.json({ message: "Upload saved", fileId: newFile.id, category: newFile.category });
    } catch (err) {
        console.error("Upload error:", err);
        res.status(500).json({ error: "Failed to save file" });
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
            metadata: true,
            primerAnalyses: { include: { referenceFile: true } },
            referenceAnalyses: { include: { primerFile: true } },
        },
    });

    res.json(files);
});

app.get("/fastq-files", authenticateToken, async (req, res) => {
    const userId = req.user?.userId;

    const files = await prisma.file.findMany({
        where: {
            userId,
            category: FileCategory.FASTQ,
        },
        include: {
            metadata: true,
            fastqAnalyses: {
                include: {
                    fastqFile: true,
                    user: true,
                },
            },
        },
    });

    res.json(files);
})

app.post("/analyze", authenticateToken, async (req, res) => {
    const { primerFileId, referenceFileId } = req.body;
    const userId = req.user?.userId;

    const existing = await prisma.fastaAnalysis.findUnique({
        where: {
            userId_primerFileId_referenceFileId: {
                userId,
                primerFileId,
                referenceFileId,
            },
        },
    });

    if (existing) {
        return res.json({
            message: "Analysis already exists",
            result: existing.result,
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

        const primerPath = path.join(__dirname, "uploads", primerFile.category, primerFile.filename);
        const referencePath = path.join(__dirname, "uploads", referenceFile.category, referenceFile.filename);
        const scriptPath = path.join(__dirname, "scripts", "process_fasta.py");
        const venvPython = path.join(__dirname, "venv", "Scripts", "python.exe");

        execFile(venvPython, [scriptPath, primerPath, referencePath], async (err, stdout, stderr) => {
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

        // Optional: store metadata for future queries
        await Promise.all([
        prisma.metadata.upsert({
            where: { fileId: primerFile.id },
            update: {
                key: "analysis_result",
                value: `Found ${result.primer_count} primer sequences.`,
            },
            create: {
                fileId: primerFile.id,
                key: "analysis_result",
                value: `Found ${result.primer_count} primer sequences.`,
            },
        }),
        prisma.metadata.upsert({
            where: { fileId: referenceFile.id },
            update: {
                key: "analysis_result",
                value: `Found ${result.reference_count} reference sequences.`,
            },
            create: {
                fileId: referenceFile.id,
                key: "analysis_result",
                value: `Found ${result.reference_count} reference sequences.`,
            },
        }),
        ]);

        res.json({
            message: "Analysis complete",
            "result": {
                "primer_count": result.primer_count,
                "reference_count": result.primer_count
            },
        });
        });
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
            primerFile: true,
            referenceFile: true,
        },
        orderBy: { createdAt: "desc" },
    });

    res.json(analyses);
});

app.get("/download/:filename", authenticateToken, (req, res) => {
    const { category, filename } = req.params;
    const filePath = path.join(__dirname, "uploads", category, filename);
    if (fs.existsSync(filePath)) {
        res.download(filePath);
    } else {
        res.status(404).json({ error: "File not found" });
    }
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