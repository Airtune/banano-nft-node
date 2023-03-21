import { INanoBlock, TAccount } from 'nano-account-crawler/dist/nano-interfaces';
import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { mainMutexManager } from './lib/mutex-manager';
import { traceSupplyBlocks } from './crawler/trace-supply-blocks';
import { createOrUpdateAccount } from './db/accounts';
import { createSupplyBlockAndFirstMint } from './db/supply-block-and-first-mint';
import { bootstrap_asset_history_from_mint_block, bootstrap_mint_blocks_from_supply_block } from './bootstrap';
import { IAssetBlockDb } from './db/db-prepare-asset-chain';
import { ASSET_BLOCK_FRONTIER_COUNT } from './constants';
import { createNFT } from './db/nfts';
import { delay_between_mint_blocks } from './bananode-cooldown';

export const scanAndCreateNewSupplyBlocksAndMints = async (nanoNode: NanoNode, pgPool: any, issuer: TAccount) => {
  const crawlAt = new Date();

  await mainMutexManager.runExclusive(issuer, async () => {
    const pgResult = await pgPool.query(`SELECT supply_block_crawl_head, supply_block_crawl_head_height FROM accounts WHERE address = $1 LIMIT 1;`, [issuer]).catch((error) => { throw(error); });
    const account = pgResult.rows[0];
    if (typeof account !== 'object') {
      throw Error(`unable to find supply_block_crawl_head for account: ${account}`);
    }
    const previousCrawlerHead = account.supply_block_crawl_head;
    const previousCrawlerHeadHeight = account.supply_block_crawl_head_height;
    
    const { supplyBlocks, crawlerHead, crawlerHeadHeight } = await traceSupplyBlocks(nanoNode, issuer, previousCrawlerHead, "-1");

    const issuer_id = await createOrUpdateAccount(pgPool, issuer, crawlAt, crawlerHead, crawlerHeadHeight).catch((error) => { throw(error); });
    try {
      for (let i = 0; i < supplyBlocks.length; i++) {
        const supplyBlock = supplyBlocks[i];
        const maxSupply = parseInt(supplyBlock.max_supply);
        const mintBlocks: INanoBlock[] = await bootstrap_mint_blocks_from_supply_block(nanoNode, issuer, supplyBlock);
        let supply_block_id;
        
        for (let j = 0; j < mintBlocks.length; j++) {
          const mintBlock = mintBlocks[j];
          console.log(`scan and bootstrap mint block: ${mintBlock.hash}`);
          const db_asset_chain: IAssetBlockDb[] = await bootstrap_asset_history_from_mint_block(nanoNode, issuer, mintBlock);
          const asset_chain_height: number = db_asset_chain.length;
          const db_asset_chain_frontiers   = db_asset_chain.slice(-ASSET_BLOCK_FRONTIER_COUNT);

          // TODO: Rollback created mints and supply blocks on failure.
          if (j == 0) {
            supply_block_id = await createSupplyBlockAndFirstMint(crawlAt, pgPool, mintBlock, issuer_id, maxSupply, db_asset_chain_frontiers, asset_chain_height); 
          } else {
            const mintNumber = j+1;
            await createNFT(pgPool, mintBlock, mintNumber, supply_block_id, db_asset_chain_frontiers, asset_chain_height);
          }
          console.log(`Finished scan and bootstrapping asset from mint block. Frontier: ${db_asset_chain[db_asset_chain.length-1].state} ${db_asset_chain[db_asset_chain.length-1].block_hash}`)
          await delay_between_mint_blocks();
        }
      }
    } catch (error) {
      let updateAccountError: Error = null;
      await createOrUpdateAccount(pgPool, issuer, crawlAt, previousCrawlerHead, previousCrawlerHeadHeight).catch((error) => { updateAccountError = error; });

      if (updateAccountError !== null) {
        throw Error(`Two errors: ${error.name}, ${updateAccountError.name}.\n${error.name}: ${error.message}\n${updateAccountError.name}: ${updateAccountError.message}`);
      } else {
        throw(error);
      }
    }
  });
}
