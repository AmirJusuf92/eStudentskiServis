const express = require('express');
const router = express.Router();
const db = require('../config/db');

// View all jobs
router.get('/', (req, res) => {
    db.query('SELECT * FROM jobs ORDER BY created_at DESC', (err, results) => {
        if (err) throw err;
        res.render('jobs', { jobs: results, isAdmin: !!(req.session.user && req.session.user.role === 'admin') });
    });
});

// Apply to job
router.get('/:id/apply', (req, res) => {
    const jobId = req.params.id;
    res.render('apply', { jobId });
});

router.post('/:id/apply', (req, res) => {
    const jobId = req.params.id;
    const { full_name, email } = req.body;
    db.query('INSERT INTO applications (job_id, full_name, email) VALUES (?, ?, ?)', [jobId, full_name, email], (err) => {
        if (err) throw err;
        res.redirect('/jobs');
    });
});

module.exports = router;