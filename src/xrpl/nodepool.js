import log from '@mwni/log'
import { createEmitter } from '@mwni/events'
import { wait } from '@xrplkit/time'
import { format as formatLedger } from './ledger.js'
import Node from './node.js'


export function createPool(sources){
	let events = new createEmitter()
	let seenHashes = []
	let queue = []
	let nodes = []
	let latestLedger
	let closed = false
	
	async function workQueue(){
		while(!closed){
			for(let i=0; i<queue.length; i++){
				let request = queue[i]
				let [ bestBid ] = nodes
					.map(node => ({node, bid: node.bid(request.payload)}))
					.sort((a, b) => b.bid - a.bid)

				if(bestBid.bid <= 0)
					continue

				request.accepted()
			
				bestBid.node.do(request.payload)
					.then(result => request.resolve({result, node: bestBid.node.name}))
					.catch(error => request.reject({
						error: error.message || error.stack || error.error_message, 
						node: bestBid.node.name
					}))

				queue.splice(i--, 1)
			}

			await wait(100)
		}
	}

	function sawHash(hash){
		if(seenHashes.includes(hash))
			return true

		seenHashes.push(hash)

		if(seenHashes.length > 10000)
			seenHashes.shift()
	}

	function warnAllLost(){
		if(nodes.some(node => node.status.connected))
			return

		log.warn(`lost connection to all nodes`)
	}


	log.info(`using nodes:`)

	for(let spec of sources){
		let connections = spec.connections || 1

		for(let i=0; i<connections; i++){
			let node = new Node(spec)
			let firstConnect = true
			
			node.on('connected', () => {
				log.info(
					firstConnect
						? `connected to ${spec.url}`
						: `reconnected to ${spec.url}`
				)

				firstConnect = false
			})

			node.on('disconnected', () => {
				log.info(`lost connection to ${spec.url}:`, node.error)
				warnAllLost()
			})

			node.on('error', () => {
				log.debug(`failed to connect to ${spec.url}:`, node.error)
			})

			node.on('event', ({ hash, tx, ledger }) => {
				if(sawHash(hash))
					return

				if(ledger){
					latestLedger = { ...ledger, transactions: [] }
				}

				if(latestLedger){
					if(tx){
						latestLedger.transactions.push(tx)
					}

					if(latestLedger.transactions.length === latestLedger.txn_count){
						events.emit('ledger', formatLedger(latestLedger))
					}
				}
			})

			nodes.push(node)
		}

		log.info(` -> ${spec.url}`)
	}

	workQueue()

	return Object.assign(
		events,
		{
			request(payload){
				return new Promise((resolve, reject) => {
					let timeout = setTimeout(() => reject('noNodeAcceptedRequest'), 30000)
					let accepted = () => clearTimeout(timeout)
		
					queue.push({
						payload,
						resolve,
						reject,
						accepted
					})
				})
			},
			close(){
				closed = true
				
				for(let node of nodes){
					node.disconnect()
				}
			},
			get connectionsCount(){
				return nodes.length
			}
		}
	)
}