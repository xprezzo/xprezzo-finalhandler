const Buffer = require('xprezzo-buffer').Buffer
const finalhandler = require('..')
const http = require('http')
const utils = require('./support/utils')

const assert = utils.assert
const createError = utils.createError
const createServer = utils.createServer
const createSlowWriteStream = utils.createSlowWriteStream
const rawrequest = utils.rawrequest
const request = utils.request
const shouldHaveStatusMessage = utils.shouldHaveStatusMessage
const shouldNotHaveBody = utils.shouldNotHaveBody
const shouldNotHaveHeader = utils.shouldNotHaveHeader

let describeStatusMessage = !/statusMessage/.test(http.IncomingMessage.toString())
  ? describe.skip
  : describe

describe('finalhandler(req, res)', function () {
  describe('headers', function () {
    it('should ignore err.headers without status code', function (done) {
      request(createServer(createError('oops!', {
        headers: { 'X-Custom-Header': 'foo' }
      })))
        .get('/')
        .expect(shouldNotHaveHeader('X-Custom-Header'))
        .expect(500, done)
    })

    it('should ignore err.headers with invalid res.status', function (done) {
      request(createServer(createError('oops!', {
        headers: { 'X-Custom-Header': 'foo' },
        status: 601
      })))
        .get('/')
        .expect(shouldNotHaveHeader('X-Custom-Header'))
        .expect(500, done)
    })

    it('should ignore err.headers with invalid res.statusCode', function (done) {
      request(createServer(createError('oops!', {
        headers: { 'X-Custom-Header': 'foo' },
        statusCode: 601
      })))
        .get('/')
        .expect(shouldNotHaveHeader('X-Custom-Header'))
        .expect(500, done)
    })

    it('should include err.headers with err.status', function (done) {
      request(createServer(createError('oops!', {
        headers: { 'X-Custom-Header': 'foo=500', 'X-Custom-Header2': 'bar' },
        status: 500
      })))
        .get('/')
        .expect('X-Custom-Header', 'foo=500')
        .expect('X-Custom-Header2', 'bar')
        .expect(500, done)
    })

    it('should include err.headers with err.statusCode', function (done) {
      request(createServer(createError('too many requests', {
        headers: { 'Retry-After': '5' },
        statusCode: 429
      })))
        .get('/')
        .expect('Retry-After', '5')
        .expect(429, done)
    })

    it('should ignore err.headers when not an object', function (done) {
      request(createServer(createError('oops!', {
        headers: 'foobar',
        statusCode: 500
      })))
        .get('/')
        .expect(500, done)
    })
  })

  describe('status code', function () {
    it('should 404 on no error', function (done) {
      request(createServer())
        .get('/')
        .expect(404, done)
    })

    it('should 500 on error', function (done) {
      request(createServer(createError()))
        .get('/')
        .expect(500, done)
    })

    it('should use err.statusCode', function (done) {
      request(createServer(createError('nope', {
        statusCode: 400
      })))
        .get('/')
        .expect(400, done)
    })

    it('should ignore non-error err.statusCode code', function (done) {
      request(createServer(createError('created', {
        statusCode: 201
      })))
        .get('/')
        .expect(500, done)
    })

    it('should ignore non-numeric err.statusCode', function (done) {
      request(createServer(createError('oops', {
        statusCode: 'oh no'
      })))
        .get('/')
        .expect(500, done)
    })

    it('should use err.status', function (done) {
      request(createServer(createError('nope', {
        status: 400
      })))
        .get('/')
        .expect(400, done)
    })

    it('should use err.status over err.statusCode', function (done) {
      request(createServer(createError('nope', {
        status: 400,
        statusCode: 401
      })))
        .get('/')
        .expect(400, done)
    })

    it('should set status to 500 when err.status < 400', function (done) {
      request(createServer(createError('oops', {
        status: 202
      })))
        .get('/')
        .expect(500, done)
    })

    it('should set status to 500 when err.status > 599', function (done) {
      request(createServer(createError('oops', {
        status: 601
      })))
        .get('/')
        .expect(500, done)
    })

    it('should use err.statusCode over invalid err.status', function (done) {
      request(createServer(createError('nope', {
        status: 50,
        statusCode: 410
      })))
        .get('/')
        .expect(410, done)
    })

    it('should ignore non-error err.status code', function (done) {
      request(createServer(createError('created', {
        status: 201
      })))
        .get('/')
        .expect(500, done)
    })

    it('should ignore non-numeric err.status', function (done) {
      request(createServer(createError('oops', {
        status: 'oh no'
      })))
        .get('/')
        .expect(500, done)
    })
  })

  describeStatusMessage('status message', function () {
    it('should be "Not Found" on no error', function (done) {
      request(createServer())
        .get('/')
        .expect(shouldHaveStatusMessage('Not Found'))
        .expect(404, done)
    })

    it('should be "Internal Server Error" on error', function (done) {
      request(createServer(createError()))
        .get('/')
        .expect(shouldHaveStatusMessage('Internal Server Error'))
        .expect(500, done)
    })

    it('should be "Bad Request" when err.statusCode = 400', function (done) {
      request(createServer(createError('oops', {
        status: 400
      })))
        .get('/')
        .expect(shouldHaveStatusMessage('Bad Request'))
        .expect(400, done)
    })

    it('should reset existing res.statusMessage', function (done) {
      function onRequest (req, res, next) {
        res.statusMessage = 'An Error Occurred'
        next(new Error())
      }

      request(createServer(onRequest))
        .get('/')
        .expect(shouldHaveStatusMessage('Internal Server Error'))
        .expect(500, done)
    })
  })

  describe('404 response', function () {
    it('should include method and pathname', function (done) {
      request(createServer())
        .get('/foo')
        .expect(404, /<pre>Cannot GET \/foo<\/pre>/, done)
    })

    it('should escape method and pathname characters', function (done) {
      rawrequest(createServer())
        .get('/<la\'me>')
        .expect(404, /<pre>Cannot GET \/%3Cla&#39;me%3E<\/pre>/, done)
    })

    it('should encode bad pathname characters', function (done) {
      rawrequest(createServer())
        .get('/foo%20§')
        .expect(404, /<pre>Cannot GET \/foo%20%C2%A7<\/pre>/, done)
    })

    it('should fallback to generic pathname without URL', function (done) {
      const server = createServer(function (req, res, next) {
        req.url = undefined
        next()
      })

      request(server)
        .get('/foo')
        .expect(404, /<pre>Cannot GET resource<\/pre>/, done)
    })

    it('should include original pathname', function (done) {
      const server = createServer(function (req, res, next) {
        let parts = req.url.split('/')
        req.originalUrl = req.url
        req.url = '/' + parts.slice(2).join('/')
        next()
      })

      request(server)
        .get('/foo/bar')
        .expect(404, /<pre>Cannot GET \/foo\/bar<\/pre>/, done)
    })

    it('should include pathname only', function (done) {
      rawrequest(createServer())
        .get('http://localhost/foo?bar=1')
        .expect(404, /<pre>Cannot GET \/foo<\/pre>/, done)
    })

    it('should handle HEAD', function (done) {
      request(createServer())
        .head('/foo')
        .expect(404)
        .expect(shouldNotHaveBody())
        .end(done)
    })

    it('should include X-Content-Type-Options header', function (done) {
      request(createServer())
        .get('/foo')
        .expect('X-Content-Type-Options', 'nosniff')
        .expect(404, done)
    })

    it('should includeContent-Security-Policy header', function (done) {
      request(createServer())
        .get('/foo')
        .expect('Content-Security-Policy', "default-src 'none'")
        .expect(404, done)
    })

    it('should not hang/error if there is a request body', function (done) {
      let buf = Buffer.alloc(1024 * 16, '.')
      let server = createServer()
      let test = request(server).post('/foo')
      test.write(buf)
      test.write(buf)
      test.write(buf)
      test.expect(404, done)
    })
  })

  describe('error response', function () {
    it('should include error stack', function (done) {
      request(createServer(createError('boom!')))
        .get('/foo')
        .expect(500, /<pre>Error: boom!<br> &nbsp; &nbsp;at/, done)
    })

    it('should handle HEAD', function (done) {
      request(createServer())
        .head('/foo')
        .expect(404)
        .expect(shouldNotHaveBody())
        .end(done)
    })

    it('should include X-Content-Type-Options header', function (done) {
      request(createServer(createError('boom!')))
        .get('/foo')
        .expect('X-Content-Type-Options', 'nosniff')
        .expect(500, done)
    })

    it('should includeContent-Security-Policy header', function (done) {
      request(createServer(createError('boom!')))
        .get('/foo')
        .expect('Content-Security-Policy', "default-src 'none'")
        .expect(500, done)
    })

    it('should handle non-error-objects', function (done) {
      request(createServer('lame string'))
        .get('/foo')
        .expect(500, /<pre>lame string<\/pre>/, done)
    })

    it('should handle null prototype objects', function (done) {
      request(createServer(Object.create(null)))
        .get('/foo')
        .expect(500, /<pre>Internal Server Error<\/pre>/, done)
    })

    it('should send staus code name when production', function (done) {
      let err = createError('boom!', {
        status: 501
      })
      request(createServer(err, {
        env: 'production'
      }))
        .get('/foo')
        .expect(501, /<pre>Not Implemented<\/pre>/, done)
    })

    describe('when there is a request body', function () {
      it('should not hang/error when unread', function (done) {
        let buf = Buffer.alloc(1024 * 16, '.')
        let server = createServer(new Error('boom!'))
        let test = request(server).post('/foo')
        test.write(buf)
        test.write(buf)
        test.write(buf)
        test.expect(500, done)
      })

      it('should not hang/error when actively piped', function (done) {
        let buf = Buffer.alloc(1024 * 16, '.')
        const server = createServer(function (req, res, next) {
          req.pipe(stream)
          process.nextTick(function () {
            next(new Error('boom!'))
          })
        })
        const stream = createSlowWriteStream()
        const test = request(server).post('/foo')
        test.write(buf)
        test.write(buf)
        test.write(buf)
        test.expect(500, done)
      })

      it('should not hang/error when read', function (done) {
        const buf = Buffer.alloc(1024 * 16, '.')
        const server = createServer(function (req, res, next) {
          // read off the request
          req.once('end', function () {
            next(new Error('boom!'))
          })
          req.resume()
        })
        const test = request(server).post('/foo')
        test.write(buf)
        test.write(buf)
        test.write(buf)
        test.expect(500, done)
      })
    })

    describe('when res.statusCode set', function () {
      it('should keep when >= 400', function (done) {
        const server = http.createServer(function (req, res) {
          const done = finalhandler(req, res)
          res.statusCode = 503
          done(new Error('oops'))
        })

        request(server)
          .get('/foo')
          .expect(503, done)
      })

      it('should convert to 500 is not a number', function (done) {
        const server = http.createServer(function (req, res) {
          const done = finalhandler(req, res)
          res.statusCode = 'oh no'
          done(new Error('oops'))
        })

        request(server)
          .get('/foo')
          .expect(500, done)
      })

      it('should override with err.status', function (done) {
        const server = http.createServer(function (req, res) {
          const done = finalhandler(req, res)
          const err = createError('oops', {
            status: 414,
            statusCode: 503
          })
          done(err)
        })

        request(server)
          .get('/foo')
          .expect(414, done)
      })

      it('should default body to status message in production', function (done) {
        const err = createError('boom!', {
          status: 509
        })
        request(createServer(err, {
          env: 'production'
        }))
          .get('/foo')
          .expect(509, /<pre>Bandwidth Limit Exceeded<\/pre>/, done)
      })
    })

    describe('when res.statusCode undefined', function () {
      it('should set to 500', function (done) {
        const server = http.createServer(function (req, res) {
          const done = finalhandler(req, res)
          res.statusCode = undefined
          done(new Error('oops'))
        })

        request(server)
          .get('/foo')
          .expect(500, done)
      })
    })
  })

  describe('request started', function () {
    it('should not respond', function (done) {
      const server = http.createServer(function (req, res) {
        const done = finalhandler(req, res)
        res.statusCode = 301
        res.write('0')
        process.nextTick(function () {
          res.end('1')
          done()
        })
      })
      request(server)
        .get('/foo')
        .expect(301, '01', done)
    })

    it('should terminate on error', function (done) {
      const server = http.createServer(function (req, res) {
        const done = finalhandler(req, res)
        res.statusCode = 301
        res.write('0')
        process.nextTick(function () {
          done(createError('too many requests', {
            status: 429,
            headers: { 'Retry-After': '5' }
          }))
        })
      })
      request(server)
        .get('/foo')
        .expect(301, '0', done)
    })
  })

  describe('onerror', function () {
    it('should be invoked when error', function (done) {
      const err = new Error('boom!')
      let error

      function log (e) {
        error = e
      }

      request(createServer(err, { onerror: log }))
        .get('/')
        .end(function () {
          assert.equal(error, err)
          done()
        })
    })
  })
})
