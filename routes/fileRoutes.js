/*const express = require("express");
const multer = require("multer");
const path = require("path");
const { ensureAuthenticated } = require("../middleware/authMiddleware");
const db = require("../config/db");
const router = express.Router();

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, req.session.user.first_name + "_" + req.session.user.last_name + ".pdf");
  }
});

const upload = multer({ storage });

// File Upload
router.post("/upload", ensureAuthenticated, upload.single("pdf"), (req, res) => {
  db.query("INSERT INTO files (user_id, filename) VALUES (?, ?)", [req.session.user.id, req.file.filename], () => {
    res.redirect("/usr_dash");
  });
});

// File View & Download
router.get("/download/:filename", (req, res) => {
  res.download(path.join(__dirname, "../uploads", req.params.filename));
});

module.exports = router;*/
const express = require("express");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
const { ensureAuthenticated } = require("../middleware/authMiddleware");
const db = require("../config/db");
const router = express.Router();

// ========================
// SUPABASE SETUP
// ========================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;  // ← Service role key here

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Multer: keep file in memory (no local save)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed!"));
    }
  },
});

// ========================
// UPLOAD PDF TO SUPABASE
// ========================
router.post("/upload", ensureAuthenticated, upload.single("pdf"), async (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded or invalid file type.");
  }

  try {
    const fileName = `${req.session.user.id}_${Date.now()}_${req.session.user.first_name}_${req.session.user.last_name}.pdf`;
    const fileBuffer = req.file.buffer;

    // Upload to Supabase Storag
    const { data, error } = await supabase.storage
      .from("Uploads")  // ← Your bucket name
      .upload(`resumes/${fileName}`, fileBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (error) {
      console.error("Supabase upload error:", error);
      return res.status(500).send("Upload failed: " + error.message);
    }

    // Get public URL (if bucket is public) or signed URL
    const { data: urlData } = supabase.storage
      .from("Uploads")
      .getPublicUrl(`resumes/${fileName}`);

    const publicUrl = urlData.publicUrl;

    
    db.query(
      "INSERT INTO files (user_id, filename, file_path, file_url) VALUES (?, ?, ?, ?)",
      [req.session.user.id, req.file.originalname, data.path, publicUrl],
      (err) => {
        if (err) {
          console.error("DB Error:", err);
          return res.status(500).send("Database error");
        }
        res.redirect("/usr_dash");
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ========================
// DOWNLOAD / VIEW PDF
// ========================
router.get("/download/:path(*)", ensureAuthenticated, async (req, res) => {
  const filePath = req.params.path;

  try {
    const [rows] = await new Promise((resolve, reject) => {
      db.query(
        "SELECT file_url, filename FROM files WHERE file_path = ? AND user_id = ?",
        [filePath, req.session.user.id],
        (err, results) => err ? reject(err) : resolve([results])
      );
    });

    if (rows.length === 0) {
      return res.status(404).send("File not found or access denied");
    }

    const { file_url, filename } = rows[0];

    // This URL already works when pasted manually → just use it!
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.redirect(file_url);

  } catch (err) {
    console.error(err);
    res.status(500).send("Download failed");
  }
});




module.exports = router;

