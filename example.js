const isBrowser = require('is-browser')
const https = require('https')
const http = require('http')
const doh = require('./')

let server = null
let app = null

if (isBrowser) {
  query()
} else {
  app = doh({
    servers: [
      'discovery1.datprotocol.com:5300',
      'localhost:5300',
      '9.9.9.9',
      '8.8.8.8',
      '1.1.1.1',
    ]
  })

  server = http.createServer(app).listen(3000, onlisten)
}

function onlisten() {
  console.log('onlisten', server.address())
  query()
}

function query() {
  const results = []
  const url = 'http://localhost:3000'
  //const url = 'https://dns.google.com:443/experimental'
  const lookups = [
    { type: 'TXT', name: '4662933590fc1b8a2af8aba8958c0b18058abc17.dns-discovery.local' }, // hyperdivision.dk
    { type: 'A', name: 'google.com'},
    { type: 'A', name: 'littlstar.com'},
    { type: 'A', name: 'twitter.com'},
  ]
  for (const lookup of lookups) {
    doh.query({url}, [lookup], (err, res) => {
      if (err) { throw err }
      results.push(res.answers)
      if (results.length == lookups.length) {
        console.log(results);
      }
    })
  }
}
