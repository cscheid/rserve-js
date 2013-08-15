Rserve = require('../main.js');

s = Rserve.create({
    host: 'http://127.0.0.1:8081',
    debug: {
        message_in: function(msg) {
            console.log(msg);
        }
    },
    on_connect: function() {
        console.log(s.ocap_alpha);
        s.OCcall(s.ocap_alpha, [], function() {
            console.log("ha!");
        });
    }
});

// function sequence_(lst)
// {
//     function do_it(i) {
//         if (i === lst.length)
//             return;
//         lst[i](function() { 
//             do_it(i+1);
//         });
//     }
//     do_it(0);
// }

// function test()
// {
//     s.set('x', {a:1, b:2}, function() {
//         s.eval('x', function(v) {
//             console.log(v);
//             console.log(v.value.json());
//         });
//     });
// }

