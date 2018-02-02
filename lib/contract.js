const fs = require('fs')
const path = require('path')
const globby = require('globby')
const once = require('once')
const contractWrap = require('./contract-wrap')
exports = module.exports = {}

const contractDir = path.resolve(__dirname + '/../truffle/build/contracts')
const contractPath = globby.sync('*.json', {
  cwd: contractDir,
  absolute: false,
  nodir: true
})
for (const filename of contractPath) {
  const name = filename.replace(/.json$/, '')
  Object.defineProperty(exports, name, {
    enumerable: true,
    get: once(function () {
      const json = JSON.parse(fs.readFileSync(path.join(contractDir, filename)))
      const contract = contractWrap(json.abi, json.unlinked_binary)
      return contract
    })
  })
}

