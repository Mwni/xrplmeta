import fs from 'fs'
import path from 'path'
import minimist from 'minimist'
import { fileURLToPath } from 'url'
import log from '@mwni/log'
import { find as findConfig } from '../../src/lib/config.js'
import { load as loadConfig } from '../../src/lib/config.js'
import { override as overrideConfig } from '../../src/lib/config.js'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


const args = minimist(process.argv.slice(2))
const component = args._[0]
const configPath = args.config
	? args.config
	: findConfig()


const cases = fs.readdirSync(path.join(__dirname, 'cases'))
	.map(file => file.slice(0, -3))

if(!cases.includes(component)){
	log.warn(`no test case selected!`)
	log.info(`available cases are:`)

	for(let key of cases){
		log.info(`  - ${key}`)
	}
	
	process.exit(1)
}

	
log.config({ 
	level: args.log || 'debug',
	dir: path.resolve(
		path.join(__dirname, '..', '..')
	)
})
log.info(`*** XRPLMETA NODE LIVE COMPONENT TEST ***`)
log.info(`testing component "${component}"`)
log.info(`using config at "${configPath}"`)


const baseConfig = loadConfig(configPath, true)
const config = overrideConfig(baseConfig, args)

if(args.testdb){
	const testDataDir = path.join(__dirname, 'data')

	log.info(`overriding data dir to "${testDataDir}"`)

	Object.assign(config.node, {
		dataDir: testDataDir
	})

	if(!fs.existsSync(testDataDir)){
		log.info(`data dir "${testDataDir}" does not exist - creating it`)
		fs.mkdirSync(testDataDir, {
			recursive: true
		})
	}
}

let { default: run } = await import(`./cases/${component}.js`)

await run({ args, config })

log.info(`live test exited with code 0`)