Rserve = require('../main.js');

s = Rserve.create({
    host: 'http://127.0.0.1:8081',
    on_connect: function() {
        s.eval('rnorm(100)', function(x) { 
            console.log(x.value.json());
        });
    }
});

