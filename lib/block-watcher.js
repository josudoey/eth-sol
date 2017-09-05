const Web3 = require('web3')
const ProviderEngine = require("web3-provider-engine")
const Web3Subprovider = require("web3-provider-engine/subproviders/web3.js")
exports = module.exports = function (providerUrl) {
  const engine = new ProviderEngine();
  engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(providerUrl)));
  return engine
}

