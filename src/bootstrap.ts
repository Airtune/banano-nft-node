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
import { retry_on_error } from "./lib/retry-on-error";
import { AssetCrawler } from "banano-nft-crawler/dist/asset-crawler";
import { IStatusReturn } from "nano-account-crawler/dist/status-return-interfaces";
import { IErrorReturn } from "nano-account-crawler/dist/status-return-interfaces";

export const bootstrap = async (nanoNode: NanoNode, pgPool: any): Promise<void> => {
  const errorReturns: IErrorReturn[] = [];
  const issuers = await get_issuers().catch((error) => { throw (error); });

  for (let i = 0; i < issuers.length; i++) {
    const issuer = issuers[i].toLowerCase() as TAccount;
    await bootstrap_issuer(nanoNode, pgPool, issuer, errorReturns).catch((error) => { throw(error); });

    console.log(`Finished bootstrapping issuer: ${issuer}`);
    await delay_between_issuers();
  }
  console.log('Finished bootstrapping everything.');
}

export const bootstrap_issuer = async (nanoNode: NanoNode, pgPool: any, issuer: TAccount, errorReturns: IErrorReturn[]) => {
  console.log(`bootstrapping issuer: ${issuer}`);
  const crawlAt = new Date();

  await mainMutexManager.runExclusive(issuer, async () => {
    const { supplyBlocks, crawlerHead, crawlerHeadHeight } = await bootstrap_supply_blocks_from_issuer(nanoNode, issuer).catch((error) => { throw (error); });
    const issuer_id = await createOrUpdateAccount(pgPool, issuer, crawlAt, crawlerHead, crawlerHeadHeight).catch((error) => { throw (error); });

    for (let i = 0; i < supplyBlocks.length; i++) {
      const supplyBlock = supplyBlocks[i];
      console.log(`bootstrapping supply block: ${supplyBlock.supply_block_hash}, ${supplyBlock.metadata_representative}`);
      // TODO: Return crawler_head and crawler_height 
      const mintBlocks: INanoBlock[] = await bootstrap_mint_blocks_from_supply_block(nanoNode, issuer, supplyBlock.supply_block_hash).catch((error) => { throw (error); });
      let supply_block_id: number;

      for (let j = 0; j < mintBlocks.length; j++) {
        const mintBlock = mintBlocks[j];

        await mainMutexManager.runExclusive(mintBlock.hash, async () => {
          console.log(`bootstrapping mint block: ${mintBlock.hash}`);
          const assetHistoryStatusReturn = await bootstrap_asset_history_from_mint_block(nanoNode, issuer, mintBlock).catch((error) => { throw (error); });
          if (assetHistoryStatusReturn.status === "error") {
            errorReturns.push(assetHistoryStatusReturn);
            return;
          }

          const asset_crawler_block_head = assetHistoryStatusReturn.value.crawler_head;
          const asset_crawler_block_height = assetHistoryStatusReturn.value.crawler_head_height
          const db_asset_chain: IAssetBlockDb[] = assetHistoryStatusReturn.value.db_asset_chain;
          const db_asset_chain_frontiers = db_asset_chain.slice(-ASSET_BLOCK_FRONTIER_COUNT);
          const asset_chain_height: number = db_asset_chain.length;
          if (j == 0) {
            supply_block_id = await createSupplyBlockAndFirstMint(crawlAt, pgPool, mintBlock, issuer_id, supplyBlock.max_supply, db_asset_chain_frontiers, asset_chain_height, asset_crawler_block_head, asset_crawler_block_height).catch((error) => { throw (error); });
          } else {
            const mintNumber = j + 1;
            await createNFT(pgPool, mintBlock, mintNumber, supply_block_id, db_asset_chain_frontiers, asset_chain_height, asset_crawler_block_head, asset_crawler_block_height).catch((error) => { throw (error); });
          }
          console.log(`Finished bootstrapping asset from mint block. Frontier: ${db_asset_chain[db_asset_chain.length - 1].state} ${db_asset_chain[db_asset_chain.length - 1].block_hash}`);

        }).catch((error) => { throw (error); });
        await delay_between_mint_blocks();
      }

      console.log(`Finished bootstrapping supply block: ${supplyBlock.supply_block_hash}, representative: ${supplyBlock.metadata_representative}`);
      await delay_between_supply_blocks();
    }
  }).catch((error) => { throw (error); });
}

const bootstrap_supply_blocks_from_issuer = async (nanoNode: NanoNode, issuer: TAccount): Promise<{ supplyBlocks: ISupplyBlock[], crawlerHead: TBlockHash, crawlerHeadHeight: number }> => {
  return await retry_on_error(async () => {
    const { supplyBlocks, crawlerHead, crawlerHeadHeight } = await traceSupplyBlocks(nanoNode, issuer).catch((error) => { throw (error); });
    return { supplyBlocks, crawlerHead, crawlerHeadHeight };;
  }).catch((error) => { throw (error); });
}

export const bootstrap_mint_blocks_from_supply_block = async (nanoNode: NanoNode, issuer: TAccount, supplyBlockHash: TBlockHash) => {
  return await retry_on_error(async () => {
    const mintBlocksCrawler: MintBlocksCrawler = new MintBlocksCrawler(issuer, supplyBlockHash);
    await mintBlocksCrawler.crawl(nanoNode).catch((error) => { throw (error); });

    const mintBlocks = mintBlocksCrawler.mintBlocks;
    if (Array.isArray(mintBlocks)) {
      return mintBlocks;
    } else {
      return [];
    }
  }).catch((error) => { throw (error); });
}

export const bootstrap_asset_history_from_mint_block = async (nanoNode: NanoNode, issuer: TAccount, mint_block: INanoBlock): Promise<IStatusReturn<{ db_asset_chain: IAssetBlockDb[], crawler_head: TBlockHash, crawler_head_height: number }>> => {
  const assetCrawlerStatusReturn = await traceAssetChain(nanoNode, issuer, mint_block.hash);
  if (assetCrawlerStatusReturn.status === "error") {
    return assetCrawlerStatusReturn;
  }
  const assetCrawler: AssetCrawler = assetCrawlerStatusReturn.value;
  const assetChain = assetCrawler?.assetChain;
  if (Array.isArray(assetChain)) {
    return {
      status: "ok",
      value: {
        db_asset_chain: dbPrepareAssetChain(assetChain),
        crawler_head: assetCrawler.head,
        crawler_head_height: assetCrawler.headHeight
      }
    };
  } else {
    return {
      status: "error",
      error_type: "NoAssetHistory",
      message: `Traced history for issuer: ${issuer}, mint_block: ${mint_block?.hash} is empty.`
    };
  }
}

