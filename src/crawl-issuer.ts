// TYPES
import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";

import { ISupplyBlock } from './interfaces/supply-block';
import { IAssetBlock } from './interfaces/asset-block';

// DEPENDENCIES
import { MintBlocksCrawler } from 'banano-nft-crawler/dist/mint-blocks-crawler';
import { traceSupplyBlocks } from './crawler/trace-supply-blocks';
import { traceAssetChain } from './crawler/trace-asset-chain';
import { createOrUpdateAccount } from './db/accounts';
import { createSupplyBlockAndFirstMint } from './db/supply-block-and-first-mint';
import { mainMutexManager } from './lib/mutex-manager';
import { createOrUpdateNFT } from './db/nfts';
import { ASSET_BLOCK_FRONTIER_COUNT } from './constants';
import { dbPrepareAssetChain } from './db/db-prepare-asset-chain';


export const crawlIssuer = async (pgPool: any, nanoNode: NanoNode, issuer: TAccount) => {
  console.log(`Tracing supply blocks for issuer: ${issuer}`);
  const lowercaseIssuer = issuer.toLowerCase().trim() as TAccount;
  // TODO: validate issuer address
  let crawlAt: Date;
  let supplyBlocks: ISupplyBlock[];
  let crawlerHead: TBlockHash;
  let crawlerHeadHeight: number;
  let accountId: number;

  mainMutexManager.runExclusive(lowercaseIssuer, async () => {
    crawlAt = new Date();
    const supplyTraceResult = await traceSupplyBlocks(nanoNode, lowercaseIssuer).catch((error) => { throw(error); });
    supplyBlocks      = supplyTraceResult.supplyBlocks;
    crawlerHead       = supplyTraceResult.crawlerHead;
    crawlerHeadHeight = supplyTraceResult.crawlerHeadHeight;
    accountId = await createOrUpdateAccount(pgPool, lowercaseIssuer, crawlAt, crawlerHead, crawlerHeadHeight).catch((error) => { throw(error); });

    for (let i = 0; i < supplyBlocks.length; i++) {
      console.log(`supply block #${i}:`);
      const supplyBlock = supplyBlocks[i];
      console.log(supplyBlock);
      const nftSupplyBlockHash = supplyBlock.supply_block_hash;
  
      const mintBlocksCrawler: MintBlocksCrawler = new MintBlocksCrawler(lowercaseIssuer, nftSupplyBlockHash);
      await mintBlocksCrawler.crawl(nanoNode).catch((error) => { throw(error); });
  
      const mintBlocks = mintBlocksCrawler.mintBlocks;
      if (!Array.isArray(mintBlocks) || mintBlocks.length == 0) { continue; }
  
      const firstMintBlock = mintBlocks[mintBlocks.length - 1];
      const assetCrawler = await traceAssetChain(nanoNode, issuer, firstMintBlock.hash).catch((error) => { throw(error); });
      const asset_chain_frontiers = assetCrawler.assetChain.slice(-ASSET_BLOCK_FRONTIER_COUNT);
      const supplyBlockId = await createSupplyBlockAndFirstMint(pgPool, firstMintBlock, accountId, parseInt(supplyBlock.max_supply), asset_chain_frontiers).catch((error) => { throw(error); });
      // TODO: Check supplyBlockId is present
  
      for (let j = 1; j < mintBlocks.length; j++) {
        const mintBlock = mintBlocks[j];
        console.log(`supply block #${i} mint block #${j}:`);
        console.log(mintBlock);
        const nftAssetCrawler = await traceAssetChain(nanoNode, lowercaseIssuer, mintBlock.hash).catch((error) => { throw(error); });
        const dbAssetChainFrontiers = dbPrepareAssetChain(nftAssetCrawler.assetChain).slice(-ASSET_BLOCK_FRONTIER_COUNT);
        const mintNumber = 1; // TODO: Calculate mint number in a way that works with caching!!!
        const nftId = await createOrUpdateNFT(pgPool, mintBlock, mintNumber, supplyBlockId, dbAssetChainFrontiers).catch((error) => { throw(error); });
      }
    }
  }).catch((error) => { throw(error); });
}