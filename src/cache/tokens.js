import log from '@mwni/log'
import { sub, mul, div, min, gt } from '@xrplkit/xfl'
import { currencyHexToUTF8 } from '@xrplkit/tokens'
import { readLedgerAt, readMostRecentLedger } from '../db/helpers/ledgers.js'
import { readTokenMetrics } from '../db/helpers/tokenmetrics.js'
import { readTokenExchangeAligned, readTokenExchangeCount, readTokenExchangeUniqueTakerCount, readTokenVolume } from '../db/helpers/tokenexchanges.js'
import { readAccountProps, readTokenProps } from '../db/helpers/props.js'


const maxChangePercent = 999999999
const metricInts = ['trustlines', 'holders']



export function updateCacheForTokenProps({ ctx, token }){
	if(ctx.backwards)
		return

	let props = readTokenProps({ ctx, token })
	let tokenName = props.find(prop => prop.key === 'name')?.value
	let changedCache = ctx.db.cache.tokens.createOne({
		data: {
			...getCommonTokenCacheFields({ ctx, token }),
			tokenName,
			tokenProps: props,
			trustLevel: Math.max(
				0,
				...props
					.filter(({ key }) => key === 'trust_level')
					.map(({ value }) => value)
			)
		},
		returnUnchanged: false
	})

	if(changedCache){
		dispatchTokenUpdate({ ctx, token, subject: 'tokenProps' })
	}
}

export function updateCacheForAccountProps({ ctx, account }){
	if(ctx.backwards)
		return

	let props = readAccountProps({ 
		ctx, 
		account 
	})

	let issuerName = props.find(prop => prop.key === 'name')?.value
	
	let tokens = ctx.db.core.tokens.readMany({
		where: {
			issuer: account
		}
	})

	for(let token of tokens){
		if(!token.issuer)
			continue

		let changedCache = ctx.db.cache.tokens.createOne({
			data: {
				...getCommonTokenCacheFields({ ctx, token }),
				issuerName,
				issuerProps: props
			},
			returnUnchanged: false
		})

		if(changedCache){
			dispatchTokenUpdate({ ctx, token, subject: 'issuerProps' })
		}

		updateCacheForTokenProps({ ctx, token })
	}
}

export function updateCacheForTokenMetrics({ ctx, token, metrics }){
	if(ctx.backwards)
		return

	let cache = {}
	let sequences = getCommonLedgerSequences({ ctx })

	let currentValues = readTokenMetrics({
		ctx,
		token,
		metrics,
		ledgerSequence: sequences.current
	})

	let pre24hValues = readTokenMetrics({
		ctx,
		token,
		metrics,
		ledgerSequence: sequences.pre24h
	})

	let pre7dValues = readTokenMetrics({
		ctx,
		token,
		metrics,
		ledgerSequence: sequences.pre7d
	})

	for(let key of Object.keys(metrics)){
		let current = currentValues[key] || 0
		let pre24h = pre24hValues[key] || 0
		let pre7d = pre7dValues[key] || 0
		let delta24h = sub(current, pre24h)
		let delta7d = sub(current, pre7d)

		let percent24h = gt(pre24h, 0)
			? Number(min(mul(div(delta24h, pre24h), 100), maxChangePercent))
			: 0

		let percent7d = gt(pre7d, 0)
			? Number(min(mul(div(delta7d, pre7d), 100), maxChangePercent))
			: 0

		if(metricInts.includes(key)){
			delta24h = Number(delta24h)
			delta7d = Number(delta7d)
		}else{
			current = current.toString()
			delta24h = delta24h.toString()
			delta7d = delta7d.toString()
		}

		cache[key] = current
		cache[`${key}Delta24H`] = delta24h
		cache[`${key}Percent24H`] = percent24h
		cache[`${key}Delta7D`] = delta7d
		cache[`${key}Percent7D`] = percent7d
	}

	let changedCache = ctx.db.cache.tokens.createOne({
		data: {
			...getCommonTokenCacheFields({ ctx, token }),
			...cache
		},
		returnUnchanged: false
	})

	if(changedCache){
		dispatchTokenUpdate({ ctx, token, subject: 'metrics' })
	}
}

export function updateCacheForTokenExchanges({ ctx, token }){
	if(ctx.backwards)
		return

	if(token.currency === 'XRP')
		return

	let sequences = getCommonLedgerSequences({ ctx })

	let current = readTokenExchangeAligned({
		ctx,
		base: token,
		quote: {
			currency: 'XRP'
		},
		ledgerSequence: sequences.current
	})?.price || 0

	let pre24h = readTokenExchangeAligned({
		ctx,
		base: token,
		quote: {
			currency: 'XRP'
		},
		ledgerSequence: sequences.pre24h
	})?.price || 0

	let pre7d = readTokenExchangeAligned({
		ctx,
		base: token,
		quote: {
			currency: 'XRP'
		},
		ledgerSequence: sequences.pre7d
	})?.price || 0

	let delta24h = sub(current, pre24h)
	let delta7d = sub(current, pre7d)

	let percent24h = gt(pre24h, 0)
		? Number(min(mul(div(delta24h, pre24h), 100), maxChangePercent))
		: 0

	let percent7d = gt(pre7d, 0)
		? Number(min(mul(div(delta7d, pre7d), 100), maxChangePercent))
		: 0

	let volume24H = readTokenVolume({
		ctx,
		base: token,
		quote: {
			id: 1,
			currency: 'XRP'
		},
		sequenceStart: sequences.pre24h,
		sequenceEnd: sequences.current
	})

	let volume7D = readTokenVolume({
		ctx,
		base: token,
		quote: {
			id: 1,
			currency: 'XRP'
		},
		sequenceStart: sequences.pre7d,
		sequenceEnd: sequences.current
	})

	let exchanges24H = readTokenExchangeCount({
		ctx,
		base: token,
		quote: {
			id: 1,
			currency: 'XRP'
		},
		sequenceStart: sequences.pre24h,
		sequenceEnd: sequences.current
	})

	let exchanges7D = readTokenExchangeCount({
		ctx,
		base: token,
		quote: {
			id: 1,
			currency: 'XRP'
		},
		sequenceStart: sequences.pre7d,
		sequenceEnd: sequences.current
	})

	let takers24H = readTokenExchangeUniqueTakerCount({
		ctx,
		base: token,
		quote: {
			id: 1,
			currency: 'XRP'
		},
		sequenceStart: sequences.pre24h,
		sequenceEnd: sequences.current
	})

	let takers7D = readTokenExchangeUniqueTakerCount({
		ctx,
		base: token,
		quote: {
			id: 1,
			currency: 'XRP'
		},
		sequenceStart: sequences.pre7d,
		sequenceEnd: sequences.current
	})

	let changedCache = ctx.db.cache.tokens.createOne({
		data: {
			...getCommonTokenCacheFields({ ctx, token }),
			price: current.toString(),
			pricePercent24H: percent24h,
			pricePercent7D: percent7d,
			volume24H: volume24H.toString(),
			volume7D: volume7D.toString(),
			exchanges24H,
			exchanges7D,
			takers24H,
			takers7D
		},
		returnUnchanged: false
	})

	if(changedCache){
		dispatchTokenUpdate({ ctx, token, subject: 'metrics' })
	}
}

export function getCommonTokenCacheFields({ ctx, token }){
	if(!token.id || !token.issuer || !token.issuer.address)
		token = ctx.db.core.tokens.readOne({
			where: token,
			include: {
				issuer: true
			}
		})

	return {
		token: token.id,
		tokenCurrencyHex: token.currency,
		tokenCurrencyUtf8: currencyHexToUTF8(token.currency),
		issuerAddress: token.issuer.address
	}
}

function getCommonLedgerSequences({ ctx }){
	let currentLedger = readMostRecentLedger({ ctx })
	
	return {
		current: currentLedger.sequence,
		pre24h: readLedgerAt({ 
			ctx, 
			time: currentLedger.closeTime - 60 * 60 * 24, 
			clamp: true 
		}).sequence,
		pre7d: readLedgerAt({ 
			ctx, 
			time: currentLedger.closeTime - 60 * 60 * 24 * 7, 
			clamp: true 
		}).sequence
	}
}

function dispatchTokenUpdate({ ctx, token, subject }){
	if(!ctx.ipc)
		return

	ctx.ipc.emit({
		tokenUpdate: {
			token,
			subject
		}
	})
}