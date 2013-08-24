Rserve = require('../main.js');

s = Rserve.create({
    host: 'http://127.0.0.1:8081',
    on_connect: test
});

function test()
{
    var ocap = s.ocap, funs;
    ocap(function(v) { 
        funs = v;
        funs.t1(5, function(v) {
            console.log("ok.");
        });
        funs.t3(function(x) {
            console.log("This is running in javascript!");
            return 20 + x;
        }, function(v) {
            funs.t4(5, function(v) {
                console.log("Result: ", v);
                process.exit(0);
            });
        });
    });
}

