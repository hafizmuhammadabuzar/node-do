var express = require('express');
var router = express.Router();
var db = require('./../db_connect');

/* GET home page. */
var returnRouter = function(io) {
  router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
  });

    router.get('/cron', function(req, res) {
      var sql = "insert into rates (rate) value ('12.34')";
      db.query(sql, function (err, result) {
        if (err) throw err;
        console.log(result.insertId);
        // socket create
        io.sockets.emit("userMsg", {msg: result.insertId});
      });
        res.json({msg: 'successfully saved'});
    });

    return router;
}

module.exports = returnRouter;