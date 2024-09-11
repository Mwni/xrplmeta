import log from '@mwni/log'
import { spawn } from '@mwni/workers'
import { openDB } from '../db/index.js'
import crawlers from './crawlers/index.js'


export async function startCrawlers({ ctx }){
	if(ctx.config.crawl?.disabled){
		log.warn(`skipping all crawlers (disabled by config)`)
		return
	}

	for(let { name } of crawlers){
		spawn(':spawnCrawler', { ctx, name })
	}
}

export async function spawnCrawler({ ctx, name }){
	let { start } = crawlers.find(crawler => crawler.name === name)
	let crashed = false

	log.pipe(ctx.log)

	ctx = {
		...ctx,
		db: await openDB({ ctx })
	}

	start({ ctx })
		.catch(error => {
			log.warn(`skipping crawler [${name}]:`, error.message)
			crashed = true
		})

	await Promise.resolve()

	if(!crashed){
		log.info(`started crawler [${name}]`)
	}else{
		process.exit()
	}
}