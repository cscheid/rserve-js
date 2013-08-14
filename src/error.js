Rserve.RserveError = function(message, status_code) {
    this.name = "RserveError";
    this.message = message;
    this.status_code = status_code;
};

Rserve.RserveError.prototype = Object.create(Error);
Rserve.RserveError.prototype.constructor = Rserve.RserveError;
