Rserve = require('../main.js');

function sequence_(lst)
{
    function do_it(i) {
        if (i === lst.length)
            return;
        lst[i](function() { 
            do_it(i+1);
        });
    }
    do_it(0);
}

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

