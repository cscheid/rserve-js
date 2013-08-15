// type_id tries to match some javascript values to Rserve value types
Rserve.type_id = function(value)
{
    if (_.isNull(value) || _.isUndefined(value))
        return Rserve.Rsrv.XT_NULL;
    var type_dispatch = {
        "boolean": Rserve.Rsrv.XT_BOOL,
        "number": Rserve.Rsrv.XT_DOUBLE,
        "string": Rserve.Rsrv.XT_STR
    };
    if (!_.isUndefined(type_dispatch[typeof value]))
        return type_dispatch[typeof value];

    // typed arrays
    if (!_.isUndefined(value.byteLength) && !_.isUndefined(value.BYTES_PER_ELEMENT))
        return Rserve.Rsrv.XT_ARRAY_DOUBLE;

    // arraybuffers
    if (!_.isUndefined(value.byteLength) && !_.isUndefined(value.slice))
        return Rserve.Rsrv.XT_RAW;

    // arbitrary lists
    if (_.isArray(value))
        return Rserve.Rsrv.XT_VECTOR;

    // // objects
    // if (_.isObject(value))
    //     return Rserve.Rsrv.XT_VECTOR | Rserve.Rsrv.XT_HAS_ATTR;

    throw new Rserve.RServeError("Value type unrecognized by Rserve: " + value);
};

// FIXME this is really slow, as it's walking the object many many times.
Rserve.determine_size = function(value)
{
    function list_size(lst) {
        return _.reduce(lst, function(memo, el) {
            return memo + Rserve.determine_size(el);
        }, 0);
    }
    var header_size = 4, t;
    switch ((t = Rserve.type_id(value))) {
    case Rserve.Rsrv.XT_NULL:
        return header_size + 0;
    case Rserve.Rsrv.XT_DOUBLE:
        return header_size + 8;
    case Rserve.Rsrv.XT_BOOL:
        return header_size + 1;
    case Rserve.Rsrv.XT_STR:
        return header_size + value.length + 1;
    case Rserve.Rsrv.XT_ARRAY_DOUBLE:
        return header_size + 8 * value.length;
    case Rserve.Rsrv.XT_RAW:
        return header_size + value.length;
    case Rserve.Rsrv.XT_VECTOR:
        return header_size + list_size(value);
    // case Rserve.Rsrv.XT_VECTOR | Rserve.Rsrv.XT_HAS_ATTR:
    //     return header_size + list_size(_.values(value))
    //         + list_size(_.keys(value));
    default:
        throw new Rserve.RserveError("Internal error, can't handle type " + t);
    }
};

Rserve.write_into_view = function(value, array_buffer_view)
{
    var size = Rserve.determine_size(value);
    if (size > 16777215)
        throw new Rserve.RserveError("Can't currently handle objects >16MB");
    var t = Rserve.type_id(value), i, current_offset;
    var read_view;
    var write_view = array_buffer_view.data_view();
    write_view.setInt32(0, t + ((size - 4) << 8));

    switch (t) {
    case Rserve.Rsrv.XT_NULL:
        break;
    case Rserve.Rsrv.XT_DOUBLE:
        write_view.setFloat64(4, value);
        break;
    case Rserve.Rsrv.XT_BOOL:
        write_view.setInt8(4, value ? 1 : 0);
        break;
    case Rserve.Rsrv.XT_STR:
        for (i=0; i<value.length; ++i)
            write_view.setUint8(4 + i, value.charCodeAt(i));
        write_view.setUint8(4 + value.length, 0);
        break;
    case Rserve.Rsrv.XT_ARRAY_DOUBLE:
        for (i=0; i<value.length; ++i)
            write_view.setFloat64(4 + 8 * i, value[i]);
        break;
    case Rserve.Rsrv.XT_RAW:
        read_view = new Rserve.EndianAwareDataView(value);
        for (i=0; i<value.length; ++i)
            write_view.setUint8(4 + i, read_view.getUint8(value, i));
        break;
    case Rserve.Rsrv.XT_VECTOR:
        current_offset = 4;
        _.each(value, function(el) {
            var sz = Rserve.determine_size(el);
            Rserve.write_into_view(el, array_buffer_view.skip(
                current_offset));
            current_offset += sz;
        });
        break;
    // case Rserve.Rsrv.XT_VECTOR | Rserve.Rsrv.XT_HAS_ATTR:
    //     current_offset = 4;
    //     _.each(value, function(el_value, el_key) {
    //         var sz_key = Rserve.determine_size(el_key);
    //         var sz_value = Rserve.determine_size(el_value);
    //         Rserve.write_into_view(el_value, array_buffer_view.view(
    //             current_offset,
    //             sz_value));
    //         current_offset += sz_value;
    //         Rserve.write_into_view(el_key, array_buffer_view.view(
    //             current_offset,
    //             sz_key));
    //         current_offset += sz_key;
    //     });
    //     break;
    default:
        throw new Rserve.RserveError("Internal error, can't handle type " + t);
    }
};
