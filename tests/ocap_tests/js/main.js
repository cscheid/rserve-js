var WebSocket = require("ws"),
    ws = new WebSocket("http://127.0.0.1:8081");

ws.on('open', function() {
    console.log("open!");
});
ws.on('message', function(msg) {
    console.log('received', msg);
    console.log(msg.byteLength, msg.length);
    var array = new Uint8Array(msg);
    console.log(array.byteLength);
    console.log(String.fromCharCode(msg[0]) + 
                String.fromCharCode(msg[1]) + 
                String.fromCharCode(msg[2]) + 
                String.fromCharCode(msg[3]));
});

// var http = require("http");

// http.createServer(function(request, response) {
//   response.writeHead(200, {"Content-Type": "text/plain"});
//   response.write("Hello World");
//   response.end();
// }).listen(8888);
