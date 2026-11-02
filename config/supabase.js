const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");
dotenv.config();

// Isti Supabase klijent i isti bucket ("Uploads") kao za PDF dokumente.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = { supabase, BUCKET: "Uploads" };
