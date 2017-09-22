var express = require('express');
var router = express.Router();
// var db = require('./../db_connect');

/* GET home page. */
var returnRouter = function(db) {

  router.get('/companiesConversions', function(req, res) {
    var sql = "select company, conversion from company_conversions";
    db.query(sql, function (err, companies) {
      if (err) throw err;

      console.log(companies);

      
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

  return router;
}

module.exports = returnRouter;