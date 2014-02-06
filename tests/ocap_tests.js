r = require('../main.js');
Promise = require('bluebird');

s = r.create({
    host: 'http://127.0.0.1:8081',
    on_connect: test
});

function test()
{
    var ocap = s.ocap, funs;
    ocap(function(err, funs) { 
        funs = Promise.promisifyAll(funs);

        funs.tfailAsync(null).then(function() {
            throw new Error("This should have failed");
        }).catch(function(e) {
            console.log("Nice!");
            var lst = [
                function() { return funs.t1Async(5); },
                function() { return funs.t2Async(4); },
                function() { return funs.t3Async(function(x, k) { k(null, 21 + x); }); },
                function() { return funs.t4Async(5).then(function(v) { 
                    if (v !== 26)
                        throw new Error("test failed.");
                }); },
                function() { return funs.t5Async(function(i) { return i * i; }); },
                function() { return funs.t6Async(5).then(function(v) {
                    var f = v[0], i = v[1];
                    if (f(i) !== 25)
                        throw new Error("test failed.");
                }); },
                function() { process.exit(0); }
            ];
            var chain = lst[0]();
            for (var i=1; i<lst.length; ++i)
                chain = chain.then(lst[i]);
        });
    });
}

