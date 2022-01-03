import EventEmitter from 'events'
import Pool from './pool.js'


export class Host{
	constructor(config){
		this.pool = new Pool(config)
		this.pool.on('ledger', ledger => this.dispatchEmit('ledger', ledger))
		this.pool.on('transaction', tx => this.dispatchEmit('transaction', tx))
		this.workers = []
	}

	register(worker){
		this.workers.push(worker)

		worker.on('message', ({type, payload}) => {
			switch(type){
				case 'xrpl.invoke':
					this.pool[payload.method](...payload.args)
						.then(data => worker.send({
							type: 'xrpl.invoke', 
							payload: {id: payload.id, data}
						}))
						.catch(error => worker.send({
							type: 'xrpl.invoke', 
							payload: {id: payload.id, error}
						}))
					break

			}
		})
	}

	discard(worker){
		this.workers.splice(this.workers.indexOf(worker), 1)
	}

	dispatchEmit(event, data){
		for(let worker of this.workers){
			worker.send({type: 'xrpl.event', payload: {event, data}})
		}
	}
}

export class Client extends EventEmitter{
	constructor(){
		super()
		this.requests = []
		this.counter = 0
		process.on('message', ({type, payload}) => {
			switch(type){
				case 'xrpl.event':
					this.emit(payload.event, payload.data)
					break

				case 'xrpl.invoke':
					let req = this.requests.find(r => r.id === payload.id)

					if(req){
						if(payload.data)
							req.resolve(payload.data)
						else
							req.reject(payload.error)

						this.requests.splice(this.requests.indexOf(req), 1)
					}

					break
			}
		})
	}

	async request(...args){
		return await new Promise((resolve, reject) => {
			let id = this.counter++

			this.requests.push({id, resolve, reject})
			process.send({type: 'xrpl.invoke', payload: {id, method: 'request', args}})

		})
	}
}