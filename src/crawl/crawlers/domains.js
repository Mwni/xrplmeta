import log from '@mwni/log'
import { parse as parseXLS26 } from '@xrplkit/xls26'
import { parse as parseURL } from 'url'
import { sanitize as sanitizeURL } from '../../lib/url.js'
import { scheduleIterator } from '../schedule.js'
import { createFetch } from '../../lib/fetch.js'
import { clearAccountProps, clearTokenProps, readAccountProps, writeAccountProps, writeTokenProps } from '../../db/helpers/props.js'
import { currencyUTF8ToHex } from '@xrplkit/tokens'
import { reduceProps } from '../../srv/procedures/token.js'


const tomlStandardPath = '.well-known/xrp-ledger.toml'


export default async function({ ctx }){
	let config = ctx.config.source.issuerdomain

	if(!config || config.disabled){
		throw new Error(`disabled by config`)
	}
	
	let fetch = createFetch({
		timeout: config.connectionTimeout || 20
	})

	while(true){
		await scheduleIterator({
			ctx,
			type: 'issuer',
			task: 'domains',
			interval: config.fetchInterval,
			concurrency: 3,
			routine: async ({ id, address }) => {
				let { domain } = reduceProps({
					props: readAccountProps({ 
						ctx, 
						account: { id } 
					}),
					sourceRanking: [
						'tokenlist',
						'ledger',
						'issuer/domain',
						'xumm',
						'bithomp',
						'xrpscan',
						'twitter'
					]
				})

				if(domain){
					try{
						var xls26 = await fetchToml({ domain, fetch })
					}catch(error){
						log.debug(`issuer (${address}): ${error.message}`)
						return
					}finally{
						log.accumulate.info({
							text: [`%xrplTomlLookups xrp-ledger.toml lookups in %time`],
							data: {
								xrplTomlLookups: 1
							}
						})
					}

					let publishedIssuers = 0
					let publishedTokens = 0
					
					for(let { address: issuer, ...props } of xls26.issuers){
						if(issuer !== address)
							continue

						delete props.trust_level

						writeAccountProps({
							ctx,
							account: {
								address: issuer
							},
							props,
							source: `issuer/domain/${address}`
						})

						publishedIssuers++
					}

					for(let { currency, issuer, ...props } of xls26.tokens){
						if(issuer !== address)
							continue

						delete props.trust_level

						writeTokenProps({
							ctx,
							token: {
								currency: currencyUTF8ToHex(currency),
								issuer: {
									address: issuer
								}
							},
							props,
							source: `issuer/domain/${address}`
						})

						publishedTokens++
					}

					log.debug(`issuer (${address}) valid xls26:`, xls26)

					if(publishedIssuers || publishedTokens){
						log.accumulate.info({
							text: [`%domainIssuersUpdated issuers and %domainTokensUpdated tokens updated in %time`],
							data: {
								domainIssuersUpdated: publishedIssuers,
								domainTokensUpdated: publishedTokens,
							}
						})
					}
				}else{
					clearAccountProps({
						ctx,
						account: { id },
						source: `issuer/domain/${address}`
					})

					for(let token of ctx.db.core.tokens.readMany({ 
						where: {
							issuer: { id }
						}
					})){
						clearTokenProps({
							ctx,
							token,
							source: `issuer/domain/${address}`
						})
					}
				}
			}
		})
	}
}

export async function fetchToml({ domain, fetch }){
	let { protocol, host, pathname } = parseURL(domain)

	if(protocol && protocol !== 'https:' && protocol !== 'http:')
		throw new Error(`unsupported protocol: ${domain}`)

	if(!host)
		host = ''

	if(!pathname)
		pathname = ''

	let tomlUrls = (protocol ? [protocol] : ['https:', 'http:'])
		.map(protocol => `${protocol}//${host}${pathname}/${tomlStandardPath}`)
		.map(sanitizeURL)

	for(let tomlUrl of tomlUrls){
		log.debug(`fetching ${tomlUrl}`)

		try{
			let { status, data } = await fetch(tomlUrl)

			if(status !== 200)
				throw new Error(`HTTP ${status}`)

			return parseXLS26(data)
		}catch(error){
			if(tomlUrl === tomlUrls.at(-1))
				throw new Error(
					error.message.includes(tomlUrl)
						? error.message
						: `${tomlUrl} -> ${error.message}`
				)
		}
	}
}