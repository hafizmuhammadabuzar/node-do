var express = require('express');
var router = express.Router();
var request = require('request');
var db = require('./../db_connect');
var async = require('async');

/* GET home page. */
var returnRouter = function(io) {
  router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
  });

  router.get('/minute/rates', function(req, res, next){

    var ip = req.connection.remoteAddress;

    var sql = "insert into minute_requests (ip) values ('"+ip+"')";
    db.query(sql, function (err, result) {
      if (err) throw err;
      console.log(result);
    });
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

    var ticker = {};
    
    async.waterfall([
      function(callback){

        var url = "https://bittrex.com/api/v1.1/public/getmarketsummaries";
        request.get(url, function(error, request, body){
          var rates = JSON.parse(body);
          rates = rates.result;

          var bittrexObj = {};
          async.forEach(rates, function(rate, index){
            var con = rate.MarketName.split('-');
            con = con[1]+"/"+con[0];
            bittrexObj[con] = {
              'last': rate.Last,
              'bid': rate.Bid,
              'ask': rate.Ask,
              'high': rate.High,
              'low': rate.Low
          };

            ticker.BitTrex = bittrexObj;
          });
          
          callback(null);
        });
    },
    function(callback){
      var bitfinexObj = {};
      var sql = "select company, conversion from company_conversions where company = 'Bitfinex'";
      db.query(sql, function (err, companies) {
        if (err) callback(err);
        
        async.forEach(companies, function(cmp, done){
          var splitConversion = cmp.conversion.replace('/', '');
          link = "https://api.bitfinex.com/v1/pubticker/"+splitConversion.toLowerCase();
          request.get(link, function(error, request, body){
            if(error){
              callback(error, null);
            }
              var rates = JSON.parse(body);
              var con = cmp.conversion;

              bitfinexObj[cmp.conversion] = {
                'last': parseFloat(rates.last_price),
                'bid': parseFloat(rates.bid),
                'ask': parseFloat(rates.ask),
                'high': parseFloat(rates.high),
                'low': parseFloat(rates.low),
              };  

                ticker.Bitfinex = bitfinexObj;
                done();
            });
          },function(err){
            callback(null);
        });
      });  
    },
    function(callback){
      var bitstampObj = {};
      var sql = "select company, conversion from company_conversions where company = 'Bitstamp'";
      db.query(sql, function (err, companies) {
        if (err) callback(err);
        
        async.forEach(companies, function(cmp, complete){
          var splitConversion = cmp.conversion.replace('/', '');
          link = "https://www.bitstamp.net/api/v2/ticker/"+splitConversion.toLowerCase();
          request.get(link, function(error, request, body){
            if(error){
              callback(error, null);
            }
              var rates = JSON.parse(body);

              bitstampObj[cmp.conversion] = {
                'last': parseFloat(rates.last),
                'bid': parseFloat(rates.bid),
                'ask': parseFloat(rates.ask),
                'high': parseFloat(rates.high),
                'low': parseFloat(rates.low),
              };
                  
              ticker.Bitstamp = bitstampObj;
              complete();
            });
        },function(err){
          callback(null);
        });
      });  
    }
    // function(nextTwo){
    //   var companiesRates = [];
    //   var sql = "select company, conversion from company_conversions where company = 'Kraken' limit 1";
    //   db.query(sql, function (err, companies) {
    //     if (err) nextTwo(err);
        
    //     async.forEach(companies, function(cmp, complete){
    //       var splitConversion = cmp.conversion.replace('/', '');
    //       link = "https://www.bitstamp.net/api/v2/ticker/"+splitConversion.toLowerCase();
    //       request.get(link, function(error, request, body){
    //         if(error){
    //           nextTwo(error, null);
    //         }
    //           var rates = JSON.parse(body);

    //           var obj = {
    //               [cmp.conversion]: {
    //                 'last': parseFloat(rates.last),
    //                 'bid': parseFloat(rates.bid),
    //                 'ask': parseFloat(rates.ask),
    //                 'high': parseFloat(rates.high),
    //                 'low': parseFloat(rates.low),
    //               }};
                  
    //             companiesRates.push(obj);
    //             ticker.Kraken = companiesRates;
    //             complete();
    //         });
    //     },function(err){
    //       nextTwo(null, 'Third');
    //     });
    //   });  
    // }
  ], function(err){
      console.log('end');
      // io.sockets.emit('ticker', {'rates': ticker});
      res.json(ticker);
    });
  });

  return router;
}

module.exports = returnRouter;