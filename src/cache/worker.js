import log from '@mwni/log'
import { wait } from '@xrplkit/time'
import { 
	updateCacheForAccountProps, 
	updateCacheForTokenExchanges, 
	updateCacheForTokenMetrics, 
	updateCacheForTokenProps
} from './tokens.js'
import { updateIconCacheFor } from './icons.js'


export async function startMetaCacheWorker({ ctx }){
	let running = true
	
	;(async () => {
		while(running){
			let todo = ctx.db.cache.todos.readOne({
				where: {
					NOT: {
						task: {
							in: [
								'account.icons',
								'token.icons',
							]
						}
					}
				}
			})

			if(!todo){
				await wait(25)
				continue
			}

			try{
				switch(todo.task){
					case 'account.props': {
						updateCacheForAccountProps({ 
							ctx, 
							account: {
								id: todo.subject 
							}
						})
						break
					}
					case 'token.props': {
						updateCacheForTokenProps({ 
							ctx, 
							token: {
								id: todo.subject 
							}
						})
						break
					}
					case 'token.exchanges': {
						updateCacheForTokenExchanges({ 
							ctx, 
							token: {
								id: todo.subject 
							}
						})
						break
					}
					case 'token.metrics.trustlines': {
						updateCacheForTokenMetrics({ 
							ctx, 
							token: {
								id: todo.subject 
							},
							metrics: {
								trustlines: true
							}
						})
						break
					}
					case 'token.metrics.holders': {
						updateCacheForTokenMetrics({ 
							ctx, 
							token: {
								id: todo.subject 
							},
							metrics: {
								holders: true
							}
						})
						break
					}
					case 'token.metrics.supply': {
						updateCacheForTokenMetrics({ 
							ctx, 
							token: {
								id: todo.subject 
							},
							metrics: {
								supply: true
							}
						})
						break
					}
					case 'token.metrics.marketcap': {
						updateCacheForTokenMetrics({ 
							ctx, 
							token: {
								id: todo.subject 
							},
							metrics: {
								marketcap: true
							}
						})
						break
					}
				}
			}catch(error){
				log.warn(`cache update for token ${todo.subject} failed: ${error.stack || error.message || error}`)
			}

			ctx.db.cache.todos.deleteOne({
				where: {
					id: todo.id
				}
			})

			log.accumulate.info({
				text: [`processed %cacheTasksProcessed cache updates in %time`],
				data: { cacheTasksProcessed: 1 }
			})

			await wait(1)
		}
	})()

	return {
		stop(){
			running = false
		}
	}
}

export async function startIconCacheWorker({ ctx }){
	let running = true

	;(async () => {
		while(running){
			let todo = ctx.db.cache.todos.readOne({
				where: {
					task: {
						in: [
							'account.icons',
							'token.icons',
						]
					}
				}
			})

			if(!todo){
				await wait(1000)
				continue
			}

			switch(todo.task){
				case 'account.icons': {
					updateIconCacheFor({ 
						ctx, 
						account: {
							id: todo.subject 
						}
					})
					break
				}
				case 'token.icons': {
					updateIconCacheFor({ 
						ctx, 
						token: {
							id: todo.subject 
						}
					})
					break
				}
			}

			ctx.db.cache.todos.deleteOne({
				where: {
					id: todo.id
				}
			})

			log.accumulate.info({
				text: [`processed %iconCacheTasksProcessed icon cache updates in %time`],
				data: { iconCacheTasksProcessed: 1 }
			})

			await wait(1)
		}
	})()

	return {
		stop(){
			running = false
		}
	}
}