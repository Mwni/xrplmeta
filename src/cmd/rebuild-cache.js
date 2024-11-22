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

	let tokens

	if(args.token){
		let [currency, issuer] = args.token.split(':')

		tokens = [ctx.db.core.tokens.readOne({
			where: {
				currency,
				issuer: {
					address: issuer
				}
			}
		})]

		if(!tokens[0])
			throw new Error(`token "${args.token}" not found`)
	}else{
		tokens = ctx.db.core.tokens.readMany().slice(1) // first is XRP

		if(args.clean){
			log.time.info(`cache.wipe`, `wiping current cache`)
			ctx.db.cache.tokens.deleteMany()
			ctx.db.cache.icons.deleteMany()
			ctx.db.cache.iconUsers.deleteMany()
			ctx.db.cache.todos.deleteMany()
			log.time.info(`cache.wipe`, `wiped cache in %`)
		}
	}

	log.time.info(`cache.tokens`, `rebuilding for`, tokens.length, `token(s)`)

	for(let i=0; i<tokens.length; i++){
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

		await updateIconCacheFor({
			ctx,
			account: token.issuer
		})

		await updateIconCacheFor({
			ctx,
			token
		})

		log.accumulate.info({
			text: [i+1, `of`, tokens.length, `(+%rebuiltTokenCache in %time)`],
			data: { rebuiltTokenCache: 1 }
		})
	}

	log.time.info(`cache.tokens`, `rebuilt token cache in %`)
}