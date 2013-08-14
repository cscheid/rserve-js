// normalizes node.js Buffer vs user agent's ArrayBuffer
Rserve.buffer_length = function(b) {
    return b.byteLength;
};
