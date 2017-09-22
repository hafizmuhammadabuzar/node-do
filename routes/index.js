var express = require('express');
var router = express.Router();
var request = require('request');
var db = require('./../db_connect');
var fs = require('fs');

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

  router.get('/daily/rates', function(req, res) {
    var sql = "select company, conversion from company_conversions";
    db.query(sql, function (err, companies) {
      if (err) throw err;

      companies.forEach(function(cmp){
        if(cmp.company == 'BitTrex'){
          
          var dailyData = [];
          var conv = cmp.conversion.split('/');
          const timestamp = Math.floor(new Date() / 1000);
          const link = "https://min-api.cryptocompare.com/data/histoday?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=2&toTs="+timestamp+"&e="+cmp.company;
          
          request.get({ url: link }, function(error, response, body) { 
            if (!error && response.statusCode == 200) { 
              
              var data = JSON.parse(body);
              data = data.Data[data.length-1];

              // if(Array.isArray(data) && data.length > 0){
              //   data.forEach(function(val) {
              //     if(val.close != 0){
              //       var values = [val.time, val.close, val.high, val.low, val.open, val.volumefrom, val.volumeto, cmp.company, cmp.conversion];
              //       dailyData.push(values);
              //     }
              //   });

              if(Array.isArray(data) && data.length > 0){
                if(val.close != 0){
                  var values = [data.time, val.close, val.high, val.low, val.open, val.volumefrom, val.volumeto, cmp.company, cmp.conversion];
                  dailyData.push(values);
                }
              }
                
                var sql = "insert into daily_rates (time, close, open, high, low, volumefrom, volumeto, company, conversion) values ?";
                var query = db.query(sql, [dailyData], function (err, response) {
                  if (err) throw err;
                  console.log(cmp.conversion);
                });
              }
          }); 
        }
      });
    });
    res.json({msg: 'Saved'});
  });

  router.get('/test', function(req, res, next) {
    request.get({ url: "http://mygoldtracker.com/lametric/gold" }, function(error, response, body) { 
      if (!error && response.statusCode == 200) { 
        // res.setHeader('content-type', 'application/json');
        res.json(JSON.parse(body)); 
      } 
    }); 
  });

  return router;
}

module.exports = returnRouter;