import os from 'os'
import fs from 'fs'
import path from 'path'
import log from '@mwni/log'
import { openDB } from '../../src/db/index.js'

export async function createContext({ debugQueries=false }={}){
	let dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xrplmeta-test-'))
	
	let ctx = {
		config: {
			node: {
				dataDir
			},
			debug: {
				queries: debugQueries
			}
		}
	}

	log.config({ level: 'error' })

	console.log(`using data dir: ${dataDir}`)

	return {
		...ctx,
		db: await openDB({
			inMemory: true,
			ctx
		})
	}
}