import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import log from '@mwni/log'
import { createHash } from 'crypto'
import { unixNow } from '@xrplkit/time'
import { readAccountProps, readTokenProps } from '../db/helpers/props.js'
import { validate as validateURL } from '../lib/url.js'
import { createFetch } from '../lib/fetch.js'
import { getAccountId, getTokenId } from '../db/helpers/common.js'
import { getCommonTokenCacheFields } from './tokens.js'


const mimeTypes = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
}

export const iconSizes = [
	512,
	256,
	128,
	64
]

export async function updateIconCacheFor({ ctx, token, account }){
	let user
	let targetTokens

	if(token){
		token.id = getTokenId({ ctx, token })
		user = {
			userType: 'token',
			userId: token.id
		}
		targetTokens = [token]
	}else if(account){
		account.id = getAccountId({ ctx, account })
		user = {
			userType: 'account',
			userId: account.id
		}
		targetTokens = ctx.db.core.tokens.readMany({
			where: {
				issuer: account
			}
		})
	}else
		throw new Error(`must specify either "token" or "account"`)
	

	let using = ctx.db.cache.iconUsers.readMany({
		where: {
			...user
		},
		include: {
			icon: true
		}
	})

	let props = token
		? readTokenProps({ ctx, token })
		: readAccountProps({ ctx, account })

	let urls = props
		.filter(prop => prop.key === 'icon')
		.map(prop => prop.value)
		.filter((url, i, urls) => urls.indexOf(url) === i)
		.filter(validateURL)

	log.debug(`got ${urls.length} icon URL(s) for ${token ? `token ${token.id}` : `account ${account.id}`}`)

	for(let url of urls){
		let cache = ctx.db.cache.icons.readOne({
			where: {
				url
			}
		})

		if(!cache){
			cache = ctx.db.cache.icons.createOne({
				data: {
					url
				}
			})
		}

		ctx.db.cache.iconUsers.createOne({
			data: {
				icon: cache,
				...user
			}
		}) 

		let lifetime = cache.error
			? 60 * 10
			: (ctx.config.cache?.icons?.lifetime || 60 * 60)
		
		if(!cache.timeUpdated || cache.timeUpdated < unixNow() - lifetime){
			try{
				let { hash, fileType } = await downloadAndProcessIcon({ ctx, url })

				cache = ctx.db.cache.icons.updateOne({
					data: {
						hash,
						fileType,
						timeUpdated: unixNow()
					},
					where: {
						id: cache.id
					}
				})
			}catch(error){
				log.debug(`failed to download ${url}: ${error.message}`)

				ctx.db.cache.icons.updateOne({
					data: {
						timeUpdated: unixNow(),
						error: error.message
					},
					where: {
						id: cache.id
					}
				})

				continue
			}
		}

		for(let token of targetTokens){
			linkCachedIconToTokenCache({ 
				ctx, 
				token,
				cachedIcon: cache
			})
		}
	}

	let previouslyUsedUrls = using
		.map(use => use.icon.url)
		.filter((url, i, urls) => urls.indexOf(url) === i)

	let removedUsing = using
		.filter(use => !urls.includes(use.icon.url))

	let removedUrls = previouslyUsedUrls
		.filter(url => !urls.includes(url))

	for(let url of removedUrls){
		for(let token of targetTokens){
			unlinkCachedIconFromTokenCache({ ctx, token, url })
		}
	}

	for(let use of removedUsing){
		ctx.db.cache.iconUsers.deleteOne({
			where: {
				id: use.id
			}
		})
	}

	for(let url of previouslyUsedUrls){
		let userCount = ctx.db.cache.iconUsers.count({
			where: {
				icon:{
					url
				}
			}
		})

		if(Number(userCount) === 0){
			log.debug(`icon "${url}" has no more users - deleting it`)
			deleteIcon({ ctx, url })
		}
	}
}


function linkCachedIconToTokenCache({ ctx, token, cachedIcon }){
	let tokenCache = ctx.db.cache.tokens.readOne({
		where: {
			token: token.id
		}
	})

	if(!tokenCache){
		ctx.db.cache.tokens.createOne({
			data: {
				...getCommonTokenCacheFields({ ctx, token }),
				cachedIcons: {
					[cachedIcon.url]: `${cachedIcon.hash}.${cachedIcon.fileType}`
				}
			}
		})
	}else{
		ctx.db.cache.tokens.updateOne({
			data: {
				cachedIcons: {
					...tokenCache.cachedIcons,
					[cachedIcon.url]: `${cachedIcon.hash}.${cachedIcon.fileType}`
				}
			},
			where: {
				id: tokenCache.id
			}
		})
	}
}

function unlinkCachedIconFromTokenCache({ ctx, token, url }){
	let tokenCache = ctx.db.cache.tokens.readOne({
		where: {
			token: token.id
		}
	})

	ctx.db.cache.tokens.updateOne({
		data: {
			cachedIcons: {
				...tokenCache.cachedIcon,
				[url]: undefined
			}
		},
		where: {
			id: tokenCache.id
		}
	})
}

async function downloadAndProcessIcon({ ctx, url }){
	let fetch = createFetch()
	let res = await fetch(url, { raw: true })
	let mime = res.headers.get('content-type')
	let fileType = mimeTypes[mime]

	if(!fileType)
		throw new Error(`unsupported format: ${mime}`)

	let buffer = Buffer.from(await res.arrayBuffer())
	let hash = createHash('md5')
		.update(buffer)
		.digest('hex')
		.slice(0, 10)
		.toUpperCase()

	let makePath = suffix => getCachedIconPath({ ctx, hash, suffix, fileType })

	fs.writeFileSync(
		makePath(),
		buffer
	)

	if(fileType !== 'svg'){
		for(let size of iconSizes){
			await sharp(buffer)
				.png()
				.resize(size, size, { fit: 'cover' })
				.toFile(makePath(`@${size}`))
		}
	}

	log.debug(`downloaded ${url} (hash ${hash})`)

	return { hash, fileType }
}

function deleteIcon({ ctx, url }){
	let icon = ctx.db.cache.icons.readOne({
		where: {
			url
		}
	})

	fs.rmSync(getCachedIconPath({ ctx, ...icon }))

	if(icon.fileType !== 'svg'){
		for(let size of iconSizes){
			fs.rmSync(getCachedIconPath({ ctx, ...icon, suffix: `@${size}` }))
		}
	}

	ctx.db.cache.icons.deleteOne({
		where: {
			id: icon.id
		}
	})
}

function getIconCacheDir({ ctx }){
	let dir = path.join(ctx.config.node.dataDir, 'media', 'icons')

	if(!fs.existsSync(dir))
		fs.mkdirSync(dir, { recursive: true })

	return dir
}

export function getCachedIconPath({ ctx, hash, suffix, fileType }){
	return path.join(getIconCacheDir({ ctx }), `${hash}${suffix || ''}.${fileType}`)
}