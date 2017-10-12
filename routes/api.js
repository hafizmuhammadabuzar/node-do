var express = require('express');
var router = express.Router();
var validator = require('express-validator');
var fs = require('fs');
var request = require('request');
var async = require('async');
router.use(validator());

/* GET home page. */
var returnRouter = function(db) {
var sql;
var result = {};

  router.get('/companiesConversions', function(req, res) {
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

      var result = {
        status : 'Success',
        msg : 'Companies Conversions',
        data: companiesArray
      }
      res.json(result);
    });
  });

  router.get('/getHistory/:type', function(req, res, next){

    req.checkQuery('company', 'Company name required').notEmpty();
    req.checkQuery('conversion', 'Conversion required').notEmpty();

    var v_errors = req.validationErrors();
    if(v_errors){
      res.json(v_errors);
    }

    let rawdata = fs.readFileSync('public/data/'+req.query.company+'/'+req.params.type+'.json');  
    let histo = JSON.parse(rawdata);
    let result = {
      status : 'Success',
      msg : req.query.company+' History',
      data: histo[req.query.conversion]
    }
    res.json(result);
  });

  router.get('/addIosToken', function(req, res, next){

    req.checkQuery('company', 'Company name required').notEmpty();
    req.checkQuery('conversion', 'Combination required').notEmpty();
    req.checkQuery('price', 'Price required').notEmpty();
    req.checkQuery('token', 'Token required').notEmpty();
    req.checkQuery('type', 'Type required').notEmpty();
    req.checkQuery('date', 'Date required').notEmpty();
    req.checkQuery('status', 'Status required').notEmpty();

    var v_errors = req.validationErrors();
    if(v_errors){
      res.json(v_errors);
    }

    let token = req.query.token;
    let company = req.query.company;
    let conversion = req.query.conversion;
    let price = req.query.price;
    let type = req.query.type;
    let date = req.query.date;
    let status = req.query.status;
    let id = req.query.id;
    let result = {};

    async.waterfall([
      function(callback){
        sql = "select * from tokens where token = '"+token+"' and company = '"+company+"' and conversion = '"+conversion+"' and price = "+price+" and status ="+status+" and is_less ="+type;
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
            'test_type': 1
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
  
            let jsonData = JSON.parse(response.body);  
            
            saveQuery = "insert into tokens (company, conversion, token, player_id, price, is_less, date) values ('"+company+"', '"+conversion+"', '"+token+"', '"+jsonData.id+"', '"+price+"', "+type+", '"+date+"')";
            db.query(saveQuery, function(err, data){
              if(err){
                result.status = 'Error';''
                result.msg = 'Token could not saved';
                result.error = err;
                
                callback(true);
              } 
  
              result.status = 'Success';
              result.msg = 'Successfully saved';
              callback(null);
            });
          });
        }
        else{
          sql = "update tokens set company = '"+company+"', conversion = '"+conversion+"', price = '"+price+"', is_less = "+type+", date = '"+date+"', status = "+status+" where id = "+id;

          db.query(sql, function(err, data){
            if(err){
              result.status = 'Error';''
              result.msg = 'Token could not saved';
              result.error = err;
              
              callback(true);
            } 

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

    let device_id = req.query.device_id;
    let token = req.query.token;
    let company = req.query.company;
    let conversion = req.query.conversion;
    let price = req.query.price;
    let type = req.query.type;
    let date = req.query.date;
    let id = req.query.id;
    let status = req.query.status;
    let result = {};

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
        }
        else{
          saveQuery = "update token set company = '"+company+"', conversion = '"+conversion+"', price = '"+price+"', is_less = "+type+", date = '"+date+"', status = "+status+", where id = "+id;
        }
        db.query(saveQuery, function(err, data){
          if(err){
            result.status = 'Error';
            result.msg = 'Token could not saved';
            result.error = err;
            
            callback(true);
          } 

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

    let token = req.query.token;
    let device_id = req.query.device_id;

    sql ="select * from tokens where ";
    sql += (token != undefined) ? "token = '"+token+"'" : "device_id = '"+device_id+"'";
    
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
          result.status = 'Error';
          result.msg = 'No record found';
        }
      }
      
      res.json(result);
    });
  });

  router.get('/removeAlert', function(req, res, next){

    req.checkQuery('id', 'Id required').notEmpty();
    var v_errors = req.validationErrors();
    if(v_errors) res.json(v_errors);

    let id = req.query.id;

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
          result.msg = 'Successfully Deleted';
        }
        else{
          result.status = 'Error';
          result.msg = 'Could not be deleted';
        }
      }
      
      res.json(result);
    });
  });

  return router;
}

module.exports = returnRouter;