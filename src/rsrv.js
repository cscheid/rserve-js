// Simple constants and functions are defined here,
// in correspondence with Rserve's Rsrv.h

function custom_nan(int32_words) {
    // DataView.getFloat64() canonicalizes any NaNs with custom bit patterns, so
    // instead use what is essentially a C union in JavaScript. Unfortunately,
    // that means we have to deal with endianness.
    var buf = new ArrayBuffer(8);
    var intRep = new Int32Array(buf);
    var floatRep = new Float64Array(buf);

    // Server may be little endian.
    intRep[0] = int32_words[1];
    intRep[1] = int32_words[0];
    if (isNaN(floatRep[0]))
        return floatRep[0];

    // Server may be big endian.
    intRep[0] = int32_words[0];
    intRep[1] = int32_words[1];
    return floatRep[0];
}

Rserve.Rsrv = {
    PAR_TYPE: function(x) { return x & 255; },
    PAR_LEN: function(x) { return x >>> 8; },
    PAR_LENGTH: function(x) { return x >>> 8; },
    par_parse: function(x) { return [Rserve.Rsrv.PAR_TYPE(x), Rserve.Rsrv.PAR_LEN(x)]; },
    SET_PAR: function(ty, len) { return ((len & 0xffffff) << 8 | (ty & 255)); },
    CMD_STAT: function(x) { return (x >>> 24) & 127; },
    SET_STAT: function(x, s) { return x | ((s & 127) << 24); },

    IS_OOB_SEND: function(x) { return (x & 0xffff000) === Rserve.Rsrv.OOB_SEND; },
    IS_OOB_MSG: function(x) { return (x & 0xffff000) === Rserve.Rsrv.OOB_MSG; },
    OOB_USR_CODE: function(x) { return x & 0xfff; },

    CMD_RESP           : 0x10000,
    RESP_OK            : 0x10000 | 0x0001,
    RESP_ERR           : 0x10000 | 0x0002,
    OOB_SEND           : 0x20000 | 0x1000,
    OOB_MSG            : 0x20000 | 0x2000,
    ERR_auth_failed    : 0x41,
    ERR_conn_broken    : 0x42,
    ERR_inv_cmd        : 0x43,
    ERR_inv_par        : 0x44,
    ERR_Rerror         : 0x45,
    ERR_IOerror        : 0x46,
    ERR_notOpen        : 0x47,
    ERR_accessDenied   : 0x48,
    ERR_unsupportedCmd : 0x49,
    ERR_unknownCmd     : 0x4a,
    ERR_data_overflow  : 0x4b,
    ERR_object_too_big : 0x4c,
    ERR_out_of_mem     : 0x4d,
    ERR_ctrl_closed    : 0x4e,
    ERR_session_busy   : 0x50,
    ERR_detach_failed  : 0x51,
    ERR_disabled       : 0x61,
    ERR_unavailable    : 0x62,
    ERR_cryptError     : 0x63,
    ERR_securityClose  : 0x64,

    CMD_login            : 0x001,
    CMD_voidEval         : 0x002,
    CMD_eval             : 0x003,
    CMD_shutdown         : 0x004,
    CMD_switch           : 0x005,
    CMD_keyReq           : 0x006,
    CMD_secLogin         : 0x007,
    CMD_OCcall           : 0x00f,
    CMD_openFile         : 0x010,
    CMD_createFile       : 0x011,
    CMD_closeFile        : 0x012,
    CMD_readFile         : 0x013,
    CMD_writeFile        : 0x014,
    CMD_removeFile       : 0x015,
    CMD_setSEXP          : 0x020,
    CMD_assignSEXP       : 0x021,
    CMD_detachSession    : 0x030,
    CMD_detachedVoidEval : 0x031,
    CMD_attachSession    : 0x032,
    CMD_ctrl             : 0x40,
    CMD_ctrlEval         : 0x42,
    CMD_ctrlSource       : 0x45,
    CMD_ctrlShutdown     : 0x44,
    CMD_setBufferSize    : 0x081,
    CMD_setEncoding      : 0x082,
    CMD_SPECIAL_MASK     : 0xf0,
    CMD_serEval          : 0xf5,
    CMD_serAssign        : 0xf6,
    CMD_serEEval         : 0xf7,

    DT_INT        : 1,
    DT_CHAR       : 2,
    DT_DOUBLE     : 3,
    DT_STRING     : 4,
    DT_BYTESTREAM : 5,
    DT_SEXP       : 10,
    DT_ARRAY      : 11,
    DT_LARGE      : 64,

    XT_NULL          : 0,
    XT_INT           : 1,
    XT_DOUBLE        : 2,
    XT_STR           : 3,
    XT_LANG          : 4,
    XT_SYM           : 5,
    XT_BOOL          : 6,
    XT_S4            : 7,
    XT_VECTOR        : 16,
    XT_LIST          : 17,
    XT_CLOS          : 18,
    XT_SYMNAME       : 19,
    XT_LIST_NOTAG    : 20,
    XT_LIST_TAG      : 21,
    XT_LANG_NOTAG    : 22,
    XT_LANG_TAG      : 23,
    XT_VECTOR_EXP    : 26,
    XT_VECTOR_STR    : 27,
    XT_ARRAY_INT     : 32,
    XT_ARRAY_DOUBLE  : 33,
    XT_ARRAY_STR     : 34,
    XT_ARRAY_BOOL_UA : 35,
    XT_ARRAY_BOOL    : 36,
    XT_RAW           : 37,
    XT_ARRAY_CPLX    : 38,
    XT_UNKNOWN       : 48,
    XT_LARGE         : 64,
    XT_HAS_ATTR      : 128,

    BOOL_TRUE  : 1,
    BOOL_FALSE : 0,
    BOOL_NA    : 2,

    // See Arith.h in R.
    INTEGER_NA : (2147483647 + 1) | 0,
    STRING_NA  : 0xff,
    DOUBLE_NA  : custom_nan([ 0x7ff00000, 0x000007a2 ]),

    GET_XT: function(x) { return x & 63; },
    GET_DT: function(x) { return x & 63; },
    HAS_ATTR: function(x) { return (x & Rserve.Rsrv.XT_HAS_ATTR) > 0; },
    IS_LARGE: function(x) { return (x & Rserve.Rsrv.XT_LARGE) > 0; },
    IS_DOUBLE_NA: function(x) {
        var view = new DataView(new ArrayBuffer(16));
        view.setFloat64(0, x);
        view.setFloat64(8, Rserve.Rsrv.DOUBLE_NA);
        // Any operations (not involving NaN) still produce NA, but they convert
        // the signaling NaN to quiet NaN by toggling the highest mantissa bit.
        return (view.getInt32(0) & ~0x00080000) === view.getInt32(8) && view.getInt32(4) === view.getInt32(12);
    },

    // # FIXME A WHOLE LOT OF MACROS HERE WHICH ARE PROBABLY IMPORTANT
    // ##############################################################################

    status_codes: {
        0x41 : "ERR_auth_failed"   ,
        0x42 : "ERR_conn_broken"   ,
        0x43 : "ERR_inv_cmd"       ,
        0x44 : "ERR_inv_par"       ,
        0x45 : "ERR_Rerror"        ,
        0x46 : "ERR_IOerror"       ,
        0x47 : "ERR_notOpen"       ,
        0x48 : "ERR_accessDenied"  ,
        0x49 : "ERR_unsupportedCmd",
        0x4a : "ERR_unknownCmd"    ,
        0x4b : "ERR_data_overflow" ,
        0x4c : "ERR_object_too_big",
        0x4d : "ERR_out_of_mem"    ,
        0x4e : "ERR_ctrl_closed"   ,
        0x50 : "ERR_session_busy"  ,
        0x51 : "ERR_detach_failed" ,
        0x61 : "ERR_disabled"      ,
        0x62 : "ERR_unavailable"   ,
        0x63 : "ERR_cryptError"    ,
        0x64 : "ERR_securityClose"
    }
};
