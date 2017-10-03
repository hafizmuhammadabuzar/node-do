var express = require('express');
var router = express.Router();
// var request = require('request');
var db = require('./../db_connect');
var async = require('async');
var promise = require('promise');
var request = require('request-promise');

/* GET home page. */
var returnRouter = function(io) {
  router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
  });

  router.get('/cron/rates/:type', function(req, res) {
    
    var urlParam;
    if(req.params.type=='minute'){
      urlParam = 'histominute';
    }
    else if(req.params.type=='daily'){
      urlParam = 'histoday';
    }
    else if(req.params.type=='hour'){
      urlParam = 'histohour';
    }
    else{
      res.send('Invalid request :(');
    }
    
    var sql = "select company, conversion from company_conversions";
    db.query(sql, function (err, companies) {
      if (err) throw err;
      
      companies.forEach(function(cmp, index){
        var count = companies.length;
        var conv = cmp.conversion.split('/');
        // const timestamp = Math.floor(new Date() / 1000);
        var d, timestamp, i=1;
        d = new Date();
        timestamp = d.setMinutes(d.getMinutes() - 1);
        const link = "https://min-api.cryptocompare.com/data/"+urlParam+"?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=2000&toTs="+timestamp+"&e="+cmp.company;

        request.get({ url: link }, function(error, response, body) { 
          if (!error && response.statusCode == 200) { 
            var data = JSON.parse(body);
            data = data.Data;
            var length = data.length;
            var ratesData = [];
            
            if(Array.isArray(data) && length > 0 && data[length-1].close != 0){
              var apiRates = {
                'time': data[length-1].time, 
                'close': data[length-1].close, 
                'open': data[length-1].open, 
                'high': data[length-1].high, 
                'low': data[length-1].low, 
                'volumefrom': data[length-1].volumefrom, 
                'volumeto': data[length-1].volumeto, 
                'company': cmp.company, 
                'conversion': cmp.conversion, 
              };
              ratesData.push(apiRates);
              
               var values = "("+data[length-1].time+","+data[length-1].close+","+ data[length-1].high+","+ data[length-1].low+","+ data[length-1].open+","+ data[length-1].volumefrom+","+ data[length-1].volumeto+",'"+ cmp.company+"','"+ cmp.conversion+"')";
              
              var insertSql = "insert into "+req.params.type+"_rates (time, close, high, low, open, volumefrom, volumeto, company, conversion) values "+values;

              var query = db.query(insertSql, function (err, response) {
                if (err) throw err;
              });
            }
            else{
                console.log(link);
              }
            }

          if(i==count){
            console.log('All Done :)');
          }
          i++;
        });
      });
    });
    
    res.json({msg: 'Saved'});
  });

  router.get('/daily/rates', function(req, res, next){
    
    var values = [];
    var urls = [];

    async.waterfall([
      function(callback) {
        var sql = "select company, conversion from company_conversions where company= 'Bitfinex'";
        db.query(sql, function (err, companies) {
          if (err) throw err;

          async.forEach(companies, function(cmp){
            var conv = cmp.conversion.split('/');
            const timestamp = Math.floor(new Date() / 1000);
            link = "https://min-api.cryptocompare.com/data/histoday?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=100&toTs="+timestamp+"&e="+cmp.company;
  
            urls.push({'link': link, 'company': cmp.company, 'conversion': cmp.conversion});
          });

          callback(null);
        }); 
      },
      function(callback) {

        async.forEach(urls, function(url, done){

          request.get(url.link, function(err, response, body){
            var rates = JSON.parse(body);
            rates = rates.Data;
            
            if(Array.isArray(rates) && rates.length > 0){
              async.forEach(rates, function(rate){
                if(rate.close != 0){
                  var v = [rate.time, rate.close, rate.high, rate.low, rate.open, rate.volumefrom, rate.volumeto, url.company, url.conversion];
                  values.push(v);
                }
              });
              var sql = "insert into daily_rates (time, close, high, low, open, volumefrom, volumeto, company, conversion) values ?";
              var query = db.query(sql, [values], function (err, response) {
                if (err) throw err;
                done();
              });
            }
          });
        }, function(err){
          if(err) throw err;
          callback(null, 'Test');
        });
      }
    ], function(error, c) {
      res.json({'msg': 'Successfully Saved'});
    });
  });

  router.get('/ticker', function(req, res, next){

    var companiesRates, companiesArray = [];
    var ticker = {};
    
    async.waterfall([
      function(callback){
        
      var currentRates = [];
      var url = "https://bittrex.com/api/v1.1/public/getmarketsummaries";
      request.get(url, function(err, request, body){
        if(!err && request.statusCode == 200){
          var rates = JSON.parse(body);
          rates = rates.result;
  
          async.forEach(rates, function(rate){
            var con = rate.MarketName.replace('-', '/');
            var bittrex = {
              [con]: {
                'last': rate.Last,
                'bid': rate.Bid,
                'ask': rate.Ask,
                'high': rate.High,
                'low': rate.Low,
            }};
            companiesRates.push(bittrex);
            ticker.bittrex = companiesRates;
          });
        }
        callback(true);
      });
    },
      function(callback){
        sql = "select company, conversion from company_conversions where company <> 'Kraken'";
        db.query(sql, function (err, companies) {
          if (err) throw err;      
          var company = '';
          
          companies.forEach(function(value){
            if(value.company != company){
              var conversions = [];
    
              companies.forEach(function(innerValue){
                if(innerValue.company == value.company){
                  conversions.push(innerValue.conversion);
                }
              })
    
              companiesArray.push({[value.company]: conversions});
            }
    
            company = value.company;
          })

          callback(null);
        });
    }, function(callback){

      async.forEach(companiesArray[0].Bitstamp, function(cmp, done){
          var splitConversion = cmp.replace('/', '');
          link = "https://www.bitstamp.net/api/v2/ticker/"+splitConversion;
          console.log(link);
          request.get(link, function(err, request, body){
            console.log(body);
            // if(!err && request.statusCode == 200){
            //   var rates = JSON.parse(body);

            //   if(Array.isArray(rates) && rates.length > 0){
            //     var bitObj = {
            //     [splitConversion]: {
            //       'last': rates.last_price,
            //       'bid': rates.bid,
            //       'ask': rates.ask,
            //       'high': rates.high,
            //       'low': rates.low,
            //     }};
                
                // companiesRates.push(bodyj);
                // ticker.bitfinex = body;
                // done(null, 'Success');
            //   }
            // }
            done();
          });
        }, function(err){
          if(err) throw err;
          callback(true);
        }) 
    }, function(callback){

      async.forEach(companiesArray[1].Bitfinex, function(cmp, done){
          var splitConversion = cmp.replace('/', '');
          link = "https://api.bitfinex.com/v1/pubticker/"+splitConversion;
          console.log(link);
          request.get(link, function(err, request, body){
            console.log(request.statusCode);
            if(!err && request.statusCode == 200){
              var rates = JSON.parse(body);

              if(Array.isArray(rates) && rates.length > 0){
                var bitObj = {
                [splitConversion]: {
                  'last': rates.last_price,
                  'bid': rates.bid,
                  'ask': rates.ask,
                  'high': rates.high,
                  'low': rates.low,
                }};
                
                companiesRates.push(bitObj);
                ticker.bitfinex = companiesRates;
                done(null, 'Success');
              }
            }
          });
        }, function(err){
          if(err) throw err;
          callback(null, 'Test');
        }) 
    }
  ], function(c){
      console.log('end');
      res.json(ticker);
    });

  });

  return router;
}

module.exports = returnRouter;