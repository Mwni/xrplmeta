import fs from 'fs'
import path from 'path'
import Router from '@koa/router'
import sendFile from 'koa-send'
import log from '@mwni/log'
import * as procedures from './api.js'
import { getCachedIconPath, iconSizes } from '../cache/icons.js'


export function createRouter({ ctx }){
	let router = new Router()

	router.get(
		['/', '/info', '/server'],
		async svc => {
			await handle({
				ctx,
				svc,
				procedure: 'server_info'
			})
		}
	)

	router.get(
		'/ledger',
		async svc => {
			await handle({
				ctx,
				svc,
				procedure: 'ledger',
				args: {
					...parsePoint(svc.query)
				}
			})
		}
	)

	router.get(
		'/tokens',
		async svc => {
			await handle({
				ctx,
				svc,
				procedure: 'tokens',
				args: {
					...svc.query,
					expand_meta: svc.query.expand_meta !== undefined,
					include_sources: svc.query.include_sources !== undefined,
					include_changes: svc.query.include_changes !== undefined,
					decode_currency: svc.query.decode_currency !== undefined,
					original_icons: svc.query.original_icons !== undefined,
					name_like: svc.query.name_like,
					trust_levels: svc.query.trust_levels
						? svc.query.trust_levels.split(',')
						: undefined,
					prefer_sources: svc.query.prefer_sources
						? svc.query.prefer_sources.split(',')
						: undefined
				}
			})
		}
	)

	router.get(
		'/tokens/exchanges/:base/:quote',
		async svc => {
			await handle({
				ctx,
				svc,
				procedure: 'token_exchanges',
				args: {
					base: parseTokenURI(svc.params.base),
					quote: parseTokenURI(svc.params.quote),
					newestFirst: svc.query.newest_first !== undefined,
					...parseRange(svc.query)
				}
			})
		}
	)

	router.get(
		'/token/:token',
		async svc => {
			await handle({
				ctx,
				svc,
				procedure: 'token',
				args: {
					token: parseTokenURI(svc.params.token),
					expand_meta: svc.query.expand_meta !== undefined,
					include_sources: svc.query.include_sources !== undefined,
					include_changes: svc.query.include_changes !== undefined,
					decode_currency: svc.query.decode_currency !== undefined,
					original_icons: svc.query.original_icons !== undefined,
					prefer_sources: svc.query.prefer_sources
						? svc.query.prefer_sources.split(',')
						: undefined
				}
			})
		}
	)

	router.get(
		'/token/:token/series/:metric',
		async svc => {
			await handle({
				ctx,
				svc,
				procedure: 'token_series',
				args: {
					token: parseTokenURI(svc.params.token),
					metric: svc.params.metric,
					...parseRange(svc.query)
				}
			})
		}
	)

	router.get(
		'/icon/:file',
		async svc => {
			try{
				var [hash, fileType] = svc.params.file.split('.')

				if(!hash || !fileType)
					throw 'bad'
			}catch{
				svc.status = 400
				svc.body = 'Invalid icon URL. The URL should consists of a hash and file extension, such as C0FFE.png'
				return
			}

			let size
			let suffix

			if(svc.query.size){
				size = parseInt(svc.query.size)

				if(!iconSizes.includes(size)){
					svc.status = 400
					svc.body = `The specified icon "${svc.query.size}" size is not available. Available sizes are: ${iconSizes}`
					return
				}

				suffix = `@${size}`
			}

			let iconPath = getCachedIconPath({ ctx, hash, suffix, fileType })

			if(!fs.existsSync(iconPath)){
				svc.status = 404
				svc.body = 'This icon does not exist. Make sure to only use icon URLs from the live token manifest.'
				return
			}

			await sendFile(
				svc,
				path.basename(iconPath),
				{
					root: path.dirname(iconPath)
				}
			)
		}
	)

	return router
}


async function handle({ ctx, svc, procedure, args = {} }){
	if(!procedures[procedure]){
		svc.throw(404)
		return
	}

	try{
		svc.body = await procedures[procedure]({
			...args,
			ctx,
		})
	}catch(e){
		if(e.expose){
			delete e.expose

			svc.status = 400
			svc.body = e
		}else{
			svc.status = 500
			svc.body = {
				message: `Internal error while handling your request.`
			}
			log.warn(`internal error while handling procedure "${procedure}":\n${e.stack}\args:`, args)
		}
	}
}


function parseTokenURI(uri){
	let [currency, issuer] = uri.split(':')

	return {
		currency,
		issuer
	}
}

function parseRange({ sequence_start, sequence_end, sequence_interval, time_start, time_end, time_interval }){
	let range = {}

	if(sequence_start !== undefined){
		range.sequence = {
			start: parseInt(sequence_start),
			end: sequence_end
				? parseInt(sequence_end)
				: undefined
		}

		if(sequence_interval)
			range.sequence.interval = parseInt(sequence_interval)
	}else if(time_start !== undefined){
		range.time = {
			start: parseInt(time_start),
			end: time_end
				? parseInt(time_end)
				: undefined
		}

		if(time_interval)
			range.time.interval = parseInt(time_interval)
	}

	return range
}

function parsePoint({ sequence, time }){
	if(sequence !== undefined){
		return { sequence: parseInt(sequence) }
	}else if(time !== undefined){
		return { time: parseInt(time) }
	}
}