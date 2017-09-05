const SolidityEvent = require("web3/lib/web3/event.js");
const Parser = function (contract) {
  if (!contract) {
    contract = {
      events: {}
    }
  }
  this.contract = contract
}

Parser.prototype.parse = function (log) {
  const contract = this.contract
  const logABI = contract.events[log.topics[0]]
  if (!logABI) {
    return
  }

  var decoder = new SolidityEvent(null, logABI, log.address);
  const e = decoder.decode(log);
  return e
}

exports = module.exports = function (contract) {
  return new Parser(contract)
}

