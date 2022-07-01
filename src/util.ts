'use strict'
import { ethers } from 'ethers'
import * as _ from "lodash";

// Description
// * Asynchronous waiting.
//
// Input
// * period / Number - Non-negative integer, number of miliseconds
//   for waiting.
//
// Output
// * Promise<undefined>
export async function delay(period: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, period)
    })
}

export function splitChunks(from: number, to: number, count: any) {
    const size = Math.floor((to - from + 1) / count)
    const blocks = _.range(count).map(i => {
        const fromBlock = from + (size * i)
        const toBlock = fromBlock + size - 1
        return { fromBlock, toBlock }
    });
    return blocks;
}

export function rpcKnownError(err: any) {
    return err && ['TIMEOUT', 'SERVER_ERROR'].includes(err.code)
}

export function addressFromTopic(topic: any) {
    return ethers.utils.getAddress(topic.substr(2 + 24))
}