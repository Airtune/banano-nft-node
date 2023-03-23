// types and interfaces
import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { INanoBlock, TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { ISupplyBlock } from "./interfaces/supply-block";

// dependencies
import { MintBlocksCrawler } from "banano-nft-crawler/dist/mint-blocks-crawler";

// src
import { traceSupplyBlocks } from './crawler/trace-supply-blocks';
import { get_issuers } from "./get-issuers";
import { mainMutexManager } from './lib/mutex-manager';
import { traceAssetChain } from "./crawler/trace-asset-chain";
import { dbPrepareAssetChain, IAssetBlockDb } from "./db/db-prepare-asset-chain";
import { createOrUpdateAccount } from "./db/accounts";
import { createSupplyBlockAndFirstMint } from "./db/supply-block-and-first-mint";
import { ASSET_BLOCK_FRONTIER_COUNT } from "./constants";
import { createNFT } from "./db/nfts";
import { delay_between_issuers, delay_between_mint_blocks, delay_between_retries, delay_between_supply_blocks } from './bananode-cooldown';
import { banano_ipfs } from "./lib/banano-ipfs";

// delays to avoid running out of memory on low spec banano nodes
const max_retries              = 5;

// retry function if an error is throw with a delay in between retries
async function retry_on_error(fn) {
  let retries: number = 0;

  while (true) {
    retries += 1;

    try {
      return await fn();
    } catch (error) {
      if (retries >= max_retries) {
        throw error;
      }
      console.log(`retrying after getting error: ${error.toString()}`);
      await delay_between_retries();
    }
  }
}

export const bootstrap = async (nanoNode: NanoNode, pgPool: any): Promise<void> => {
  const crawlAt = new Date();
  const issuers = await get_issuers().catch((error) => { throw(error); });

  for (let i = 0; i < issuers.length; i++) {
    const issuer = issuers[i].toLowerCase() as TAccount;
    console.log(`bootstrapping issuer: ${issuer}`);
    await mainMutexManager.runExclusive(issuer, async () => {
      const { supplyBlocks, crawlerHead, crawlerHeadHeight } = await bootstrap_supply_blocks_from_issuer(nanoNode, issuer).catch((error) => { throw(error); });
      const issuer_id = await createOrUpdateAccount(pgPool, issuer, crawlAt, crawlerHead, crawlerHeadHeight).catch((error) => { throw(error); });      

      for (let i = 0; i < supplyBlocks.length; i++) {
        const supplyBlock = supplyBlocks[i];
        const maxSupply = parseInt(supplyBlock.max_supply);
        console.log(`bootstrapping supply block: ${supplyBlock.supply_block_hash}, ${supplyBlock.metadata_representative}`);
        const mintBlocks: INanoBlock[] = await bootstrap_mint_blocks_from_supply_block(nanoNode, issuer, supplyBlock).catch((error) => { throw(error); }); 
        let supply_block_id: number;
        
        for (let j = 0; j < mintBlocks.length; j++) {
          const mintBlock = mintBlocks[j];
          console.log(`bootstrapping mint block: ${mintBlock.hash}`);
          const db_asset_chain: IAssetBlockDb[] = await bootstrap_asset_history_from_mint_block(nanoNode, issuer, mintBlock).catch((error) => { throw(error); });
          const db_asset_chain_frontiers = db_asset_chain.slice(-ASSET_BLOCK_FRONTIER_COUNT);
          const asset_chain_height: number = db_asset_chain.length;
          if (j == 0) {
            supply_block_id = await createSupplyBlockAndFirstMint(crawlAt, pgPool, mintBlock, issuer_id, maxSupply, db_asset_chain_frontiers, asset_chain_height).catch((error) => { throw(error); });
          } else {
            const mintNumber = j+1;
            await createNFT(pgPool, mintBlock, mintNumber, supply_block_id, db_asset_chain_frontiers, asset_chain_height).catch((error) => { throw(error); });
          }
          console.log(`Finished bootstrapping asset from mint block. Frontier: ${db_asset_chain[db_asset_chain.length-1].state} ${db_asset_chain[db_asset_chain.length-1].block_hash}`);
          await delay_between_mint_blocks();
        }

        console.log(`Finished bootstrapping supply block: ${supplyBlock.supply_block_hash}, representative: ${supplyBlock.metadata_representative}`);
        await delay_between_supply_blocks();
      }
    }).catch((error) => { throw(error); });

    console.log(`Finished bootstrapping issuer: ${issuer}`);
    await delay_between_issuers();
  }
  console.log('Finished bootstrapping everything.');
}

const bootstrap_supply_blocks_from_issuer = async(nanoNode: NanoNode, issuer: TAccount): Promise<{ supplyBlocks: ISupplyBlock[], crawlerHead: TBlockHash, crawlerHeadHeight: number }> => {
  return await retry_on_error(async () => {
    const { supplyBlocks, crawlerHead, crawlerHeadHeight } = await traceSupplyBlocks(nanoNode, issuer).catch((error) => { throw(error); });
    return { supplyBlocks, crawlerHead, crawlerHeadHeight };;
  }).catch((error) => { throw(error); });
}

export const bootstrap_mint_blocks_from_supply_block = async(nanoNode: NanoNode, issuer: TAccount, supplyBlock: ISupplyBlock) => {
  return await retry_on_error(async () => {
    const nftSupplyBlockHash = supplyBlock.supply_block_hash;
    const mintBlocksCrawler: MintBlocksCrawler = new MintBlocksCrawler(issuer, nftSupplyBlockHash);
    await mintBlocksCrawler.crawl(nanoNode).catch((error) => { throw(error); });

    const mintBlocks = mintBlocksCrawler.mintBlocks;
    if (Array.isArray(mintBlocks)) {
      return mintBlocks;
    } else {
      return [];
    }
  }).catch((error) => { throw(error); });
}

export const bootstrap_asset_history_from_mint_block = async(nanoNode: NanoNode, issuer: TAccount, mint_block: INanoBlock): Promise<IAssetBlockDb[]> => {
  return await retry_on_error(async () => {
    const assetCrawler = await traceAssetChain(nanoNode, issuer, mint_block.hash).catch((error) => { throw(error); });
    const assetChain = assetCrawler.assetChain;
    if (Array.isArray(assetChain)) {
      return dbPrepareAssetChain(assetChain);
    } else {
      return [];
    }
  }).catch((error) => { throw(error); });
}


