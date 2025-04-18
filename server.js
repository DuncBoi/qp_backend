const express = require('express')
const pool = require('./db')
const cors = require('cors')
require('dotenv').config()

const port = process.env.PORT || 3000

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const rateLimit = require('express-rate-limit');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express()
app.use(cors({
  origin: '*'
}
))
app.use(express.json())

const authenticateFirebaseUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid auth token' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.userId = decodedToken.uid;
    next();
  } catch (error) {
    console.error('Firebase Auth Error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
};

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                 // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true, 
  legacyHeaders: false
});

app.use(limiter);

// Get all problems
app.get('/problems', async (req, res) => {
    try{
        const data = await pool.query('SELECT * FROM problems ORDER BY id')
        res.status(200).send(data.rows)
    } catch (err){
        console.log(err)
        res.sendStatus(500)
    }
});

// Get all completed problems for a user
app.get('/completed-problems', authenticateFirebaseUser, async (req, res) => {
  try {
      const userId = req.userId; 
      const result = await pool.query(
          'SELECT problem_id FROM completed_problems WHERE user_id = $1',
          [userId]
      );
      res.json(result.rows.map(r => r.problem_id));
  } catch (error) {
      res.status(500).json({ error: 'Failed to fetch completions' });
  }
});

/* user login endpoint */
app.post('/log-user', authenticateFirebaseUser, async (req, res) => {
  try {
    const uid = req.userId;
    
    await pool.query(
      'INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [uid]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error logging user:', error);
    res.status(500).json({ error: 'Failed to log user' });
  }
});

app.post('/batch-toggle-complete', authenticateFirebaseUser, async (req, res) => {
  try {
    const userId = req.userId;
    const changes = req.body.changes;

    if (!changes || typeof changes !== 'object') {
      return res.status(400).json({ error: 'Invalid or missing changes object' });
    }

    for (const [problemId, shouldBeCompleted] of Object.entries(changes)) {
      const pid = parseInt(problemId, 10);
      if (Number.isNaN(pid)) continue;

      if (shouldBeCompleted) {
        await pool.query(
          `INSERT INTO completed_problems (user_id, problem_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [userId, pid]
        );
      } else {
        await pool.query(
          `DELETE FROM completed_problems
           WHERE user_id = $1 AND problem_id = $2`,
          [userId, pid]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Batch toggle error:', err);
    res.status(500).json({ error: 'Batch toggle failed' });
  }
});

app.get('/problems/:id', async (req, res) => {
  try{
      const { id } = req.params;
      const data = await pool.query('SELECT * FROM problems WHERE id = $1', [id]);
      if (data.rows.length === 0){
          return res.status(404).json({error: 'Problem not found'});
      }
      const problem = data.rows[0];
      res.status(200).send(problem)
  } catch (err){
      console.log(err)
      res.sendStatus(500)
  }
});

app.post('/api/reset-progress', authenticate, async (req, res) => {
  const uid = req.body.uid;      
  try {
    await pool.query(
      `DELETE FROM user_progress
         WHERE user_id = $1`,
      [uid]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Reset-progress error:', err);
    return res.status(500).json({ error: 'Could not reset progress' });
  }
});

app.post('/api/delete-user', authenticate, async (req, res) => {
  const uid = req.body.uid;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1) remove all progress
    await client.query(
      `DELETE FROM user_progress
         WHERE user_id = $1`,
      [uid]
    );
    // 2) remove the user record itself
    await client.query(
      `DELETE FROM users
         WHERE id = $1`,
      [uid]
    );
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete-user error:', err);
    return res.status(500).json({ error: 'Could not delete user' });
  } finally {
    client.release();
  }
});

const authenticateKey = (req, res, next) => {
    const submittedKey = req.body.secretKey;
    if (submittedKey === process.env.ADMIN_SECRET) {
      delete req.body.secretKey; // Remove key before DB insertion
      next();
    } else {
      res.status(401).json({ error: 'Invalid secret key' });
    }
  };

//PUT endpoint
app.put('/problems/:id', authenticateKey, async (req, res) => {
  try {
      const { rows } = await pool.query(
          `UPDATE problems SET
              title = $1,
              difficulty = $2,
              category = $3,
              roadmap = $4,
              roadmap_num = $5,
              description = $6,
              solution = $7,
              explanation = $8,
              yt_link = $9
          WHERE id = $10 RETURNING id`,
          [
              req.body.problem.title,
              req.body.problem.difficulty,
              req.body.problem.category,
              req.body.problem.roadmap,
              req.body.problem.roadmap_num || null,
              req.body.problem.description,
              req.body.problem.solution,
              req.body.problem.explanation,
              req.body.problem.yt_link || null,
              req.params.id
          ]
      );
      rows.length ? res.json({ success: true }) : res.status(404).json({ error: 'Not found' });
  } catch (err) {
      res.status(500).json({ error: 'Update failed' });
  }
});

  app.delete('/problems/:id', authenticateKey, async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            'DELETE FROM problems WHERE id = $1',
            [req.params.id]
        );
        rowCount ? res.json({ success: true }) : res.status(404).json({ error: 'Not found' });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// admin post
app.post('/admin/post', authenticateKey, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO problems (
        id, title, difficulty, category, roadmap, roadmap_num,
        description, solution, explanation, yt_link
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        req.body.problem.id,
        req.body.problem.title,
        req.body.problem.difficulty,
        req.body.problem.category,
        req.body.problem.roadmap || null,
        req.body.problem.roadmap_num || null,
        req.body.problem.description,
        req.body.problem.solution,
        req.body.problem.explanation,
        req.body.problem.yt_link || null
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Insert failed' });
  }
});

app.listen(port, () => console.log(`Server has started on port: ${port}`))