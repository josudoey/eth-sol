//ref https://github.com/ethereumjs/ethereumjs-wallet/blob/master/hdkey.js
const hdkey = require('ethereumjs-wallet/hdkey');
const bip39 = require('bip39');

//ref https://github.com/ethereumjs/ethereumjs-wallet/blob/master/index.js
exports = module.exports = function (mnemonic) {
  const hdpath = "m/44'/60'/0'/0";
  const node = hdkey.fromMasterSeed(bip39.mnemonicToSeed(mnemonic)).derivePath(hdpath);
  const index = function (i) {
    const key = node.deriveChild(i)
    const wallet = key.getWallet();
    wallet.index = index
    Object.defineProperty(wallet, 'address', {
      get: function () {
        return '0x' + wallet.getAddress().toString('hex');
      },
      enumerable: true,
      configurable: false
    });
    return wallet
  }
  return index(0)
}

