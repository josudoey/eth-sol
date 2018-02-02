const ABI = require('ethjs-abi')
const utils = require('ethjs-abi/src/utils')
const encodeParams = ABI.encodeParams
const encodeSignature = ABI.encodeSignature
exports = module.exports = function (abi, unlinked_binary) {
  if (unlinked_binary) {
    const defaultConstructor ={
      "inputs": [],
      "payable": false,
      "type": "constructor"
    }
    const encode = abi['constructor'] = function () {
      const values = Array.prototype.slice.call(arguments);
      const count = values.length
      if (count !== 0) {
        throw new Error(`[ethjs-abi] while encoding params, types/values mismatch, Your contract requires 0 types (arguments), and you passed in ${count}`)
      }
      return unlinked_binary
    }
    const props = ['constant', 'inputs', 'name', 'outputs', 'payable', 'type']
    props.forEach(function (name) {
      Object.defineProperty(encode, name, {
        enumerable: true,
        get: function () {
          return defaultConstructor[name]
        }
      })
    })
  }

  abi.forEach(function (method) {
    const type = method.type
    let methodName = method.name || 'constructor'
    let signatureEncoded = encodeSignature(method)
    if (methodName === 'constructor') {
      signatureEncoded = unlinked_binary
    }

    let encode = abi[methodName] = function () {
      const values = Array.prototype.slice.call(arguments);
      const paramsEncoded = encodeParams(utils.getKeys(method.inputs, 'type'), values).substring(2);
      return `${signatureEncoded}${paramsEncoded}`
    }

    encode.decode = function (returns) {
      return ABI.decodeMethod(method, returns)
    }

    const props = ['constant', 'inputs', 'name', 'outputs', 'payable', 'type']
    props.forEach(function (name) {
      Object.defineProperty(encode, name, {
        enumerable: true,
        get: function () {
          return method[name]
        }
      })
    })
  })
  return abi
}