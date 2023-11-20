import { isSameCurrency } from '@xrplkit/amount'
import { markCacheDirtyForAccountProps, markCacheDirtyForTokenProps } from '../../cache/todo.js'



export function diffTokensProps({ ctx, tokens, source }){
	for(let { currency, issuer, props } of tokens){
		writeTokenProps({
			ctx,
			token: {
				currency,
				issuer
			},
			props,
			source
		})
	}

	let staleProps = ctx.db.core.tokenProps.readMany({
		where: {
			NOT: {
				OR: tokens.map(
					({ currency, issuer }) => ({
						token: {
							currency,
							issuer
						}
					})
				)
			},
			source
		},
		include: {
			token: true
		}
	})

	ctx.db.core.tokenProps.deleteMany({
		where: {
			id: {
				in: staleProps.map(
					({ id }) => id
				)
			}
		}
	})

	let deletionAffectedTokens = staleProps
		.map(({ token }) => token)
		.filter(
			(token, index, tokens) => index === tokens.findIndex(
				({ currency, issuer }) => isSameCurrency(token, { currency, issuer })
			)
		)
	
	for(let token of deletionAffectedTokens){
		markCacheDirtyForTokenProps({ ctx, token })
	}
}

export function diffAccountsProps({ ctx, accounts, source }){
	for(let { address, props } of accounts){
		writeAccountProps({
			ctx,
			account: {
				address
			},
			props,
			source
		})
	}

	let accountIds = ctx.db.core.accounts.readMany({
		select: {
			id: true
		},
		where: {
			address: {
				in: accounts.map(
					({ address }) => address
				)
			}
		}
	}).map(
		({ id }) => id
	)

	let staleProps = ctx.db.core.accountProps.readMany({
		where: {
			NOT: {
				account: {
					id: {
						in: accountIds
					}
				}
			},
			source
		}
	})

	ctx.db.core.accountProps.deleteMany({
		where: {
			id: {
				in: staleProps.map(
					({ id }) => id
				)
			}
		}
	})

	let deletionAffectedAccounts = staleProps
		.map(({ account }) => account)
		.filter(
			(account, index, accounts) => index === accounts.findIndex(
				({ address }) => address === account.address
			)
		)
	
	for(let account of deletionAffectedAccounts){
		markCacheDirtyForAccountProps({ ctx, account })
	}
}


export function readTokenProps({ ctx, token }){
	let props = ctx.db.core.tokenProps.readMany({
		where: {
			token
		}
	})
	
	let issuerKycProps = ctx.db.core.accountProps.readMany({
		where: {
			account: token.issuer,
			key: 'kyc',
			value: true
		}
	})

	for(let { source } of issuerKycProps){
		let existingTrustProp = props.find(
			prop => prop.key === 'trust_level' && prop.source === source
		)

		if(existingTrustProp){
			existingTrustProp.value = Math.max(existingTrustProp.value, 1)
		}else{
			props.push({
				key: 'trust_level',
				value: 1,
				source
			})
		}
	}
	
	return props.map(({ key, value, source }) => ({ key, value, source }))
}

export function writeTokenProps({ ctx, token, props, source }){
	ctx.db.core.tx(() => {
		for(let [key, value] of Object.entries(props)){
			if(value == null){
				ctx.db.core.tokenProps.deleteOne({
					where: {
						token,
						key,
						source
					}
				})
			}else{
				ctx.db.core.tokenProps.createOne({
					data: {
						token,
						key,
						value,
						source
					}
				})
			}
		}
	})

	markCacheDirtyForTokenProps({ ctx, token })
}


export function readAccountProps({ ctx, account }){
	let props = ctx.db.core.accountProps.readMany({
		where: {
			account
		}
	})

	let kycProps = props.filter(
		prop => prop.key === 'kyc' && prop.value === true
	)

	for(let { source } of kycProps){
		let trustProp = props.find(
			prop => prop.key === 'trust_level' && prop.source === source
		)

		if(trustProp){
			trustProp.value = Math.max(trustProp.value, 1)
		}else{
			props.push({
				key: 'trust_level',
				value: 1,
				source
			})
		}
	}

	account = ctx.db.core.accounts.readOne({
		where: account
	})
	
	if(account?.domain)
		props.push({
			key: 'domain',
			value: account.domain,
			source: 'ledger'
		})


	return props.map(({ key, value, source }) => ({ key, value, source }))
}

export function writeAccountProps({ ctx, account, props, source }){
	ctx.db.core.tx(() => {
		for(let [key, value] of Object.entries(props)){
			if(value == null){
				ctx.db.core.accountProps.deleteOne({
					where: {
						account,
						key,
						source
					}
				})
			}else{
				ctx.db.core.accountProps.createOne({
					data: {
						account,
						key,
						value,
						source
					}
				})
			}
		}
	})

	markCacheDirtyForAccountProps({ ctx, account })
}


export function clearTokenProps({ ctx, token, source }){
	let deletedNum = ctx.db.core.tokenProps.deleteMany({
		where: {
			token,
			source
		}
	})
	
	if(deletedNum > 0)
		markCacheDirtyForTokenProps({ ctx, token })
}

export function clearAccountProps({ ctx, account, source }){
	let deletedNum = ctx.db.core.accountProps.deleteMany({
		where: {
			account,
			source
		}
	})
	
	if(deletedNum > 0)
		markCacheDirtyForAccountProps({ ctx, account })
}