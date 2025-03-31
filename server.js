const express = require('express')
const pool = require('./db')
const cors = require('cors')
const admin = require('firebase-admin');
require('dotenv').config()

const port = process.env.PORT || 3000

const app = express()
app.use(express.json())

const corsOptions = {
  origin: '*', 
  methods: ['POST', 'GET', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}
app.use(cors(corsOptions))

app.options('*', cors(corsOptions));

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized - Missing token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = { uid: decodedToken.uid };
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(401).json({ error: 'Unauthorized - Invalid token' });
  }
};

app.get('/problems', verifyToken, async (req, res) => {
    try{
        const userId = req.user.uid;
        const data = await pool.query(`SELECT p.*,
        EXISTS(
          SELECT 1 FROM completed_problems 
          WHERE user_id = $1 AND problem_id = p.id
        ) as completed
        FROM problems p
        ORDER BY p.id`, [userId]);
        res.status(200).send(data.rows)
    } catch (err){
        console.log(err)
        res.sendStatus(500)
    }
});

/* roadmap endpoint */
app.get('/problems/roadmap/:roadmap', async (req, res) => {
  try {
    const { roadmap } = req.params;
    const result = await pool.query(
      'SELECT * FROM problems WHERE roadmap = $1 ORDER BY id',
      [roadmap.toLowerCase()]
    );
    
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching problems:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* user login endpoint */
app.options('/log-user', cors());
app.post('/log-user', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    
    await pool.query(
      'INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [userId]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error logging user:', error);
    res.status(500).json({ error: 'Failed to log user' });
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

/* toggle checkmark endpoint */
app.post('/api/toggle-complete', async (req, res) => {
  try {
    const { userId, problemId } = req.body;

    const result = await pool.query(`
      WITH                            
      delete_attempt AS (
        DELETE FROM completed_problems 
        WHERE user_id = $1 AND problem_id = $2
        RETURNING 'deleted' AS action
      ),
      insert_attempt AS (
        INSERT INTO completed_problems (user_id, problem_id)
        SELECT $1, $2
        WHERE NOT EXISTS (SELECT 1 FROM delete_attempt)
        RETURNING 'inserted' AS action
      )
      SELECT * FROM delete_attempt
      UNION ALL
      SELECT * FROM insert_attempt;
    `, [userId, problemId]);

    const action = result.rows[0]?.action;
    res.json({ completed: result.rowCount > 0 });
  } catch (error) {
    console.error('Toggle error:', error);
    res.status(500).json({ error: 'Failed to toggle completion' });
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
              description = $5,
              solution = $6,
              explanation = $7,
              yt_link = $8
          WHERE id = $9 RETURNING id`,
          [
              req.body.problem.title,
              req.body.problem.difficulty,
              req.body.problem.category,
              req.body.problem.roadmap,
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
        id, title, difficulty, category, roadmap,
        description, solution, explanation, yt_link
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.body.problem.id,
        req.body.problem.title,
        req.body.problem.difficulty,
        req.body.problem.category,
        req.body.problem.roadmap,
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