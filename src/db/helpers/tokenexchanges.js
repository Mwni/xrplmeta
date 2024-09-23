import { XFL, sum, div, gt } from '@xrplkit/xfl'

const dustValueXRP = '0.0001'

export function readTokenExchangesAligned({ 
	ctx, 
	base, 
	quote, 
	sequenceStart,
	sequenceEnd, 
	limit, 
	newestFirst, 
	include, 
	skipDust 
}){
	return ctx.db.core.tokenExchanges.readMany({
		where: {
			...composeBaseQuoteWhere({ base, quote, skipDust }),
			AND: [
				{
					ledgerSequence: {
						greaterOrEqual: sequenceStart
					}
				},
				{
					ledgerSequence: {
						lessOrEqual: sequenceEnd
					}
				}
			]
		},
		orderBy: {
			ledgerSequence: newestFirst ? 'desc' : 'asc'
		},
		include: {
			...include,
			takerPaidToken: {
				issuer: true
			},
			takerGotToken: {
				issuer: true
			}
		},
		take: limit
	})
		.map(exchange => alignTokenExchange({ exchange, base, quote }))
}

export function readTokenExchangeAligned({ ctx, base, quote, ledgerSequence, skipDust }){
	let exchange = ctx.db.core.tokenExchanges.readOne({
		where: {
			...composeBaseQuoteWhere({ base, quote, skipDust }),
			ledgerSequence: {
				lessOrEqual: ledgerSequence
			}
		},
		orderBy: {
			ledgerSequence: 'desc'
		},
		include: {
			takerPaidToken: {
				issuer: true
			},
			takerGotToken: {
				issuer: true
			}
		}
	})

	if(!exchange)
		return

	return alignTokenExchange({ exchange, base, quote })
}

export function readTokenVolume({ ctx, base, quote, sequenceStart, sequenceEnd }){
	let volume = XFL(0)
	
	for(let counter of [false, true]){
		let sumKey = counter 
			? 'takerPaidValue' 
			: 'takerGotValue'
			
		let aggregate = ctx.db.core.tokenExchanges.readOne({
			select: {
				[sumKey]: {
					function: 'XFL_SUM'
				},
				id: {
					function: 'COUNT'
				}
			},
			where: {
				AND: [
					{
						takerPaidToken: counter ? quote : base,
						takerGotToken: counter ? base : quote
					},
					{
						ledgerSequence: {
							greaterOrEqual: sequenceStart
						}
					},
					{
						ledgerSequence: {
							lessOrEqual: sequenceEnd
						}
					}
				]
			}
		})

		volume = sum(volume, aggregate[sumKey])
	}

	return volume
}

export function readTokenExchangeCount({ ctx, base, quote, sequenceStart, sequenceEnd }){
	return ctx.db.core.tokenExchanges.count({
		where: {
			OR: [
				{
					takerPaidToken: base,
					takerGotToken: quote
				},
				{
					takerPaidToken: quote,
					takerGotToken: base
				}
			],
			AND: [
				{
					ledgerSequence: {
						greaterOrEqual: sequenceStart
					}
				},
				{
					ledgerSequence: {
						lessOrEqual: sequenceEnd
					}
				}
			]
		}
	})
}

export function readTokenExchangeUniqueTakerCount({ ctx, base, quote, sequenceStart, sequenceEnd }){
	return ctx.db.core.tokenExchanges.count({
		distinct: ['taker'],
		where: {
			OR: [
				{
					takerPaidToken: base,
					takerGotToken: quote
				},
				{
					takerPaidToken: quote,
					takerGotToken: base
				}
			],
			AND: [
				{
					ledgerSequence: {
						greaterOrEqual: sequenceStart
					}
				},
				{
					ledgerSequence: {
						lessOrEqual: sequenceEnd
					}
				}
			]
		}
	})
}

export function alignTokenExchange({ exchange, base, quote }){
	let { takerPaidToken, takerGotToken, takerPaidValue, takerGotValue, ...props } = exchange
	let takerPaidIsBase = false
	let takerGotIsBase = false
	let takerPaidIsQuote = false
	let takerGotIsQuote = false

	if(base?.currency === 'XRP')
		base.id = 1

	if(quote?.currency === 'XRP')
		quote.id = 1

	if(base){
		takerPaidIsBase = (
			takerPaidToken.id === base.id
			|| (
				takerPaidToken.currency === base.currency
				&& takerPaidToken.issuer?.address == base.issuer?.address
			)
		)

		takerGotIsBase = (
			takerGotToken.id === base.id
			|| (
				takerGotToken.currency === base.currency
				&& takerGotToken.issuer?.address == base.issuer?.address
			)
		)
	}

	if(quote){
		takerPaidIsQuote = (
			takerPaidToken.id === quote.id
			|| (
				takerPaidToken.currency === quote.currency
				&& takerPaidToken.issuer?.address == quote.issuer?.address
			)
		)

		takerGotIsQuote = (
			takerGotToken.id === quote.id
			|| (
				takerGotToken.currency === quote.currency
				&& takerGotToken.issuer?.address == quote.issuer?.address
			)
		)
	}

	if(takerPaidIsBase || takerGotIsQuote){
		return {
			...props,
			base: exchange.takerPaidToken,
			quote: exchange.takerGotToken,
			price: gt(takerPaidValue, 0)
				? div(takerGotValue, takerPaidValue)
				: XFL(0),
			volume: takerGotValue
		}
	}
	else if(takerPaidIsQuote || takerGotIsBase)
	{
		return {
			...props,
			base: exchange.takerGotToken,
			quote: exchange.takerPaidToken,
			price: gt(takerGotValue, 0)
				? div(takerPaidValue, takerGotValue)
				: XFL(0),
			volume: takerPaidValue
		}
	}
	else
	{
		throw new Error(`cannot align exchange: base/quote does not match`)
	}
}



export function readTokenExchangeIntervalSeries({ ctx, base, quote, sequence, time }){
	if(time){
		var exchanges = ctx.db.core.tokenExchanges.readManyRaw({
			query: 
				`SELECT MAX(Ledger.closeTime) as time, takerPaidToken, takerGotToken, takerPaidValue, takerGotValue
				FROM TokenExchange
				LEFT JOIN Ledger ON (Ledger.sequence = ledgerSequence)
				WHERE (
						(takerPaidToken = ? AND takerGotToken = ?)
						OR
						(takerGotToken = ? AND takerPaidToken = ?)
					)
					AND 
					(
						(Ledger.closeTime >= ? AND Ledger.closeTime <= ?)
						OR
						(
							ledgerSequence = (
								SELECT ledgerSequence
								FROM TokenExchange
								WHERE (
										(takerPaidToken = ? AND takerGotToken = ?)
										OR
										(takerGotToken = ? AND takerPaidToken = ?)
									)
									AND ledgerSequence < ?
								ORDER BY ledgerSequence DESC
								LIMIT 1
							)
						)
					)
				GROUP BY Ledger.closeTime / CAST(? as INTEGER)
				ORDER BY Ledger.closeTime ASC`,
			params: [
				base.id,
				quote.id,
				quote.id,
				base.id,
				time.start,
				time.end,
				base.id,
				quote.id,
				quote.id,
				base.id,
				sequence.start,
				time.interval,
			]
		})
	}else{
		var exchanges = ctx.db.core.tokenExchanges.readManyRaw({
			query: 
				`SELECT MAX(ledgerSequence) as sequence, takerPaidToken, takerGotToken, takerPaidValue, takerGotValue
				FROM TokenExchange
				WHERE (
						(takerPaidToken = ? AND takerGotToken = ?)
						OR
						(takerGotToken = ? AND takerPaidToken = ?)
					)
					AND (
						(ledgerSequence >= ? AND ledgerSequence <= ?)
						OR
						(
							ledgerSequence = (
								SELECT ledgerSequence
								FROM TokenExchange
								WHERE (
										(takerPaidToken = ? AND takerGotToken = ?)
										OR
										(takerGotToken = ? AND takerPaidToken = ?)
									)
									AND ledgerSequence < ?
								ORDER BY ledgerSequence DESC
								LIMIT 1
							)
						)
					)
				GROUP BY ledgerSequence / CAST(? as INTEGER)
				ORDER BY ledgerSequence ASC`,
			params: [
				base.id,
				quote.id,
				quote.id,
				base.id,
				sequence.start,
				sequence.end,
				base.id,
				quote.id,
				quote.id,
				base.id,
				sequence.start,
				sequence.interval,
			]
		})
	}

	return exchanges.map(
		({ takerPaidToken, takerGotToken, takerPaidValue, takerGotValue, ...props }) => {
			if(takerPaidToken === base.id){
				return {
					...props,
					price: div(takerGotValue, takerPaidValue),
					volume: takerPaidValue
				}
			}else{
				return {
					...props,
					price: div(takerPaidValue, takerGotValue),
					volume: takerGotValue
				}
			}
		}
	)
}

function composeBaseQuoteWhere({ base, quote, skipDust }){
	let takerGotBaseCondition = {
		takerPaidToken: quote,
		takerGotToken: base
	}

	let takerGotQuoteCondition = {
		takerPaidToken: base,
		takerGotToken: quote
	}

	if(skipDust){
		if(base.currency === 'XRP'){
			takerGotBaseCondition.takerGotValue = {
				greaterOrEqual: dustValueXRP
			}

			takerGotQuoteCondition.takerPaidValue = {
				greaterOrEqual: dustValueXRP
			}
		}else if(quote.currency === 'XRP'){
			takerGotBaseCondition.takerPaidValue = {
				greaterOrEqual: dustValueXRP
			}

			takerGotQuoteCondition.takerGotValue = {
				greaterOrEqual: dustValueXRP
			}
		}
	}
	
	return {
		OR: [takerGotBaseCondition, takerGotQuoteCondition]
	}
}