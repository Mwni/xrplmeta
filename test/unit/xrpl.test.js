import { expect } from 'chai'
import { createPool } from '../../src/xrpl/nodepool.js'
import log from '@mwni/log'

log.config({ level: 'error' })


describe(
	'Fetching from XRPL',
	() => {
		it(
			'should successfully retrieve ledger 80,000,000',
			async () => {
				let pool = createPool([{ url: 'wss://xrplcluster.com' }])
				let { result } = await pool.request({
					command: 'ledger',
					ledger_index: 80000000
				})

				expect(result.ledger.ledger_hash).to.be.equal('DB978F031BB14734213998060E077D5F813358222DAB07CA8148588D852A55DF')

				pool.close()
			}
		).timeout(10000)

		it(
			'should retrieve a historical ledger from a node that has it',
			async () => {
				let pool = createPool([
					{ url: 'wss://s1.ripple.com' },
					{ url: 'wss://s2.ripple.com' },
				])

				let { result } = await pool.request({
					command: 'ledger',
					ledger_index: 32570
				})

				expect(result.ledger.ledger_hash).to.be.equal('4109C6F2045FC7EFF4CDE8F9905D19C28820D86304080FF886B299F0206E42B5')

				pool.close()
			}
		).timeout(10000)
	}
)