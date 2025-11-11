// register.js
require('dotenv').config(); // This loads the variables from the .env file
const sql = require('mssql');
const bcrypt = require('bcrypt');

// Database configuration object
const dbConfig = {
  server: 'DESKTOP-JMIJH98\\SQLEXPRESS',         // ✅ Reads 'localhost\\SQLEXPRESS' from .env
  database:  'LaybackGarmentsDB',  // ✅ Reads 'LaybackGarmentsDB' from .env
  user: 'sa',            // ✅ Reads 'sa' from .env
  password: AinzOoalGown369,    // ✅ Reads 'YourActualStrongPassword123!' from .env
  options: {
    trustServerCertificate: true, // Needed for local development with self-signed certificates
    enableArithAbort: true,       // Recommended by mssql library
    encrypt: false               // Set to true if your server requires encryption (e.g., Azure SQL)
  }
};


async function registerUser({ username, firstName, lastName, email, password }) {
  let pool;
  try {
    // Connect to the database using the config object
    console.log("Attempting to connect to:", 'DESKTOP-JMIJH98\\SQLEXPRESS', "Database:", 'LaybackGarmentsDB');
    pool = await sql.connect(dbConfig);

    // Hash the password before storing it
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert the new user into the database
    await pool.request()
      .input('Username', sql.NVarChar, username)
      .input('FirstName', sql.NVarChar, firstName)
      .input('LastName', sql.NVarChar, lastName)
      .input('Email', sql.NVarChar, email)
      .input('HashedPassword', sql.NVarChar, hashedPassword)
      .query(`
        INSERT INTO Users (Username, FirstName, LastName, Email, HashedPassword)
        VALUES (@Username, @FirstName, @LastName, @Email, @HashedPassword)
      `);

    console.log('✅ Success! User registered.');
  } catch (err) {
    if (err.message.includes('UNIQUE constraint') || err.message.includes('IX_Users')) {
      console.error('Error: Username or email already exists.');
    } else {
      console.error('Database connection or query error:', err.message);
    }
  } finally {
    if (pool) {
      await pool.close(); // Close the connection pool when done
    }
  }
}

// Example usage: Test the registration function
registerUser({
  username: 'lebo_test_user',
  firstName: 'Lebo',
  lastName: 'Tester',
  email: 'lebo.test@example.com',
  password: 'SecurePassword123!'
});