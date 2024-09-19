import log from '@mwni/log'
import { scheduleGlobal } from '../schedule.js'
import { createFetch } from '../../lib/fetch.js'
import { diffMultiAccountProps } from '../../db/helpers/props.js'


export default async function({ ctx }){
	let config = ctx.config.source.xrpscan

	if(!config || config.disabled){
		throw new Error(`disabled by config`)
	}
	
	let fetch = createFetch({
		baseUrl: 'https://api.xrpscan.com/api/v1'
	})

	while(true){
		await scheduleGlobal({
			ctx,
			task: 'xrpscan.well-known',
			interval: config.fetchInterval,
			routine: async () => {
				log.info(`fetching well-known list...`)

				let accounts = []
				let { data } = await fetch('names/well-known')

				log.info(`got`, data.length, `well known`)

				for(let { account, name, domain, twitter } of data){
					let weblinks = undefined

					if(twitter){
						weblinks = [{
							url: `https://twitter.com/${twitter}`,
							type: `socialmedia`
						}]
					}

					accounts.push({
						address: account,
						props: {
							name,
							domain,
							weblinks
						},
					})
				}

				diffMultiAccountProps({
					ctx,
					accounts,
					source: 'xrpscan/well-known'
				})

				log.info(`updated`, accounts.length, `issuers`)
			}
		})
	}
}