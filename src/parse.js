(function() {

function read(m)
{
    var handlers = {};

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
            return decodeURIComponent(escape(result)); // UTF-8 to UTF-16
        },
        read_stream: function(length) {
            var old_offset = this.offset;
            this.offset += length;
            return this.msg.view(old_offset, length);
        },
        read_int_vector: function(length) {
            var old_offset = this.offset;
            this.offset += length;
            return _.map(this.msg.make(Int32Array, old_offset, length), function(v) {
                return v !== Rserve.Rsrv.INTEGER_NA ? v : null;
            });
        },
        read_double_vector: function(length) {
            var old_offset = this.offset;
            this.offset += length;
            return _.map(this.msg.make(Float64Array, old_offset, length), function(v) {
                return !Rserve.Rsrv.IS_DOUBLE_NA(v) ? v : null;
            });
        },

        //////////////////////////////////////////////////////////////////////
        // these are members of the reader monad

        read_null: lift(function(a, l) { return Rserve.Robj.null(a); }),

        read_unknown: lift(function(a, l) { 
            this.offset += l;
            return Rserve.Robj.null(a); 
        }),

        read_string_array: function(attributes, length) {
            var a = this.read_stream(length).make(Uint8Array);
            var result = [];
            var current_str = "";
            for (var i=0; i<a.length; ++i)
                if (a[i] === 0) {
                    if (current_str.length !== 1 || current_str.charCodeAt(0) !== Rserve.Rsrv.STRING_NA)
                        current_str = decodeURIComponent(escape(current_str));
                    else
                        current_str = null;
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
            var a = _.map(s.make(Uint8Array).subarray(0, l2), function(v) {
                return v !== Rserve.Rsrv.BOOL_NA ? v ? true : false : null;
            });
            return [Rserve.Robj.bool_array(a, attributes), length];
        },
        read_raw: function(attributes, length) {
            var l2 = this.read_int();
            var s = this.read_stream(length-4);
            var a = s.make(Uint8Array).subarray(0, l2).buffer;
            return [Rserve.Robj.raw(a, attributes), length];
        },

        read_sexp: function() {
            var d = this.read_int();
            var _ = Rserve.Rsrv.par_parse(d);
            var t = _[0], l = _[1];
            var total_read = 4;
            var attributes = undefined;
            if (Rserve.Rsrv.IS_LARGE(t)) {
                var extra_length = this.read_int();
                total_read += 4;
                l += extra_length * Math.pow(2, 24);
                t &= ~64;
            }
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
    handlers[Rserve.Rsrv.XT_UNKNOWN]      = that.read_unknown;
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
    handlers[Rserve.Rsrv.XT_RAW]          = that.read_raw;

    handlers[Rserve.Rsrv.XT_STR]          = sl(that.read_string, Rserve.Robj.string);

    return that;
}

function parse(msg)
{
    var result = {};
    var header = new Int32Array(msg, 0, 4);
    var resp = header[0] & 16777215, status_code = header[0] >>> 24;
    var msg_id = header[2];
    result.header = [resp, status_code, msg_id];

    if (resp === Rserve.Rsrv.RESP_ERR) {
        result.ok = false;
        result.status_code = status_code;
        result.message = "ERROR FROM R SERVER: " + (Rserve.Rsrv.status_codes[status_code] || 
                                         status_code)
               + " " + result.header[0] + " " + result.header[1]
               + " " + msg.byteLength
               + " " + msg;
        return result;
    }

    if (!( resp === Rserve.Rsrv.RESP_OK || Rserve.Rsrv.IS_OOB_SEND(resp) || Rserve.Rsrv.IS_OOB_MSG(resp))) {
        result.ok = false;
        result.message = "Unexpected response from Rserve: " + resp + " status: " + Rserve.Rsrv.status_codes[status_code];
        return result;
    }
    try {
        result.payload = parse_payload(msg);
        result.ok = true;
    } catch (e) {
        result.ok = false;
        result.message = e.message;
    }
    return result;
}

function parse_payload(msg)
{
    var payload = Rserve.my_ArrayBufferView(msg, 16, msg.byteLength - 16);
    if (payload.length === 0)
        return null;

    var reader = read(payload);

    var d = reader.read_int();
    var _ = Rserve.Rsrv.par_parse(d);
    var t = _[0], l = _[1];
    if (Rserve.Rsrv.IS_LARGE(t)) {
        var more_length = reader.read_int();
        l += more_length * Math.pow(2, 24);
        if (l > (Math.pow(2, 32))) { // resist the 1 << 32 temptation here!
            // total_length is greater than 2^32.. bail out because of node limits
            // even though in theory we could go higher than that.
            throw new Error("Payload too large: " + l + " bytes");
        }
        t &= ~64;
    }
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

Rserve.parse_websocket_frame = parse;
Rserve.parse_payload = parse_payload;

})();
