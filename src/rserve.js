(function() {

function _encode_command(command, buffer, msg_id) {
    if (!_.isArray(buffer))
        buffer = [buffer];
    if (!msg_id) msg_id = 0;
    var length = _.reduce(buffer, 
                          function(memo, val) {
                              return memo + val.byteLength;
                          }, 0),
        big_buffer = new ArrayBuffer(16 + length),
        view = new Rserve.EndianAwareDataView(big_buffer);
    view.setInt32(0, command);
    view.setInt32(4, length);
    view.setInt32(8, msg_id);
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
    socket.onerror = function(event) {
        handle_error(event.message);
    };

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
            view.data_view().setInt32(4, sz >>> 24);
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
        var msg_id = v.header[2], cmd = v.header[0] & 0xffffff;
        var queue = _.find(queues, function(queue) { return queue.msg_id == msg_id; });
        // console.log("onmessage, queue=" + (queue ? queue.name : "<unknown>") + ", ok= " + v.ok+ ", cmd=" + cmd +", msg_id="+ msg_id);
        // FIXME: in theory we should not need a fallback, but in case we miss some
        // odd edge case, we revert to the old behavior.
        // The way things work, the queue will be undefined only for OOB messages:
        // SEND doesn't need reply, so it's irrelevant, MSG is handled separately below and
        // enforces the right queue.
        if (!queue) queue = queues[0];
        if (!v.ok) {
            queue.result_callback([v.message, v.status_code], undefined);
            // handle_error(v.message, v.status_code);
        } else if (cmd === Rserve.Rsrv.RESP_OK) {
            queue.result_callback(null, v.payload);
        } else if (Rserve.Rsrv.IS_OOB_SEND(cmd)) {
            opts.on_data && opts.on_data(v.payload);
        } else if (Rserve.Rsrv.IS_OOB_MSG(cmd)) {
            // OOB MSG may use random msg_id, so we have to use the USR_CODE to detect the right queue
            // FIXME: we may want to consider adjusting the protocol specs to require msg_id
            //        to be retained by OOB based on the outer OCcall message (thus inheriting
            //        the msg_id), but curretnly it's not mandated.
            queue = (Rserve.Rsrv.OOB_USR_CODE(cmd) > 255) ? compute_queue : ctrl_queue;
            // console.log("OOB MSG result on queue "+ queue.name);
            if (result.ocap_mode) {
                var p;
                try {
                    p = Rserve.wrap_all_ocaps(result, v.payload); // .value.json(result.resolve_hash);
                } catch (e) {
                    _send_cmd_now(Rserve.Rsrv.RESP_ERR | cmd,
                                  _encode_string(String(e)), msg_id);
                    return;
                }
                if (!_.isFunction(p[0])) {
                    _send_cmd_now(Rserve.Rsrv.RESP_ERR | cmd,
                                  _encode_string("OOB Messages on ocap-mode must be javascript function calls"), msg_id);
                    return;
                }
                var captured_function = p[0], params = p.slice(1);
                params.push(function(err, result) {
                    if (err) {
                        _send_cmd_now(Rserve.Rsrv.RESP_ERR | cmd, _encode_value(err), msg_id);
                    } else {
                        _send_cmd_now(cmd, _encode_value(result), msg_id);
                    }
                });
                captured_function.apply(undefined, params);
            } else {
                if (_.isUndefined(opts.on_oob_message)) {
                    _send_cmd_now(Rserve.Rsrv.RESP_ERR | cmd, 
                                  _encode_string("No handler installed"), msg_id);
                } else {
                    queue.in_oob_message = true;
                    opts.on_oob_message(v.payload, function(message, error) {
                        if (!queue.in_oob_message) {
                            handle_error("Don't call oob_message_handler more than once.");
                            return;
                        }
                        queue.in_oob_message = false;
                        var header = cmd |
                            (error ? Rserve.Rsrv.RESP_ERR : Rserve.Rsrv.RESP_OK);
                        _send_cmd_now(header, _encode_string(message), msg_id);
                        bump_queues();
                    });
                }
            }
        } else {
            handle_error("Internal Error, parse returned unexpected type " + v.header[0], -1);
        }
    };

    function _send_cmd_now(command, buffer, msg_id) {
        var big_buffer = _encode_command(command, buffer, msg_id);
        if (opts.debug)
            opts.debug.message_out && opts.debug.message_out(big_buffer[0], command);
        socket.send(big_buffer);
        return big_buffer;
    };

    var ctrl_queue = {
        queue: [],
        in_oob_message: false,
        awaiting_result: false,
        msg_id: 0,
        name: "control"
    };

    var compute_queue = {
        queue: [],
        in_oob_message: false,
        awaiting_result: false,
        msg_id: 1,
        name: "compute"
    };

    // the order matters - the first queue is used if the association cannot be determined from the msg_id/cmd
    var queues = [ ctrl_queue, compute_queue ];

    function queue_can_send(queue) { return !queue.in_oob_message && !queue.awaiting_result && queue.queue.length; }

    function bump_queues() {
        var available = _.filter(queues, queue_can_send);
        // nothing in the queues (or all busy)? get out
        if (!available.length) return;
        if (result.closed) {
            handle_error("Cannot send messages on a closed socket!", -1);
        } else {
            var queue = _.sortBy(available, function(queue) { return queue.queue[0].timestamp; })[0];
            var lst = queue.queue.shift();
            queue.result_callback = lst.callback;
            queue.awaiting_result = true;
            if (opts.debug)
                opts.debug.message_out && opts.debug.message_out(lst.buffer, lst.command);
            socket.send(lst.buffer);
        }
    }

    function enqueue(buffer, k, command, queue) {
        queue.queue.push({
            buffer: buffer,
          callback: function(error, result) {
              queue.awaiting_result = false;
              bump_queues();
              k(error, result);
          },
            command: command,
            timestamp: Date.now()
        });
        bump_queues();
    };

    function _cmd(command, buffer, k, string, queue) {
        // default to the first queue - only used in non-OCAP mode which doesn't support multiple queues
        if (!queue) queue = queues[0];

        k = k || function() {};
        var big_buffer = _encode_command(command, buffer, queue.msg_id);
        return enqueue(big_buffer, k, string, queue);
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
            if (!is_ocap) {
                k(new Error("Expected an ocap, instead got " + ocap), undefined);
                return;
            }
            var params = [str];
            params.push.apply(params, values);
            // determine the proper queue from the OCAP prefix
            var queue = (str.charCodeAt(0) == 64) ? compute_queue : ctrl_queue;
            _cmd(Rserve.Rsrv.CMD_OCcall, _encode_value(params, Rserve.Rsrv.XT_LANG_NOTAG),
                 k, "", queue);
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
        s.OCcall(ocap, values, function(err, v) {
            if (!_.isUndefined(v))
                v = Rserve.wrap_all_ocaps(s, v); 
            k(err, v);
        });
    };
    wrapped_ocap.bare_ocap = ocap;
    return wrapped_ocap;
};

})();
