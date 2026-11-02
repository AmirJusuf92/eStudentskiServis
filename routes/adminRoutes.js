const express = require("express");
const { isAdmin } = require("../middleware/authMiddleware");
const db = require("../config/db");
const multer = require("multer");
const { supabase, BUCKET } = require("../config/supabase");
const router = express.Router();
const ejsLayouts = require("express-ejs-layouts");
const engine = require('ejs-mate');
const app = express();


// Admin Dashboard
router.get("/admin_dash", isAdmin, (req, res) => {
  db.query(`
    SELECT files.*, users.first_name, users.last_name 
    FROM files 
    JOIN users ON files.user_id = users.id 
    ORDER BY users.first_name, users.last_name`, 
    (err, files) => {
      db.query("SELECT * FROM users WHERE role = 'user'", (err, users) => {
        res.render("admin_dash", { admin: req.session.user, users, files });
      });
  });
});
// ========================
// LOGO KOMPANIJE (upload u isti Supabase bucket kao dokumenti)
// ========================
const LOGO_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (LOGO_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error("Logo mora biti PNG, JPG, WEBP ili GIF slika."));
  }
}).single("logo");

// Hvata greske iz multera i vraca poruku umjesto rusenja servera
const handleLogoUpload = (req, res, next) => {
  uploadLogo(req, res, (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "Logo je prevelik (maksimalno 2MB)." : err.message;
      return res.status(400).send(msg);
    }
    next();
  });
};

// Create job (GET + POST)
router.get("/create-job", isAdmin, (req, res) => {
  res.render("create-job");
});

router.post("/create-job", isAdmin, handleLogoUpload, async (req, res) => {
  const { title, description, location } = req.body;
  let logoUrl = null;
  let logoPath = null;

  try {
    if (req.file) {
      const ext = LOGO_TYPES[req.file.mimetype];
      logoPath = `logos/${Date.now()}_${req.session.user.id}.${ext}`;

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(logoPath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

      if (error) {
        console.error("Supabase logo upload error:", error);
        return res.status(500).send("Upload loga nije uspio: " + error.message);
      }

      logoUrl = supabase.storage.from(BUCKET).getPublicUrl(logoPath).data.publicUrl;
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send("Greska na serveru pri uploadu loga.");
  }

  db.query(
    "INSERT INTO jobs (title, description, location, logo_url, logo_path) VALUES (?, ?, ?, ?, ?)",
    [title, description, location, logoUrl, logoPath],
    (err) => {
      if (err) {
        console.error("DB Error:", err);
        return res.status(500).send("Greska pri spremanju oglasa.");
      }
      res.redirect("/jobs");
    }
  );
});

// Brisanje oglasa za posao (i njegovog loga iz storage-a)
router.post("/admin/jobs/:id/delete", isAdmin, (req, res) => {
  const jobId = req.params.id;

  db.query("SELECT logo_path FROM jobs WHERE id = ?", [jobId], (err, rows) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).send("Greska pri brisanju oglasa.");
    }
    if (rows.length === 0) return res.redirect("/jobs");

    const logoPath = rows[0].logo_path;

    db.query("DELETE FROM jobs WHERE id = ?", [jobId], async (err) => {
      if (err) {
        console.error("DB Error:", err);
        return res.status(500).send("Greska pri brisanju oglasa.");
      }
      if (logoPath) {
        const { error } = await supabase.storage.from(BUCKET).remove([logoPath]);
        if (error) console.error("Brisanje loga nije uspjelo:", error);
      }
      res.redirect("/jobs");
    });
  });
});

// Lista svih korisnika + unapredjenje u admina
router.get("/admin/users", isAdmin, (req, res) => {
  db.query(
    "SELECT id, first_name, last_name, email, role, created_at FROM users ORDER BY role, first_name, last_name",
    (err, users) => {
      if (err) {
        console.error("DB Error:", err);
        return res.status(500).send("Greska pri ucitavanju korisnika.");
      }
      res.render("admin_users", { admin: req.session.user, users });
    }
  );
});

router.post("/admin/users/:id/promote", isAdmin, (req, res) => {
  db.query("UPDATE users SET role = 'admin' WHERE id = ?", [req.params.id], (err) => {
    if (err) {
      console.error("DB Error:", err);
      return res.status(500).send("Greska pri promjeni uloge.");
    }
    res.redirect("/admin/users");
  });
});

// View applications
router.get('/aplication', isAdmin, (req, res) => {
  db.query(`SELECT applications.*, jobs.title FROM applications 
            JOIN jobs ON applications.job_id = jobs.id ORDER BY applied_at DESC`, (err, results) => {
      if (err) throw err;
      res.render('aplication', { applications: results });
  });
});


module.exports = router;
