import Decimal from './decimal.js'

export function deriveExchanges(tx){
	let exchanges = []
	let parties = {}
	let bookChange = ({currency, issuer, account, change}) => {
		if(!parties[account])
			parties[account] = []

		let existing = parties[account].find(change => 
			change.currency === currency && change.issuer === issuer)

		if(existing){
			existing.change = existing.change.plus(change)
		}else{
			parties[account].push({
				currency,
				issuer,
				change
			})
		}
	}

	for(let node of tx.meta.AffectedNodes){
		let nodeKey = Object.keys(node)[0]
		let nodeData = node[nodeKey]

		if(nodeKey === 'DeletedNode')
			continue

		if(nodeData.LedgerEntryType === 'RippleState'){
			let previousBalance = nodeKey === 'ModifiedNode' 
				? nodeData.PreviousFields.Balance.value
				: '0'
			let finalBalance = nodeData.FinalFields.Balance.value
			let change = Decimal.sub(finalBalance, previousBalance)
			let currency = nodeData.FinalFields.Balance.currency
			let issuer
			let account

			if(nodeData.FinalFields.HighLimit.value === '0'){
				issuer = nodeData.FinalFields.HighLimit.issuer
				account = nodeData.FinalFields.LowLimit.issuer
			}else if(nodeData.FinalFields.LowLimit.value === '0'){
				issuer = nodeData.FinalFields.LowLimit.issuer
				account = nodeData.FinalFields.HighLimit.issuer
				change = change.times(-1)
			}else{
				//ಠ_ಠ
			}

			bookChange({
				currency, 
				issuer, 
				account, 
				change
			})

		}else if(nodeData.LedgerEntryType === 'AccountRoot'){
			let previousBalance = nodeData.PreviousFields.Balance
			let finalBalance = nodeData.FinalFields.Balance
			let change = Decimal.sub(finalBalance, previousBalance).div('1000000')
			let account = nodeData.FinalFields.Account

			bookChange({
				currency: 'XRP',
				issuer: null, 
				account, 
				change
			})
		}
	}

	bookChange({
		currency: 'XRP',
		issuer: null,
		account: tx.Account,
		change: new Decimal(tx.Fee).div('1000000')
	})

	for(let [address, changes] of Object.entries(parties)){
		if(changes.length !== 2){
			throw new Error('multi currency exchange parsing not implemented, yet')
		}

		let isMaker = address === tx.Account
		let take = changes[0].change.gt(0) ? changes[0] : changes[1]
		let pay = changes[1].change.gt(0) ? changes[0] : changes[1]
		let price
		let from
		let to
		let volume


		if(isMaker){
			from = pay
			to = take
			price = take.change.div(pay.change).abs()
			volume = pay.change.abs()
		}else{
			from = take
			to = pay
			price = pay.change.div(take.change).abs()
			volume = take.change.abs()
		}

		let exchange = exchanges.find(x => 
			x.from.currency === from.currency 
			&& x.from.issuer === from.issuer
			&& x.to.currency == to.currency
			&& x.to.issuer == to.issuer
		)


		if(exchange){
			let wavgPriceSum = Decimal.sum(
				exchange.price.times(exchange.volume), 
				price.times(volume)
			)
			let wavgPriceDiv = Decimal.sum(exchange.volume, volume)

			exchange.price = wavgPriceSum.div(wavgPriceDiv)
		}else{
			exchanges.push(exchange = {
				from: {currency: from.currency, issuer: from.issuer},
				to: {currency: to.currency, issuer: to.issuer},
				price,
				volume
			})
		}

		if(isMaker)
			exchange.volume = volume
	}

	return exchanges
}