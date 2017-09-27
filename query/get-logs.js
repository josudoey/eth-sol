const utils = require('web3/lib/utils/utils')

exports = module.exports = function (opts) {
  const param = {
    "topics": []
  }

  if (opts.from) {
    param.fromBlock = isNaN(opts.from) ? opts.from : utils.toHex(opts.from)
  }

  if (opts.to) {
    param.toBlock = isNaN(opts.to) ? opts.to : utils.toHex(opts.to)
  }

  if (opts.address) {
    param.address = opts.address.toLowerCase()
  }

  return {
    "jsonrpc": "2.0",
    "method": "eth_getLogs",
    "params": [param],
    id: Date.now()
  }
}

