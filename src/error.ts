'use strict'

class ChainPublisherError extends Error {
    source: any
    constructor(message: string, source = undefined) {
        super(message)
        this.name = 'ChainPublisherError'
        this.source = source
    }
}
export default ChainPublisherError

