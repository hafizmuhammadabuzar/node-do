var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var io = require('socket.io')();
var db = require('./db_connect');
var index = require('./routes/index')(io);
var apiRoute = require('./routes/api')(db);
var apiV2Route = require('./routes/v2/api')(db);

var app = express();

app.io = io;

io.on('connection', (socket) => {
  socket.on('getCompaniesPair', (data) => {
    console.log('new user connected from companies with data -> '+data);
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

      socket.emit('companiesPair', {'data': companiesArray});
      console.log('done');
    });

  });

});
    
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/api', apiRoute);
app.use('/api/v2', apiV2Route);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
