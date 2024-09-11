import minimist from 'minimist'
import log from '@mwni/log'
import { find as findConfig } from './lib/config.js'
import { load as loadConfig } from './lib/config.js'
import { override as overrideConfig } from './lib/config.js'
import startApp from './app/main.js'
import rebuildCache from './cmd/rebuild-cache.js'
import backup from './cmd/backup.js'
import version from './lib/version.js'


const args = minimist(process.argv.slice(2))
const configPath = args.config
	? args.config
	: findConfig()

	
log.config({ level: args.log || 'info', root: '.' })
	.info(`*** XRPLMETA NODE ${version} ***`)
	.info(`using config at "${configPath}"`)


const baseConfig = loadConfig(configPath, true)
const config = overrideConfig(baseConfig, args)

if(args._[0] === 'rebuild-cache'){
	log.info(`rebuilding cache at "${config.node.dataDir}"`)
	await rebuildCache({ config, args })
}else if(args._[0] === 'backup'){
	let destinationFile = args._[1]

	if(!destinationFile){
		log.error(`backup destination file path is missing`)
		process.exit(1)
	}

	log.info(`writing backup to "${destinationFile}"`)
	await backup({ config, destinationFile })
}else if(args._.length === 0 || args._[0] === 'run'){
	log.info(`data directory is at "${config.node.dataDir}"`)
	log.info(`will start app now`)

	const app = await startApp({ config, args })

	process.on('SIGINT', async () => {
		await app.terminate()
		process.exit(0)
	})
}else{
	log.error(`unknown command "${args._[0]}"`)
	process.exit(1)
}