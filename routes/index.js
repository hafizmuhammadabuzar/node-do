var express = require('express');
var router = express.Router();
var request = require('request');
var db = require('./../db_connect');
var async = require('async');
const fs = require('fs');
var androidPush = require('../helpers/android-push');
var iosPush = require('../helpers/ios-push');
var Promise = require('promise');

/* GET home page. */
var returnRouter = function(io) {
  var sql;

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

  router.get('/history/:type', function(req, res, next){
    
    async.waterfall([
      function(callback){
        
        var company = req.query.company;
        var type = req.params.type;
        var dirName = (type=='day') ? 'daily' : type;
        
        var sql = "select company, conversion from company_conversions where company = '"+company+"'";
        
        db.query(sql, function (err, companies) {
          if (err) callback(err);
          
          async.forEach(companies, function(cmp, done){
            
            var conv = cmp.conversion.split('/');
            
            var filePath = 'public/data/'+cmp.company+'/'+dirName+'/'+conv[0]+'-'+conv[1]+'.json';
            var rawdata = fs.readFileSync(filePath);
            var jsonData = JSON.parse(rawdata);
            jsonData = jsonData.Data;

            const timestamp = Math.floor(new Date() / 1000);
            link = "https://min-api.cryptocompare.com/data/histo"+type+"?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=2&toTs="+timestamp+"&e="+cmp.company;
            
            var ip = req.connection.remoteAddress;
            
            request.get({url: link, localAdress: ip}, function(error, request, body){
              if(error){
                callback(error, null);
              }
              var rates = JSON.parse(body);
              rates = rates.Data;
              jsonData.push(rates[rates.length-1]);
              
              fs.writeFileSync(filePath, JSON.stringify(jsonData));  

              done();
            });
          },function(err){
              callback(null);
          });
        });  
      }
    ], function(error) {
      console.log('End');
      res.json({'msg': 'Successfully Saved'});
    });
  });

  router.get('/cron/history/minute', function(req, res, next){
    
    var values = [];
    var graphRates = [];
    var conversion = [];
    var company = req.query.company;

    async.waterfall([
      function(callback){
        
        var sql = "select company, conversion from company_conversions where company = '"+company+"'";
        
        db.query(sql, function (err, companies) {
          if (err) callback(err);
          
          async.forEach(companies, function(cmp, done){
            
            var conv = cmp.conversion.split('/');
            const timestamp = Math.floor(new Date() / 1000);
            link = "https://min-api.cryptocompare.com/data/histominute?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=2&toTs="+timestamp+"&e="+cmp.company;
            
            var ip = req.connection.remoteAddress;

            var myData  = new Promise(function (resolve, reject) {
              request({url:link}, function (err, res, body) {
                  if (err) {
                      return reject(err);
                  } else if (res.statusCode !== 200) {
                      err = new Error("Unexpected status code: " + res.statusCode);
                      err.res = res;
                      return reject(err);
                  }
                  var rates = JSON.parse(body);
                  rates = rates.Data;
                  if(rates.length > 0){
                    v = [rates[rates.length-1].time, rates[rates.length-1].close, rates[rates.length-1].high, rates[rates.length-1].low, rates[rates.length-1].open, rates[rates.length-1].volumefrom, rates[rates.length-1].volumeto, company, cmp.conversion];
                    values.push(v);
                  }
                  resolve(body);
                  done();
              });
            });

            
            // request.get({url: link, localAdress: ip}, function(error, response, body){
            //   if(error){
            //     res.send(error);
            //   }
            //   var rates = JSON.parse(body);
            //   rates = rates.Data;

              // if(rates.length > 0){
              //   v = [rates[rates.length-1].time, rates[rates.length-1].close, rates[rates.length-1].high, rates[rates.length-1].low, rates[rates.length-1].open, rates[rates.length-1].volumefrom, rates[rates.length-1].volumeto, company, cmp.conversion];
              //   values.push(v);
              //   done();
              // }
            //   else{
            //     console.log(cmp.conversion);
            //     done();
            //   }
            // });
          },function(err){
              callback(null);
          });
        });  
      },
      function(callback){

        sql = "insert into minute_rates (time, close, high, low, open, volumefrom, volumeto, company, conversion) values ?";
        db.query(sql, [values], function(err, saveResult){
          if(err) throw err;
          console.log(saveResult);
          callback();
        });
      }
    ], function(error) {
      console.log('End');
      res.json({'msg': 'Successfully Saved', data: values});
    });
  });

  router.get('/cron/ticker', function(req, res, next){
    var rawdata = fs.readFileSync('public/data/tickers.json');  
    var ticker = JSON.parse(rawdata);
    io.sockets.emit('new_ticker', {'appMsg': 'Testing Socket'});
    io.sockets.emit('ticker', {'rates': ticker});
    res.json(ticker);
  });

  router.get('/ticker', function(req, res, next){

    var rawdata = fs.readFileSync('public/data/tickers.json');  
    var ticker = JSON.parse(rawdata);

    // var ticker = {};
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

              if(rates.bid != null){
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
              }
              else{
                callback(null);
              }
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
        
        async.forEach(companies, function(cmp, compvare){
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
              compvare();
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
        
        async.forEach(companies, function(cmp, compvare){
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
              compvare();
            });
        },function(err){
          callback(null);
        });
      });  
    }
  ], function(err){
      var data = JSON.stringify(ticker);  
      fs.writeFileSync('public/data/tickers.json', data); 
      res.send('Ticker Sent');
    });
  });

  router.get('/sendAlerts', function(req, res, next){

    var rawdata = fs.readFileSync('public/data/tickers.json');
    var jsonData = JSON.parse(rawdata);
    var allTokens = [];
    
    async.waterfall([
      function(callback){
        var tokens = [];
        var companies = Object.keys(jsonData);
        async.forEachOf(companies, function(cmp, key, compvare){
    
          var pairObject = jsonData[cmp]; 
          async.forEachOf(pairObject, function(rate, key, done){
    
            sql = "select id, token, player_id from tokens where company = '"+cmp+"' and conversion = '"+key+"' and price > '"+rate.last+"' and is_less = 0 and status = 1 and player_id IS NOT NULL";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                allTokens.push(tokenData[0].id);
                var msg = cmp+" "+key+" is now above then you criteria";
                iosPush(tokenData[0].player_id, msg);
                // tokens.push(tokenData[0].player_id);
              }
              done();
            });
          }, function(allTokens){
            compvare();
          });
        }, function(allTokens){
          callback(null);
        });

      },
      function(callback){
        var tokens = [];
        var companies = Object.keys(jsonData);
        async.forEachOf(companies, function(cmp, key, compvare){
    
          var pairObject = jsonData[cmp]; 
          async.forEachOf(pairObject, function(rate, key, done){
    
            sql = "select id, token from tokens where company = '"+cmp+"' and conversion = '"+key+"' and price > '"+rate.last+"' and is_less = 0 and status = 1 and player_id IS NULL";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                allTokens.push(tokenData[0].id);
                var msg = cmp+" "+key+" is now above then you criteria";
                androidPush(tokenData[0].token, msg);
                // tokens.push(tokenData[0].token);
              }
              done();
            });
          }, function(allTokens){
            compvare();
          });
        }, function(allTokens){
          callback(null);
        });
      },
      function(callback){
        var tokens = [];
        var companies = Object.keys(jsonData);
        async.forEachOf(companies, function(cmp, key, compvare){
    
          var pairObject = jsonData[cmp]; 
          async.forEachOf(pairObject, function(rate, key, done){
    
            sql = "select id, token, player_id from tokens where company = '"+cmp+"' and conversion = '"+key+"' and price < '"+rate.last+"' and is_less = 1 and status = 1 and player_id IS NOT NULL";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                allTokens.push(tokenData[0].id);
                var msg = cmp+" "+key+" is now below then you criteria";
                iosPush(tokenData[0].player_id, msg);
                // tokens.push(tokenData[0].player_id);
              }
              done();
            });
          }, function(allTokens){
            compvare();
          });
        }, function(allTokens){
          callback(null);
        });

      },
      function(callback){
        var tokens = [];
        var companies = Object.keys(jsonData);
        async.forEachOf(companies, function(cmp, key, compvare){
    
          var pairObject = jsonData[cmp]; 
          async.forEachOf(pairObject, function(rate, key, done){
    
            sql = "select id, token from tokens where company = '"+cmp+"' and conversion = '"+key+"' and price < '"+rate.last+"' and is_less = 1 and status = 1 and player_id IS NULL";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                allTokens.push(tokenData[0].id);
                var msg = cmp+" "+key+" is now above then you criteria";
                androidPush(tokenData[0].token, msg);
                // tokens.push(tokenData[0].token);
              }
              done();
            });
          }, function(allTokens){
            compvare();
          });
        }, function(allTokens){
          callback(null);
        });
      }
    ], function(err){
      sql = "update tokens set status = 0 where id in ("+allTokens.join()+")";
      db.query(sql, function(err, result){
        if(err) throw err;
        console.log(result.affectedRows);
      });
      console.log('end');
      res.json(allTokens);
    });
  });

  return router;
}

module.exports = returnRouter;