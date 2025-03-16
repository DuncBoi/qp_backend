const express = require('express')
const pool = require('./db')
const cors = require('cors')
require('dotenv').config()

const port = process.env.PORT || 3000

const app = express()
app.use(cors())
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

app.listen(port, () => console.log(`Server has started on port: ${port}`))