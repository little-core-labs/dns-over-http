dns-over-https
==============

HTTP(s) middleware and client for DNS over HTTPS (DoH)

# Abstract

DNS over HTTPS (DoH) is protocol designed for performing remote Domain
Name System resolution over HTTPS. Requests are made of HTTP to increase
user security and privacy. See [DNS over
HTTPS](https://en.wikipedia.org/wiki/DNS_over_HTTPS) for more
information.

This module provides a middleware function that can be directly passed
to the `http.createServer()` and `https.createServer()` functions for
handling DNS resolution. This module will use centralized DNS servers
for DNS queries and will cache answers from them for subsequent
requests. This module is a ***work-in-progres***.

# Installation

```sh
$ npm install dns-over-https
```

# Usage

***Creating a server***

```js
const https = require('https')
const doh = require('dns-over-https')

const serverOptions = getServerOptions() // with cert and key
const server = https.createServer(serverOptions, doh({
  maxAge: 1000 * 60 * 10, // 10 minute max TTL for any DNS record
  // centralized DNS servers
  servers: [
    '9.9.9.9', // quad9
    '8.8.8.8', // google
    '1.1.1.1', // cloudflare
  ]
}))

server.listen(3000)
```

You can also use the `http` module and position it behind a load
balancer or nginx instance configured SSL certificates.


****Querying for DNS resolution***


```js
const doh = require('dns-over-https')
const url = 'https://dns.google.com:443/experimental'

const results = []
const lookups = [
  {type: 'A', name: 'google.com'},
  {type: 'A', name: 'littlstar.com'},
  {type: 'A', name: 'twitter.com'},
]

for (const lookup of lookups) {
  doh.query({url}, [lookup], (err, res) => {
    if (err) { throw err }
    results.push(res.answers)
    if (results.length == lookups.length) {
      console.log(results)
    }
  })
}
```

# API

## `doh(opts)`

Returns a function handle suitable for a http server request callback
where `opts` can be:

```js
{
  servers: ['dns.example.com'], // centralized DNS servers
  store: null, // an optional storage interface
}
```

## `doh.query(opts, questions, cb)`

Make a DNS resolution query request. Options are passed directly to the
`http.request` function. `questions` are given to a
[dns-packet][https://github.com/mafintosh/dns-packet] encoding and sent
as a `POST` request with a `'application/dns-udpwireformat'` content
type.

# License

MIT
