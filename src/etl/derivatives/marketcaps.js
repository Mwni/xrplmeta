import log from '@mwni/log'
import { mul } from '@xrplkit/xfl'
import { readTokenMetricSeries, readTokenMetrics, writeTokenMetrics } from '../../db/helpers/tokenmetrics.js'
import { readTokenExchangeAligned, alignTokenExchange } from '../../db/helpers/tokenexchanges.js'


export function updateMarketcapFromExchange({ ctx, exchange }){
	try{
		exchange = alignTokenExchange({
			exchange,
			quote: { currency: 'XRP' }
		})
	}catch(error){
		if(exchange.takerGotToken.id === 1 || exchange.takerPaidToken.id === 1){
			log.warn(`market cap update failed: ${error.message}`)
		}
		return
	}

	if(ctx.backwards){
		let firstMarketcap = ctx.db.core.tokenMarketcap.readOne({
			where: {
				token: exchange.base,
				ledgerSequence: {
					greaterOrEqual: ctx.ledgerSequence
				}
			},
			orderBy: {
				ledgerSequence: 'asc'
			}
		})

		let series = readTokenMetricSeries({
			ctx,
			token: exchange.base,
			metric: 'supply',
			sequenceStart: ctx.ledgerSequence,
			sequenceEnd: firstMarketcap?.ledgerSequence
		})

		for(let { ledgerSequence: sequence, value: supply } of series){
			writeTokenMetrics({
				ctx,
				token: exchange.base,
				ledgerSequence: sequence,
				metrics: {
					marketcap: supply
						? mul(supply, exchange.price)
						: '0'
				}
			})
		}
	}else{
		let { supply } = readTokenMetrics({
			ctx,
			token: exchange.base,
			ledgerSequence: ctx.ledgerSequence,
			metrics: {
				supply: true
			}
		})
	
		writeTokenMetrics({
			ctx,
			token: exchange.base,
			ledgerSequence: ctx.ledgerSequence,
			metrics: {
				marketcap: supply
					? mul(supply, exchange.price)
					: '0'
			}
		})
	}
}

export function updateMarketcapFromSupply({ ctx, supply }){
	let exchange = readTokenExchangeAligned({
		ctx,
		base: supply.token,
		quote: { 
			currency: 'XRP'
		},
		ledgerSequence: ctx.ledgerSequence,
		skipDust: true
	})

	if(ctx.backwards && !exchange)
		return

	writeTokenMetrics({
		ctx,
		token: supply.token,
		ledgerSequence: ctx.ledgerSequence,
		metrics: {
			marketcap: exchange
				? mul(supply.value, exchange.price)
				: '0'
		}
	})
}