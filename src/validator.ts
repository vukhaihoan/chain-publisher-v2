'use strict'

import ChainPublisherError from './error'

// Input
//  * config {Object} It is similar like 'config' from 'new ChainPublisher(config)'
//    in file 'WalletSample.js'.
//
// Output {Object} Valid configuration. It is similar like 'config' from
//        'new ChainPublisher(config)'.
//
// Errors
//  * ChainPublisherError
function standardizeStartConfiguration(config: any) {
    if (!config) {
        throw new ChainPublisherError('undefined configuration')
    }

    const knownProps = [
        'storage',
        'provider',
        'size',
    ]

    _validateStorage(config.storage)
    _validateProvider(config.provider)
    _validateSize(config.size)

    const unknownProp = Object.keys(config).find(prop => !knownProps.includes(prop))
    if (unknownProp) {
        throw new ChainPublisherError('configuration has unknown property: ' + unknownProp)
    }

    const defaultConfig = {
        size: 1000,   // make sure it's not null
    }
    return Object.assign(defaultConfig, config)
}

function _validateStorage(storage:any) {
    if (!storage || typeof storage?.setItem != 'function' || typeof storage?.getItem != 'function') {
        throw new ChainPublisherError('invalid configuration "storage"')
    }
}

function _isProvider(provider:any) {
    if (!provider) {
        throw new ChainPublisherError(
            'invalid configuration "provider". Please use lib assisted-json-rpc-provider'
        )
    }
    // Note: Not work in browser when build prod
    // if (!provider || !provider?.constructor?.name?.endsWith("JsonRpcProvider")) {
    //     throw new ChainPublisherError(
    //         'invalid configuration "provider". Please use lib assisted-json-rpc-provider'
    //     )
    // }

}

function _validateProvider(provider:any) {
    if (!provider) {
        throw new ChainPublisherError(
            'invalid configuration "provider". Please use lib assisted-json-rpc-provider'
        )
    }

    if (Array.isArray(provider)) {
        provider.forEach(_isProvider)
    } else {
        _isProvider(provider)
    }
}

function _validateSize(value:any) {
    if (value == null) {
        return
    }

    if (!Number.isInteger(value) || value < 0) {
        throw new ChainPublisherError(
            'invalid configuration "validateSafeDepth"'
        )
    }
}
export default standardizeStartConfiguration
