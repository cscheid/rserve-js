Rserve = require('../main.js');

s = Rserve.create({
    host: 'http://127.0.0.1:8081',
    on_connect: test,
    debug: {
        message_out: function(v, cmd) {
            console.log(v);
        }
    }
});

function test()
{
    s.eval('rnorm(100)', function(x) { 
        console.log("rnorm eval'ed");
    });
    s.set('x', new Float32Array([1,2,3,4]), function(x) {
        s.eval('x + x', function(v) {
            console.log(v.value.json());
        });
    });
}

