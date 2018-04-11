const debug = require('debug')('dns-over-http:store')
const lru = require('lru-cache')

class RecordStore {
  constructor(opts) {
    this.stores = {}
    this.opts = opts
  }

  store(port, host) {
    const key = hash(port, host)
    if (false == key in this.stores) {
      this.stores[key] = lru(this.opts)
    }
    return this.stores[key]
  }

  set(port, host, name, record, ttl) {
    const store = this.store(port, host)
    const key = hash(name, record.data)
    store.set(key, record, ttl)
    debug("store: set: port=%s host=%s name=%s ttl=%s",
      port, host, name, ttl, record)
    return this
  }

  get(port, host, name) {
    const store = this.store(port, host)
    return store.values().filter((record) => name == record.name)
  }

  has(port, host, name, record) {
    const store = this.store(port, host)
    const key = hash(name, record.name)
    return store.has(key)
  }

  remove(port, host, name, record) {
    const store = this.store(port, host)
    const key = hash(name, record.name)
    return store.del(key)
  }

  reset() {
    for (const k in this.stores) {
      if ('function' == typeof this.stores[k].reset) {
        this.stores[k].reset()
        delete this.stores[k]
      }
    }
  }
}

function hash(...args) {
  return Buffer.concat(args.map((x) => Buffer.from(String(x)))).toString('hex')
}

function createRecordStore(opts) {
  return new RecordStore(opts)
}

module.exports = Object.assign(createRecordStore, {
  RecordStore
})
