const express = require('express')
const pool = require('./db')
const cors = require('cors')
require('dotenv').config()

const port = process.env.PORT || 3000

const app = express()
app.use(cors())
app.use(express.json())

app.get('/problems', async (req, res) => {
    try{
        const data = await pool.query('SELECT * FROM problems')
        res.status(200).send(data.rows)
    } catch (err){
        console.log(err)
        res.sendStatus(500)
    }
})

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
})

app.put('/problems/:id', validateKey, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE problems SET
                title = $1,
                difficulty = $2,
                category = $3,
                description = $4,
                solution = $5,
                explanation = $6,
                yt_link = $7
            WHERE id = $8 RETURNING id`,
            [
                req.body.title,
                req.body.difficulty,
                req.body.category,
                req.body.description,
                req.body.solution,
                req.body.explanation,
                req.body.yt_link || null,
                req.params.id
            ]
        );
        rows.length ? res.json({ success: true }) : res.status(404).json({ error: 'Not found' });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
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

  app.delete('/problems/:id', validateKey, async (req, res) => {
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
          id, title, difficulty, category, 
          description, solution, explanation, yt_link
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          req.body.id, // Manual ID from form
          req.body.title,
          req.body.difficulty,
          req.body.category,
          req.body.description,
          req.body.solution,
          req.body.explanation,
          req.body.yt_link || null
        ]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Insert failed' });
    }
  });

app.listen(port, () => console.log(`Server has started on port: ${port}`))