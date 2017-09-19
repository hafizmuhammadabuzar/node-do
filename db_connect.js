var mysql = require('mysql');

var con = mysql.createConnection({
  host: "37.60.249.79",
  user: "synerg98",
  password: "RajaG9876!@#$",
  database: "synerg98_node_test"
});

con.connect(function(err) {
  if (err) throw err
  console.log('Database Connected...')
});

module.exports = con;
