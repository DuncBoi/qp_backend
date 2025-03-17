const express = require('express')
const pool = require('./db')
const cors = require('cors')
require('dotenv').config()

const port = process.env.PORT || 3000

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/problems/', async (req, res) => {
    try{
        const data = await pool.query('SELECT * FROM problems')
        res.status(200).send(data.rows)
    } catch (err){
        console.log(err)
        res.sendStatus(500)
    }
})

app.get('/api/problems/:id', async (req, res) => {
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

app.listen(port, () => console.log(`Server has started on port: ${port}`))