const ABI = require('ethjs-abi')
const eventSignature = ABI.eventSignature
const decodeEvent = ABI.decodeEvent

const Parser = function () {
  this.events = {}
}

Parser.prototype.append = function (abi) {
  for (const i of abi) {
    if (i.type !== 'event') {
      return
    }
    const sign = eventSignature(i)
    this.events[sign] = i
  }
}

Parser.prototype.parse = function (log) {
  const eventObject = this.events[log.topics[0]]
  if (!eventObject) {
    return
  }
  const useNumberedParams = true
  const e = decodeEvent(eventObject, log.data, log.topics, useNumberedParams)
  log.event = e._eventName
  log.args = e
  delete e._eventName
  return log
}

exports = module.exports = function (abi) {
  return new Parser(abi)
}

