var express = require('express');
var router = express.Router();
var request = require('request');
var db = require('./../db_connect');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

// router.get('/cron', function (req, res, next) {
//   var sql = "insert into rates (rate) value ('12.34')";
//   db.query(sql, function (err, result) {
//     if (err) throw err;
//     console.log(result.insertId);
//     // socket create
//       req.socket.emit('userMsg', { msg: result.insertId});
//   });
// });

router.get('/test', function(req, res, next) {
  request.get({ url: "http://mygoldtracker.com/lametric/gold" }, function(error, response, body) { 
    if (!error && response.statusCode == 200) { 
      // res.setHeader('content-type', 'application/json');
      res.json(JSON.parse(body)); 
    } 
  }); 
});

module.exports = router;
