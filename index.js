/*!
 * xprezzo-finalhandler
 * Copyright(c) 2022 Cloudgen Wong <cloudgen.wong@gmail.com>
 * MIT Licensed
 *
 * Create a function to handle the final response.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Object} [options]
 * @return {Function}
 * @public
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

const debug = require('xprezzo-debug')('xprezzo:finalhandler')
const encodeUrl = require('encodeurl')
const escapeHtml = require('escape-html')
const onFinished = require('xprezzo-on-finished')
const parseUrl = require('parseurl')
const statuses = require('statuses')
const unpipe = require('xprezzo-stream-unpipe')

/**
 * Module variables.
 * @private
 */
let DOUBLE_SPACE_REGEXP = /\x20{2}/g
let NEWLINE_REGEXP = /\n/g

/* istanbul ignore next */
let defer = typeof setImmediate === 'function'
  ? setImmediate
  : function (fn) { process.nextTick(fn.bind.apply(fn, arguments)) }
let isFinished = onFinished.isFinished

/**
 * Create a minimal HTML document.
 *
 * @param {string} message
 * @private
 */
const createHtmlDocument = (message) => {
  let body = escapeHtml(message)
    .replace(NEWLINE_REGEXP, '<br>')
    .replace(DOUBLE_SPACE_REGEXP, ' &nbsp;')

  return '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<title>Error</title>\n' +
    '</head>\n' +
    '<body>\n' +
    '<pre>' + body + '</pre>\n' +
    '</body>\n' +
    '</html>\n'
}

/**
 * Get headers from Error object.
 *
 * @param {Error} err
 * @return {object}
 * @private
 */
 const getErrorHeaders = (err) => {
  if (!err.headers || typeof err.headers !== 'object') {
    return undefined
  }

  let headers = Object.create(null)
  let keys = Object.keys(err.headers)

  for (let i = 0; i < keys.length; i++) {
    let key = keys[i]
    headers[key] = err.headers[key]
  }

  return headers
}

/**
 * Get message from Error object, fallback to status message.
 *
 * @param {Error} err
 * @param {number} status
 * @param {string} env
 * @return {string}
 * @private
 */
const getErrorMessage = (err, status, env) => {
  let msg

  if (env !== 'production') {
    // use err.stack, which typically includes err.message
    msg = err.stack

    // fallback to err.toString() when possible
    if (!msg && typeof err.toString === 'function') {
      msg = err.toString()
    }
  }

  return msg || statuses.message[status] || String(status)
}

/**
 * Get status code from Error object.
 *
 * @param {Error} err
 * @return {number}
 * @private
 */
const getErrorStatusCode = (err) => {
  // check err.status
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 600) {
    return err.status
  }

  // check err.statusCode
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
    return err.statusCode
  }

  return undefined
}

/**
 * Get resource name for the request.
 *
 * This is typically just the original pathname of the request
 * but will fallback to "resource" is that cannot be determined.
 *
 * @param {IncomingMessage} req
 * @return {string}
 * @private
 */
const getResourceName = (req) => {
  try {
    return parseUrl.original(req).pathname
  } catch (e) {
    return 'resource'
  }
}

/**
 * Get status code from response.
 *
 * @param {OutgoingMessage} res
 * @return {number}
 * @private
 */
const getResponseStatusCode = (res) => {
  let status = res.statusCode

  // default status code to 500 if outside valid range
  if (typeof status !== 'number' || status < 400 || status > 599) {
    status = 500
  }

  return status
}

/**
 * Determine if the response headers have been sent.
 *
 * @param {object} res
 * @returns {boolean}
 * @private
 */
const headersSent = (res) => {
  return typeof res.headersSent !== 'boolean'
    ? Boolean(res._header)
    : res.headersSent
}

/**
 * Send response.
 *
 * @param {IncomingMessage} req
 * @param {OutgoingMessage} res
 * @param {number} status
 * @param {object} headers
 * @param {string} message
 * @private
 */
const sendResponse = (req, res, status, headers, message) => {
  let write = () => {
    // response body
    let body = createHtmlDocument(message)

    // response status
    res.statusCode = status
    res.statusMessage = statuses.message[status] || String(status)

    // response headers
    setHeaders(res, headers)

    // security headers
    res.setHeader('Content-Security-Policy', "default-src 'none'")
    res.setHeader('X-Content-Type-Options', 'nosniff')

    // standard headers
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'))

    if (req.method === 'HEAD') {
      res.end()
      return
    }

    res.end(body, 'utf8')
  }

  if (isFinished(req)) {
    write()
    return
  }

  // unpipe everything from the request
  unpipe(req)

  // flush the request
  onFinished(req, write)
  req.resume()
}

/**
 * Set response headers from an object.
 *
 * @param {OutgoingMessage} res
 * @param {object} headers
 * @private
 */
const setHeaders = (res, headers) => {
  if (!headers) {
    return
  }

  let keys = Object.keys(headers)
  for (let i = 0; i < keys.length; i++) {
    let key = keys[i]
    res.setHeader(key, headers[key])
  }
}

/**
 * Module exports.
 * @public
 */
module.exports = (req, res, options) => {
  let opts = options || {}

  // get environment
  let env = opts.env || process.env.NODE_ENV || 'development'

  // get error callback
  let onerror = opts.onerror

  return function (err) {
    let headers
    let msg
    let status

    // cannot actually respond
    if (headersSent(res)) {
      debug('cannot %d after headers sent', status)
      res.end('')
      return this
    }

    // unhandled error
    if (err) {
      // respect status code from error
      status = getErrorStatusCode(err)

      if (status === undefined) {
        // fallback to status code on response
        status = getResponseStatusCode(res)
      } else {
        // respect headers from error
        headers = getErrorHeaders(err)
      }

      // get error message
      msg = getErrorMessage(err, status, env)
    } else {
      // not found
      status = 404
      msg = 'Cannot ' + req.method + ' ' + encodeUrl(getResourceName(req))
    }
    debug('error dispatching %s %s', req.method, encodeUrl(getResourceName(req)))
    if (opts.app && typeof opts.app.emit === 'function') {
      opts.app.emit('errorDispatch', {
        method: req.method,
        url: encodeUrl(getResourceName(req))
      })
    }
    debug('default %s', status)

    // schedule onerror callback
    if (err && onerror) {
      defer(onerror, err, req, res)
    }

    // send response
    sendResponse(req, res, status, headers, msg)
  }
}

