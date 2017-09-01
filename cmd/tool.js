const globby = require('globby')
const rp = require('request-promise')
const fs = require('fs')
const path = require('path')
const env = process.env
const Web3 = require('web3')
const co = require('co')
const delay = require('delay')
const sjcl = require('sjcl')
const bip39 = require('bip39');
const bluebird = require('bluebird')
const prompt = require('prompt-sync')({
  sigint: true,
  echo: '*'
});

module.exports = function (prog) {
  prog.option('--keystore <keystote>', 'keystore path default: ./keystote', __dirname + "/../keystore")
  prog.option('--use <address>', 'use wallet address (env["ETHERBASE"] or defualt: "0")', env.ETHERBASE || '0')
  prog.option('--rpcapi <url>', 'use HTTP-RPC interface (env["RPCAPI"] or defualt: "http://localhost:8545")', env.RPCAPI || "http://localhost:8545")
  prog.option('--password <password>', 'use HTTP-RPC interface (env["PASSWORD"] or defualt: "")', env.PASSWORD || "")
  prog.option('--wallet <path>', 'wallet file path(env["WALLET"] or defualt: "./.wallet")', env.PASSWORD || path.resolve(__dirname + '/../.wallet'))
  prog.option('--index <index>', 'wallet use index default: 0')

  let web3, eth, wallet, mnemonic
  const getNewPassword = function () {
    let password = ''
    while (true) {
      password = prompt('new password: ', {
        echo: '*'
      })
      if (!password) {
        continue
      }
      let password2 = prompt('retype new password: ', {
        echo: '*'
      })

      if (password !== password2) {
        console.log('password not match')
        continue
      }
      break
    }
    return password
  }
  const initForWeb3 = function () {
    web3 = new Web3(new Web3.providers.HttpProvider(prog.rpcapi));
    eth = bluebird.promisifyAll(web3.eth)
    web3.eth = eth
  }
  const initForWallet = function () {
    const walletPath = prog.wallet
    const exists = fs.existsSync(walletPath)
    if (!exists) {
      mnemonic = prompt('input seed mnemonic word [empty is random]:')
      if (!mnemonic) {
        mnemonic = bip39.generateMnemonic()
      }
      const password = getNewPassword()
      const ciphertext = sjcl.encrypt(password, mnemonic)
      console.log(`write wallet secret on ${walletPath}`)
      fs.writeFileSync(walletPath, ciphertext)
    } else {
      const ciphertext = fs.readFileSync(walletPath).toString()
      try {
        const password = prompt('enter password: ', {
          echo: '*'
        })
        mnemonic = sjcl.decrypt(password, ciphertext)
      } catch (e) {
        console.log('password not match')
        process.exit(-1)
      }
    }
    wallet = require('../lib/wallet')(mnemonic)
    if (prog.index) {
      wallet = wallet.index(parseInt(prog.index))
    }

  }
  const init = function () {
    initForWeb3()
    initForWallet()
  }

  prog
    .command('mnemonic')
    .description('show wallet mnemonic')
    .action(co.wrap(function* (opts) {
      init()
      console.log(`${mnemonic}`)
    }))

  prog
    .command('chpasswd')
    .description('change wallet password')
    .action(co.wrap(function* (opts) {
      init()
      const walletPath = prog.wallet
      const password = getNewPassword()
      const ciphertext = sjcl.encrypt(password, mnemonic)
      fs.writeFileSync(walletPath, ciphertext)
      console.log(`password change success`)
    }))

  prog
    .command('balance [address]')
    .description('query wallet balance')
    .action(co.wrap(function* (address, opts) {
      if (!address) {
        initForWallet()
        address = wallet.address
      }
      initForWeb3()
      const balance = yield web3.eth.getBalanceAsync(address)
      console.log(`${address} balance: ${balance.toString()}`)
    }))

  prog
    .command('show [name] [args...]')
    .description('show contract method')
    .action(co.wrap(function* (name, args, opts) {
      const contracts = require('../lib/contracts')
      if (!name) {
        for (const key of Object.keys(contracts)) {
          console.log(key)
        }
        return
      }

      const item = contracts[name]
      const abi = item.abi
      for (const i of abi) {
        const display = i.inputs.map(function (o) {
          return `${o.type} ${o.name}`
        }).join(", ")

        let methodName = (i.name) ? ` ${i.name}` : ""
        let returns = ""
        let hasConstant = (i.constant) ? " constant" : ""
        let hasPayable = (i.payable) ? " payable" : ""
        if (i.type === 'function' && i.outputs.length) {
          const display = i.outputs.map(function (o) {
            return `${o.type} ${o.name}`
          }).join(", ")
          returns = ` returns (${display})`
        }

        console.log(`${i.type}${hasPayable}${methodName}(${display})${hasConstant}${returns};`)
      }

    }))

  prog
    .command('price')
    .description('Returns the current gas price oracle. The gas price is determined by the last few blocks median gas price.')
    .action(co.wrap(function* (opts) {
      initForWeb3()

      const result = yield eth.getGasPriceAsync()
      console.log(`gas price: ${result}`)
    }))

  prog
    .command('tx <hash>')
    .option('--contract <contractName>', 'for event decode')
    .description('Returns a transaction matching the given transaction hash.')
    .action(co.wrap(function* (hash, opts) {
      initForWeb3()

      const result = yield eth.getTransactionReceiptAsync(hash)
      console.log(JSON.stringify(result, null, 4))
      if (!opts.contract) {
        return
      }

      const contracts = require('../lib/contracts')
      const contract = contracts[opts.contract]
      const SolidityEvent = require("web3/lib/web3/event.js");

      for (const log of result.logs) {
        var logABI = contract.events[log.topics[0]];
        if (logABI == null) {
          console.log('unknown')
          continue;
        }

        var decoder = new SolidityEvent(null, logABI, result.to);
        const e = decoder.decode(log);
        const eventName = e.event
        const args = e.args
        let item = `${e.logIndex} ${eventName}`
        const inputs = logABI.inputs.map(function (input) {
          const name = input.name
          const val = args[name]
          item += ` ${name}:${val.toString()}`
        })
        console.log(item)
      }
    }))

  prog
    .command('transfer <to> <wei>')
    .option('--gas <gasLimit>', 'gas limit')
    .option('--price <gasPrice>', 'gas price')
    .option('--nonce <nonce>', 'tx nonce', undefined)
    .option('--wait', 'wait receipt until block mine')
    .option('--delay [delay]', 'retry receipt delay', 1000)
    .option('--retry [retry]', 'retry receipt query', 60)
    .option('--send', 'send tx')
    .description('transfer value')
    .action(co.wrap(function* (to, value, opts) {
      init()

      const from = wallet.address
      if (!opts.gas) {
        opts.gas = yield eth.estimateGasAsync({
          to: to
        })
      }

      if (!opts.price) {
        opts.price = yield eth.getGasPriceAsync()
        opts.price += 1
      }

      console.log(`${from} to ${to} ${value} wei gas:${opts.gas} gasPrice:${opts.price}`)

      if (!opts.send) {
        return
      }

      const Tx = require('ethereumjs-tx');
      let count = yield eth.getTransactionCountAsync(from)
      var rawTx = {
        nonce: web3.toHex(opts.nonce || count),
        gasPrice: web3.toHex(opts.price),
        gasLimit: web3.toHex(opts.gas),
        to: to,
        value: web3.toHex(value),
        data: '0x'
      }
      const tx = new Tx(rawTx);
      tx.sign(wallet.getPrivateKey());
      const serializedTx = tx.serialize();
      const json = {}
      json['hash'] = '0x' + tx.hash().toString('hex')
      json['nonce'] = web3.toDecimal('0x' + tx.nonce.toString('hex'))
      json['gasLimit'] = web3.toDecimal('0x' + tx.gasLimit.toString('hex'))
      json['gasPrice'] = web3.toDecimal('0x' + tx.gasPrice.toString('hex'))
      json['input'] = '0x' + tx.input.toString('hex')
      json['to'] = '0x' + tx.to.toString('hex')
      json['value'] = web3.toDecimal('0x' + tx.value.toString('hex'))
      json['v'] = '0x' + tx.v.toString('hex')
      json['r'] = '0x' + tx.r.toString('hex')
      json['s'] = '0x' + tx.s.toString('hex')
      console.log(json)
      if (!opts.send) {
        return;
      }

      const hash = yield eth.sendRawTransactionAsync('0x' + serializedTx.toString('hex'))
      console.log(hash)
      if (!opts.wait) {
        return
      }
      for (let i = 0; i < opts.retry; i++) {
        const receipt = yield web3.eth.getTransactionReceiptAsync(hash)
        if (!receipt) {
          yield delay(opts.delay)
          continue
        }
        console.log(JSON.stringify(receipt, null, 4))
        return
      }
      console.error('wait timeout')

    }))

  prog
    .command('deploy <name> [args...]')
    .option('--value <value>', 'pay value wei', '0')
    .option('--gas <gasLimit>', 'gas limit', '')
    .option('--price <gasPrice>', 'gas price', '')
    .option('--wait', 'wait receipt until block mine')
    .option('--delay [delay]', 'retry receipt delay', 1000)
    .option('--retry [retry]', 'retry receipt query', 60)
    .option('--send', 'send tx')
    .description('deploy one eth contract to network')
    .action(co.wrap(function* (name, args, opts) {
      const contracts = require('../lib/contracts')
      if (!(name in contracts)) {
        console.error(`"${name}" contract not found`)
        return;
      }
      init()

      const item = contracts[name]
      const abi = item.abi
      let constructor
      for (const i of abi) {
        if (i.type === 'constructor') {
          constructor = i
        }
      }

      if (constructor.inputs.length !== args.length) {
        const display = constructor.inputs.map(function (o) {
          return `<${o.name} ${o.type}>`
        }).join(" ")
        console.error(`usage: deploy ${name} ${display}`)
        return;
      }

      //ref https://github.com/ethereum/web3.js/blob/1.0/packages/web3-eth-contract/src/index.js
      //
      const ethContract = require('web3-eth-contract')
      const contract = new ethContract(item.abi)
      const deploy = contract.deploy({
        arguments: args,
        data: item.binary.toString('hex')
      })
      const data = deploy.encodeABI()

      const from = wallet.address
      const value = (constructor.payable) ? opts.value : 0
      if (!opts.gas) {
        opts.gas = yield eth.estimateGasAsync({
          from: from,
          value: value,
          data: data
        })
      }
      if (!opts.price) {
        opts.price = yield eth.getGasPriceAsync()
        opts.price += 1
      }

      console.log(`deploy "${name}" contract from:${from} ${(value)?"value:"+value+" ":""}gas:${opts.gas} price:${opts.price}`)

      const Tx = require('ethereumjs-tx');
      if (!opts.nonce) {
        opts.nonce = yield eth.getTransactionCountAsync(from)
      }
      var rawTx = {
        nonce: web3.toHex(opts.nonce),
        gasPrice: web3.toHex(opts.price),
        gasLimit: web3.toHex(opts.gas),
        to: '0x',
        value: web3.toHex(value),
        data: data
      }

      console.log(rawTx)
      const tx = new Tx(rawTx);
      tx.sign(wallet.getPrivateKey());
      const serializedTx = tx.serialize();
      const json = {}
      json['hash'] = '0x' + tx.hash().toString('hex')
      json['nonce'] = web3.toDecimal('0x' + tx.nonce.toString('hex'))
      json['gasLimit'] = web3.toDecimal('0x' + tx.gasLimit.toString('hex'))
      json['gasPrice'] = web3.toDecimal('0x' + tx.gasPrice.toString('hex'))
      json['to'] = '0x' + tx.to.toString('hex')
      json['input'] = '0x' + tx.input.toString('hex')
      json['value'] = (tx.value.length) ? web3.toDecimal('0x' + tx.value.toString('hex')) : 0
      json['v'] = '0x' + tx.v.toString('hex')
      json['r'] = '0x' + tx.r.toString('hex')
      json['s'] = '0x' + tx.s.toString('hex')
      console.log(json)
      if (!opts.send) {
        return;
      }

      const hash = yield eth.sendRawTransactionAsync('0x' + serializedTx.toString('hex'))
      console.log(hash)
      if (!opts.wait) {
        return
      }
      for (let i = 0; i < opts.retry; i++) {
        const receipt = yield web3.eth.getTransactionReceiptAsync(hash)
        if (!receipt) {
          yield delay(opts.delay)
          continue
        }
        console.log(JSON.stringify(receipt, null, 4))
        return
      }
      console.error('wait timeout')

    }))

  prog
    .command('call <name> <at> <method> [args...]')
    .option('--value <value>', 'pay value wei', '0')
    .option('--gas <gasLimit>', 'gas limit', '')
    .option('--price <gasPrice>', 'gas price', '')
    .option('--wait', 'wait receipt until block mine')
    .option('--delay [delay]', 'retry receipt delay', 1000)
    .option('--retry [retry]', 'retry receipt query', 60)
    .option('--send', 'send tx')
    .description('call one eth contract method')
    .action(co.wrap(function* (name, at, methodName, args, opts) {
      const contracts = require('../lib/contracts')
      if (!(name in contracts)) {
        console.error(`"${name}" contract not found`)
        return;
      }
      init()

      const item = contracts[name]
      const abi = item.abi
      let method
      for (const i of abi) {
        if (i.type === 'function' && i.name === methodName) {
          method = i
        }
      }
      if (!method) {
        console.error(`"${name}" contract not define method "${methodName}"`)
        return
      }

      if (method.inputs.length !== args.length) {
        const display = method.inputs.map(function (o) {
          return `<${o.name} ${o.type}>`
        }).join(" ")
        console.error(`usage: call ${at} ${name} ${methodName} ${display}`)
        return;
      }

      const from = wallet.address
      const value = (constructor.payable) ? opts.value : 0

      const ethContract = require('web3-eth-contract')
      const contract = new ethContract(item.abi, at)
      const func = contract.methods[methodName].apply(null, args)
      const data = func.encodeABI()

      if (!opts.gas) {
        opts.gas = yield eth.estimateGasAsync({
          from: from,
          to: at,
          value: value,
          data: data
        })
      }

      if (!opts.price) {
        opts.price = yield eth.getGasPriceAsync()
        opts.price += 1
      }

      console.error(`"${name}" contract at:${at} call method "${methodName}" ${(value)?"value:"+value+" ":""}gas:${opts.gas} price:${opts.price}`)

      if (!opts.send) {
        const SolidityFunction = require("web3/lib/web3/function.js");
        const funcAbi = abi.filter(function (json) {
          return json.name === methodName
        })[0]
        const solidityFunction = new SolidityFunction(null, funcAbi, at)
        const result = yield eth.callAsync({
          from: from,
          to: at,
          value: value,
          data: data,
          gas: opts.gas,
          gasPrice: opts.price
        }).catch(function (err) {
          console.log(err)
        })

        console.log(solidityFunction.unpackOutput(result).toString())
        return;
      }

      const Tx = require('ethereumjs-tx');
      if (!opts.nonce) {
        opts.nonce = yield eth.getTransactionCountAsync(from)
      }
      var rawTx = {
        nonce: web3.toHex(opts.nonce),
        gasPrice: web3.toHex(opts.price),
        gasLimit: web3.toHex(opts.gas),
        to: at,
        value: web3.toHex(value),
        data: data
      }

      const tx = new Tx(rawTx);
      tx.sign(wallet.getPrivateKey());
      const serializedTx = tx.serialize();
      const json = {}
      json['hash'] = '0x' + tx.hash().toString('hex')
      json['nonce'] = web3.toDecimal('0x' + (tx.nonce.toString('hex') || '00'))
      json['gasLimit'] = web3.toDecimal('0x' + tx.gasLimit.toString('hex'))
      json['gasPrice'] = web3.toDecimal('0x' + tx.gasPrice.toString('hex'))
      json['to'] = '0x' + tx.to.toString('hex')
      json['input'] = '0x' + tx.input.toString('hex')
      json['value'] = (tx.value.length) ? web3.toDecimal('0x' + tx.value.toString('hex')) : 0
      json['v'] = '0x' + tx.v.toString('hex')
      json['r'] = '0x' + tx.r.toString('hex')
      json['s'] = '0x' + tx.s.toString('hex')
      console.log(json)

      const hash = yield eth.sendRawTransactionAsync('0x' + serializedTx.toString('hex'))
      console.log(hash)
      if (!opts.wait) {
        return
      }
      for (let i = 0; i < opts.retry; i++) {
        const receipt = yield web3.eth.getTransactionReceiptAsync(hash)
        if (!receipt) {
          yield delay(opts.delay)
          continue
        }
        console.log(JSON.stringify(receipt, null, 4))
        return
      }
      console.error('wait timeout')

    }))

  prog
    .command('getLogs <address>')
    .option('--from <from>', 'integer block number (default:"earliest")', 'earliest')
    .option('--to <to>', 'integer block number (default:"latest")', 'latest')
    .option('--contract <contractName>', 'for event decode')
    .description('get log')
    .action(co.wrap(function* (address, opts) {
      initForWeb3()
      const providerUrl = prog.rpcapi
      const body = {
        "jsonrpc": "2.0",
        "method": "eth_getLogs",
        "params": [{
          "fromBlock": isNaN(opts.from) ? opts.from : web3.toHex(opts.from),
          "toBlock": isNaN(opts.to) ? opts.to : web3.toHex(opts.to),
          "address": address.toLowerCase(),
          "topics": []
        }],
        id: Date.now()
      }

      var options = {
        method: 'POST',
        uri: providerUrl,
        body: body,
        json: true // Automatically stringifies the body to JSON
      };

      const contracts = require('../lib/contracts')
      let contract = contracts[opts.contract]
      if (!contract) {
        contract = {
          events: {}
        }
      }
      const SolidityEvent = require("web3/lib/web3/event.js");

      const resp = yield rp(options)
      for (const log of resp.result) {
        var logABI = contract.events[log.topics[0]];
        if (!logABI) {
          console.log(JSON.stringify(log, null, 4))
          continue;
        }

        var decoder = new SolidityEvent(null, logABI, log.address);
        const e = decoder.decode(log);
        const blockNumber = e.blockNumber
        const eventName = e.event
        const args = e.args
        let item = `${blockNumber} ${eventName}`
        const inputs = logABI.inputs.map(function (input) {
          const name = input.name
          const val = args[name]
          item += ` ${name}:${val.toString()}`
        })
        console.log(item)

      }

    }))

  prog
    .command('watch <address>')
    .option('--contract <contractName>', 'for event decode')
    .description('watch ')
    .action(co.wrap(function* (address, opts) {
      initForWeb3()
      const ProviderEngine = require("web3-provider-engine");
      const Web3Subprovider = require("web3-provider-engine/subproviders/web3.js");
      const providerUrl = prog.rpcapi
      let lastHeight = null
      const engine = new ProviderEngine();
      engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(providerUrl)));
      engine.on('block', co.wrap(function* (block) {
        console.log('BLOCK CHANGED:', '#' + web3.toDecimal('0x' + block.number.toString('hex')), '0x' + block.hash.toString('hex'))

        if (!lastHeight) {
          lastHeight = '0x' + block.number.toString('hex')
          return;
        }

        lastHeight = '0x' + block.number.toString('hex')
        const body = {
          "jsonrpc": "2.0",
          "method": "eth_getLogs",
          "params": [{
            "fromBlock": lastHeight,
            "toBlock": "latest",
            "address": address.toLowerCase(),
            "topics": []
          }],
          id: Date.now()
        }

        var options = {
          method: 'POST',
          uri: providerUrl,
          body: body,
          json: true // Automatically stringifies the body to JSON
        };

        const contracts = require('../lib/contracts')
        let contract = contracts[opts.contract]
        if (!contract) {
          contract = {
            events: {}
          }
        }
        const SolidityEvent = require("web3/lib/web3/event.js");

        const resp = yield rp(options)
        for (const log of resp.result) {
          var logABI = contract.events[log.topics[0]];
          if (!logABI) {
            console.log(JSON.stringify(log, null, 4))
            continue;
          }

          var decoder = new SolidityEvent(null, logABI, log.address);
          const e = decoder.decode(log);
          const blockNumber = e.blockNumber
          const eventName = e.event
          const args = e.args
          let item = `${blockNumber} ${eventName}`
          const inputs = logABI.inputs.map(function (input) {
            const name = input.name
            const val = args[name]
            item += ` ${name}:${val.toString()}`
          })
          console.log(item)

        }
      }))
      engine.start()

    }))

}

