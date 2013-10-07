# A javascript implementation of RServe over WebSockets

RServe is a protocol for communication with a remote R session. This
package allows you to connect to a running RServe server that is
serving over websockets. This way node.js (and javascript programs in
general) can communicate with an instance of R.

RServe-js allows a web browser to communicate directly with a running
R process on the other side of the wire. This means it's the
equivalent of a *chainsaw*: there are ways to use it safely, 


## Quick tour

    $ git clone https://github.com/cscheid/rserve-js.git

Start Rserve in web-sockets mode:

    $ cd rserve-js/tests
	$ r_files/start_no_ocaps
	
Run some javascript that connects to [port 8081](https://github.com/cscheid/rserve-js/blob/master/tests/r_files/no_oc.conf):

	$ node

    > r = require('../main.js')
    { Robj:
      ...
      write_into_view: [Function] }
    
	> r = r.create()
    { ocap_mode: false,
      ...
      resolve_hash: [Function] }
    
	> r.running
    true
    
	> r.eval('rnorm(10)', function(a) { console.log(a); })
    undefined
    
	{ type: 'sexp',
      value:
       { type: 'double_array',
         value:
          { '0': -1.5626166190555,
            '1': -0.16678360090204197,
            '2': 1.362470594733813,
            '3': 0.2462241937647293,
            '4': -0.6439588002729958,
            '5': 1.6695940797441013,
            '6': -0.8298271898727629,
            '7': -0.14431491982950537,
            '8': -0.05561817220786299,
            '9': -1.5889826020213365,
            BYTES_PER_ELEMENT: 8,
            get: [Function: get],
            set: [Function: set],
            slice: [Function: slice],
            subarray: [Function: subarray],
            buffer: [Object],
            length: 10,
            byteOffset: 24,
            byteLength: 80 },
         attributes: undefined } }


## Security considerations

*NB: Rserve, in the mode described above, should only be run in
trusted networks!*  `eval`, in that example above, is truly `eval`:

    > // RUNNING WITH SCISSORS
    > r.eval('readLines(pipe("ls /etc"))', function(x) { console.log(x); })
    
      { type: 'sexp',
      value:
       { type: 'string_array',
         value:
          [ ...
            'apache2',
    		... ],
         attributes: undefined } }		

Thankfully, Rserve provides a mode which only exposes a fixed set of
entry points. These are known (for
[historical reasons](http://en.wikipedia.org/wiki/Object-capability_model))
as *object capabilities*.


## Object capabilities

There's a demo of object-capability support in `tests/ocap_tests.js`
and `tests/oc.init.R`. Roughly speaking, in object-capability mode,
the server involves an initialization function that returns an object.
This object is sent and is accessible by the Javascript side. 

Critically, the serialization process converts any R functions and
closures to *opaque* objects, which in Javascript are converted to
things that behave exactly like asynchronous function calls
(eg. [`XmlHttpRequest`](http://www.w3.org/TR/XMLHttpRequest/)). These
callable objects are known as *capabilities*, since each of them is a
very specific feature accessible by the remote system. Since
capabilities are functions, they return new values. And since both
Javascript and R have functions as first-class values, *capabilities*
are also first-class in this system. Capabilities
can return other capabilities, and so a system can be designed to
provide, by default, a very limited set of features, which can be
increased when appropriate.

