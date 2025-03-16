//set up connection to db
const { Pool } = require('pg')
require('dotenv').config()

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
})

pool.connect()
    .then(client => {
        console.log('✅ Successfully connected to PostgreSQL!')
        client.release() // Release connection back to pool
    })
    .catch(err => console.error('❌ Database connection error:', err))



module.exports = pool