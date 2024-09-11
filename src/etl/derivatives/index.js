import { updateMarketcapFromExchange, updateMarketcapFromSupply } from './marketcaps.js'


export function createDerivatives({ ctx, newItems }){
	for(let exchange of newItems.tokenExchanges){
		updateMarketcapFromExchange({ ctx, exchange })
	}

	for(let supply of newItems.tokenSupply){
		updateMarketcapFromSupply({ ctx, supply })
	}
}

export function createAllDerivatives({ ctx }){
	let exchanges = ctx.db.core.tokenExchanges.iter()

	for(let exchange of exchanges){
		updateMarketcapFromExchange({ ctx, exchange })
	}
}