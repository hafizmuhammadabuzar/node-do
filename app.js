var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var io = require('socket.io')();
var index = require('./routes/index');
var db = require('./db_connect');

var app = express();

app.io = io;

app.get('/cron', function(req, res, next){
  var sql = "insert into rates (rate) values ('12.34')";
  db.query(sql, function (err, result) {
    if (err) throw err;
    // socket create
    io.on('connection', function (socket) {
      socket.emit('newRates', { rates: result.insertId});
    });
   next (null, result.insertId);
  });
});

// io.on('connection', function (socket) {
//   socket.emit('news', { serverMsg: 'Welcome to chat window' });
//   socket.broadcast.emit('news', { serverMsg: 'New User Connected: '+socket.id });
//   socket.on('userSays', function (data) {
//     socket.broadcast.emit('userMsg', { msg: data.userMsg});
//   });
//   socket.on('typing', function (data) {
//     socket.broadcast.emit('userTyping', socket.id + 'is ' +data);
//   });
// });

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
