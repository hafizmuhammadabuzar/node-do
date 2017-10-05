var express = require('express');
var router = express.Router();
var request = require('request');
var db = require('./../db_connect');
var async = require('async');
var rp = require('request-promise');
const fs = require('fs');

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
    
    var urls = [];
    var values = {};

    async.waterfall([
      function(callback){
        
        var filteredArray = {};        
        let company = 'BitTrex';
        var sql = "select company, conversion from company_conversions where company = '"+company+"'";

        db.query(sql, function (err, companies) {
          if (err) callback(err);
          
          async.forEach(companies, function(cmp, done){
            var conv = cmp.conversion.split('/');
            const timestamp = Math.floor(new Date() / 1000);
            link = "https://min-api.cryptocompare.com/data/histominute?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=2000&toTs="+timestamp+"&e="+cmp.company;

            request.get(link, function(error, request, body){
              if(error){
                callback(error, null);
              }

                var rates = JSON.parse(body);
                rates = rates.Data;

                filteredArray[cmp.conversion] = rates.filter(rate => rate.close != 0);
                values[cmp.company] = filteredArray;
                done();
              });
            },function(err){
              let filePath = 'public/data/'+company+'/minute.json';
              fs.writeFileSync(filePath, JSON.stringify(filteredArray));
              callback(true);
          });
        });  
      }
    ], function(error, c) {
      console.log(c);
      res.json({'msg': 'Successfully Saved'});
    });
  });

  router.get('/cron/ticker', function(req, res, next){
    let rawdata = fs.readFileSync('public/data/tickers.json');  
    let ticker = JSON.parse(rawdata);
    io.sockets.emit('ticker', {'rates': ticker});
    res.json(ticker);
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
              'last': rate.Last.toString(),
              'bid': rate.Bid.toString(),
              'ask': rate.Ask.toString(),
              'high': rate.High.toString(),
              'low': rate.Low.toString(),
              'volume': rate.Volume.toString()
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
                'last': rates.last_price,
                'bid': rates.bid,
                'ask': rates.ask,
                'high': rates.high,
                'low': rates.low,
                'volume': rates.volume
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
                'last': rates.last,
                'bid': rates.bid,
                'ask': rates.ask,
                'high': rates.high,
                'low': rates.low,
                'volume': rates.volume
              };
                  
              ticker.Bitstamp = bitstampObj;
              complete();
            });
        },function(err){
          callback(null);
        });
      });  
    },
    function(callback){
      var krakenObj = {};
      var sql = "select company, conversion, keyName from company_conversions where company = 'Kraken'";
      db.query(sql, function (err, companies) {
        if (err) callback(err);
        
        async.forEach(companies, function(cmp, complete){
          var conversion = cmp.keyName;
          link = "https://api.kraken.com/0/public/Ticker?pair="+conversion;
          request.get(link, function(error, request, body){
            if(error){
              callback(error, null);
            }
              var rates = JSON.parse(body);
              var rates = rates.result[conversion];

              krakenObj[cmp.conversion] = {
                'last': rates.c[0],
                'bid': rates.b[0],
                'ask': rates.a[0],
                'high': rates.h[0],
                'low': rates.l[0],
                'volume': rates.v[0]
              };
                  
              ticker.Kraken = krakenObj;
              complete();
            });
        },function(err){
          callback(null);
        });
      });  
    }
  ], function(err){
      let data = JSON.stringify(ticker);  
      fs.writeFileSync('public/data/tickers.json', data); 
      res.send('Ticker Sent');
    });
  });

  return router;
}

module.exports = returnRouter;