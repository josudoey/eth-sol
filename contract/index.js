const fs = require('fs')
const path = require('path')
const globby = require('globby')
const camelCase = require('camelcase')
const once = require('once')
exports = module.exports = {}

const abiPath = globby.sync('*.abi', {
  cwd: __dirname,
  absolute: false,
  nodir: true
})
for (const name of abiPath) {
  const key = camelCase(name.replace(/.abi$/, ''))
  if (!(key in exports)) {
    exports[key] = {}
  }
  const o = exports[key]
  Object.defineProperty(o, 'interface', {
    enumerable: true,
    get: once(function () {
      return JSON.parse(fs.readFileSync(path.join(__dirname, name)))
    })
  })
}

const binPath = globby.sync('*.bin', {
  cwd: __dirname,
  absolute: false,
  nodir: true
})
for (const name of binPath) {
  const key = camelCase(name.replace(/.bin$/, ''))
  if (!(key in exports)) {
    exports[key] = {}
  }
  const o = exports[key]
  Object.defineProperty(o, 'bytecode', {
    enumerable: true,
    get: once(function () {
      return fs.readFileSync(path.join(__dirname, name)).toString()
    })
  })
}

