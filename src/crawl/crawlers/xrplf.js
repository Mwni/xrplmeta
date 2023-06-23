import log from '@mwni/log'
import { scheduleGlobal } from '../schedule.js'
import { createFetch } from '../../lib/fetch.js'
import { diffTokensProps } from '../../db/helpers/props.js'


export default async function({ ctx }){
	let config = ctx.config.crawl?.xrplf

	if(!config){
		throw new Error(`disabled by config`)
	}
	
	let fetch = createFetch({
		baseUrl: 'https://assessments.api.xrplf.org/api/v1'
	})

	while(true){
		await scheduleGlobal({
			ctx,
			task: 'xrplf.self-assessments',
			interval: config.crawlInterval,
			routine: async () => {
				log.info(`fetching assessments list...`)

				let tokens = []
				let { data } = await fetch('all')

				log.info(`got`, data.length, `assessments`)

				for(let assessment of data){
					if(assessment.self_assessment){
						tokens.push({
							issuer: {
								address: assessment.issuer
							},
							currency: assessment.currency_code,
							props: {
								self_assessment: true,
								weblinks: [{
									url: assessment.information,
									type: 'info',
									title: 'XRPL Foundation Self Assessment'
								}]
							}
						})
					}
				}

				diffTokensProps({
					ctx,
					tokens,
					source: 'xrplf/self-assessment'
				})

				log.info(`updated`, tokens.length, `tokens`)
			}
		})
	}
}