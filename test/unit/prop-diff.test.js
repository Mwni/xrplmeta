import { expect } from 'chai'
import { createContext } from './env.js'
import { diffMultiAccountProps, diffMultiTokenProps } from '../../src/db/helpers/props.js'
import { reduceProps } from '../../src/srv/procedures/token.js'
import { updateCacheForTokenProps } from '../../src/cache/tokens.js'


const ctx = await createContext()

const accounts = [
	{
		address: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp',
		props: {
			name: 'Account Zero',
			trust_level: 3
		}
	},
	{
		address: 'rrrrrrrrrrrrrrrrrrrrBZbvji',
		props: {
			name: 'Account One',
			trust_level: 3
		}
	},
	{
		address: 'rrrrrrrrrrrrrrrrrrrn5RM1rHd',
		props: {
			name: 'NaN Address',
			trust_level: 1
		}
	}
]

const tokens = [
	{
		currency: 'XAU',
		issuer: {
			address: accounts[0].address
		},
		props: {
			name: 'Gold',
			asset_class: 'commodity'
		}
	},
	{
		currency: 'XAG',
		issuer: {
			address: accounts[1].address
		},
		props: {
			name: 'Silver',
			asset_class: 'commodity'
		}
	},
	{
		currency: 'USD',
		issuer: {
			address: accounts[2].address
		},
		props: {
			name: 'US Dollar',
			asset_class: 'fiat'
		}
	}
]

describe(
	'Diffing account props',
	() => {
		it(
			'execute with new data',
			() => {
				diffMultiAccountProps({
					ctx,
					accounts,
					source: 'test'
				})
			}
		)

		it(
			'should insert all props',
			() => {
				expect(ctx.db.core.accountProps.readMany().length).to.be.equal(6)
			}
		)

		it(
			'execute with one account removed',
			() => {
				diffMultiAccountProps({
					ctx,
					accounts: accounts.slice(0, 2),
					source: 'test'
				})
			}
		)

		it(
			'should have removed the removed account\'s props',
			() => {
				expect(ctx.db.core.accountProps.readMany().length).to.be.equal(4)
			}
		)

		it(
			'should also remove specific removed props',
			() => {
				let accountsChanged = structuredClone(accounts)

				delete accountsChanged[0].props.name

				diffMultiAccountProps({
					ctx,
					accounts: accountsChanged,
					source: 'test'
				})

				expect(ctx.db.core.accountProps.readMany().length).to.be.equal(5)
			}
		)
	}
)


describe(
	'Diffing token props',
	() => {
		it(
			'execute with new data',
			() => {
				diffMultiTokenProps({
					ctx,
					tokens,
					source: 'test'
				})
			}
		)

		it(
			'should insert all props',
			() => {
				expect(ctx.db.core.tokenProps.readMany().length).to.be.equal(6)
			}
		)

		it(
			'execute with one token removed',
			() => {
				diffMultiTokenProps({
					ctx,
					tokens: tokens.slice(0, 2),
					source: 'test'
				})
			}
		)

		it(
			'should have removed the removed token\'s props',
			() => {
				expect(ctx.db.core.tokenProps.readMany().length).to.be.equal(4)
			}
		)

		it(
			'should also remove specific removed props',
			() => {
				let tokensChanged = structuredClone(tokens)

				delete tokensChanged[0].props.name

				diffMultiTokenProps({
					ctx,
					tokens: tokensChanged,
					source: 'test'
				})

				expect(ctx.db.core.tokenProps.readMany().length).to.be.equal(5)
			}
		)

		it(
			'should have the correct token prop cache',
			() => {
				for(let { currency, issuer } of tokens){
					updateCacheForTokenProps({ 
						ctx, 
						token: { currency, issuer } 
					})
				}

				let props = ctx.db.cache.tokens.readMany()
					.map(cache => reduceProps({ props: cache.tokenProps }))

				let expectedProps = tokens
					.map(({ props }) => props)
					.slice(0, 3)

				delete expectedProps[0].name

				expect(props).to.be.deep.equal(expectedProps)
			}
		)
	}
)
