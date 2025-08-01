const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

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
const prisma = require('./prismaClient');

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

// Setup SQLite
const db = new sqlite3.Database("db.sqlite");
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);
});

// Auth middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader?.split(" ")[1];
    if (!token) return res.sendStatus(401);
    
    jwt.verify(token, SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Routes
app.post("/register", (req, res) => {
    const { username, password } = req.body;
    const hashed = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashed], function (err) {
        if (err) return res.status(400).json({ error: "User already exists" });
        res.json({ success: true});
    });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
        if (!row || !bcrypt.compareSync(password, row.password)) {
            return res.status(401).json({ error: "Invalid credentials" });
        }
        const token = jwt.sign({ username }, SECRET, { expiresIn: "1h" });
        res.json({ token });
    });
});

app.get("/files", authenticateToken, (req, res) => {
    const baseDir = path.join(__dirname, "uploads");

    const categories = ["primer", "genomic"];
    const result = {};

    for (const category of categories) {
        const dir = path.join(baseDir, category);
        if (!fs.existsSync(dir)) {
            result[category] = [];
            continue;
        }

        const files = fs.readdirSync(dir).filter((f) =>
            fs.statSync(path.join(dir, f)).isFile()
        );
        result[category] = files;
    }

    res.json(result);
});

app.post("/upload", authenticateToken, upload.single("file"), async (req, res) => {
    const { category } = req.body;
    const file = req.file;
    const userId = req.user.id;

    if (!["genomic", "primer"].includes(category)) {
        return res.status(400).json({ error: "Invalid category. Use 'genomic' or 'primer'" });
    }

    // Rename and organize by category
    const targetDir = path.join(__dirname, "uploads", category);
    const targetPath = path.join(targetDir, file.originalname);

    fs.mkdirSync(targetDir, { recursive: true });
    fs.renameSync(file.path, targetPath);

    const newFile = await prisma.file.create({
        data: {
        filename: file.originalname,
        category,
        userId,
        },
    });

    res.json({ message: "upload saved", fileId: newFile.id });
});

app.post("/analyze", authenticateToken, async (req, res) => {
    const { primerFileId, referenceFileId } = req.body;
    const userId = req.user.id;

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

        const result = stdout.trim();

        // Optional: store metadata for future queries
        await prisma.fileMetadata.create({
            data: {
            fileId: referenceFile.id,  // or primerFile.id depending on your logic
            key: "analysis_result",
            value: result,
            },
        });

        res.json({
            message: "Analysis complete",
            result,
        });
        });
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/download/:filename", authenticateToken, (req, res) => {
    const filePath = path.join(__dirname, "uploads", req.params.filename);
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