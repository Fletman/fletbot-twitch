/**
 * Wrapper around log functions
 * Allows for changing underlying log functionality without any exposure
 */
module.exports = {
    /**Log to stdout */
    log: (...data) => write(console.log, data),
    /**Log to stderr */
    error: (...err) => write(console.error, err)
}

function write(log_func, log) {
    log_func.apply(null, [`[ ${new Date(Date.now()).toLocaleString()} ]`].concat(log));
}
