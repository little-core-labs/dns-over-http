const https = require('https')
const http = require('http')
const doh = require('./')

const app = doh({
  servers: [
    '9.9.9.9',
    '8.8.8.8',
    '1.1.1.1',
  ]
})

const server = http.createServer(app)

server.listen(3000, onlisten)

function onlisten() {
  console.log('onlisten', server.address())
  query()
}

function query() {
  const results = []
  const url = 'http://localhost:3000'
  //const url = 'https://dns.google.com:443/experimental'
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
}
