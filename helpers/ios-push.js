var request = require('request');

var iosPush = function(token, msg){
    var header, fields, options = {};

    let titleText, msgText;
    let playerId = [token];

    titleText = 'Dear User';
    msgText = msg;
    
    header = {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": "Basic YjBjYjMxYjktMDg0OC00Njc4LThhODYtZTQzZWUzNmE4NDlm"
    };

    fields = {
        'app_id': "e2d795a1-20a2-43f6-ba23-9c7c3bfaa6d4",
        'include_player_ids': playerId,
        //'included_segments': ["All"],
        'contents': {'en': msgText},
        'heading': {'en': titleText},
        'data': {'title': titleText, 'body' : msgText},
        'ios_badgeType': 'SetTo',
        'ios_badgeCount': 1,
    };
    options = {
        uri: 'https://onesignal.com/api/v1/notifications',
        host: "onesignal.com",
        port: 443,
        path: "/api/v1/notifications",
        method: "POST",
        headers: header,
        body: JSON.stringify(fields)
    };

    request.post(options, function(err, response){
        if(err) throw err;
        console.log(response.body);
        return response;
    });
}

module.exports = iosPush;
