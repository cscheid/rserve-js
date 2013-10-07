r = require('../main.js');

s = r.create({
    host: 'http://127.0.0.1:8081',
    on_connect: test
});

function test()
{
    var ocap = s.ocap, funs;
    ocap(function(v) { 
        funs = v;

        funs.t1(5,                                      function(k) {
        funs.t2(4,                                      function(k) {
        funs.t3(function(x, k) {
            /* test callback from R into javascript. */ 
            k(21 + x); 
        },                                              function(k) {
        funs.t4(5, function(v) {
        if (v !== 26)
            throw new Error("test failed.");
        funs.t5(function(i) { 
            return i * i; 
        },                                              function(k) {
        funs.t6(5, function(k) {
        var f = k[0], i = k[1];
        if (f(i) !== 25)
            throw new Error("test failed.");
        process.exit(0);
        });});});});});});
    });
}

