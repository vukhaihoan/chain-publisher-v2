import Chain from '../src/index';
import { JsonRpcProvider } from '@ethersproject/providers'
import * as _ from "lodash";
import { Contract } from 'ethers';
const RPC = "https://bsc-dataseed.binance.org"
let abi = [
  "event Transfer(address indexed from, address indexed to, uint256 indexed value)"
];
// let iface = new utils.Interface(abi);
let account = "0x219230d2890f50759305d88695c488669240f964"
let token = "0x05BC2480aDcb14F05F2E73551593530dD983e335"
const contract = new Contract(token, abi, new JsonRpcProvider({ url: RPC, timeout: 6000 }));

let memory = {}
let storage = {
  setItem: async (key: string, value: any) => {
    _.set(memory, key, value)
  },
  getItem: async (key: string) => {
    return _.get(memory, key)
  }
}
const event = {
  key: 'transferIn',
  genesis: 20473714,
  safeDepth: 16,
  filter: contract.filters.Transfer(null, account),
  applyLogs: async (storage: any, logs: any) => {
    console.log('logs', logs, storage)
  }
}
export const chainPublisher = new Chain.ChainPublisher({
  provider: new JsonRpcProvider({ url: RPC, timeout: 6000 }),
  size: 1024,
  storage
})
chainPublisher.subscribe(event)
describe('blah', () => {
  it('works', () => {
    chainPublisher.subscribe(event)
  });
});
