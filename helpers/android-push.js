var request = require('request');

var androidPush = function(){
    var header, fields, options = {};
    let APP_KEY = 'AIzaSyDetxE_V8sv8dZmlAPJyMVNpoNuhsUnDPQ';
    
    header = {
        'Authorization': "key="+APP_KEY,
        'Content-Type': "application/json"
    };

    var msg = {
        'notification': {
            'title': 'Dear User',
            'message': 'Have a nice day!'
        }
    };

    fields = {
        'registration_ids': ['APA91bGTudwtLuOQlDc3gcJxZfHSFFXcv-e5uoWuOGidzO2bg4KuATpvztgmMYyIarq_V-DFoKNmgXvCPUZRFuAodX9AViWSbMMcO77YlleMjhpcjYcAVMnRBQP-rZmmx9VFwY_ku-WR'],
        'data': msg
    };
    options = {
        uri: 'https://android.googleapis.com/gcm/send',
        headers: header,
        body: JSON.stringify(fields)
    };

    request.post(options, function(err, response){
        if(err) throw err;
        return response;
    });
}

module.exports = androidPush;
