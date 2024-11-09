import log from '@mwni/log'
import { parse as parseXLS26 } from '@xrplkit/xls26'
import { createFetch } from '../../../src/lib/fetch.js'


export default async ({ config, args }) => {
	let tomlUrl = args._[1]
	let fetch = createFetch()

	if(!tomlUrl){
		throw new Error(`no toml url provided. use: npm livetest read.toml [url]`)
	}

	log.info(`fetching ${tomlUrl}`)

	let { status, data } = await fetch(tomlUrl)
	
	if(status !== 200){
		throw new Error(`HTTP ${status}: ${tomlUrl}`)
	}

	let xls26 = parseXLS26(data)

	log.info(`parsed xls26:\n`, xls26)
}