class HttpError extends Error {
    constructor(status, code, message, details) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

function asyncRoute(handler) {
    return function wrappedRoute(req, res, next) {
        return Promise.resolve(handler(req, res, next)).catch(next);
    };
}

module.exports = { HttpError, asyncRoute };
