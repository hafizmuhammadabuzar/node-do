var express = require('express');
var router = express.Router();
var db = require('./../db_connect');
var async = require('async');
const fs = require('fs');
var androidPush = require('../helpers/android-push');
var iosPush = require('../helpers/ios-push');
var Promise = require('promise');
var request = require('request');

/* GET home page. */
var returnRouter = function(io) {
  var sql;

  router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
  });

  router.get('/history/:type', function(req, res, next){
    
    var dataArray;
    var type = req.params.type;
    var dirName = (type=='day') ? 'daily' : type;

    async.waterfall([
      function(callback){
        
        var sql = "select company, conversion from company_conversions order by company";
        
        db.query(sql, function (err, companies) {
          if (err) throw err;
          dataArray = companies;
          callback(null);
        });  
      }, function(callback){

        async.eachSeries(dataArray, function(cmp, next){
          
          setTimeout(function(){
            
            var conv = cmp.conversion.split('/');
            var filePath = 'public/data/'+cmp.company+'/'+dirName+'/'+conv[0]+'-'+conv[1]+'.json';

            if(fs.existsSync(filePath)){
              var rawdata = fs.readFileSync(filePath);
              var jsonData = JSON.parse(rawdata);
              jsonData = ('Data' in jsonData) ? jsonData.Data : jsonData;
              const timestamp = Math.floor(new Date() / 1000);

              link = "https://min-api.cryptocompare.com/data/histo"+type+"?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=1&e="+cmp.company;
              
              request.get(link, function (error, response, body) {
                var rates = JSON.parse(body);
                rates = rates.Data;
                
                if(rates.length > 0){
                  var jsonLastElement = jsonData[jsonData.length-1];
                  if(type == 'day'){
                    var ratesLastElement = rates[0];
                  }else{
                    var ratesLastElement = rates[rates.length-1];
                  }
                  if(jsonLastElement.time != ratesLastElement.time){
                    jsonData.push(ratesLastElement);
                    fs.writeFileSync(filePath, JSON.stringify(jsonData));
                  }
                }

                next();
              });
            }else{
              next();
            }
          }, 100);
        }, function(){
          callback(null);
        });
      }
    ], function(error) {
      console.log('End');
      res.json({'msg': 'Successfully Saved', 'data': dataArray});
    });
  });

  router.get('/cron/history/minute', function(req, res, next){
    
    var dataArray = [];
    const timestamp = Math.floor(new Date() / 1000);

    async.waterfall([
      function(callback){
        
        // var sql = "select company, conversion from company_conversions where company = 'Bitstamp'";
        var sql = "select company, conversion from company_conversions order by company";
        
        db.query(sql, function (err, companies) {
          if (err) throw err;
          dataArray = companies;
          callback(null);
        });  
      }, function(callback){

        async.eachSeries(dataArray, function(cmp, next){
          
          var conv = cmp.conversion.split('/');
          // var filePath = 'public/data/'+cmp.company+'/minute/'+conv[0]+'-'+conv[1]+'.json';

          // if(fs.existsSync(filePath)){
          //   var rawdata = fs.readFileSync(filePath);
          //   var jsonData = JSON.parse(rawdata);
          //   jsonData = ('Data' in jsonData) ? jsonData.Data : jsonData;

            link = "https://min-api.cryptocompare.com/data/histominute?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=4&toTs="+timestamp+"&e="+cmp.company;
            
            request.get(link, function (error, response, body) {
              var rates = JSON.parse(body);
              rates = rates.Data;
              
              if(rates.length > 0){

                var values = [];
                async.forEach(rates, (rate) => {
                  values.push([rate.time, rate.close, rate.high, rate.low, rate.open, rate.volumefrom, rate.volumeto, cmp.company, cmp.conversion]);
                });
                
                var insertQuery = "insert into `minute_rates` (time, close, high, low, open, volumefrom, volumeto, company, conversion) values ?";
                
                db.query(insertQuery, [values], (error, queruRespopnse) => {
                  if(error) throw error;
                  return true;
                });
  
                // var allRates = jsonData.concat(rates);
                // fs.writeFileSync(filePath, JSON.stringify(allRates));
              }

              next();
            });
          // }else{
          //   console.log('File does not exists');
          //   next();
          // } 
        }, function(){
          callback(null);
        });
      }
    ], function(error) {
      console.log('End');
      res.json({'msg': 'Successfully Saved', 'data': dataArray});
    });
  });

 // company with pairs list saved in socket 
  router.get('/socket/companiesConversions', function(req, res) {
    sql = "select company, conversion from company_conversions order by company";
    db.query(sql, function (err, companies) {
      if (err) throw err;      
      var company = '';
      var companiesArray = [];
    
      companies.forEach(function(value){
          if(value.company != company){
          var conversions = [];

          companies.forEach(function(innerValue){
              if(innerValue.company == value.company){
              conversions.push({'cur': innerValue.conversion});
              }
          })

          companiesArray.push({'company': value.company, 'conversions': conversions});
          }

          company = value.company;
      })

      io.sockets.emit('companiesPair', {'data': companiesArray});
      res.send('Success');
    });
  });

  router.get('/cron/ticker', function(req, res, next){
    var rawdata = fs.readFileSync('public/data/tickers.json');  
    var ticker = JSON.parse(rawdata);
    io.sockets.emit('ticker', {'rates': ticker});
    res.json(ticker);
  });

  router.get('/ticker', function(req, res, next){

    var rawdata = fs.readFileSync('public/data/tickers.json');  
    var ticker = JSON.parse(rawdata);
    
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
          request.get(link, function(error, bitFinexResponse, body){
            if(error) throw error;

            if(bitFinexResponse.statusCode == 200){
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
                done();
              }
            }
            else{
              done();
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
          request.get(link, function(error, krakenResponse, body){
            if(error){
              callback(error, null);
            }
            if(krakenResponse.statusCode == 200){
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
            }
            else{
              compvare();
            }
          });
        },function(err){
          callback(null);
        });
      });  
    }
  ], function(err){
      var data = JSON.stringify(ticker);  
      fs.writeFileSync('public/data/tickers.json', data); 
      // res.send('Ticker Sent');
      res.json(JSON.parse(data));
    });
  });

// Ticker for XCoin Seller 
router.get('/sellerTicker', function(req, res, next){
  
    var tickers = {};

    var rawdata = fs.readFileSync('public/data/sellerTicker.json');  
    var oldData = JSON.parse(rawdata);
      
    async.waterfall([
    function(callback){
        
      link = "https://api.cryptonator.com/api/full/btc-usd";
      request.get(link, function(error, response, body){
        if(error){
          callback(error, null);
        }
        
        if(response.statusCode == 200){
          var rates = JSON.parse(body);
          tickers = rates['ticker'];

          console.log('seller rates found');
        }
        else{
          console.log('seller rates not found');
        }
        callback(null);
      });
    },
    function(callback){
      var bitfinexObj = {};
        
      link = "https://api.bitfinex.com/v1/pubticker/btcusd";
      request.get(link, function(error, bitfinexResponse, body){
        if(error){
          callback(error, null);
        }
        
        var market = tickers['markets'];
        
        if(bitfinexResponse.statusCode == 200){
          rates = JSON.parse(body);
          
          bitfinexObj = {
            'market': 'Bitfinex',
            'price': rates.last_price,
            'volume': parseFloat(rates.volume)
          };
          
          market.push(bitfinexObj);
          tickers.markets = market;
          console.log('Bitfinex ticker done');
        }
        else{
          market.push(oldData[11]);
          tickers.markets = oldData[11];
          console.log('Bitfinex ticker empty');
        }
        callback(null);
      });
    },
    function(callback){
      var coinroomObj = {};
        
      link = "https://coinroom.com/api/ticker/BTC/USD";
      request.get(link, function(error, coinroomResponse, body){
        if(error){
          callback(error, null);
        }

        var market = tickers['markets'];
        if(market !== undefined){

          if(coinroomResponse.statusCode == 200){
            rates = JSON.parse(body);
  
            coinroomObj = {
              'market': 'Coinroom',
              'price': rates.last.toString(),
              'volume': parseFloat(rates.volume)
            };
               
            market.push(coinroomObj);
            tickers.markets = market;
            console.log('Coinroom ticker done');
          }
          else{
            tickers.markets = oldData[12];
            console.log('Coinroom ticker empty');
          }
        }
        else{
          tickers.markets = oldData[12];
          console.log('Coinroom ticker empty');
        }
        callback(null);
      });
    },
    function(callback){
      var quadrigacxObj = {};
        
      link = "https://api.quadrigacx.com/v2/ticker?book=btc_usd";
      request.get(link, function(error, coinroomResponse, body){
        if(error){
          callback(error, null);
        }
        if(coinroomResponse.statusCode == 200){
          var rates = JSON.parse(body);
          var market = tickers['markets'];

          quadrigacxObj = {
            'market': 'Quadrigacx',
            'price': rates.last.toString(),
            'volume': parseFloat(rates.volume)
          };
              
          market.push(quadrigacxObj);
          tickers.markets = market;
          console.log('Quadrigacx ticker done');
        }
        else{
          console.log('Quadrigacx ticker empty');
        }
        callback(null);
      });
    }
  ], function(err){
      var data = JSON.stringify(tickers);  
      fs.writeFileSync('public/data/sellerTicker.json', data); 
      res.json(JSON.parse(data));
    });
  });

router.get('/cron/sellerTicker', function(req, res, next){
  var rawdata = fs.readFileSync('public/data/sellerTicker.json');  
  var ticker = JSON.parse(rawdata);
  io.sockets.emit('sellerTicker', {'rates': ticker});
  res.json(ticker);
});

  // send alerts to users and inactive 
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
    
            sql = "select id, token, player_id from tokens where company = '"+cmp+"' and conversion = '"+key+"' and price < '"+rate.last+"' and is_less = 0 and status = 1 and player_id IS NOT NULL";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                allTokens.push(tokenData[0].id);
                var msg = cmp+" "+key+" is now above than your criteria";
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
    
            sql = "select id, token from tokens where company = '"+cmp+"' and conversion = '"+key+"' and price < '"+rate.last+"' and is_less = 0 and status = 1 and player_id IS NULL";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                allTokens.push(tokenData[0].id);
                var msg = cmp+" "+key+" is now above than your criteria";
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
    
            sql = "select id, token, player_id from tokens where company = '"+cmp+"' and conversion = '"+key+"' and price > '"+rate.last+"' and is_less = 1 and status = 1 and player_id IS NOT NULL";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                allTokens.push(tokenData[0].id);
                var msg = cmp+" "+key+" is now below than your criteria";
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
    
            sql = "select id, token from tokens where company = '"+cmp+"' and conversion = '"+key+"' and price > '"+rate.last+"' and is_less = 1 and status = 1 and player_id IS NULL";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                allTokens.push(tokenData[0].id);
                var msg = cmp+" "+key+" is now below than your criteria";
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
      if(allTokens.length > 0){
        sql = "update tokens set status = 0 where id in ("+allTokens.join()+")";
        db.query(sql, function(err, result){
          if(err) throw err;
          console.log(result.affectedRows);
        });
      }
      console.log('end');
      res.json(allTokens);
    });
  });

  // send alerts v2 to users and inactive 
  router.get('/sendAlertsV2', function(req, res, next){
    
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
    
            sql = "select id, token, player_id, is_persistent from tokens_v2 where company = '"+cmp+"' and conversion = '"+key+"' and above_price <= '"+rate.last+"' and status = 1 and player_id IS NOT NULL and above_price != ''";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                if(tokenData[0].is_persistent == 0){
                  allTokens.push(tokenData[0].id);
                }
                var msg = cmp+" "+key+" is now above than your criteria";
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
    
            sql = "select id, token, is_persistent from tokens_v2 where company = '"+cmp+"' and conversion = '"+key+"' and above_price <= '"+rate.last+"' and status = 1 and player_id IS NULL and above_price != ''";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                if(tokenData[0].is_persistent == 0){
                  allTokens.push(tokenData[0].id);
                }
                var msg = cmp+" "+key+" is now above than your criteria";
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
    
            sql = "select id, token, player_id, is_persistent from tokens_v2 where company = '"+cmp+"' and conversion = '"+key+"' and below_price >= '"+rate.last+"' and status = 1 and player_id IS NOT NULL and below_price != ''";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                if(tokenData[0].is_persistent == 0){
                  allTokens.push(tokenData[0].id);
                }
                var msg = cmp+" "+key+" is now below than your criteria";
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
    
            sql = "select id, token, is_persistent from tokens_v2 where company = '"+cmp+"' and conversion = '"+key+"' and below_price >= '"+rate.last+"' and status = 1 and player_id IS NULL and below_price != ''";
            db.query(sql, function(err, tokenData){
              if(err) throw err;
              if(tokenData.length > 0){
                if(tokenData[0].is_persistent == 0){
                  allTokens.push(tokenData[0].id);
                }
                var msg = cmp+" "+key+" is now below than your criteria";
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
      if(allTokens.length > 0){
        sql = "update tokens_v2 set status = 0 where id in ("+allTokens.join()+")";
        db.query(sql, function(err, result){
          if(err) throw err;
          console.log(result.affectedRows);
        });
      }
      console.log('end');
      res.json(allTokens);
    });
  });

  // remove duplicate entries in a json file
  router.get('/duplicate/:type', (req, res, next) => {

    var dataArray = [];
    async.waterfall([
      function(callback){
        
        var type = req.params.type;
        var company = req.query.company;
        var removeNull = req.query.removeNull;
        var dirName = (type=='day') ? 'daily' : type;
        
        var sql = "select company, conversion from company_conversions where company = '"+company+"'";
        
        db.query(sql, function (err, companies) {
          if (err) throw(err);
          
          async.forEach(companies, function(cmp, done){
            
            var conv = cmp.conversion.split('/');
            var filePath = 'public/data/'+cmp.company+'/'+dirName+'/'+conv[0]+'-'+conv[1]+'.json';

            if(fs.existsSync(filePath)){
              var rawdata = fs.readFileSync(filePath);
              var jsonData = JSON.parse(rawdata);
              jsonData = ('Data' in jsonData) ? jsonData.Data : jsonData;
              
              if(jsonData.length > 0){
                if(removeNull != 1){
                  var temp = [];
                  jsonData = jsonData.filter((x, i) => {
                    if (temp.indexOf(x.time) < 0 && x.close != 0) {
                      temp.push(x.time);
                      return true;
                    }
                    return false;
                  });
                }
                else{
                  jsonData = jsonData.filter((x, i) => {
                    if (x !== null) {
                      return true;
                    }
                    return false;
                  });
                }
  
                fs.writeFileSync(filePath, JSON.stringify(jsonData));
              }
              done();
            }
            else{
              done();
            }
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

  router.get('/splice/:type', (req, res, next) => {

    var company = req.query.company;
    var conversion = req.query.conversion;
    var startIndex = req.query.first;
    var endIndex = req.query.last;
    var type = req.params.type;
    var dirName = (type=='day') ? 'daily' : type;

    var conv = conversion.split('/');
    
    var filePath = 'public/data/'+company+'/'+dirName+'/'+conv[0]+'-'+conv[1]+'.json';

    if(fs.existsSync(filePath)){
      var rawdata = fs.readFileSync(filePath);
      var jsonData = JSON.parse(rawdata);
      jsonData = ('Data' in jsonData) ? jsonData.Data : jsonData;
    }
    
    jsonData.splice(startIndex, endIndex);
    fs.writeFileSync(filePath, JSON.stringify(jsonData));
    res.json(jsonData);
  });

  router.get('/historyFull/:type', function(req, res, next){
    
    var dataArray;
    var company = req.query.company;
    var type = req.params.type;
    var dirName = (type=='day') ? 'daily' : type;
    const timestamp = Math.floor(new Date() / 1000);

    async.waterfall([
      function(callback){
        
        // var sql = "select company, conversion from company_conversions where company = '"+company+"'";
        var sql = "select company, conversion from company_conversions order by company";
        
        db.query(sql, function (err, companies) {
          if (err) throw err;
          dataArray = companies;
          callback(null);
        });  
      }, function(callback){

        async.eachSeries(dataArray, function(cmp, next){
          
          var conv = cmp.conversion.split('/');
          var filePath = 'public/data/'+cmp.company+'/'+dirName+'/'+conv[0]+'-'+conv[1]+'.json';
          link = "https://min-api.cryptocompare.com/data/histo"+type+"?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=2000&e="+cmp.company;

          request.get(link, function (error, response, body) {
            var rates = JSON.parse(body);
            rates = rates.Data;
            rates.pop();
            if(rates.length > 0){
              fs.writeFileSync(filePath, JSON.stringify(rates));
              console.log(cmp.company+' - '+cmp.conversion);
            }
            next();
          });
        }, function(){
          callback(null);
        });
      }
    ], function(error) {
      console.log('End');
      res.json({'msg': 'Successfully Saved', 'data': dataArray});
    });
  });

  router.get('/saveVenue', (req, res, next) => {

    request.get('http://coinmap.org/api/v1/venues/?mode=full', function(error, response, body){
      if(error) throw error;

      if(response.statusCode == 200){
        var dataArray = [];
        var data = JSON.parse(body);
        data = data.venues;
        if(data.length > 0){
          // delete old venue points from database
          sql = "delete from venues where is_user = 0";
          db.query(sql, function(err, deleteResponse){
            if(err) throw err;
          });

          // save each venue point in database
          async.eachSeries(data, (row, done) => {
  
            var opening_hours = (row.opening_hours == null) ? '' : row.opening_hours.replace(/'/g, "`");
            var state = (row.state == null) ? '' : row.state.replace(/'/g, "`");
            var street = (row.street == null) ? '' : row.street.replace(/'/g, "`");
            var category = (row.category == null) ? '' : row.category.replace(/'/g, "`");
            var city = (row.city == null) ? '' : row.city.replace(/'/g, "`");
            var houseno = (row.houseno == null) ? '' : row.houseno.replace(/'/g, "`");
            var name = (row.name == null) ? '' : row.name.replace(/'/g, "`");
            var phone = (row.phone == null) ? '' : row.phone.replace(/'/g, "`");
            var fax = (row.fax == null) ? '' : row.fax.replace(/'/g, "`");
            var postcode = (row.postcode == null) ? '' : row.postcode.replace(/'/g, "`");
            var description = (row.description == null) ? '' : row.description.replace(/'/g, "`");

            sql = "insert into venues (country, opening_hours, facebook, longitude, street, fax, category, city, twitter, name, state, website, email, phone, house_no, latitude, postcode, description, status) values ('"+row.country+"', '"+opening_hours+"', '"+row.facebook+"', '"+row.lon+"', '"+street+"', '"+fax+"', '"+category+"', '"+city+"', '"+row.twitter+"', '"+name+"', '"+state+"', '"+row.website+"', '"+row.email+"', '"+phone+"', '"+houseno+"', '"+row.lat+"', '"+postcode+"', '"+description+"', 1)";
  
            db.query(sql, function(err, queryResponse){
              if(err) throw err;
              console.log(queryResponse);
              done();
            });
          }, function(){
            console.log('data end');
            sql = "SELECT country, opening_hours, facebook, longitude as lon, latitude as lat, street, fax, category, city, twitter, name, state, website, email, phone, house_no as houseno, postcode, description FROM `venues` WHERE status = 1";
            db.query(sql, function(err, venueList){
              if(err) throw err;
              fs.writeFileSync('public/data/venueList.json', JSON.stringify(venueList));
              res.send('Successfully Added!');
            });
          });
        }
        else{
          res.send('No record found!');
        }
      }else{
        res.send('Empty Repsonse');
      }
    });
  });

  router.post('/saveUserVenue', (req, res, next) => {
    
    sql = "insert into venues (facebook, longitude, fax, category, twitter, name, website, email, phone, latitude, description, is_user, status) values ('"+req.body.facebook+"', '"+req.body.longitude+"', '"+req.body.fax+"', '"+req.body.category+"', '"+req.body.twitter+"', '"+req.body.name+"', '"+req.body.website+"', '"+req.body.email+"', '"+req.body.phone+"', '"+req.body.latitude+"', '"+req.body.description+"', 1, 0)";
    db.query(sql, function(err, queryResponse){
      if(err) throw err;
      var result = {};
      result.status = 'Success';
      res.header("Access-Control-Allow-Origin", "*");
      res.json(result);
    });
  });

  router.get('/updateTokensV2', (req, res, next) => {

    sql = "select * from tokens";
    db.query(sql, function(err, data){
      if(err) throw err;

      async.forEach(data, function(d, done){

        var below_price = (d.is_less==1) ? d.price : '';
        var above_price = (d.is_less==0) ? d.price : '';
        var is_persistent = 0;
  
        saveQuery = "insert into tokens_v2 (company, conversion, token, player_id, device_id, above_price, below_price, is_persistent, date) values ('"+d.company+"', '"+d.conversion+"', '"+d.token+"', '"+d.player_id+"', '"+d.device_id+"', '"+above_price+"', '"+below_price+"', "+is_persistent+", '"+d.date+"')";
  
        db.query(saveQuery, (error, response) => {
          if(error) throw error;
          done();
        });
      },function(){
        res.send('Saved!');
      });
    });
  });


  router.get('/sendEmail', (req, res, next) => {
    var nodemailer = require('nodemailer');

    var transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
             user: 'hamzasynergistics@gmail.com',
             pass: 'synergistics'
         }
     });

     const mailOptions = {
      from: 'hafizmabuzar@gmail.com',
      to: 'hafizmabuzar@synergistics.pk',
      subject: 'Nodejs Test Email',
      html: '<p>Your html here</p>'
    };

    transporter.sendMail(mailOptions, function (err, info) {
      if(err)
        console.log(err)
      else
        console.log(info);

        res.json(info);
   });

  });

  return router;
}

module.exports = returnRouter;