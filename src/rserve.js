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
        var v = Rserve.parse_websocket_frame(msg.data);
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
