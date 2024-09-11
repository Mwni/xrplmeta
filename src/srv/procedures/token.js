import { isSameToken } from '@xrplkit/tokens'
import { readTokenExchangeIntervalSeries, readTokenExchangesAligned } from '../../db/helpers/tokenexchanges.js'
import { readTokenMetricIntervalSeries } from '../../db/helpers/tokenmetrics.js'
import { sanitize as sanitizeUrl } from '../../lib/url.js'


export function serveTokenList(){
	return ({ ctx, sort_by, name_like, trust_levels, decode_currency, prefer_sources, include_sources, include_changes, original_icons, expand_meta, limit, offset }) => {
		let tokens = []
		let where = {}

		if(trust_levels){
			where.trustLevel = {
				in: trust_levels
			}
		}

		if(name_like){
			where.OR = [
				{ tokenCurrencyUtf8: { like: `${name_like}%` } },
				{ tokenName: { like: `%${name_like}%` } },
				{ issuerAddress: { like: `${name_like}%` } },
				{ issuerName: { like: `%${name_like}%` } },
			]
		}

		let count = ctx.db.cache.tokens.count({
			where
		})
		
		let caches = ctx.db.cache.tokens.readMany({
			where,
			include: {
				token: {
					issuer: true
				}
			},
			orderBy: {
				[sort_by || 'trustlines']: 'desc'
			},
			take: limit,
			skip: offset
		})

		for(let cache of caches){
			tokens.push(
				formatTokenCache({
					ctx,
					cache,
					decodeCurrency: decode_currency,
					preferSources: prefer_sources,
					expandMeta: include_sources || expand_meta,
					includeChanges: include_changes,
					originalIcons: original_icons
				})
			)
		}

		return { 
			count: Number(count), 
			tokens 
		}
	}
}

export function subscribeTokenList(){
	return ({ ctx, tokens, decode_currency, prefer_sources, include_sources, include_changes, expand_meta }) => {
		for(let token of tokens){
			ctx.client.tokenSubscriptions[token.id] = {
				token: {
					currency: token.currency,
					issuer: token.issuer.address
				},
				decode_currency,
				prefer_sources,
				include_sources: include_sources || expand_meta,
				include_changes
			}
		}

		return {
			subscriptions: Object.values(
				ctx.client.tokenSubscriptions
			)
		}
	}
}

export function unsubscribeTokenList(){
	return ({ ctx, tokens }) => {
		for(let token of tokens){
			delete ctx.client.tokenSubscriptions[token.id]
		}

		return {
			subscriptions: Object.values(
				ctx.client.tokenSubscriptions
			)
		}
	}
}

export function serveTokenSummary(){
	return ({ ctx, token, decode_currency, prefer_sources, include_sources, include_changes, expand_meta, original_icons }) => {
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

		return formatTokenCache({
			ctx,
			cache,
			decodeCurrency: decode_currency,
			preferSources: prefer_sources,
			expandMeta: include_sources || expand_meta,
			includeChanges: include_changes,
			originalIcons: original_icons
		})
	}
}


export function serveTokenPoint(){
	return ({ ctx, token, sequence, time, metric }) => {

	}
}


export function serveTokenSeries(){
	return ({ ctx, token, sequence, time, metric, ...opts }) => {
		let series

		if(metric === 'price'){
			series = readTokenExchangeIntervalSeries({
				ctx,
				base: token,
				quote: {
					id: 1 // XRP
				},
				sequence,
				time
			})
				.filter((point, i, list) => 
					!(point.time && point.time === list[i+1]?.time) &&
					!(point.sequence && point.sequence === list[i+1]?.sequence)
				)
				.map(point => ({
					...point,
					value: point.price
				}))
		}else if(['trustlines', 'holders', 'supply', 'marketcap'].includes(metric)){
			series = readTokenMetricIntervalSeries({
				ctx,
				metric,
				token,
				sequence,
				time
			})
		}else{
			throw {
				type: `invalidParam`,
				message: `Invalid metric. Allowed values are: price, volume, trustlines, holders, supply, marketcap.`,
				expose: true
			}
		}

		if(series.length === 0)
			return []

		
		if(time){
			series[0].time = Math.max(
				series[0].time,
				time.start
			)

			return series.map(
				point => ({
					time: Number(point.time), 
					value: point.value.toString() 
				})
			)
		}else{
			series[0].sequence = Math.max(
				series[0].sequence,
				sequence.start
			)

			return series.map(
				point => ({
					sequence: Number(point.sequence), 
					value: point.value.toString() 
				})
			)
		}
	}
}


export function serveTokenExchanges(){
	return ({ ctx, base, quote, sequence, limit, newestFirst }) => {
		if(isSameToken(base, quote)){
			throw {
				type: `invalidParam`,
				message: `The base and quote asset can not be the same.`,
				expose: true
			}
		}

		let exchanges = readTokenExchangesAligned({ 
			ctx, 
			base, 
			quote, 
			sequenceStart: sequence.start,
			sequenceEnd: sequence.end,
			limit,
			newestFirst,
			include: {
				taker: true,
				maker: true
			}
		})
		
		return {
			exchanges: exchanges.map(
				({ txHash, ledgerSequence, taker, maker, price, volume }) => ({
					txHash,
					ledgerSequence,
					taker: taker.address,
					maker: maker.address,
					price: price.toString(),
					volume: volume.toString()
				})
			),
			marker: null
		}
	}
}


export function formatTokenCache({ ctx, cache, decodeCurrency, preferSources, expandMeta, includeChanges, originalIcons }){
	if(!originalIcons){
		cache = applyIconCaches({ ctx, cache })
	}

	let token = {
		currency: decodeCurrency
			? cache.tokenCurrencyUtf8
			: cache.tokenCurrencyHex,
		issuer: cache.issuerAddress,
		meta: {
			token: reduceProps({
				props: cache.tokenProps || [],
				expand: expandMeta,
				sourceRanking: [
					...(preferSources || []),
					...(ctx.config.api?.sourceRanking || [])
				]
			}),
			issuer: reduceProps({
				props: cache.issuerProps || [],
				expand: expandMeta,
				sourceRanking: [
					...(preferSources || []),
					...(ctx.config.api?.sourceRanking || [])
				]
			})
		},
		metrics: {
			trustlines: cache.trustlines,
			holders: cache.holders,
			supply: cache.supply.toString(),
			marketcap: cache.marketcap.toString(),
			price: cache.price.toString(),
			volume_24h: cache.volume24H.toString(),
			volume_7d: cache.volume7D.toString(),
			exchanges_24h: cache.exchanges24H.toString(),
			exchanges_7d: cache.exchanges7D.toString(),
			takers_24h: cache.takers24H.toString(),
			takers_7d: cache.takers7D.toString(),
		}
	}

	if(includeChanges){
		token.metrics.changes = {
			'24h': {
				trustlines: {
					delta: cache.trustlinesDelta24H,
					percent: cache.trustlinesPercent24H,
				},
				holders: {
					delta: cache.holdersDelta24H,
					percent: cache.holdersPercent24H,
				},
				supply: {
					delta: cache.supplyDelta24H.toString(),
					percent: cache.supplyPercent24H,
				},
				marketcap: {
					delta: cache.marketcapDelta24H.toString(),
					percent: cache.marketcapPercent24H,
				},
				price: {
					percent: cache.pricePercent24H,
				}
			},
			'7d': {
				trustlines: {
					delta: cache.trustlinesDelta7D,
					percent: cache.trustlinesPercent7D,
				},
				holders: {
					delta: cache.holdersDelta7D,
					percent: cache.holdersPercent7D,
				},
				supply: {
					delta: cache.supplyDelta7D.toString(),
					percent: cache.supplyPercent7D,
				},
				marketcap: {
					delta: cache.marketcapDelta7D.toString(),
					percent: cache.marketcapPercent7D,
				},
				price: {
					percent: cache.pricePercent7D,
				}
			}
		}
	}

	return token
}

export function reduceProps({ props, expand, sourceRanking }){
	let data = {}
	let sources = {}
	let weblinks = []

	for(let { key, value, source } of props){
		if(expand){
			if(!data[key])
				data[key] = {}

			data[key][source] = value
		}else{
			let rank = sourceRanking
				? sourceRanking.findIndex(rs => doSourcesMatch(rs, source))
				: 0

			if(rank === -1)
				rank = Infinity

			if(key === 'weblinks'){
				weblinks.push({ links: value, rank })
			}else{
				if(!sources.hasOwnProperty(key) || sources[key] > rank){
					data[key] = value
					sources[key] = rank
				}
			}
		}
	}

	if(weblinks.length > 0){
		data.weblinks = weblinks
			.sort((a, b) => a.rank - b.rank)
			.map(({ links }) => links)
			.reduce((a, l) => [...a, ...l], [])
	}

	return data
}

function applyIconCaches({ ctx, cache }){
	let apply = props => props
		.map(
			prop => prop.key === 'icon'
				? (
					cache.cachedIcons?.[prop.value]
					? {...prop, value: sanitizeUrl(`${ctx.config.api.publicUrl}/icon/${cache.cachedIcons?.[prop.value]}`)}
					: null
				)
				: prop
		)
		.filter(Boolean)

	return {
		...cache,
		issuerProps: apply(cache.issuerProps || []),
		tokenProps: apply(cache.tokenProps || []),
	}
}

function doSourcesMatch(s1, s2){
	s1 = s1.split('/')
	s2 = s2.split('/')

	return s1.every((s, i) => s === s2[i])
}