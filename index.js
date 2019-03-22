const { EventEmitter } = require('events')
const isBrowser = require('is-browser')
const DNSSocket = require('dns-socket')
const accept = require('accept')
const extend = require('extend')
const packet = require('dns-packet')
const debug = require('debug')('dns-over-http')
const randi = require('random-int')
const store = require('./store')
const https = require('https')
const http = require('http')
const cors = require('cors')
const lru = require('lru-cache')
const url = require('url')
const qs = require('qs')

const kRequestContentType = 'application/dns-udpwireformat'

const mix = (t, X) => Object.assign(t, new X(), X.prototype)

function doh(opts, cb) {
  if (!opts || 'object' != typeof opts) {
    opts = {}
  }

  if ('function' == typeof opts) {
    cb = opts
    opts = {}
  }

  const preamble = (req, res) => cors()(req, res, () => onrequest(req, res))
  const handle = mix(preamble, EventEmitter)

  if (opts.server) {
    opts.servers = Array.isArray(opts.server) ? opts.server : [opts.server]
    delete opts.server
  }

  if (opts.servers && false == Array.isArray(opts.servers)) {
    opts.servers = [opts.servers]
  }

  if (false == Array.isArray(opts.servers)) {
    opts.servers = []
  }

  opts.servers = opts.servers.map(parseAddress)
  opts.store = opts.store || store(opts)

  return handle

  function onrequest(req, res) {
    const accepts = accept.parseAll(req.headers)
    const socket = new DNSSocket()
    const query = qs.parse(req.url.split('?')[1])
    const rinfo = req.socket.address()

    if (kRequestContentType === accepts[0]) {
      res.setHeader('Content-Type', kRequestContentType)
    } else {
      res.setHeader('Content-Type', 'text/json')
    }

    debug("onrequest:", rinfo)

    req.on('readable', onreadable)
    req.on('data', ondata)

    socket.on('response', onresponse)
    socket.on('query', onquery)
    socket.on('error', onerror)

    handle.emit('request', req, res)
    handle.emit('socket', socket)

    if (query && query.type && query.name) {
      ondata(createPacket({ questions: [ query ] }))
    }

    function onerror(err) {
      debug("onerror:", err)
      handle.emit('error', err)
    }

    function ondata(buffer) {
      try {
        const payload = JSON.parse(buffer)
        buffer = createPacket(payload)
      } catch (err) {
      }

      socket.socket.emit('message', buffer, rinfo)
    }

    function onreadable() {
      debug("onreadable")
      for (let buffer = req.read(); buffer; buffer = req.read()) {
        ondata(buffer)
      }
    }

    function onresponse(query, port, address) {
      debug("onresponse:", query)
      if (query && query.answers) {
        for (const answer of query.answers) {
          onanswer(answer, port, address)
        }
      }

      if (kRequestContentType === accepts[0]) {
        res.end(packet.encode(query))
      } else {
        query.answers = query.answers.map((answer) => Object.assign(answer, {
          data: serialize(answer.data)
        }))

        res.end(JSON.stringify(query))

        function serialize(data) {
          if (Buffer.isBuffer(data)) {
            return data.toString('base64')
          } else if (Array.isArray(data)) {
            return data.map(serialize)
          } else {
            return data
          }
        }
      }
    }

    function onquery(query, port, address) {
      debug("onquery:", query, port, address)
      const { questions } = query
      const answers = []
      const reply = { questions, answers }

      for (let i = 0; i < opts.servers.length; ++i) {
        const server = opts.servers[i]
        const ports = [server.port, server.secondaryPort]
        for (let j = 0; j < ports.length; ++j) {
          for (const question of query.questions) {
            onquestion(question, ports[j], server.host, answers)
          }

          for (const answer of query.answers) {
            onanswer(answer, ports[j], server.host)
          }
        }
      }

      if (opts.servers.length && 0 == reply.answers.length) {
        probe(socket, reply, onprobe)
      } else {
        onresponse(reply, port, address)
      }
    }

    function onprobe(err) {
      debug("onprobe")
    }

    function onquestion(question, port, host, answers) {
      debug("onquestion:", question)
      const records = opts.store.get(port, host, question.name)
      for (const record of records) {
        switch (question.type) {
          case 'A':
            answers.push({
              type: 'A',
              name: question.name,
              ttl: record.ttl,
              data: record.data
            })
            break

          case 'SRV':
            answers.push({
              type: 'A',
              name: question.name,
              ttl: record.ttl,
              data: { host: record.host, port: record.port }
            })
            break

          case 'TXT':
            answers.push({
              type: 'TXT',
              name: question.name,
              ttl: record.ttl,
              data: record.data
            })
            break
        }
      }
    }

    function onanswer(answer, port, host) {
      debug("onanswer:", answer)
      if (false == opts.store.has(port, host, answer.name, answer)) {
        const ttl = Math.floor(answer.ttl*1000)
        opts.store.set(port, host, answer.name, answer, ttl)
      }
    }
  }

  function probe(socket, query, cb) {
    let success = false
    let pending = 0
    for (let i = 0; i < opts.servers.length; ++i) {
      const server = opts.servers[i]
      const ports = [server.port, server.secondaryPort]
      debug("probe: server:", server)

      pending++
      send()

      function send() {
        const { host } = server
        const port = ports.shift()

        debug("probe: server: query: send: %s:%s:", port, host, query)
        try { socket.query(query, port, host, ontry) }
        catch (err) {
          if (ports.length) { return send() }
          else { cb(err) }
        }
      }

      function onprobe(err, res, port, host) {
        if (!res || err) { success = false }
        if (0 == --pending) {
          cb(success ? null : new Error("probe: Query failed"))
        }
      }

      function ontry(err, res, port, host) {
        debug("probe: server: query: send: try: %s:%s:", port, host, res)
        if ((err || !res) && ports.length) {
          return send()
        }

        onprobe(err, res, port, host)
      }
    }
  }
}

function request(opts, cb) {
  if (!opts || 'object' != typeof opts) {
    throw new TypeError("Expecting an object")
  }

  if (!opts.packet || false == Buffer.isBuffer(opts.packet)) {
    throw new TypeError("Expecting packet to be a buffer")
  }

  opts = configure()
  if ('https:' == opts.protocol) {
    opts.https = https
  } else if ('http:' == opts.protocol) {
    opts.https = http
  } else {
    opts.https = opts.https || opts.http || https
  }

  const req = opts.https.request(opts, onresponse)

  if ('function' == typeof cb) {
    req.on('error', (err) => cb(err))
  }

  req.write(opts.packet)
  req.end()
  return req

  function configure() {
    const defaults = {
      method: 'POST',
      headers: {
        'Accept': isBrowser ? 'application/json' : kRequestContentType,
        'Content-Type': isBrowser ? 'application/json' : kRequestContentType,
        'Content-Length': Buffer.byteLength(opts.packet)
      }
    }

    const extended = opts.host
      ? url.parse(opts.host)
      : opts.url || opts.uri
        ? url.parse(opts.url || opts.uri)
        : {}

    opts = extend(true, {}, opts, defaults, extended)
    debug("request: configure:", opts)
    return opts
  }

  function onresponse(res) {
    debug("request: onresponse")
    res.on('data', (data) => {
      try {
        const payload = packet.decode(data)
        if ('function' == typeof cb) {
          cb(null, payload)
        }
        req.emit('packet', payload)
      } catch (err) {
        try {
          const payload = JSON.parse(data)
          if ('function' == typeof cb) {
            cb(null, payload)
          }
          req.emit('packet', payload)
        } catch (err) {
          req.emit('error', err)
        }
      }
    })
  }
}

function createPacket(opts) {
  if (!opts || 'object' != typeof opts) {
    throw new TypeError("Expecting an object")
  }

  const encoded = packet.encode(extend(true, {
    // defaults
    flags: packet.RECURSION_DESIRED,
    type: 'query',
    id: randi(0x0, 0xffff),
  }, opts))

  if (isBrowser) {
    return Buffer.from(JSON.stringify(packet.decode(encoded)))
  }

  return encoded
}

function query(opts, questions, cb) {
  if ('string' == typeof opts) {
    opts = {host: opts}
  }

  if (!opts || 'object' != typeof opts) {
    throw new TypeError("Expecting ")
  }

  if ('function' == typeof questions) {
    cb = questions
    questions = null
  }

  return request(extend(true, {
    packet: questions ? createPacket({questions}) : null,
  }, opts), cb)
}

// ported from https://github.com/mafintosh/dns-discovery/blob/master/index.js
function parseAddress(address) {
  if ('string' != typeof address) {
    return null
  }

  if (-1 == address.indexOf(':')) {
    address += ':53,5300'
  }

  const regex = /^([^:]+)(?::(\d{1,5})(?:,(\d{1,5}))?)?$/
  const match = address.match(regex)

  if (null == match) {
    throw new Error(`parseAddress: Could not parse: ${address}`)
  }

  const host = match[1] || null
  const port = parseInt(match[2] || 53)
  const secondaryPort = parseInt(match[3] || 0)

  return { host, port, secondaryPort }
}

module.exports = Object.assign(doh, {
  createPacket,
  request,
  packet,
  query,
})
