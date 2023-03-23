import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config();
import { bootstrap } from './src/bootstrap';

const pg = require('pg');
const pgPool = new pg.Pool();

pgPool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const BANANODE_RPC_URL = process.env.BANANODE_RPC_URL;
if (typeof BANANODE_RPC_URL !== 'string') { throw Error('Environment variable BANANODE_RPC_URL must be set.'); }
// TODO: check bananode is available

import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { traceAssetChain } from './src/crawler/trace-asset-chain';
const fetch = require('node-fetch');
export const bananode = new NanoNode(BANANODE_RPC_URL, fetch);

const testCrawler = async () => {
  const issuer = "ban_3pnftpao6pbekmear374478f1ytmwz3kodcjuzf1hutcnb3gudwi9qcu8pwc";
  const mintBlockHash = "AA3794A0A08E337CBBB84D76A31CE667E2A420C55DAFBE35C6CA2F203DD1F263";
  const assetCrawler = await traceAssetChain(bananode, issuer, mintBlockHash).catch((error) => { throw(error); });
}

const main = async () => {
  console.log(`Bootstrapping...`);
  await testCrawler().catch((error) => { throw(error); });
  /*
  const nft_count_res = await pgPool.query("SELECT count(id) FROM nfts;").catch((error) => { throw(error); });
  const nft_count = parseInt(nft_count_res.rows[0].count);
  if (typeof nft_count !== 'number' || nft_count === 0) {
    console.log("startBootstrap...");
    await bootstrap(bananode, pgPool).catch((error) => { throw(error); });
  } else {
    console.log(`DB not empty. Bootstrap cancelled.`);
  }
  */
}

main().catch((error) => {
  console.error(error);
  process.exit(-1);
});
