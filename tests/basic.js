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
        // calls t1 function from hello.world result, in oc.init.R
        caps.t1(function(v) {
            console.log(v);
            // calls t2 function in hello.world result, in oc.init.R
            caps.t2(function(v) {
                console.log(v);
            });
        });
    });
}

