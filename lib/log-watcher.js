const merge = require('merge')
const utils = require('web3/lib/utils/utils')
const Query = require('./query/get-logs')
const rp = require('request-promise')
const EventEmitter = require('events').EventEmitter
exports = module.exports = function (opts) {
  const instance = new EventEmitter()
  opts = merge({
    rpcapi: 'http://localhost:8545',
    from: null
  }, opts)

  const rpcapi = opts.rpcapi
  const address = opts.address
  let latestHeight
  let from = opts.from
  let lock = false
  let needReq = false
  const triggerGetLog = function () {
    if (lock) {
      needReq = true
      return
    }
    lock = true
    needReq = false
    const reqLast = latestHeight
    if (!from) {
      from = reqLast
    }
    let to = reqLast
    const body = Query({
      from: from,
      to: to,
      address: address
    })
    const options = {
      method: 'POST',
      uri: rpcapi,
      body: body,
      json: true
    };

    rp(options).then(function (resp) {
      if (!resp.result) {
        return
      }
      for (const log of resp.result) {
        instance.emit('log', log)
      }
      from = to + 1
      instance.emit('block', reqLast)
    }, function (err) {}).then(function () {
      lock = false
      if (needReq) {
        triggerGetLog()
      }
    })
  }

  const engine = require('./block-watcher')(rpcapi);
  engine.on('block', function (block) {
    latestHeight = utils.toDecimal('0x' + block.number.toString('hex'))
    triggerGetLog()
  })
  instance.start = function () {
    engine.start()
  }
  return instance
}

