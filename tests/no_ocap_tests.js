Rserve = require('../main.js');

function no_ocap_tests()
{
    var s = Rserve.create({
        host: 'http://127.0.0.1:8081',
        on_connect: test,
        on_close: function(msg) {
            console.log("Socket closed. (!?)");
            console.log(msg);
        }//,
        // debug: {
        //     message_out: function(data) {
        //         if (data !== void 0)
        //             console.log("OUT!", data.slice(0, 128));
        //     },
        //     message_in: function(data) {
        //         if (data.data !== void 0)
        //             console.log("IN!", data.data.slice(0,64));
        //     }
        // }
    });

    function range(x) {
        var result = new Float64Array(x);
        for (var i=0; i<x; ++i)
            result[i] = i+1; // R arrays are 1-based. wat
        return result;
    }
    function expect_equals(x, k) {
        return function(v) {
            if (v.value.json() !== x) {
                console.log('Expected value to be ' + String(x) + ', got ' + String(v.value.json()));
            }
            k();
        };
    }
    
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
            function(k) { s.set('a', new Float64Array(2500000), k); },
            function(k) { s.eval('mean(a)', expect_equals(0, k)); },
            function(k) {
                s.set('a', range(2500000), k); 
            },
            function(k) { s.eval('a[1]', expect_equals(1, k)); },
            function(k) { s.eval('a[100]', expect_equals(100, k)); },
            function(k) { s.eval('a[1000]', expect_equals(1000, k)); },
            function(k) { s.eval('a[2499999]', expect_equals(2499999, k)); },
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
