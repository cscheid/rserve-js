Rserve = require('../main.js');

function no_ocap_tests()
{
    var s = Rserve.create({
        host: 'http://127.0.0.1:8081',
        on_connect: test,
        on_close: function(msg) {
            console.log("Socket closed. (!?)");
            console.log(msg);
        }// ,
        // debug: {
        //     message_out: function(data) {
        //         console.log("OUT!", data);
        //     },
        //     message_in: function(data) {
        //         console.log("IN!", data.data.slice(0,64));
        //     }
        // }
    });

    function test()
    {
        sequence_([
            function(k) { s.set('a', 1, k); },
            function(k) { s.eval('cat(a)', k); },
            function(k) { s.eval('print(a)', k); },
            function(k) { s.eval('rnorm(100)', k); },
            function(k) { s.set('y', [1,2], k); },
            function(k) {
                s.set('x', new Float32Array([1,2,3,4]), k); 
            },
            function(k) { s.set('z', "Hello, world!", k); },
            function(k) { s.eval('z', k); },
            function(k) { s.eval('print(c(z))', k); },
            function(k) { s.eval('cat(z)', k); },
            function(k) { s.eval('print(z)', k); },
            function(k) { s.set('x', {a:1, b:2}, k); },
            function(k) { s.eval('x', k); },
            function(k) { s.set('x', true, function() {
                s.eval('x', function(v) {
                    if (v.value.json() !== true) {
                        console.log("Expected true, got ", v.value.json());
                        // throw new Error("Test failed, true does not match");
                    }
                    k();
                });
            }); },
            function(k) { s.set('a', 1, k); },
            function(k) { s.set('a', (new Uint8Array([1,2,3,4,5,6,7,8])).buffer, k); },
            function(k) { s.eval('print(a)', k); },
            function(k) { s.eval('attr(Orange, "formula")', k); }, // tests XT_UNKNOWN
            function(k) { s.eval('rnorm(3000000)', k); }, // tests XT_LARGE

            function(k) {
                console.log("All run!");
                process.exit(0);
            }
        ]);
    }
}

//////////////////////////////////////////////////////////////////////////////
// utilities

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

//////////////////////////////////////////////////////////////////////////////

no_ocap_tests();
