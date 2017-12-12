var express = require('express');
var router = express.Router();
var validator = require('express-validator');
var fs = require('fs');
var request = require('request');
var async = require('async');
var androidPush = require('../helpers/android-push');
var iosPush = require('../helpers/ios-push');
router.use(validator());

/* GET home page. */
var returnRouter = function(db) {
var sql;
var result = {};

  router.get('/companiesConversions', function(req, res) {
    var filePath = 'public/companies_conversions.json';
    var companiesArray = [];

    if(fs.existsSync(filePath)){
      var rawdata = fs.readFileSync(filePath);
      var companiesArray = JSON.parse(rawdata);
      
      var result = {
        status : 'Success',
        msg : 'Companies Conversions',
        data: companiesArray
      }
      res.json(result);
    }
    else{
      var result = {
        status : 'Error',
        msg : 'Some error occurred',
        data: companiesArray
        }

        res.json(result);
    }

    // sql = "select company, conversion from company_conversions order by company";
    // db.query(sql, function (err, companies) {
    //   if (err) throw err;      
    //   var company = '';
    //   var companiesArray = [];?
      
    //   companies.forEach(function(value){
    //     if(value.company != company){
    //       var conversions = [];

    //       companies.forEach(function(innerValue){
    //         if(innerValue.company == value.company){
    //           conversions.push({'cur': innerValue.conversion});
    //         }
    //       })

    //       companiesArray.push({'company': value.company, 'conversions': conversions});
    //     }

    //     company = value.company;
    //   })

    //   var result = {
    //     status : 'Success',
    //     msg : 'Companies Conversions',
    //     data: companiesArray
    //   }
    //   res.json(result);
    // });
  });

  router.get('/getHistory/:type', function(req, res, next){

    req.checkQuery('company', 'Company name required').notEmpty();
    req.checkQuery('conversion', 'Conversion required').notEmpty();

    var v_errors = req.validationErrors();
    if(v_errors){
      res.json(v_errors);
    }

    var company = req.query.company;
    var type = req.params.type;
    var conversion = req.query.conversion;
    
    if(req.params.type == 'minute'){
      
      const timestamp = Math.floor(new Date() / 1000);
      var conv = conversion.split('/');
      link = "https://min-api.cryptocompare.com/data/histominute?fsym="+conv[0]+"&tsym="+conv[1]+"&limit=2000&toTs="+timestamp+"&e="+company;
      
      request.get(link, function (error, response, body) {
        var rates = JSON.parse(body);
        rates = rates.Data;

        var result = {
          status : 'Success',
          msg : company+' History',
        }
        
        result.data = rates;
        
        res.json(result);
      });

      // sql = "select time, close, high, low, open, volumefrom, volumeto from minute_rates where company = '"+company+"' and conversion = '"+conversion+"'";

      // db.query(sql, function(err, ratesData){
      //   if(err) throw err;
      //   var result = {
      //     status : 'Success',
      //     msg : company+' History',
      //     data: ratesData
      //   }

        // res.json(result);
      // });
    }
    else{
      var conv = req.query.conversion.split('/');
      var filePath = 'public/data/'+company+'/'+type+'/'+conv[0]+'-'+conv[1]+'.json';
  
      var data = '';
      if(fs.existsSync(filePath)){
        var rawdata = fs.createReadStream(filePath); 
        
        rawdata.on('data', function(chunk) {  
          data += chunk;
        }).on('end', function() {
          var histo = JSON.parse(data);
          var result = {
            status : 'Success',
            msg : req.query.company+' History',
          }
          
          result.data = ('Data' in histo) ? histo.Data : histo;
          
          res.json(result);
        });
      }
      else{
        var result = {
          status : 'Success',
          msg : 'No data found',
        }

        res.json(result);
      }
    }
  });

  router.get('/addIosToken', function(req, res, next){

    req.checkQuery('company', 'Company name required').notEmpty();
    req.checkQuery('conversion', 'Combination required').notEmpty();
    req.checkQuery('price', 'Price required').notEmpty();
    req.checkQuery('token', 'Token required').notEmpty();
    req.checkQuery('device_id', 'Device Id required').notEmpty();
    req.checkQuery('type', 'Type required').notEmpty();
    req.checkQuery('date', 'Date required').notEmpty();
    req.checkQuery('status', 'Status required').notEmpty();

    var v_errors = req.validationErrors();
    if(v_errors){
      res.json(v_errors);
    }

    var token = req.query.token;
    var device_id = req.query.device_id;
    var company = req.query.company;
    var conversion = req.query.conversion;
    var price = req.query.price;
    var type = req.query.type;
    var date = req.query.date;
    var status = req.query.status;
    var id = req.query.id;
    var result = {};

    // for v2 values
    var below_price = (type==1) ? price : '';
    var above_price = (type==0) ? price : '';
    var is_persistent = 0;
    // end for v2 values
    
    async.waterfall([
      function(callback){
        sql = "select * from tokens where token = '"+token+"' and device_id = '"+device_id+"' and company = '"+company+"' and conversion = '"+conversion+"' and price = "+price+" and status ="+status+" and is_less ="+type;
        db.query(sql, function(err, data){
          if(err){
            result.status = 'Error';
            result.msg = err;
            
            callback(err);
          }
          
          if(data.length > 0){
            result.status = 'Error';
            result.msg = 'Already Exists';
            callback(true);
          }
          callback(null);
        });
      },
      function(callback){
        
        if(id == undefined){
          var fields = {
            'app_id': "e2d795a1-20a2-43f6-ba23-9c7c3bfaa6d4",
            'identifier': token,
            'language': "en",
            'timezone': "-28800",
            'game_version': "1.0",
            'device_os': "",
            'device_type': "0",
            'device_model': "iPhone",
            'test_type': 2
          };
          var options = {
            uri: "https://onesignal.com/api/v1/players",
            host: "onesignal.com",
            port: 443,
            path: "/api/v1/players",
            method: "POST",
            headers: {'Content-Type': "application/json"},
            body: JSON.stringify(fields)
          };
  
          request.post(options, function(err, response){
            if(err){
              result.status = 'Error';
              result.msg = 'Request sending error, Please check service provider request';
              result.error = err;
  
              callback(true);
            } 
  
            var jsonData = JSON.parse(response.body);  
            
            saveQuery = "insert into tokens (company, conversion, token, player_id, device_id, price, is_less, date) values ('"+company+"', '"+conversion+"', '"+token+"', '"+jsonData.id+"', '"+device_id+"', '"+price+"', "+type+", '"+date+"')";
            db.query(saveQuery, function(err, data){
              if(err){
                result.status = 'Error';''
                result.msg = 'Token could not saved';
                result.error = err;
                
                callback(true);
              } 

              saveQueryV2 = "insert into tokens_v2 (company, conversion, token, player_id, device_id, above_price, below_price, is_persistent, date) values ('"+company+"', '"+conversion+"', '"+token+"', '"+jsonData.id+"', '"+device_id+"', '"+above_price+"', '"+below_price+"', "+is_persistent+", '"+date+"')";
              db.query(saveQueryV2, function(err, data){
                if(err) throw err;
                return true;
              });
  
              result.status = 'Success';
              result.msg = 'Successfully saved';
              callback(null);
            });
          });
        }
        else{
          sql = "update tokens set device_id = '"+device_id+"', company = '"+company+"', conversion = '"+conversion+"', price = '"+price+"', is_less = "+type+", date = '"+date+"', status = "+status+" where id = "+id;

          db.query(sql, function(err, data){
            if(err){
              result.status = 'Error';''
              result.msg = 'Token could not saved';
              result.error = err;
              
              callback(true);
            } 

            sqlV2 = "update tokens_v2 set device_id = '"+device_id+"', company = '"+company+"', conversion = '"+conversion+"', above_price = '"+above_price+"', below_price = '"+below_price+"', is_persistent = "+is_persistent+", date = '"+date+"', status = "+status+" where id = "+id;
            
            db.query(sqlV2, function(err, data){
              if(err) throw err;
              return true;
            });

            result.status = 'Success';
            result.msg = 'Successfully saved';
            callback(null);
          });
        }
      }
    ], function(err){
      res.json(result);
    });

  });

  router.get('/addAndroidToken', function(req, res, next){

    req.checkQuery('company', 'Company name required').notEmpty();
    req.checkQuery('conversion', 'Combination required').notEmpty();
    req.checkQuery('price', 'Price required').notEmpty();
    req.checkQuery('device_id', 'Device Id required').notEmpty();
    req.checkQuery('token', 'Token required').notEmpty();
    req.checkQuery('type', 'Type required').notEmpty();
    req.checkQuery('date', 'Date required').notEmpty();
    req.checkQuery('status', 'Status required').notEmpty();

    var v_errors = req.validationErrors();
    if(v_errors){
      res.json(v_errors);
    }

    var device_id = req.query.device_id;
    var token = req.query.token;
    var company = req.query.company;
    var conversion = req.query.conversion;
    var price = req.query.price;
    var type = req.query.type;
    var date = req.query.date;
    var id = req.query.id;
    var status = req.query.status;
    var result = {};

    // for v2 values
    var below_price = (type==1) ? price : '';
    var above_price = (type==0) ? price : '';
    var is_persistent = 0;
    // end for v2 values

    async.waterfall([
      function(callback){
        sql = "select * from tokens where token = '"+token+"' and device_id ='"+device_id+"' and company = '"+company+"' and conversion = '"+conversion+"' and price = "+price+" and status ="+status+" and is_less ="+type;
        db.query(sql, function(err, data){
          if(err){
            result.status = 'Error';
            result.msg = err;
            
            callback(err);
          }
          
          if(data.length > 0){
            result.status = 'Error';
            result.msg = 'Already Exists';
            callback(true);
          }
          callback(null);
        });
      },
      function(callback){

        if(id == undefined){
          saveQuery = "insert into tokens (company, conversion, token, device_id, price, is_less, date) values ('"+company+"', '"+conversion+"', '"+token+"', '"+device_id+"', '"+price+"', "+type+", '"+date+"')";

          // for v2
          saveQueryV2 = "insert into tokens_v2 (company, conversion, token, device_id, above_price, below_price, is_persistent, date) values ('"+company+"', '"+conversion+"', '"+token+"', '"+device_id+"', '"+above_price+"', '"+below_price+"', "+is_persistent+", '"+date+"')";
        }
        else{
          saveQuery = "update tokens set company = '"+company+"', conversion = '"+conversion+"', price = '"+price+"', is_less = "+type+", date = '"+date+"', status = "+status+" where id = "+id;

          // for v2
          saveQueryV2 = "update tokens_v2 set company = '"+company+"', conversion = '"+conversion+"', above_price = '"+above_price+"', below_price = '"+below_price+"', is_persistent = "+is_persistent+", date = '"+date+"', status = "+status+" where id = "+id;
        }

        db.query(saveQuery, function(err, data){
          if(err){
            result.status = 'Error';
            result.msg = 'Token could not saved';
            result.error = err;
            
            callback(true);
          } 
          
          db.query(saveQueryV2, function(err, data){
            if(err) throw err;
            return true;
          });

          result.status = 'Success';
          result.msg = 'Successfully saved';
          callback(null);
        });
      }
    ], function(err){
      res.json(result);
    });

  });

  router.get('/getMyAlerts', function(req, res, next){

    req.checkQuery('device_id', 'Device Id required').notEmpty();

    var v_errors = req.validationErrors();
    if(v_errors){
      res.json(v_errors);
    }

    var token = req.query.token;
    var device_id = req.query.device_id;

    sql ="select * from tokens where device_id = '"+device_id+"'";
    // sql += (token != undefined) ? "token = '"+token+"'" : "device_id = '"+device_id+"'";
    
    db.query(sql, function(err, alerts){
      if(err){
        result.status = 'Error';
        result.msg = 'Some error occurred';
        result.error = err;
      }
      else{
        if(alerts.length > 0){
          result.status = 'Success';
          result.msg = 'User Alerts';
          result.data = alerts;
        }
        else{
          result.status = 'Success';
          result.msg = 'No record found';
          result.data = [];
        }
      }
      
      res.json(result);
    });
  });

  router.get('/removeAlert', function(req, res, next){

    req.checkQuery('id', 'Id required').notEmpty();
    var v_errors = req.validationErrors();
    if(v_errors) res.json(v_errors);

    var id = req.query.id;

    sql ="Delete from tokens where id = "+id;
    
    db.query(sql, function(err, response){
      if(err){
        result.status = 'Error';
        result.msg = 'Some error occurred';
        result.error = err;
      }
      else{
        if(response.affectedRows == 1){
          result.status = 'Success';
          result.msg = 'Successfully delete';
        }
        else{
          result.status = 'Error';
          result.msg = 'Could not be delete';
        }
      }
      
      res.json(result);
    });
  });

  return router;
}

module.exports = returnRouter;