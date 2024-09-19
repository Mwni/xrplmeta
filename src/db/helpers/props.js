import { isSameToken } from '@xrplkit/tokens'
import { readTokenMetrics } from './tokenmetrics.js'
import { 
	markCacheDirtyForAccountIcons, 
	markCacheDirtyForAccountProps, 
	markCacheDirtyForTokenIcons, 
	markCacheDirtyForTokenProps 
} from '../../cache/todo.js'



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
					({ currency, issuer, props }) => ({
						token: {
							currency,
							issuer
						},
						key: {
							in: Object.keys(props)
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
				({ currency, issuer }) => isSameToken(token, { currency, issuer })
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
			id: true,
			address: true
		},
		where: {
			address: {
				in: accounts.map(
					({ address }) => address
				)
			}
		}
	})

	let staleProps = ctx.db.core.accountProps.readMany({
		where: {
			NOT: {
				OR: accounts.map(
					({ address, props }) => ({
						account: {
							id: accountIds
								.find(account => account.address === address)
								.id
						},
						key: {
							in: Object.keys(props)
						}
					})
				)
			},
			source
		},
		include: {
			account: true
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

	let issuerGivenTrustLevelProps = []
	let issuerProps = readAccountProps({
		ctx,
		account: token.issuer
			? token.issuer
			: ctx.db.core.tokens.readOne({ where: token }).issuer
	})

	for(let { key, value, source } of issuerProps){
		if(key !== 'trust_level')
			continue

		let existingTrustProp = props.find(
			prop => prop.key === 'trust_level' && prop.source === source
		)

		if(existingTrustProp){
			existingTrustProp.value = Math.max(existingTrustProp.value, 1)
		}else{
			issuerGivenTrustLevelProps.push({
				key: 'trust_level',
				value,
				source
			})
		}
	}

	if(issuerGivenTrustLevelProps.length > 0){
		let { holders } = readTokenMetrics({ 
			ctx, 
			token, 
			metrics: {
				holders: true
			}
		})

		if(holders > 0){
			props.push(...issuerGivenTrustLevelProps)
		}
	}
	
	return props.map(({ key, value, source }) => ({ key, value, source }))
}

export function writeTokenProps({ ctx, token, props, source }){
	if(Object.keys(props).length === 0)
		return

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

	if(props.hasOwnProperty('icon'))
		markCacheDirtyForTokenIcons({ ctx, token })
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

	let { domain } = ctx.db.core.accounts.readOne({
		where: account,
		select: {
			domain: true
		}
	})
	
	if(domain)
		props.push({
			key: 'domain',
			value: domain,
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

	if(props.hasOwnProperty('icon'))
		markCacheDirtyForAccountIcons({ ctx, account })
}


export function clearTokenProps({ ctx, token, source }){
	let deletedNum = ctx.db.core.tokenProps.deleteMany({
		where: {
			token,
			source
		}
	})
	
	if(deletedNum > 0){
		markCacheDirtyForTokenProps({ ctx, token })
		markCacheDirtyForTokenIcons({ ctx, token })
	}
}

export function clearAccountProps({ ctx, account, source }){
	let deletedNum = ctx.db.core.accountProps.deleteMany({
		where: {
			account,
			source
		}
	})
	
	if(deletedNum > 0){
		markCacheDirtyForAccountProps({ ctx, account })
		markCacheDirtyForAccountIcons({ ctx, account })
	}
}