var express = require('express');
var router = express.Router();
var validator = require('express-validator');
router.use(validator());

/* GET home page. */
var returnRouter = function(db) {
var sql;

  router.get('/companiesConversions', function(req, res) {
    sql = "select company, conversion from company_conversions";
    db.query(sql, function (err, companies) {
      if (err) throw err;      
      var company = '';
      var result = [];
      
      companies.forEach(function(value){
        if(value.company != company){
          var conversions = [];

          companies.forEach(function(innerValue){
            if(innerValue.company == value.company){
              conversions.push({'cur': innerValue.conversion});
            }
          })

          result.push({'company': value.company, 'conversions': conversions});
        }

        company = value.company;
      })

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
    var table = req.params.type+"_rates";
    sql = "select time, close, high, low, open from "+table+" where company='"+req.query.company+"' and conversion='"+req.query.conversion+"'";
    var query = db.query(sql, function(err, data){
      var result = {
        status : 'Success',
        msg : 'Daily History',
        data: data
      }
      res.json(result);
    });
  });

  return router;
}

module.exports = returnRouter;