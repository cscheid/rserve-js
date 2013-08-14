/*

 RServe is a low-level communication layer between Javascript and a
 running RServe process on the other side, via Websockets. 
 
 */

(function() {

function _encode_command(command, buffer) {
    var length = buffer.byteLength;
    var big_buffer = new ArrayBuffer(16 + length);
    var array_view = new Uint8Array(buffer);
    var view = new Rserve.EndianAwareDataView(big_buffer);
    view.setInt32(0, command);
    view.setInt32(4, length);
    view.setInt32(8, 0);
    view.setInt32(12, 0);
    for (var i=0; i<length; ++i)
        view.setUint8(16+i, array_view[i]);
    return big_buffer;
};

function _encode_string(str) {
    var payload_length = str.length + 5;
    var result = new ArrayBuffer(payload_length);
    var view = new Rserve.EndianAwareDataView(result);
    view.setInt32(0, Rserve.Rsrv.DT_STRING + (payload_length << 8));
    for (var i=0; i<str.length; ++i)
        view.setInt8(4+i, str.charCodeAt(i));
    view.setInt8(4+str.length, 0);
    return result;
};

function _encode_bytes(bytes) {
    var payload_length = bytes.length;
    var header_length = 4;
    var result = new ArrayBuffer(payload_length + header_length);
    var view = new Rserve.EndianAwareDataView(result);
    view.setInt32(0, Rserve.Rsrv.DT_BYTESTREAM + (payload_length << 8));
    for (var i=0; i<bytes.length; ++i)
        view.setInt8(4+i, bytes[i]);
    return result;
};


function reader(m)
{
    var handlers = {};
    var _;

    function lift(f, amount) {
        return function(attributes, length) {
            return [f.call(that, attributes, length), amount || length];
        };
    }

    function bind(m, f) {
        return function(attributes, length) {
            var t = m.call(that, attributes, length);
            var t2 = f(t[0])(attributes, length - t[1]);
            return [t2[0], t[1] + t2[1]];
        };
    }

    function unfold(f) {
        return function(attributes, length) {
            var result = [];
            var old_length = length;
            while (length > 0) {
                var t = f.call(that, attributes, length);
                result.push(t[0]);
                length -= t[1];
            }
            return [result, old_length];
        };
    }

    var that = {
        offset: 0,
        data_view: m.make(Rserve.EndianAwareDataView),
        msg: m,

        //////////////////////////////////////////////////////////////////////

        read_int: function() {
            var old_offset = this.offset;
            this.offset += 4;
            return this.data_view.getInt32(old_offset);
        },
        read_string: function(length) {
            // FIXME SLOW
            var result = "";
            while (length--) {
                var c = this.data_view.getInt8(this.offset++);
                if (c) result = result + String.fromCharCode(c);
            }
            return result;
        },
        read_stream: function(length) {
            var old_offset = this.offset;
            this.offset += length;
            return this.msg.view(old_offset, length);
        },
        read_int_vector: function(length) {
            var old_offset = this.offset;
            this.offset += length;
            return this.msg.make(Int32Array, old_offset, length);
        },
        read_double_vector: function(length) {
            var old_offset = this.offset;
            this.offset += length;
            return this.msg.make(Float64Array, old_offset, length);
        },

        //////////////////////////////////////////////////////////////////////

        read_null: lift(function(a, l) { return Rserve.Robj.null(a); }),

        //////////////////////////////////////////////////////////////////////
        // and these return full R objects as well.

        read_string_array: function(attributes, length) {
            var a = this.read_stream(length).make(Uint8Array);
            var result = [];
            var current_str = "";
            for (var i=0; i<a.length; ++i)
                if (a[i] === 0) {
                    result.push(current_str);
                    current_str = "";
                } else {
                    current_str = current_str + String.fromCharCode(a[i]);
                }
            return [Rserve.Robj.string_array(result, attributes), length];
        },
        read_bool_array: function(attributes, length) {
            var l2 = this.read_int();
            var s = this.read_stream(length-4);
            var a = s.make(Uint8Array).subarray(0, l2);
            return [Rserve.Robj.bool_array(a, attributes), length];
        },

        read_sexp: function() {
            var d = this.read_int();
            var _ = Rserve.Rsrv.par_parse(d);
            var t = _[0], l = _[1];
            var total_read = 4;
            var attributes = undefined;
            if (t & Rserve.Rsrv.XT_HAS_ATTR) {
                t = t & ~Rserve.Rsrv.XT_HAS_ATTR;
                var attr_result = this.read_sexp();
                attributes = attr_result[0];
                total_read += attr_result[1];
                l -= attr_result[1];
            }
            if (handlers[t] === undefined) {
                throw new Rserve.RserveError("Unimplemented " + t, -1);
            } else {
                var result = handlers[t].call(this, attributes, l);
                return [result[0], total_read + result[1]];
            }
        }
    };

    that.read_clos = bind(that.read_sexp, function(formals) { 
              return bind(that.read_sexp, function(body)    { 
              return lift(function(a, l) {
              return Rserve.Robj.clos(formals, body, a); 
              }, 0);
              } );
    });

    that.read_list = unfold(that.read_sexp);

    function read_symbol_value_pairs(lst) {
        var result = [];
        for (var i=0; i<lst.length; i+=2) {
            var value = lst[i], tag = lst[i+1];
            if (tag.type === "symbol") {
                result.push({ name: tag.value,
                              value: value });
            } else {
                result.push({ name: null,
                              value: value });
            }
        }
        return result;
    }
    that.read_list_tag = bind(that.read_list, function(lst) {
        return lift(function(attributes, length) {
            var result = read_symbol_value_pairs(lst);
            return Rserve.Robj.tagged_list(result, attributes);
        }, 0);
    });
    that.read_lang_tag = bind(that.read_list, function(lst) {
        return lift(function(attributes, length) {
            var result = read_symbol_value_pairs(lst);
            return Rserve.Robj.tagged_lang(result, attributes);
        }, 0);
    });

    function xf(f, g) { return bind(f, function(t) { 
        return lift(function(a, l) { return g(t, a); }, 0); 
    }); }
    that.read_vector       = xf(that.read_list, Rserve.Robj.vector);
    that.read_list_no_tag  = xf(that.read_list, Rserve.Robj.list);
    that.read_lang_no_tag  = xf(that.read_list, Rserve.Robj.lang);
    that.read_vector_exp   = xf(that.read_list, Rserve.Robj.vector_exp);

    function sl(f, g) { return lift(function(a, l) {
        return g(f.call(that, l), a);
    }); }
    that.read_symname      = sl(that.read_string,        Rserve.Robj.symbol);
    that.read_int_array    = sl(that.read_int_vector,    Rserve.Robj.int_array);
    that.read_double_array = sl(that.read_double_vector, Rserve.Robj.double_array);

    handlers[Rserve.Rsrv.XT_NULL]         = that.read_null;
    handlers[Rserve.Rsrv.XT_VECTOR]       = that.read_vector;
    handlers[Rserve.Rsrv.XT_CLOS]         = that.read_clos;
    handlers[Rserve.Rsrv.XT_SYMNAME]      = that.read_symname;
    handlers[Rserve.Rsrv.XT_LIST_NOTAG]   = that.read_list_no_tag;
    handlers[Rserve.Rsrv.XT_LIST_TAG]     = that.read_list_tag;
    handlers[Rserve.Rsrv.XT_LANG_NOTAG]   = that.read_lang_no_tag;
    handlers[Rserve.Rsrv.XT_LANG_TAG]     = that.read_lang_tag;
    handlers[Rserve.Rsrv.XT_VECTOR_EXP]   = that.read_vector_exp;
    handlers[Rserve.Rsrv.XT_ARRAY_INT]    = that.read_int_array;
    handlers[Rserve.Rsrv.XT_ARRAY_DOUBLE] = that.read_double_array;
    handlers[Rserve.Rsrv.XT_ARRAY_STR]    = that.read_string_array;
    handlers[Rserve.Rsrv.XT_ARRAY_BOOL]   = that.read_bool_array;

    return that;
}

function parse(msg)
{
    var result = {};
    var header = new Int32Array(msg, 0, 4);
    var resp = header[0] & 16777215, status_code = header[0] >> 24;
    result.header = [resp, status_code];

    if (result.header[0] === Rserve.Rsrv.RESP_ERR) {
        result.ok = false;
        result.status_code = status_code;
        result.message = "ERROR FROM R SERVER: " + (Rserve.Rsrv.status_codes[status_code] || 
                                         status_code)
               + " " + result.header[0] + " " + result.header[1]
               + " " + msg.byteLength
               + " " + msg;
        return result;
    }

    if (!_.contains([Rserve.Rsrv.RESP_OK, Rserve.Rsrv.OOB_SEND, Rserve.Rsrv.OOB_MSG], result.header[0])) {
        result.ok = false;
        result.message = "Unexpected response from RServe: " + result.header[0] + " status: " + Rserve.Rsrv.status_codes[status_code];
        return result;
    }
    result.ok = true;
    var payload = Rserve.my_ArrayBufferView(msg, 16, msg.byteLength - 16);
    if (payload.length === 0) {
        result.payload = null;
    } else {
        result.payload = parse_payload(reader(payload));
    }
    return result;
}

function parse_payload(reader)
{
    var d = reader.read_int();
    var _ = Rserve.Rsrv.par_parse(d);
    var t = _[0], l = _[1];
    if (t === Rserve.Rsrv.DT_INT) {
        return { type: "int", value: reader.read_int() };
    } else if (t === Rserve.Rsrv.DT_STRING) {
        return { type: "string", value: reader.read_string(l) };
    } else if (t === Rserve.Rsrv.DT_BYTESTREAM) { // NB this returns a my_ArrayBufferView()
        return { type: "stream", value: reader.read_stream(l) };
    } else if (t === Rserve.Rsrv.DT_SEXP) {
        _ = reader.read_sexp();
        var sexp = _[0], l2 = _[1];
        return { type: "sexp", value: sexp };
    } else
        throw new Rserve.RserveError("Bad type for parse? " + t + " " + l, -1);
}

Rserve.create = function(opts) {
        var host = opts.host;
        var onconnect = opts.on_connect;
        var socket = new WebSocket(host);
        var handle_error = opts.on_error || function(error) { throw new Rserve.RserveError(error, -1); };

        var received_handshake = false;

        var result;
        var command_counter = 0;
        
        function hand_shake(msg)
        {
            msg = msg.data;
            if (msg.substr(0,4) !== 'Rsrv') {
                handle_error("server is not an RServe instance", -1);
            } else if (msg.substr(4, 4) !== '0103') {
                handle_error("sorry, rserve only speaks the 0103 version of the R server protocol", -1);
            } else if (msg.substr(8, 4) !== 'QAP1') {
                handle_error("sorry, rserve only speaks QAP1", -1);
            } else {
                received_handshake = true;
                if (opts.login)
                    result.login(opts.login);
                result.running = true;
                onconnect && onconnect.call(result);
            }
        }

        socket.onclose = function(msg) {
            result.running = false;
            result.closed = true;
            opts.on_close && opts.on_close(msg);
        };

        socket.onmessage = function(msg) {
            if (opts.debug)
                opts.debug.message_in && opts.debug.message_in(msg);
            if (!received_handshake) {
                hand_shake(msg);
                return;
            } 
            if (typeof msg.data === 'string') {
                opts.on_raw_string && opts.on_raw_string(msg.data);
                return;
            }
            // node.js Buffer vs ArrayBuffer workaround
            if (msg.data.constructor.name === 'Buffer')
                msg.data = (new Uint8Array(msg.data)).buffer;
            var v = parse(msg.data);
            if (!v.ok) {
                handle_error(v.message, v.status_code);
            } else if (v.header[0] === Rserve.Rsrv.RESP_OK) {
                result_callback(v.payload);
            } else if (v.header[0] === Rserve.Rsrv.OOB_SEND) {
                opts.on_data && opts.on_data(v.payload);
            } else if (v.header[0] === Rserve.Rsrv.OOB_MSG) {
                if (_.isUndefined(opts.on_oob_message)) {
                    _send_cmd_now(Rserve.Rsrv.RESP_ERR | Rserve.Rsrv.OOB_MSG, 
                                  _encode_string("No handler installed"));
                } else {
                    in_oob_message = true;
                    opts.on_oob_message(v.payload, function(message, error) {
                        if (!in_oob_message) {
                            handle_error("Don't call oob_message_handler more than once.");
                            return;
                        }
                        in_oob_message = false;
                        var header = Rserve.Rsrv.OOB_MSG | 
                            (error ? Rserve.Rsrv.RESP_ERR : Rserve.Rsrv.RESP_OK);
                        _send_cmd_now(header, _encode_string(message));
                        bump_queue();
                    });
                }
            } else {
                handle_error("Internal Error, parse returned unexpected type " + v.header[0], -1);
            }
        };

        function _send_cmd_now(command, buffer) {
            var big_buffer = _encode_command(command, buffer);
            if (opts.debug)
                opts.debug.message_out && opts.debug.message_out(big_buffer[0], command);
            socket.send(big_buffer);
            return big_buffer;
        };

        var queue = [];
        var in_oob_message = false;
        var awaiting_result = false;
        var result_callback;
        function bump_queue() {
            if (result.closed && queue.length) {
                handle_error("Cannot send messages on a closed socket!", -1);
            } else if (!awaiting_result && !in_oob_message && queue.length) {
                var lst = queue.shift();
                result_callback = lst[1];
                awaiting_result = true;
                if (opts.debug)
                    opts.debug.message_out && opts.debug.message_out(lst[0], lst[2]);
                socket.send(lst[0]);
            }
        }
        function enqueue(buffer, k, command) {
            queue.push([buffer, function(result) {
                awaiting_result = false;
                bump_queue();
                k(result);
            }, command]);
            bump_queue();
        };

        function _cmd(command, buffer, k, string) {
            k = k || function() {};
            var big_buffer = _encode_command(command, buffer);
            return enqueue(big_buffer, k, string);
        };

        result = {
            running: false,
            closed: false,
            close: function() {
                socket.close();
            },
            login: function(command, k) {
                _cmd(Rserve.Rsrv.CMD_login, _encode_string(command), k, command);
            },
            eval: function(command, k) {
                _cmd(Rserve.Rsrv.CMD_eval, _encode_string(command), k, command);
            },
            createFile: function(command, k) {
                _cmd(Rserve.Rsrv.CMD_createFile, _encode_string(command), k, command);
            },
            writeFile: function(chunk, k) {
                _cmd(Rserve.Rsrv.CMD_writeFile, _encode_bytes(chunk), k, "");
            },
            closeFile: function(k) {
                _cmd(Rserve.Rsrv.CMD_closeFile, new ArrayBuffer(0), k, "");
            }
        };
        return result;
};

})();
