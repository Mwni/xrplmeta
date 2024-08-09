import { expect } from 'chai'
import { createContext } from './env.js'
import { diffAccountsProps, diffTokensProps } from '../../src/db/helpers/props.js'
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
				diffAccountsProps({
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
			'execute with one entry removed',
			() => {
				diffAccountsProps({
					ctx,
					accounts: accounts.slice(0, 2),
					source: 'test'
				})
			}
		)

		it(
			'should have removed the redacted props',
			() => {
				expect(ctx.db.core.accountProps.readMany().length).to.be.equal(4)
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
				diffTokensProps({
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
			'execute with one entry removed',
			() => {
				diffTokensProps({
					ctx,
					tokens: tokens.slice(0, 2),
					source: 'test'
				})
			}
		)

		it(
			'should have removed the redacted props',
			() => {
				expect(ctx.db.core.tokenProps.readMany().length).to.be.equal(4)
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

				expect(props).to.be.deep.equal(
					tokens
						.map(({ props }) => props)
						.slice(0, 2)
						.concat([{}])
				)
			}
		)
	}
)
