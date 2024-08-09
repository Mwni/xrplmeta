import { XFL } from '@xrplkit/xfl'
import { amountFromRippled } from '@xrplkit/tokens'
import { rippleToUnix } from '@xrplkit/time'
import { writeTokenOffer, expireTokenOffer } from '../../db/helpers/tokenoffers.js'


export function parse({ entry }){
	let takerPays = amountFromRippled(entry.TakerPays)
	let takerGets = amountFromRippled(entry.TakerGets)
	let size = takerGets.value
	let qualityHex = entry.BookDirectory.slice(-16)

	try{
		let qualityMantissa = Buffer.from(`00${qualityHex.slice(2)}`, 'hex')
			.readBigInt64BE(0)

		let qualityExponent = Buffer.from(qualityHex.slice(0, 2), 'hex')
			.readInt8(0) 
			- 100
			+ (takerPays.currency === 'XRP' ? -6 : 0) 
			- (takerGets.currency === 'XRP' ? -6 : 0)

		var quality = XFL(`${qualityMantissa}e${qualityExponent}`)
	}catch{
		return
	}

	return {
		account: { address: entry.Account },
		accountSequence: entry.Sequence,
		book: {
			takerPays: {
				currency: takerPays.currency,
				issuer: takerPays.issuer
					? { address: takerPays.issuer }
					: undefined
			},
			takerGets: {
				currency: takerGets.currency,
				issuer: takerGets.issuer
					? { address: takerGets.issuer }
					: undefined
			},
		},
		quality,
		size,
		expirationTime: entry.Expiration
			? rippleToUnix(entry.Expiration)
			: null,
		previousSequence: entry.PreviousTxnLgrSeq
	}
}

export function diff({ ctx, previous, final }){
	if(previous){
		expireTokenOffer({
			ctx,
			account: previous.account,
			accountSequence: previous.accountSequence,
			ledgerSequence: ctx.ledgerSequence,
			book: previous.book
		})
	}

	if(final){
		writeTokenOffer({
			ctx,
			account: final.account,
			accountSequence: final.accountSequence,
			ledgerSequence: ctx.ledgerSequence,
			book: final.book,
			quality: final.quality,
			size: final.size,
			expirationTime: final.expirationTime
		})
	}
}