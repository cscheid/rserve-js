// normalizes node.js Buffer vs user agent's ArrayBuffer
Rserve.buffer_length = function(b) {
    return _.isUndefined(b.length) ? b.byteLength : b.length;
};
