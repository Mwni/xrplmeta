import log from '@mwni/log'
import { parse as parseXLS26 } from '@xrplkit/xls26'
import { scheduleGlobal } from '../schedule.js'
import { createFetch } from '../../lib/fetch.js'
import { diffMultiAccountProps, diffMultiTokenProps } from '../../db/helpers/props.js'
import { currencyUTF8ToHex } from '@xrplkit/tokens'


export default async function({ ctx }){
	let configs = ctx.config.source.tokenlists

	if(!configs || configs.length == 0){
		throw new Error(`disabled by config`)
	}

	await Promise.all(
		configs
			.filter(config => !config.disabled)
			.map(config => crawlList({ ctx, ...config }))
	)
}

async function crawlList({ ctx, id, url, fetchInterval = 600, trustLevel = 0, ignoreAdvisories = false }){
	let fetch = createFetch({
		baseUrl: url
	})

	while(true){
		await scheduleGlobal({
			ctx,
			task: `tokenlist.${id}`,
			interval: fetchInterval,
			routine: async () => {
				log.info(`reading ${url}`)

				let tokens = []
				let accounts = []

				let { status, data } = await fetch()
			
				if(status !== 200){
					throw `${url}: HTTP ${response.status}`
				}

				try{
					var { issuers: declaredIssuers, tokens: declaredTokens, issues, advisories } = parseXLS26(data)
				}catch(error){
					console.log(error)
					throw error
				}

				if(issues.length > 0){
					log.debug(`tokenlist [${id}] has issues: ${
						issues
							.map(issue => `  - ${issue}`)
							.join(`\n`)
					}`)
				}
				
				for(let { address, ...props } of declaredIssuers){
					if(props.hasOwnProperty('trust_level'))
						props.trust_level = Math.min(props.trust_level, trustLevel)

					accounts.push({
						address,
						props
					})
				}

				for(let { currency, issuer, ...props } of declaredTokens){
					if(props.hasOwnProperty('trust_level'))
						props.trust_level = Math.min(props.trust_level, trustLevel)

					tokens.push({
						currency: currencyUTF8ToHex(currency),
						issuer: {
							address: issuer
						},
						props
					})
				}

				let advisoryUpdates = 0

				if(!ignoreAdvisories && trustLevel > 0){
					let groupedAdvisories = {}

					for(let { address, ...props } of advisories){
						if(!groupedAdvisories[address])
							groupedAdvisories[address] = []

						groupedAdvisories[address].push(props)
					}

					for(let [address, advisories] of Object.entries(groupedAdvisories)){
						advisoryUpdates++
						accounts.push({
							address,
							props: {
								advisories
							}
						})
					}
				}
				
				diffMultiAccountProps({
					ctx,
					accounts,
					source: `tokenlist/${id}`
				})

				diffMultiTokenProps({
					ctx,
					tokens,
					source: `tokenlist/${id}`
				})

				log.info(`tokenlist [${id}] synced (issuers: ${issues.length} tokens: ${tokens.length} advisories: ${advisoryUpdates})`)
			}
		})
	}
}