import log from '@mwni/log'
import * as procedures from './api.js'
import { formatTokenCache } from './procedures/token.js'


const checkAliveInterval = 10000


export function createManager({ ctx }){
	let clients = []
	let counter = 0

	setInterval(
		() => {
			for(let client of clients){
				if(!client.alive){
					client.socket.close()
					log.debug(`client #${client.id} inactivity kick`)
					continue
				}
	
				client.alive = false
				client.socket.ping()
			}
		},
		checkAliveInterval
	)

	ctx.ipc.subscribe(
		async payload => {
			if(payload.tokenUpdate){
				let token = payload.tokenUpdate.token
				let key = `${token.id}`
				let recipients = []
				
				for(let client of clients){
					let subscription = client.tokenSubscriptions[key]
					
					if(subscription){
						recipients.push({
							client,
							subscription
						})
					}
				}

				if(recipients.length > 0){
					pushTokenUpdate({ 
						ctx, 
						token, 
						recipients 
					})
				}
			}
		}
	)

	function logCount(change){
		log.accumulate.info({
			text: [
				clients.length,
				`client(s) connected (%wsConnectionChange in %time)`
			],
			data: {
				wsConnectionChange: change
			}
		})
	}

	return {
		registerSocket(socket){
			let client = {
				id: ++counter,
				socket, 
				tokenSubscriptions: {},
				alive: true
			}
	
			socket.on('message', async message => {
				try{
					var { id, command, ...params } = JSON.parse(message)
				}catch{
					log.debug(`client #${client.id} sent malformed request - dropping them`)
					socket.close()
				}
	
				try{
					if(!procedures[command]){
						throw {
							message: 'unknown command', 
							expose: true
						}
					}

					socket.send(
						JSON.stringify({
							result: await procedures[command]({
								ctx: {
									...ctx,
									client
								},
								...params
							}),
							id
						})
					)
				}catch(error){
					let response = null
	
					if(typeof error === 'object'){
						if(error.expose){
							response = error
							delete response.expose
						}
					}
	
					if(!response){
						log.debug(`internal server error while serving client #${client.id}:`, error.message)
						response = {message: 'internal server error'}
					}

					response.request = {
						...params,
						command,
					}
	
					socket.send(
						JSON.stringify({
							id, 
							error: response
						})
					)
				}
			})
	
			socket.on('pong', () => {
				client.alive = true
			})
	
			socket.on('close', () => {
				clients.splice(clients.indexOf(client))
				log.debug(`client #${client.id} disconnected`)
				logCount(-1)
			})

			socket.on('error', error => {
				log.info(`client #${client.id} websocket error: ${error.message}`)
			})
	
			clients.push(client)

			log.debug(`new connection (#${client.id} ${socket._socket.remoteAddress})`)
			logCount(1)
		}
	}
}

function pushTokenUpdate({ ctx, token, recipients }){
	if(!token.id)
		throw new Error(`token.id required`)

	let cache = ctx.db.cache.tokens.readOne({
		where: {
			token: token.id
		},
		include: {
			token: {
				issuer: true
			}
		}
	})

	for(let { client, subscription } of recipients){
		client.socket.send(
			JSON.stringify({
				type: 'tokenUpdate',
				token: formatTokenCache({
					ctx,
					cache,
					decodeCurrency: subscription.decode_currency,
					preferSources: subscription.prefer_sources,
					expandMeta: subscription.include_sources,
					includeChanges: subscription.include_changes,
				})
			})
		)
	}
}