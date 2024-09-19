import log from '@mwni/log'
import { scheduleGlobal } from '../schedule.js'
import { createFetch } from '../../lib/fetch.js'
import { diffMultiAccountProps } from '../../db/helpers/props.js'

const socialMediaUrls = {
	twitter: `https://twitter.com/%`,
	facebook: `https://facebook.com/%`,
	youtube: `https://youtube.com/c/%`,
	instagram: `https://instagram.com/%`,
	linkedin: `https://linkedin.com/%`,
	reddit: `https://reddit.com/u/%`,
	medium: `https://medium.com/@%`,
	telegram: `https://t.me/%`,
}


export default async function({ ctx }){
	let config = ctx.config.source.bithomp

	if(!config || config.disabled){
		throw new Error(`disabled by config`)
	}
	
	let fetch = createFetch({
		baseUrl: 'https://bithomp.com/api/v2', 
		headers: {
			'x-bithomp-token': config.apiKey
		}
	})

	while(true){
		await scheduleGlobal({
			ctx,
			task: 'bithomp.services',
			interval: config.fetchInterval,
			routine: async () => {
				log.info(`fetching services list...`)

				let accounts = []

				let { data } = await fetch('services')
				let services = data.services

				log.info(`got`, services.length, `services`)

				for(let service of services){
					for(let { address } of service.addresses){
						let weblinks = undefined

						if(service.socialAccounts && service.socialAccounts.length > 0){
							weblinks = Object.entries(service.socialAccounts).map(
								([key, handle]) => ({
									url: socialMediaUrls[key].replace('%', handle),
									type: 'socialmedia'
								})
							)
						}

						accounts.push({
							address,
							props: {
								name: service.name,
								domain: service.domain,
								weblinks,
							},
						})
					}
				}

				diffMultiAccountProps({
					ctx,
					accounts,
					source: 'bithomp/services'
				})

				log.info(`updated`, accounts.length, `issuers`)
			}
		})
	}
}