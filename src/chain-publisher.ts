import { rpcKnownError, delay } from './util'
import Bluebird from 'bluebird'
import * as _ from "lodash";
import standardizeStartConfiguration from './validator'
import { mergeRequests, partitionRequests, filterLogs, mergeUniqSortedLogs } from "./ethers-log-filter"

const REMOVE_KEY = 'VGhpcyBpcyBhbiBhd2Vzb21lIHNjcmlwdA'

class ChainPublisher {
    config: any = {}
    context: any = {}
    subscribers: Map<any, any>
    memories: Map<any, any>
    constructor(config: any) {
        let validConfig = standardizeStartConfiguration(config)
        this.subscribers = new Map()
        this.memories = new Map()
        this.config = validConfig
        const provider = this._getProvider()
        provider.on('block', (blockNumber: number) => {
            this.context.head = blockNumber
        })
        this._startProcessingLoop()
    }

    _getProvider = (seed?: number) => {
        let providers = _.flatten([this.config?.provider])

        const i = Math.floor(providers.length * (seed ?? Math.random()))

        return providers[i]
    }

    async _startProcessingLoop() {
        let nextPastProcess = Date.now()
        while (true) {
            if (this.subscribers.size == 0 || !this.context.head) {
                console.info('Waiting subcriber...');
                await delay(3000)
                continue
            }

            try {
                if (Date.now() < nextPastProcess) {
                    await delay(Math.min(1000, nextPastProcess - Date.now()))
                    continue
                }
                if (this.context.lastProcessed == this.context.head) {
                    //  Head of chain has not been updated
                    const nextDelay = 3 * 1000
                    console.log(`next processor processing in ${nextDelay / 1000}s`, 'head', this.context.head, Date.now())
                    nextPastProcess = Date.now() + 3000
                    continue
                }
                const head = this.context.head
                this.context.lastProcessed = await this._processor(head)

            } catch (error) {
                if (!rpcKnownError(error)) {
                    console.error('unexpected error: ', error)
                }
                console.log('[WARNING] processing loop:', error.code)
                nextPastProcess = Date.now() + 1000
            }
        }
    }
    /**
     * 
     * @returns Threshold to evaluate if fromBlock to head is too large
     */
    _getRange() {
        return this.config?.size || 1000
    }

    async _getRequest({ key, filter, genesis }: any) {
        const state = await this.config.storage.getItem(key) || {
            safeBlock: genesis - 1,
        }
        const from = (state.safeBlock) + 1
        return _.flatten([filter]).map(({ address, topics }) => ({ key, address, topics, from }))
    }

    async _processor(head: number) {
        const consumerRequests = await Bluebird.map(Array.from(this.subscribers.values()), ({ key, filter, genesis }) => this._getRequest({ key, filter, genesis }))

        const requests = consumerRequests.flat()

        const fromBlock = Math.min(...requests.map(r => r.from))

        if (fromBlock > head) {
            return head // nothing to do
        }

        // When fromBlock to head is too large, scanApi will be used, otherwise getLogs will be used
        let toBlock = head - fromBlock > this._getRange() ? head : undefined

        // partition similar requests base on the same combination of address and each topic
        const parts = partitionRequests(consumerRequests.flat())

        let logs: any[] = []
        logs = await Bluebird.map(parts, async requests => {
            const merged = mergeRequests({ requests, fromBlock, toBlock })
            if (merged) {
                const ret = await this._getLogs(merged)
                return ret
            }
            return []
        }).then(mergeUniqSortedLogs)


        // console.log('---- PROCESSOR', { fromBlock, range: _.min([toBlock, head]) - fromBlock + 1, logs: logs.length })

        const requestsByKey = _.zipObject(Array.from(this.subscribers.keys()), consumerRequests)

        let newMemories = new Map()

        for (const [key, subcriber] of this.subscribers) {
            const requests = requestsByKey[key]
            if (!requests) {
                return
            }

            const consumerLogs = mergeUniqSortedLogs(_.map(requests, request => filterLogs(logs, request)))

            await this._processLogs({
                key,
                logs: consumerLogs,
                subcriber,
                requests,
                head,
                memories: newMemories
            })
        }

        this.memories = newMemories

        return head
    }

    async _processLogs({ key, logs, subcriber, memories, requests, head }: any) {
        let from = Math.min(...requests.map((r: any) => r.from))

        let safeBlock = _.min([_.max([from - 1, head - subcriber.safeDepth]), head])

        let safeLogs = logs.filter(({ blockNumber }: any) => Number(blockNumber) <= safeBlock)
        await subcriber.applyLogs(this.config.storage, safeLogs)
        // console.log(`\t --- SAFE   ${from} +${safeBlock - from + 1} :${safeLogs.length}\t${key} behind: ${this.context.head - safeBlock}`)

        let unsafeLogs = logs.filter(({ blockNumber }: any) => Number(blockNumber) > safeBlock)

        await subcriber.applyLogs(
            {
                setItem: (key: string, value: any) => memories.set(key, value),
                getItem: (key: string) => this.config.storage.getItem(key),
                removeItem: (key: string) => memories.set(key, REMOVE_KEY)
            },
            unsafeLogs,
            true
        )

        // console.log(`\t --- UNSAFE ${safeBlock + 1} +${head - safeBlock - 1} :${unsafeLogs.length}\t${key}`)

        await this.config.storage.setItem(key, {
            safeBlock,
        })
        return memories
    }

    _getLogs = async ({ address, fromBlock, toBlock, topics }: any) => {
        const logs = await this._tryGetLogs({
            address,
            topics,
            fromBlock,
            toBlock
        });

        if (!Array.isArray(logs)) {
            throw new Error('unexpected logs response: ' + JSON.stringify(logs));
        }

        return logs;
    }

    _tryGetLogs = async (params: any, seed?: number) => {
        const RETRY = 8
        for (let i = 0; true; ++i) {
            try {
                return await this._getProvider(seed).getLogs(params);
            } catch (err) {
                if (i < RETRY) {
                    const duration = Math.round((i + 1) * (333 + Math.random() * 1000))
                    console.warn(`retry after ${duration / 1000}s: `, err?.reason ?? err?.code ?? err?.message)
                    await delay(duration)
                    continue
                }
                console.error('unable to get logs: out of retries', params)
                throw err
            }
        }
    }

    _eventExist(key: string) {
        return this.subscribers.has(key)
    }

    _validateKey(event: any, name: string) {
        try {
            return event[name]
        } catch (error) {
            return undefined
        }
    }

    _validateEvent(event: any) {
        const key = this._validateKey(event, 'key')
        if (key === undefined) {
            throw 'Missing key event'
        }

        const filter = this._validateKey(event, 'filter')
        if (filter === undefined) {
            throw 'Missing filter'
        }

        const safeDepth = this._validateKey(event, 'safeDepth')
        if (safeDepth === undefined) {
            throw 'Missing safeDepth'
        }

        let validGenesis = this._validateKey(event, 'genesis')
        if (validGenesis === undefined) {
            console.warn('Missing genesis use default genesis = 0')
            validGenesis = 0
        }

        const applyLogs = this._validateKey(event, 'applyLogs')
        if (filter === undefined) {
            throw 'Missing applyLogs'
        }
        if (typeof applyLogs !== 'function') {
            throw `applyLogs of ${event.key} is not function`
        }

        return {
            key,
            filter,
            genesis: validGenesis,
            applyLogs,
            safeDepth
        }
    }

    subscribe(event: any) {
        let validEvent = this._validateEvent(event)
        this.subscribers.set(validEvent.key, validEvent)
    }

    async unSubscribe(key: string, allowRemoveState = true) {
        if (this.subscribers.has(key)) {
            allowRemoveState && await this._removeState(key)
            this.subscribers.delete(key)
        }
    }
    async unSubscribeAll(allowRemoveState = true) {
        const subscribers = this.subscribers[Symbol.iterator]();

        for (const [key] of subscribers) {
            allowRemoveState && await this._removeState(key)
        }

        this.subscribers.clear()
    }
    async getState(key: string) {
        if (this.memories.get(key) == REMOVE_KEY) {
            return null
        }

        return this.memories.get(key) ?? await this.config.storage.getItem(key)
    }

    private _removeState = async (key: string) => {
        await this.config.storage.removeItem(key)
    }
}
export default ChainPublisher