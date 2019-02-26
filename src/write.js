(function () {

_.mixin({
    isTypedArray: function(v) {
        if (!_.isObject(v))
            return false;
        return !_.isUndefined(v.byteLength) && !_.isUndefined(v.BYTES_PER_ELEMENT);
    }
});

// type_id tries to match some javascript values to Rserve value types
Rserve.type_id = function(value)
{
    if (_.isNull(value) || _.isUndefined(value))
        return Rserve.Rsrv.XT_NULL;
    var type_dispatch = {
        "boolean": Rserve.Rsrv.XT_ARRAY_BOOL,
        "number":  Rserve.Rsrv.XT_ARRAY_DOUBLE,
        "string":  Rserve.Rsrv.XT_ARRAY_STR // base strings need to be array_str or R gets confused?
    };
    if (!_.isUndefined(type_dispatch[typeof value]))
        return type_dispatch[typeof value];

    // typed arrays
    if (_.isTypedArray(value))
        return Rserve.Rsrv.XT_ARRAY_DOUBLE;

    // arraybuffers
    if (!_.isUndefined(value.byteLength) && !_.isUndefined(value.slice))
        return Rserve.Rsrv.XT_RAW;

    // before coercion, NA is R is a logical, so if entire array is null, then
    // translate it into a logical vector accordingly
    if (_.isArray(value) && _.all(value, function(el) { return _.isNull(el) || _.isBoolean(el); }))
        return Rserve.Rsrv.XT_ARRAY_BOOL;

    // lists of strings (important for tags)
    if (_.isArray(value) && _.all(value, function(el) { return _.isNull(el) || _.isString(el); }))
        return Rserve.Rsrv.XT_ARRAY_STR;

    // arbitrary lists
    if (_.isArray(value))
        return Rserve.Rsrv.XT_VECTOR;

    // functions get passed as an array_str with extra attributes
    if (_.isFunction(value))
        return Rserve.Rsrv.XT_ARRAY_STR | Rserve.Rsrv.XT_HAS_ATTR;

    // objects
    if (_.isObject(value))
        return Rserve.Rsrv.XT_VECTOR | Rserve.Rsrv.XT_HAS_ATTR;

    throw new Rserve.RServeError("Value type unrecognized by Rserve: " + value);
};

// FIXME this is really slow, as it's walking the object many many times.
Rserve.determine_size = function(value, forced_type)
{
    function list_size(lst) {
        return _.reduce(lst, function(memo, el) {
            return memo + Rserve.determine_size(el);
        }, 0);
    }
    function final_size(payload_size) {
        if (payload_size > (1 << 24))
            return payload_size + 8; // large header
        else
            return payload_size + 4;
    }
    var header_size = 4, t = forced_type || Rserve.type_id(value);

    switch (t & ~Rserve.Rsrv.XT_LARGE) {
    case Rserve.Rsrv.XT_NULL:
        return final_size(0);
    case Rserve.Rsrv.XT_ARRAY_BOOL:
        if (_.isNull(value) || _.isBoolean(value))
            return final_size(8);
        else
            return final_size((value.length + 7) & ~3);
    case Rserve.Rsrv.XT_ARRAY_STR:
        if (_.isArray(value))
            return final_size(_.reduce(value, function(memo, str) {
                // FIXME: this is a bit silly, since we'll be re-encoding this twice: once for the size and second time for the content
                var utf8;
                if (_.isNull(str))
                    utf8 = String.fromCharCode(Rserve.Rsrv.STRING_NA);
                else
                    utf8 = unescape(encodeURIComponent(str));
                return memo + utf8.length + 1;
            }, 0));
        else {
            var utf8;
            if (_.isNull(value))
                utf8 = String.fromCharCode(Rserve.Rsrv.STRING_NA);
            else
                utf8 = unescape(encodeURIComponent(value));
            return final_size(utf8.length + 1);
        }
    case Rserve.Rsrv.XT_ARRAY_DOUBLE:
        if (_.isNull(value) || _.isNumber(value))
            return final_size(8);
        else
            return final_size(8 * value.length);
    case Rserve.Rsrv.XT_RAW:
        return final_size(4 + value.byteLength);
    case Rserve.Rsrv.XT_VECTOR:
    case Rserve.Rsrv.XT_LANG_NOTAG:
        return final_size(list_size(value));
    case Rserve.Rsrv.XT_VECTOR | Rserve.Rsrv.XT_HAS_ATTR: // a named list (that is, a js object)
        var names_size_1 = final_size("names".length + 3);
        var names_size_2 = Rserve.determine_size(_.keys(value));
        var names_size = final_size(names_size_1 + names_size_2);
        return final_size(names_size + list_size(_.values(value)));
/*        return header_size // XT_VECTOR | XT_HAS_ATTR
            + header_size // XT_LIST_TAG (attribute)
              + header_size + "names".length + 3 // length of 'names' + padding (tag as XT_SYMNAME)
              + Rserve.determine_size(_.keys(value)) // length of names
            + list_size(_.values(value)); // length of values
*/
    case Rserve.Rsrv.XT_ARRAY_STR | Rserve.Rsrv.XT_HAS_ATTR: // js->r ocap (that is, a js function)
        return Rserve.determine_size("0403556553") // length of ocap nonce; that number is meaningless aside from length
            + header_size // XT_LIST_TAG (attribute)
              + header_size + "class".length + 3 // length of 'class' + padding (tag as XT_SYMNAME)
              + Rserve.determine_size(["javascript_function"]); // length of class name
        
    default:
        throw new Rserve.RserveError("Internal error, can't handle type " + t);
    }
};

Rserve.write_into_view = function(value, array_buffer_view, forced_type, convert)
{
    var size = Rserve.determine_size(value, forced_type);
    var is_large = size > 16777215;
    // if (size > 16777215)
    //     throw new Rserve.RserveError("Can't currently handle objects >16MB");
    var t = forced_type || Rserve.type_id(value), i, current_offset, lbl;
    if (is_large)
        t = t | Rserve.Rsrv.XT_LARGE;
    var read_view;
    var write_view = array_buffer_view.data_view();
    var payload_start;
    if (is_large) {
        payload_start = 8;
        write_view.setInt32(0, t + ((size - 8) << 8));
        write_view.setInt32(4, (size - 8) >>> 24);
    } else { 
        payload_start = 4;
        write_view.setInt32(0, t + ((size - 4) << 8));
    }

    switch (t & ~Rserve.Rsrv.XT_LARGE) {
    case Rserve.Rsrv.XT_NULL:
        break;
    case Rserve.Rsrv.XT_ARRAY_BOOL:
        if (_.isNull(value)) {
            write_view.setInt32(payload_start, 1);
            write_view.setInt8(payload_start + 4, Rserve.Rsrv.BOOL_NA);
        } else if (_.isBoolean(value)) {
            write_view.setInt32(payload_start, 1);
            write_view.setInt8(payload_start + 4, value ? Rserve.Rsrv.BOOL_TRUE : Rserve.Rsrv.BOOL_FALSE);
        } else {
            write_view.setInt32(payload_start, value.length);
            for (i=0; i<value.length; ++i)
                write_view.setInt8(payload_start + 4 + i, !_.isNull(value[i]) ? value[i] ? Rserve.Rsrv.BOOL_TRUE : Rserve.Rsrv.BOOL_FALSE : Rserve.Rsrv.BOOL_NA);
        }
        break;
    case Rserve.Rsrv.XT_ARRAY_STR:
        if (_.isNull(value)) {
            write_view.setUint8(payload_start, Rserv.Rsrv.STRING_NA);
            write_view.setUint8(payload_start + 1, 0);
        } else if (_.isArray(value)) {
            var offset = payload_start;
            _.each(value, function(el) {
                if (_.isNull(el)) {
                    write_view.setUint8(offset++, Rserv.Rsrv.STRING_NA);
                } else {
                    var utf8 = unescape(encodeURIComponent(el));
                    for (var i=0; i<utf8.length; ++i, ++offset)
                        write_view.setUint8(offset, utf8.charCodeAt(i));
                }
                write_view.setUint8(offset++, 0);
            });
        } else {
            var utf8 = unescape(encodeURIComponent(value));
            for (i=0; i<utf8.length; ++i)
                write_view.setUint8(payload_start + i, utf8.charCodeAt(i));
            write_view.setUint8(payload_start + utf8.length, 0);
        }
        break;
    case Rserve.Rsrv.XT_ARRAY_DOUBLE:
        if (_.isNull(value)) {
            write_view.setFloat64(payload_start, Rserv.Rsrv.DOUBLE_NA);
        } else if (_.isNumber(value))
            write_view.setFloat64(payload_start, value);
        else {
            for (i=0; i<value.length; ++i)
                if (_.isNull(value[i]))
                    write_view.setFloat64(payload_start + 8 * i, Rserv.Rsrv.DOUBLE_NA);
                else
                    write_view.setFloat64(payload_start + 8 * i, value[i]);
        }
        break;
    case Rserve.Rsrv.XT_RAW:
        read_view = new Rserve.EndianAwareDataView(value);
        write_view.setUint32(payload_start, value.byteLength);
        for (i=0; i<value.byteLength; ++i) {
            write_view.setUint8(payload_start + 4 + i, read_view.getUint8(i));
        }
        break;
    case Rserve.Rsrv.XT_VECTOR:
    case Rserve.Rsrv.XT_LANG_NOTAG:
        current_offset = payload_start;
        _.each(value, function(el) {
            var sz = Rserve.determine_size(el);
            Rserve.write_into_view(el, array_buffer_view.skip(
                current_offset), undefined, convert);
            current_offset += sz;
        });
        break;
    case Rserve.Rsrv.XT_VECTOR | Rserve.Rsrv.XT_HAS_ATTR:
        current_offset = payload_start + 8;
        _.each(_.keys(value), function(el) {
            for (var i=0; i<el.length; ++i, ++current_offset)
                write_view.setUint8(current_offset, el.charCodeAt(i));
            write_view.setUint8(current_offset++, 0);
        });
        write_view.setUint32(payload_start + 4, Rserve.Rsrv.XT_ARRAY_STR + ((current_offset - (payload_start + 8)) << 8));

        write_view.setUint32(current_offset, Rserve.Rsrv.XT_SYMNAME + (8 << 8));
        current_offset += 4;
        lbl = "names";
        for (i=0; i<lbl.length; ++i, ++current_offset)
            write_view.setUint8(current_offset, lbl.charCodeAt(i));
        current_offset += 3;

        write_view.setUint32(payload_start, Rserve.Rsrv.XT_LIST_TAG + ((current_offset - (payload_start + 4)) << 8));

        _.each(_.values(value), function(el) {
            var sz = Rserve.determine_size(el);
            Rserve.write_into_view(el, array_buffer_view.skip(
                current_offset), undefined, convert);
            current_offset += sz;
        });
        break;

    case Rserve.Rsrv.XT_ARRAY_STR | Rserve.Rsrv.XT_HAS_ATTR:
        var converted_function = convert(value);
        current_offset = payload_start + 8;
        var class_name = "javascript_function";
        for (i=0; i<class_name.length; ++i, ++current_offset)
            write_view.setUint8(current_offset, class_name.charCodeAt(i));
        write_view.setUint8(current_offset++, 0);
        write_view.setUint32(8, Rserve.Rsrv.XT_ARRAY_STR + ((current_offset - (payload_start + 8)) << 8));
        write_view.setUint32(current_offset, Rserve.Rsrv.XT_SYMNAME + (8 << 8));
        current_offset += 4;
        lbl = "class";
        for (i=0; i<lbl.length; ++i, ++current_offset)
            write_view.setUint8(current_offset, lbl.charCodeAt(i));
        current_offset += 3;
        write_view.setUint32(4, Rserve.Rsrv.XT_LIST_TAG + ((current_offset - (payload_start + 4)) << 8));
        for (i=0; i<converted_function.length; ++i)
            write_view.setUint8(current_offset + i, converted_function.charCodeAt(i));
        write_view.setUint8(current_offset + converted_function.length, 0);
        break;
    default:
        throw new Rserve.RserveError("Internal error, can't handle type " + t);
    }
};

})();
