Rserve = require('../main.js');

s = Rserve.create({
    host: 'http://127.0.0.1:8081',
    on_connect: test,
    debug: {
        message_out: function(v) {
            console.log(v);
        }
    }
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
    s.set('x', {a:1, b:2}, function() {
        s.eval('x', function(v) {
            console.log(v);
            console.log(v.value.json());
        });
    });
}

