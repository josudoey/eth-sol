const globby = require('globby')
const fs = require('fs')
const path = require('path')
const env = process.env
const Web3 = require('web3')
const co = require('co')

//ref http://web3js.readthedocs.io/en/1.0/web3-eth.html

module.exports = function (prog) {
  prog.option('--keystore <keystote>', 'keystore path default: ./keystote', __dirname + "/../keystore")
  prog.option('--use <address>', 'use wallet address (env["ETHERBASE"] or defualt: "0")', env.ETHERBASE || '0')
  prog.option('--rpcapi <url>', 'use HTTP-RPC interface (env["RPCAPI"] or defualt: "http://localhost:8545")', env.RPCAPI || "http://localhost:8545")
  prog.option('--password <password>', 'use HTTP-RPC interface (env["PASSWORD"] or defualt: "")', env.PASSWORD || "")
  let web3, eth
  const init = function () {
    web3 = new Web3(new Web3.providers.HttpProvider(prog.rpcapi));
    eth = web3.eth
    const cwd = prog.keystore
    const paths = globby.sync('*.json', {
      cwd: cwd,
      absolute: false,
      nodir: true,
      nosort: true
    })

    const keystotes = []
    for (fn of paths) {
      const data = fs.readFileSync(
        path.join(cwd, fn)
      )
      try {
        var json = JSON.parse(data)
        if (json.version !== 3) {
          throw new Error('Not a valid V3 wallet')
        }
        keystotes.push(json)
      } catch (e) {

      }
    }

    eth.accounts.wallet.decrypt(keystotes, prog.password)

  }

  prog
    .command('create')
    .description('create account')
    .action(function (opts) {
      web3 = new Web3();
      const acc = web3.eth.accounts.create();
      const keystore = acc.encrypt(prog.password)
      const ctx = JSON.stringify(keystore, null, 4)
      console.log(ctx)
      fs.writeFileSync(path.join(prog.keystore, "~" + new Date().toISOString() + "." + keystore.address + ".json"), ctx)
    })

  prog
    .command('list')
    .option('--key', 'show key')
    .description('list account')
    .action(function (opts) {
      init()
      for (let i = 0; i < eth.accounts.wallet.length; i++) {
        const w = eth.accounts.wallet[i]
        console.log(`wallet[${i}] address: ${w.address}`)
        if (opts.key) {
          console.log(`wallet[${i}] privateKey: ${w.privateKey}`)
        }
      }
    })

  prog
    .command('balance [address]')
    .description('query currency balance')
    .action(co.wrap(function* (address, opts) {
      init()
      address = address || eth.accounts.wallet[prog.use].address
      console.log(`query balance ${address}`)
      const balance = yield web3.eth.getBalance(address)
      console.log(`balance: ${balance}`)
    }))

  prog
    .command('show [name]')
    .description('show contract method')
    .action(co.wrap(function* (name, opts) {
      const contract = require('../contract')
      if (!name) {
        for (const key of Object.keys(contract)) {
          console.log(key)
        }
        return
      }

      const item = contract[name]
      const abi = item.interface
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
    .option('--gas <gasLimit>', 'gas limit', undefined)
    .option('--price <gasPrice>', 'gas price', '100')
    .option('--nonce <nonce>', 'tx nonce', undefined)
    .option('--send', 'send tx')
    .description('Returns the current gas price oracle. The gas price is determined by the last few blocks median gas price.')
    .action(co.wrap(function* (to, value, opts) {
      init()

      const result = yield eth.getGasPrice()
      console.log(result)

    }))

  prog
    .command('tx <hash>')
    .description('Returns a transaction matching the given transaction hash.')
    .action(co.wrap(function* (hash, opts) {
      init()

      const result = yield eth.getTransaction(hash)
      console.log(JSON.stringify(result, null, 4))
    }))

  prog
    .command('transfer <to> <wei>')
    .option('--gas <gasLimit>', 'gas limit', undefined)
    .option('--price <gasPrice>', 'gas price', '100')
    .option('--nonce <nonce>', 'tx nonce', undefined)
    .option('--send', 'send tx')
    .description('transfer value')
    .action(co.wrap(function* (to, value, opts) {
      init()

      const wallet = eth.accounts.wallet[prog.use]
      const from = wallet.address
      if (!opts.gas) {
        opts.gas = yield eth.estimateGas({
          to: to
        })
      }
      console.log(`${from} to ${to} ${value} wei gas:${opts.gas} gasPrice:${opts.price}`)

      const Tx = require('ethereumjs-tx');
      let count = yield eth.getTransactionCount(from)
      var rawTx = {
        nonce: web3.utils.toHex(opts.nonce || count),
        gasPrice: web3.utils.toHex(opts.price),
        gasLimit: web3.utils.toHex(opts.gas),
        to: to,
        value: web3.utils.toHex(value),
        data: '0x'
      }
      const tx = new Tx(rawTx);
      tx.sign(Buffer.from(wallet.privateKey.replace(/^0x/, ''), 'hex'));
      const serializedTx = tx.serialize();
      const json = {}
      json['hash'] = '0x' + tx.hash().toString('hex')
      json['nonce'] = web3.utils.hexToNumber('0x' + tx.nonce.toString('hex'))
      json['gasLimit'] = web3.utils.hexToNumber('0x' + tx.gasLimit.toString('hex'))
      json['gasPrice'] = web3.utils.hexToNumber('0x' + tx.gasPrice.toString('hex')).toString()
      json['input'] = '0x' + tx.input.toString('hex')
      json['to'] = '0x' + tx.to.toString('hex')
      json['value'] = web3.utils.hexToNumber('0x' + tx.value.toString('hex')).toString()
      json['v'] = '0x' + tx.v.toString('hex')
      json['r'] = '0x' + tx.r.toString('hex')
      json['s'] = '0x' + tx.s.toString('hex')
      console.log(json)
      if (!opts.send) {
        return;
      }

      const result = yield eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))
      console.log(JSON.stringify(result, null, 4))

      /*
      const action = eth.sendTransaction({
        from: from,
        to: to,
        gas: opts.gas,
        gasPrice: opts.price,
        value: value
      })

      action.on('transactionHash', function (hash) {
          console.error(`hash: ${hash}`)
        })
        .on('receipt', function (receipt) {
          console.log(receipt)
        })
        .on('confirmation', function (confirmationNumber, receipt) {})
        .on('error', console.error)
      const result = yield action
      console.log(JSON.stringify(result, null, 4))
      */
    }))

  prog
    .command('deploy <name> [args...]')
    .option('--value <value>', 'pay value wei', '0')
    .option('--gas <gasLimit>', 'gas limit', '')
    .option('--price <gasPrice>', 'gas price', '100')
    .option('--send', 'send tx')
    .description('deploy one eth contract to network')
    .action(co.wrap(function* (name, args, opts) {
      const contract = require('../contract')
      if (!(name in contract)) {
        console.error(`"${name}" contract not found`)
        return;
      }
      init()

      const item = contract[name]
      const abi = item.interface
      const act = new web3.eth.Contract(abi);
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

      const from = eth.accounts.wallet[prog.use].address
      const value = (constructor.payable) ? opts.value : undefined
      const deploy = act.deploy({
        data: '0x' + item.bytecode,
        arguments: args
      })
      if (!opts.gas) {
        opts.gas = yield deploy.estimateGas({
          from: from
        })
      }
      console.log(`deploy "${name}" contract from:${from} ${(value)?"value:"+value+" ":""}gas:${opts.gas} price:${opts.price}`)

      if (!opts.send) {
        return;
      }

      const tx = yield deploy.send({
        from: from,
        value: value,
        gas: opts.gas,
        gasPrice: opts.price
      }).catch(function (err) {
        console.log(err)
      })

      console.log(tx)

    }))

  prog
    .command('call <at> <name> <method> [args...]')
    .option('--value <value>', 'pay value wei', "0")
    .option('--gas <gasLimit>', 'gas limit', '')
    .option('--price <gasPrice>', 'gas price', '100')
    .option('--send', 'send tx')
    .description('call one eth contract method')
    .action(co.wrap(function* (at, name, methodName, args, opts) {
      const contract = require('../contract')
      if (!(name in contract)) {
        console.error(`"${name}" contract not found`)
        return;
      }
      init()

      const item = contract[name]
      const abi = item.interface
      const act = new web3.eth.Contract(abi, at);
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

      const from = eth.accounts.wallet[prog.use].address
      const value = (constructor.payable) ? opts.value : undefined
      const func = act.methods[methodName].apply(null, args)

      if (!opts.gas) {
        opts.gas = yield func.estimateGas({
          from: from
        })
      }
      console.error(`"${name}" contract at:${from} call method "${methodName}" ${(value)?"value:"+value+" ":""}gas:${opts.gas} price:${opts.price}`)

      if (!opts.send) {
        const result = yield func.call({
          from: from,
          value: value,
          gas: opts.gas,
          gasPrice: opts.price
        }).catch(function (err) {
          console.log(err)
        })

        console.log(result)
        return;
      }

      const result = yield func.send({
        from: from,
        value: value,
        gas: opts.gas,
        gasPrice: opts.price
      }).catch(function (err) {
        console.log(err)
      })
      console.log(result)

    }))

}

