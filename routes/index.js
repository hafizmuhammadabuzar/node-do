var express = require('express');
var router = express.Router();
var db = require('./../db_connect');
var async = require('async');
const fs = require('fs');
var androidPush = require('../helpers/android-push');
var iosPush = require('../helpers/ios-push');
var Promise = require('promise');
var request = require('request')

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

              link = "https://min-api.cryptocompare.com/data/histo"+type+"?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=2&toTs="+timestamp+"&e="+cmp.company;
              
              request.get(link, function (error, response, body) {
                var rates = JSON.parse(body);
                rates = rates.Data;
                
                if(rates.length > 0){
                  var jsonLastElement = jsonData[jsonData.length-1];
                  var ratesLastElement = rates[rates.length-1];
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
          var filePath = 'public/data/'+cmp.company+'/minute/'+conv[0]+'-'+conv[1]+'.json';

          if(fs.existsSync(filePath)){
            var rawdata = fs.readFileSync(filePath);
            var jsonData = JSON.parse(rawdata);
            jsonData = ('Data' in jsonData) ? jsonData.Data : jsonData;

            link = "https://min-api.cryptocompare.com/data/histominute?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=4&toTs="+timestamp+"&e="+cmp.company;
            
            request.get(link, function (error, response, body) {
              var rates = JSON.parse(body);
              rates = rates.Data;
              
              if(rates.length > 0){
                var allRates = jsonData.concat(rates);
                fs.writeFileSync(filePath, JSON.stringify(allRates));
              }

              next();
            });
          }else{
            console.log('File does not exists');
            next();
          } 
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
          request.get(link, function(error, request, body){
            if(error) throw error;

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
    
            sql = "select id, token, player_id, is_persistent from tokens_v2 where company = '"+cmp+"' and conversion = '"+key+"' and above_price <= '"+rate.last+"' and status = 1 and player_id IS NOT NULL";
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
    
            sql = "select id, token, is_persistent from tokens_v2 where company = '"+cmp+"' and conversion = '"+key+"' and above_price <= '"+rate.last+"' and status = 1 and player_id IS NULL";
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
    
            sql = "select id, token, player_id, is_persistent from tokens_v2 where company = '"+cmp+"' and conversion = '"+key+"' and below_price >= '"+rate.last+"' and status = 1 and player_id IS NOT NULL";
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
    
            sql = "select id, token, is_persistent from tokens_v2 where company = '"+cmp+"' and conversion = '"+key+"' and below_price >= '"+rate.last+"' and status = 1 and player_id IS NULL";
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
          link = "https://min-api.cryptocompare.com/data/histo"+type+"?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=200&toTs="+timestamp+"&e="+cmp.company;

          request.get(link, function (error, response, body) {
            var rates = JSON.parse(body);
            rates = rates.Data;
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
          async.eachSeries(data, (row, done) => {
  
            var state = (row.state == null) ? '' : row.state.replace(/'/g, "`");
            var street = (row.street == null) ? '' : row.street.replace(/'/g, "`");
            var category = (row.category == null) ? '' : row.category.replace(/'/g, "`");
            var city = (row.city == null) ? '' : row.city.replace(/'/g, "`");
            var description = (row.description == null) ? '' : row.description.replace(/'/g, "`");

            sql = "insert into venues (country, opening_hours, facebook, longitude, street, fax, category, city, twitter, name, state, website, email, phone, house_no, latitude, postcode, description) values ('"+row.country+"', '"+row.opening_hours+"', '"+row.facebook+"', '"+row.lon+"', '"+row.street+"', '"+row.fax+"', '"+row.category+"', '"+row.city+"', '"+row.twitter+"', '"+row.name+"', '"+row.state+"', '"+row.website+"', '"+row.email+"', '"+row.phone+"', '"+data.houseno+"', '"+row.lat+"', '"+row.postcode+"', '"+description+"')";
  
            // var dataObj = {
            //   "country": row.country,
            //   "opening_hours": row.opening_hours,
            //   "facebook": row.facebook,
            //   "lon": row.lon,
            //   "street": row.street,
            //   "fax": row.fax,
            //   "category": row,category,
            //   "city": row,city,
            //   "twitter": rwo.twitter,
            //   "name": row.name,
            //   "state": row.state,
            //   "website": row.website,
            //   "email": row.email,
            //   "phone": row.phone,
            //   "houseno": row.houseno,
            //   "lat": row.lat,
            //   "postcode": row.postcode,
            //   "description": row.description
            // }


            // res.send(sql);
            // process.exit(0);
  
            db.query(sql, function(err, queryResponse){
              if(err) throw err;
              console.log(queryResponse);
              done();
            });
          }, function(){
            res.send('Successfully Added!');
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

  return router;
}

module.exports = returnRouter;