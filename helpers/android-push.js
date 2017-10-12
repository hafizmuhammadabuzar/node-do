var androidPush = function(data){
    
    var header = {
        'Authorization': "key=",
        'Content-Type': "application/json"
    };

    var options = {
        uri: 'https://android.googleapis.com/gcm/send',
        headers: header,
        body: ''
    };
    return text;
}

module.exports = androidPush;
