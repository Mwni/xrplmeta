import path from 'path'
import log from '@mwni/log'
import { createContext } from '../../unit/env.js'
import { writeTokenProps } from '../../../src/db/helpers/props.js'
import { updateIconCacheFor } from '../../../src/cache/icons.js'



export default async ({ config, args }) => {
	let ctx = await createContext()
	let iconUrl = args._[1]
	
	if(!iconUrl)
		throw new Error(`no icon url provided. use: npm livetest icon.cache [url]`)

	let token = {
		currency: '000',
		issuer: {
			address: 'rrrrrrrrrrrrrrrrrrrrrhoLvTp',
		},
		props: {
			icon: iconUrl
		}
	}

	writeTokenProps({
		ctx,
		token: {
			currency: token.currency,
			issuer: token.issuer
		},
		props: token.props,
		source: 'test'
	})

	log.config({ level: 'debug' })
	log.info(`downloading and caching ${iconUrl}...`)

	await updateIconCacheFor({ 
		ctx, 
		token: {
			currency: token.currency,
			issuer: token.issuer
		}
	})

	log.info(`icon cache registry:`, ctx.db.cache.icons.readMany()[0])
	log.info(`generated token meta:`, ctx.db.cache.tokens.readOne({
		where: {
			token: 2
		}
	}).cachedIcons)
	log.info(`icon file and variants cached at ${path.join(ctx.config.node.dataDir, 'media', 'icons')}`)
}