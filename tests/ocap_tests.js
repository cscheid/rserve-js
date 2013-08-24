Rserve = require('../main.js');

s = Rserve.create({
    host: 'http://127.0.0.1:8081',
    on_connect: test
});

function test()
{
    var ocap = s.ocap, caps;
    ocap(function(v) { 
        caps = v;
        caps.t1(5, function(v) {
            console.log("huh?");
        });
        debugger;
        caps.t3(function(x) {
            console.log("This is a cap!");
            return 20 + x;
        }, function(v) {
            caps.t4(5, function(v) {
                console.log("Result: ", v);
            });
        });
        // // calls t1 function from hello.world result, in oc.init.R
        // caps.t1(5, function(v) {
        //     console.log(v);
        //     // calls t2 function in hello.world result, in oc.init.R
        //     caps.t2(5, function(v) {
        //         console.log(v);
        //         console.log("All run!");
        //         process.exit(0);
        //     });
        // });
    });
}

