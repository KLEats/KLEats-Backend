const mysql=require("mysql2/promise")

const connection = mysql.createPool({
  host: process.env.mysql_host,
  database: process.env.mysql_database,
  user: process.env.mysql_user,
  password: process.env.mysql_password,
  waitForConnections: true,
  connectTimeout: 20000
});

connection
  .getConnection()
  .then((connection) => {
    // Use the connection
    console.log("Connection ID:", connection.threadId);
    connection.release();
  })
  .catch((error) => {
    console.error("Error acquiring connection:", error.message);
    console.log(error);
  });

module.exports = connection;