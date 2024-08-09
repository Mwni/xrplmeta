import { encodeAccountID } from 'ripple-address-codec'
import { amountFromRippled } from '@xrplkit/tokens'
import { rippleToUnix } from '@xrplkit/time'
import { expireNFTokenOffer, writeNFTokenOffer } from '../../db/helpers/nftoffers.js'


export function parse({ index, entry }){
	let amountToken
	let amountValue
	let issuer = encodeAccountID(Buffer.from(entry.NFTokenID.slice(8, 48), 'hex'))
	let isSellOffer = entry.Flags & 0x00000001
	let expirationTime = entry.Expiration
		? rippleToUnix(entry.Expiration)
		: null

		
	if(entry.Amount){
		let { currency, issuer, value } = amountFromRippled(entry.Amount)

		amountValue = value
		amountToken = currency === 'XRP'
			? { id: 1 }
			: {
				currency,
				issuer: {
					address: issuer
				}
			}
	}

	return {
		account: {
			address: entry.Owner
		},
		offerId: index,
		nft: {
			tokenId: entry.NFTokenID,
			issuer: {
				address: issuer
			}
		},
		destination: entry.Destination
			? { address: entry.Destination }
			: null,
		amountToken,
		amountValue,
		isSellOffer,
		expirationTime
	}
}



export function diff({ ctx, previous, final }){
	if(previous){
		expireNFTokenOffer({
			...previous,
			ctx,
			ledgerSequence: ctx.ledgerSequence,
		})
	}

	if(final){
		writeNFTokenOffer({
			...final,
			ctx,
			ledgerSequence: ctx.ledgerSequence,
		})
	}
}