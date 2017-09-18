var express = require('express');
var router = express.Router();
var request = require('request');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/test', function(req, res, next) {
  request.get({ url: "http://mygoldtracker.com/lametric/gold" }, function(error, response, body) { 
    if (!error && response.statusCode == 200) { 
      // res.setHeader('content-type', 'application/json');
      res.json(JSON.parse(body)); 
    } 
  }); 
});

module.exports = router;
