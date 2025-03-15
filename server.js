const express = require('express')
const pool = require('./db')
require('dotenv').config()

const port = process.env.PORT || 3000

const app = express()
app.use(express.json())

app.get('/', async (req, res) => {
    try{
        const data = await pool.query('SELECT * FROM problems')
        res.status(200).send(data.rows)
    } catch (err){
        console.log(err)
        res.sendStatus(500)
    }
})

app.post('/', async (req, res) => {
    const { title, difficulty } = req.body
    try{
        await pool.query('INSERT INTO problems (title, difficulty) VALUES ($1, $2)', [title, difficulty])
        res.status(200).send({message: "Successfully added problem"})
    } catch (err){
        console.log(err)
        res.sendStatus(500)
    }
})

app.listen(port, () => console.log(`Server has started on port: ${port}`))