const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      service: "voix-media-promo-242"
    });
  } catch (error) {
    res.status(503).json({
      ok: false
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Voix Média Promo 242 fonctionne sur le port ${PORT}`)app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    }
  })
);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase(); 
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}
});app.get("/api/me", async (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }

  const result = await pool.query(
    "SELECT id, name, email FROM users WHERE id = $1",
    [req.session.userId]
  );

  res.json({
    user: result.rows[0] || null
  });
});

app.post("/api/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (name.length < 2) {
      return res.status(400).json({
        error: "Nom invalide."
      });
    }

    if (!email.includes("@")) {
      return res.status(400).json({
        error: "E-mail invalide."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Le mot de passe doit contenir au moins 8 caractères."
      });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({
        error: "Cette adresse e-mail est déjà utilisée."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, passwordHash]
    );

    req.session.userId = result.rows[0].id;

    res.json({
      user: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Impossible de créer le compte."
    });
  }
});app.post("/api/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (
      result.rowCount === 0 ||
      !(await bcrypt.compare(password, result.rows[0].password_hash))
    ) {
      return res.status(401).json({
        error: "E-mail ou mot de passe incorrect."
      });
    }

    req.session.userId = result.rows[0].id;

    res.json({
      user: safeUser(result.rows[0])
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Impossible de se connecter."
    });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});app.get("/api/content", async (req, res) => {
  try {
    let result;

    if (req.query.category) {
      result = await pool.query(
        `SELECT * FROM content
         WHERE category = $1
         ORDER BY id DESC`,
        [String(req.query.category)]
      );
    } else {
      result = await pool.query(
        "SELECT * FROM content ORDER BY id DESC"
      );
    }

    res.json({
      content: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Impossible de récupérer les contenus."
    });
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM events ORDER BY date ASC"
    );

    res.json({
      events: result.rows
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Impossible de récupérer les événements."
    });
  }
});app.post("/api/favorites", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Connexion requise."
    });
  }

  try {
    await pool.query(
      `INSERT INTO favorites
       (user_id, content_type, content_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [
        req.session.userId,
        String(req.body.content_type || ""),
        Number(req.body.content_id)
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Impossible d'ajouter aux favoris."
    });
  }
});

app.get("/api/favorites", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Connexion requise."
    });
  }

  const result = await pool.query(
    `SELECT content_type, content_id, created_at
     FROM favorites
     WHERE user_id = $1
     ORDER BY id DESC`,
    [req.session.userId]
  );

  res.json({
    favorites: result.rows
  });
});function adminOnly(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(401).json({
      error: "Connexion administrateur requise."
    });
  }

  next();
}

app.post("/api/admin/login", (req, res) => {
  const adminEmail = normalizeEmail(
    process.env.ADMIN_EMAIL || "admin@voixmedia.local"
  );

  const adminPassword =
    process.env.ADMIN_PASSWORD || "ChangeMe123!";

  if (
    normalizeEmail(req.body.email) !== adminEmail ||
    String(req.body.password || "") !== adminPassword
  ) {
    return res.status(401).json({
      error: "Identifiants administrateur incorrects."
    });
  }

  req.session.isAdmin = true;

  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => {
  res.json({
    admin: !!req.session.isAdmin
  });
});

app.get("/api/admin/stats", adminOnly, async (req, res) => {
  try {
    const users = await pool.query(
      "SELECT COUNT(*)::int AS count FROM users"
    );

    const content = await pool.query(
      "SELECT COUNT(*)::int AS count FROM content"
    );

    const events = await pool.query(
      "SELECT COUNT(*)::int AS count FROM events"
    );

    res.json({
      users: users.rows[0].count,
      content: content.rows[0].count,
      events: events.rows[0].count
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Impossible de récupérer les statistiques."
    });
  }
});

app.post("/api/admin/content", adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `INSERT INTO content
       (category, title, description, image_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        String(req.body.category || ""),
        String(req.body.title || ""),
        String(req.body.description || ""),
        String(req.body.image_url || "")
      ]
    );

    res.json({
      id: result.rows[0].id
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Impossible de publier le contenu."
    });
  }
});

app.post("/api/admin/events", adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `INSERT INTO events
       (title, date, place, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        String(req.body.title || ""),
        String(req.body.date || ""),
        String(req.body.place || ""),
        String(req.body.body || "")
      ]
    );

    res.json({
      id: result.rows[0].id
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Impossible de créer l'événement."
    });
  }
});async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS content (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        image_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        date DATE NOT NULL,
        place TEXT NOT NULL,
        body TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content_type TEXT NOT NULL,
        content_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, content_type, content_id)
      );
    `);

    console.log("Base PostgreSQL initialisée.");
  } catch (error) {
    console.error("Erreur PostgreSQL :", error);
  }
}

initializeDatabase();
