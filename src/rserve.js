(function() {

function _encode_command(command, buffer) {
    if (!_.isArray(buffer))
        buffer = [buffer];
    var length = _.reduce(buffer, 
                          function(memo, val) {
                              return memo + val.byteLength;
                          }, 0),
        big_buffer = new ArrayBuffer(16 + length),
        view = new Rserve.EndianAwareDataView(big_buffer);
    view.setInt32(0, command);
    view.setInt32(4, length);
    view.setInt32(8, 0);
    view.setInt32(12, 0);
    var offset = 16;
    _.each(buffer, function(b) {
        var source_array = new Uint8Array(b);
        for (var i=0; i<source_array.byteLength; ++i)
            view.setUint8(offset+i, source_array[i]);
        offset += b.byteLength;
    });
    return big_buffer;
};

function _encode_string(str) {
    var strl = ((str.length + 1) + 3) & ~3; // pad to 4-byte boundaries.
    var payload_length = strl + 4;
    var result = new ArrayBuffer(payload_length);
    var view = new Rserve.EndianAwareDataView(result);
    view.setInt32(0, Rserve.Rsrv.DT_STRING + (strl << 8));
    for (var i=0; i<str.length; ++i)
        view.setInt8(4+i, str.charCodeAt(i));
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

Rserve.create = function(opts) {
    opts = _.defaults(opts || {}, {
        host: 'http://127.0.0.1:8081',
        on_connect: function() {}
    });
    var host = opts.host;
    var onconnect = opts.on_connect;
    var socket = new WebSocket(host);
    socket.binaryType = 'arraybuffer';
    var handle_error = opts.on_error || function(error) { throw new Rserve.RserveError(error, -1); };
    var received_handshake = false;

    var result;
    var command_counter = 0;

    var captured_functions = {};

    var fresh_hash = function() {
        var k;
        do {
            // while js has no crypto rngs :(
            k = String(Math.random()).slice(2,12);
        } while (k in captured_functions);
        if (k.length !== 10)
            throw new Error("Bad rng, no cookie");
        return k;
    };
    
    function convert_to_hash(value) {
        var hash = fresh_hash();
        captured_functions[hash] = value;
        return hash;
    }

    function _encode_value(value, forced_type)
    {
        var sz = Rserve.determine_size(value, forced_type);
        // all this will still break if sz is, say, >= 2^31.
        if (sz > 16777215) {
            var buffer = new ArrayBuffer(sz + 8);
            var view = Rserve.my_ArrayBufferView(buffer);
            // can't left shift value here because value will have bit 32 set and become signed..
            view.data_view().setInt32(0, Rserve.Rsrv.DT_SEXP + ((sz & 16777215) * Math.pow(2, 8)) + Rserve.Rsrv.DT_LARGE);
            // but *can* right shift because we assume sz is less than 2^31 or so to begin with
            view.data_view().setInt32(4, sz >> 24);
            Rserve.write_into_view(value, view.skip(8), forced_type, convert_to_hash);
            return buffer;
        } else {
            var buffer = new ArrayBuffer(sz + 4);
            var view = Rserve.my_ArrayBufferView(buffer);
            view.data_view().setInt32(0, Rserve.Rsrv.DT_SEXP + (sz << 8));
            Rserve.write_into_view(value, view.skip(4), forced_type, convert_to_hash);
            return buffer;
        }
    }
    
    function hand_shake(msg)
    {
        msg = msg.data;
        if (typeof msg === 'string') {
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
        } else {
            var view = new DataView(msg);
            var header = String.fromCharCode(view.getUint8(0)) + 
                String.fromCharCode(view.getUint8(1)) + 
                String.fromCharCode(view.getUint8(2)) + 
                String.fromCharCode(view.getUint8(3));

            if (header === 'RsOC') {
                received_handshake = true;
                result.ocap_mode = true;
                result.bare_ocap = Rserve.parse_payload(msg).value;
                result.ocap = Rserve.wrap_ocap(result, result.bare_ocap);
                result.running = true;
                onconnect && onconnect.call(result);
            } else
                handle_error("Unrecognized server answer: " + header, -1);
        }
    }

    socket.onclose = function(msg) {
        result.running = false;
        result.closed = true;
        opts.on_close && opts.on_close(msg);
    };

    socket.onmessage = function(msg) {
        // node.js Buffer vs ArrayBuffer workaround
        if (msg.data.constructor.name === 'Buffer')
            msg.data = (new Uint8Array(msg.data)).buffer;
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
        var v = Rserve.parse_websocket_frame(msg.data);
        if (!v.ok) {
            handle_error(v.message, v.status_code);
        } else if (v.header[0] === Rserve.Rsrv.RESP_OK) {
            result_callback(v.payload);
        } else if (v.header[0] === Rserve.Rsrv.OOB_SEND) {
            opts.on_data && opts.on_data(v.payload);
        } else if (v.header[0] === Rserve.Rsrv.OOB_MSG) {
            if (result.ocap_mode) {
                var p;
                try {
                    p = Rserve.wrap_all_ocaps(result, v.payload); // .value.json(result.resolve_hash);
                } catch (e) {
                    _send_cmd_now(Rserve.Rsrv.RESP_ERR | Rserve.Rsrv.OOB_MSG, 
                                  _encode_string(String(e)));
                    return;
                }
                if (!_.isFunction(p[0])) {
                    _send_cmd_now(Rserve.Rsrv.RESP_ERR | Rserve.Rsrv.OOB_MSG, 
                                  _encode_string("OOB Messages on ocap-mode must be javascript function calls"));
                    return;
                }
                var captured_function = p[0], params = p.slice(1);
                params.push(function(result) {
                    _send_cmd_now(Rserve.Rsrv.OOB_MSG, _encode_value(result));
                });
                captured_function.apply(undefined, params);
            } else {
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
        ocap_mode: false,
        running: false,
        closed: false,
        close: function() {
            socket.close();
        },

        //////////////////////////////////////////////////////////////////////
        // non-ocap mode

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
        },
        set: function(key, value, k) {
            _cmd(Rserve.Rsrv.CMD_setSEXP, [_encode_string(key), _encode_value(value)], k, "");
        }, 

        //////////////////////////////////////////////////////////////////////
        // ocap mode

        OCcall: function(ocap, values, k) {
            var is_ocap = false, str;
            try {
                is_ocap |= ocap.r_attributes['class'] === 'OCref';
                str = ocap[0];
            } catch (e) {};
            if(!is_ocap) {
                try {
                    is_ocap |= ocap.attributes.value[0].value.value[0] === 'OCref';
                    str = ocap.value[0];
                } catch (e) {};
            }
            if (!is_ocap)
                throw new Error("Expected an ocap, instead got " + ocap);
            var params = [str];
            params.push.apply(params, values);
            _cmd(Rserve.Rsrv.CMD_OCcall, _encode_value(params, Rserve.Rsrv.XT_LANG_NOTAG),
                 k,
                 "");
        },

        wrap_ocap: function(ocap) {
            return Rserve.wrap_ocap(this, ocap);
        },

        resolve_hash: function(hash) {
            if (!(hash in captured_functions))
                throw new Error("hash " + hash + " not found.");
            return captured_functions[hash];
        }
    };
    return result;
};

Rserve.wrap_all_ocaps = function(s, v) {
    v = v.value.json(s.resolve_hash);
    function replace(obj) {
        var result = obj;
        if (_.isArray(obj) &&
            obj.r_attributes &&
            obj.r_attributes['class'] == 'OCref') {
            return Rserve.wrap_ocap(s, obj);
        } else if (_.isArray(obj)) {
            result = _.map(obj, replace);
            result.r_type = obj.r_type;
            result.r_attributes = obj.r_attributes;
        } else if (_.isTypedArray(obj)) {
            return obj;
        } else if (_.isFunction(obj)) {
            return obj;
        } else if (_.isObject(obj)) {
            result = _.object(_.map(obj, function(v, k) {
                return [k, replace(v)];
            }));
        }
        return result;
    }
    return replace(v);
};

Rserve.wrap_ocap = function(s, ocap) {
    var wrapped_ocap = function() {
        var values = _.toArray(arguments);
        // common error (tho this won't catch the case where last arg is a function)
        if(!values.length || !_.isFunction(values[values.length-1]))
            throw new Error("forgot to pass continuation to ocap");
        var k = values.pop();
        s.OCcall(ocap, values, function(v) {
            k(Rserve.wrap_all_ocaps(s, v));
        });
    };
    wrapped_ocap.bare_ocap = ocap;
    return wrapped_ocap;
};

})();
