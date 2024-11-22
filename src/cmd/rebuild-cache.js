import log from '@mwni/log'
import { openDB } from '../db/index.js'
import { updateIconCacheFor } from '../cache/icons.js'
import { 
	updateCacheForTokenProps,
	updateCacheForAccountProps,
	updateCacheForTokenExchanges,
	updateCacheForTokenMetrics,
} from '../cache/tokens.js'


export default async function({ config, args }){
	const ctx = {
		config,
		log,
		db: await openDB({ 
			ctx: { config },
			coreReadOnly: true
		})
	}

	const tokens = ctx.db.core.tokens.readMany()

	if(args.clean){
		log.time.info(`cache.wipe`, `wiping current cache`)
		ctx.db.cache.tokens.deleteMany()
		ctx.db.cache.icons.deleteMany()
		ctx.db.cache.iconUsers.deleteMany()
		ctx.db.cache.todos.deleteMany()
		log.time.info(`cache.wipe`, `wiped cache in %`)
	}

	log.time.info(`cache.tokens`, `rebuilding for`, tokens.length, `tokens`)

	for(let i=1; i<tokens.length; i++){
		let token = tokens[i]

		updateCacheForTokenProps({ ctx, token })
		updateCacheForAccountProps({ ctx, account: token.issuer })
		updateCacheForTokenExchanges({ ctx, token })
		updateCacheForTokenMetrics({ 
			ctx,
			token,
			metrics: {
				trustlines: true,
				holders: true,
				supply: true,
				marketcap: true
			}
		})

		updateIconCacheFor({
			ctx,
			account: token.issuer
		})

		updateIconCacheFor({
			ctx,
			token
		})

		log.accumulate.info({
			text: [i+1, `of`, tokens.length, `(+%rebuiltTokenCache in %time)`],
			data: { rebuiltTokenCache: 1 }
		})
	}

	log.time.info(`cache.tokens`, `rebuilt entire token cache in %`)
}