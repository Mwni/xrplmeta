import log from '@mwni/log'
import { scheduleGlobal, scheduleIterator } from '../schedule.js'
import { createFetch } from '../../lib/fetch.js'
import { diffMultiAccountProps, diffMultiTokenProps, writeAccountProps } from '../../db/helpers/props.js'


export default async function({ ctx }){
	let config = ctx.config.source.xumm

	if(!config || config.disabled){
		throw new Error(`disabled by config`)
	}
	
	let fetchApi = createFetch({
		baseUrl: 'https://xumm.app/api/v1/platform/',
		headers: {
			'x-api-key': config.apiKey, 
			'x-api-secret': config.apiSecret
		},
		ratelimit: config.maxRequestsPerMinute
	})

	let fetchAvatar = createFetch({
		baseUrl: 'https://xumm.app/avatar/',
		ratelimit: config.maxRequestsPerMinute 
	})

	await Promise.all([
		crawlAssets({
			ctx,
			fetch: fetchApi,
			interval: config.fetchIntervalAssets
		}),
		crawlKyc({
			ctx,
			fetch: fetchApi,
			interval: config.fetchIntervalKyc
		}),
		crawlAvatar({
			ctx,
			fetch: fetchAvatar,
			interval: config.fetchIntervalAvatar
		})
	])
}

async function crawlAssets({ ctx, fetch, interval }){
	while(true){
		await scheduleGlobal({
			ctx,
			task: 'xumm.curated',
			interval,
			routine: async () => {
				log.info(`fetching curated asset list...`)

				let tokens = []
				let accounts = []

				let { data } = await fetch('curated-assets')

				if(!data?.details){
					log.warn(`got malformed XUMM curated asset list:`, data)
					throw new Error(`malformed response`)
				}

				log.info(`got ${Object.values(data.details).length} curated assets`)

				for(let issuer of Object.values(data.details)){
					if(issuer.info_source.type !== 'native')
						continue

					for(let currency of Object.values(issuer.currencies)){
						accounts.push({
							address: currency.issuer,
							props: {
								name: issuer.name.length > 0
									? issuer.name
									: undefined,
								domain: issuer.domain,
								icon: issuer.avatar,
								trust_level: issuer.shortlist ? 3 : 2
							}
						})
						
						tokens.push({
							currency: currency.currency,
							issuer: {
								address: currency.issuer
							},
							props: {
								name: currency.name > 0
									? currency.name
									: undefined,
								icon: currency.avatar,
								trust_level: (
									currency.info_source.type === 'native'
										? (currency.shortlist ? 3 : 2)
										: 1
								)
							}
						})
					}
				}

				diffMultiAccountProps({ 
					ctx, 
					accounts,
					source: 'xumm/curated'
				})

				diffMultiTokenProps({
					ctx, 
					tokens,
					source: 'xumm/curated'
				})

				log.info(`updated`, tokens.length, `tokens and`, accounts.length, `issuers`)
			}
		})
	}
}


async function crawlKyc({ ctx, fetch, interval }){
	while(true){
		await scheduleIterator({
			ctx,
			type: 'issuer',
			task: 'xumm.kyc',
			interval,
			routine: async ({ id, address }) => {
				log.debug(`checking KYC for ${address}`)

				let { data } = await fetch(`kyc-status/${address}`)

				writeAccountProps({
					ctx,
					account: { id },
					props: {
						kyc: data.kycApproved
					},
					source: 'xumm/kyc'
				})

				log.debug(`KYC for ${address}: ${data.kycApproved}`)
	
				log.accumulate.info({
					text: [`%kycChecked KYC checked in %time`],
					data: {
						kycChecked: 1
					}
				})
			}
		})
	}
}

async function crawlAvatar({ ctx, fetch, interval }){
	while(true){
		await scheduleIterator({
			ctx,
			type: 'issuer',
			task: 'xumm.avatar',
			interval,
			routine: async ({ id, address }) => {
				log.debug(`checking avatar for ${address}`)

				let { headers } = await fetch(
					`${address}.png`, 
					{ redirect: 'manual' }
				)

				let avatar = headers.get('location')
					? headers.get('location').split('?')[0]
					: undefined
	
				writeAccountProps({
					ctx,
					account: { id },
					props: {
						icon: avatar
					},
					source: 'xumm/avatar'
				})

				log.debug(`avatar for ${address}: ${avatar}`)
				
				log.accumulate.info({
					text: [`%avatarsChecked avatars checked in %time`],
					data: {
						avatarsChecked: 1
					}
				})
			}
		})
	}
}