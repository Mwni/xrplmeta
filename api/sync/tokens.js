import { unixNow, keySort, mapMultiKey, nestDotNotated } from '@xrplmeta/utils'
import Decimal from 'decimal.js'
import log from '@xrplmeta/log'

log.config({
	name: 'sync:tokens',
	color: 'cyan'
})



export function allocate(heads){
	log.time(`sync.tokens`, `building tokens cache`)

	let tokens = this.repo.tokens.all()
	let progress = 0
	
	for(let i=0; i<tokens.length; i++){
		compose.call(this, tokens[i])

		let newProgress = Math.floor((i / tokens.length) * 100)

		if(newProgress !== progress){
			progress = newProgress
			log.info(`processed`, i, `of`, tokens.length, `tokens (${progress}%)`)
		}
	}

	log.time(`sync.tokens`, `built tokens cache in %`)
}

export function register({ affected }){
	let relevant = affected.filter(({contexts}) => 
		contexts.some(context => ['exchange', 'meta', 'stat'].includes(context)))

	for(let { type, id } of relevant){
		if(type === 'token'){
			compose.call(this, this.repo.tokens.get({id}))
			log.debug(`updated token (TL${id})`)
		}
	}
}

function compose(token){
	let { id, currency, issuer: issuerId } = token
	let issuer = this.repo.accounts.get({id: issuerId})	
	let currencyMetas = this.repo.metas.all({token})
	let issuerMetas = this.repo.metas.all({account: issuerId})
	let meta = {
		currency: sortMetas(
			nestDotNotated(mapMultiKey(currencyMetas, 'key', true)),
			this.config.meta.sourcePriorities
		),
		issuer: sortMetas(
			nestDotNotated(mapMultiKey(issuerMetas, 'key', true)),
			this.config.meta.sourcePriorities
		)
	}


	let currentStats = this.repo.stats.get(token)
	let yesterdayStats
	let now = unixNow()
	let candles = this.cache.candles.all(
		{base: id, quote: null, interval: 86400},
		now - 60*60*24*7
	)
	let stats = {
		marketcap: new Decimal(0),
		volume: new Decimal(0),
		tokens: 0
	}

	if(currentStats){
		stats.tokens = currentStats.count
		stats.supply = currentStats.supply
		stats.liquidity = {ask: currentStats.ask, bid: currentStats.bid}

		yesterdayStats = this.repo.stats.get(token, currentStats.date - 60*60*24)

		if(yesterdayStats){
			stats.tokens_change = Math.round((currentStats.accounts / yesterdayStats.accounts - 1) * 10000) / 100
		}
	}

	if(candles.length > 0){
		let newestCandle = candles[candles.length - 1]
		let lastWeeksCandle = candles[0]

		stats.price = newestCandle.c
		stats.price_change = Math.round((newestCandle.c / newestCandle.o - 1) * 1000)/10
		stats.marketcap = Decimal.mul(stats.supply || 0, newestCandle.c)
		stats.volume = Decimal.sum(...candles
			.slice(candles.indexOf(lastWeeksCandle))
			.map(candle => candle.v)
		)
	}

	let full = {stats, meta}
	let condensed = {
		stats: {
			...stats,
			liquidity: undefined
		}, 
		meta: {
			currency: collapseMetas(
				meta.currency, 
				this.config.meta.sourcePriorities
			),
			issuer: collapseMetas(
				{
					...meta.issuer,
					emailHash: undefined,
					socials: undefined,
					description: undefined
				}, 
				this.config.meta.sourcePriorities
			)
		}
	}

	this.cache.tokens.insert({
		id,
		currency, 
		issuer: issuer.address,
		condensed,
		full
	})
}


function sortMetas(metas, priorities){
	let sorted = {}

	for(let [key, values] of Object.entries(metas)){
		if(Array.isArray(values)){
			sorted[key] = keySort(values, meta => {
				let index = priorities.indexOf(meta.source)

				return index >= 0 ? index : 9999
			})
		}else if(typeof values === 'object'){
			sorted[key] = sortMetas(values, priorities)
		}
	}

	return sorted
}


function collapseMetas(metas, sourcePriority){
	let collapsed = {}

	for(let [key, values] of Object.entries(metas)){
		if(!values)
			continue

		if(Array.isArray(values)){
			let meta = values[0]

			if(meta.value)
				collapsed[key] = meta.value
		}else{
			collapsed[key] = collapseMetas(values, sourcePriority)
		}
	}

	return collapsed
}