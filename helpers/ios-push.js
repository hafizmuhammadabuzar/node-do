var request = require('request');

var androidPush = function(){
    var header, fields, options = {};
    let APP_KEY = 'AIzaSyDetxE_V8sv8dZmlAPJyMVNpoNuhsUnDPQ';
    
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": "Basic YjBjYjMxYjktMDg0OC00Njc4LThhODYtZTQzZWUzNmE4NDlm"
    };

    var msg = {
        'notification': {
            'title': 'Dear User',
            'message': 'Have a nice day!'
        }
    };

    fields = {
        'app_id': "725fc226-b421-4667-a208-2704ff8e8a58",
        // 'include_player_ids' => ["ffbcf7eb-a1a6-4903-8a0b-726acab42501"],
        'included_segments': array("All"),
        'contents': $content,
        'heading': $title,
        'data': {'title': $noti_title, 'body' : $msg},
        'ios_badgeType': 'SetTo',
        'ios_badgeCount': 1,
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
