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
const doh = require('dns-over-https')

const server = http.createServer(doh({
  servers: [
    '9.9.9.9', // quad9
    '8.8.8.8', // google
    '1.1.1.1', // cloudflare
  ]
}))

server.listen(3000)
```

# API

# License

MIT
