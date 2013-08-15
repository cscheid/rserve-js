Rserve = require('../main.js');

s = Rserve.create({
    host: 'http://127.0.0.1:8081',
    on_connect: test
});

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

function test()
{
    sequence_([
        function(k) { s.set('a', 1, k); },
        function(k) { s.eval('cat(a)', k); },
        function(k) { s.eval('print(a)', k); },
        function(k) { s.eval('rnorm(100)', k); },
        function(k) { s.set('y', [1,2], k); },
        function(k) { s.set('x', new Float32Array([1,2,3,4]), k); },
        function(k) { s.set('z', "Hello, world!", k); },
        function(k) { s.eval('z', k); },
        function(k) { s.eval('print(c(z))', k); },
        function(k) { s.eval('cat(z)', k); },
        function(k) { s.eval('print(z)', k); }
    ]);
}
