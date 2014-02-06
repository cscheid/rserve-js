Rserve = require('../main.js');
Promise = require('bluebird');

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

    s = Promise.promisifyAll(s);

    function range(x) {
        var result = new Float64Array(x);
        for (var i=0; i<x; ++i)
            result[i] = i+1; // R arrays are 1-based. wat
        return result;
    }
    function expect_equals(x) {
        return function(v) {
            if (v.value.json() !== x)
                throw new Error('Expected value to be ' + String(x) + ', got ' + String(v.value.json()));
        };
    }
    
    function test()
    {
        var lst = [
            function() { return s.setAsync('a', 1); },
            function() { return s.evalAsync('cat(a)'); },
            function() { return s.evalAsync('print(a)'); },
            function() { return s.evalAsync('rnorm(100)'); },
            function() { return s.setAsync('y', [1,2]); },
            function() { return s.setAsync('x', new Float32Array([1,2,3,4])); },
            function() { return s.setAsync('z', "Hello, world!"); },
            function() { return s.evalAsync('z'); },
            function() { return s.evalAsync('print(c(z))'); },
            function() { return s.evalAsync('cat(z)'); },
            function() { return s.evalAsync('print(z)'); },
            function() { return s.setAsync('x', {a:1, b:2}); },
            function() { return s.evalAsync('x'); },
            function() { return s.setAsync('x', true); },
            function() { return s.evalAsync('x').then(expect_equals(true)); },
            function() { return s.setAsync('a', 1); },
            function() { return s.setAsync('a', (new Uint8Array([1,2,3,4,5,6,7,8])).buffer); },
            function() { return s.evalAsync('print(a)'); },
            function() { return s.evalAsync('attr(Orange, "formula")'); }, // tests XT_UNKNOWN
            function() { return s.evalAsync('rnorm(3000000)'); }, // tests XT_LARGE
            function() { return s.setAsync('a', new Float64Array(2500000)); },
            function() { return s.evalAsync('mean(a)').then(expect_equals(0)); },
            function() { return s.setAsync('a', range(2500000)); },
            function() { return s.evalAsync('a[1]').then(expect_equals(1)); },
            function() { return s.evalAsync('a[100]').then(expect_equals(100)); },
            function() { return s.evalAsync('a[1000]').then(expect_equals(1000)); },
            function() { return s.evalAsync('a[2499999]').then(expect_equals(2499999)); },
            function() {
                console.log("All run!");
                process.exit(0);
            }
        ];
        sequence_(lst);
    }
}

//////////////////////////////////////////////////////////////////////////////
// utilities

function sequence_(lst)
{
    var promise = lst[0]();
    for (var i=1; i<lst.length; ++i) {
        promise = promise.then(lst[i]);
    }
    return promise;
}

//////////////////////////////////////////////////////////////////////////////

no_ocap_tests();
