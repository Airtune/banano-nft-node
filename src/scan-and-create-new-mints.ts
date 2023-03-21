import { INanoBlock, TAccount, TBlockHash } from 'nano-account-crawler/dist/nano-interfaces';
import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { mainMutexManager } from './lib/mutex-manager';
import { traceSupplyBlocks } from './crawler/trace-supply-blocks';
import { createOrUpdateAccount, findAccountIdByAddress } from './db/accounts';
import { bootstrap_asset_history_from_mint_block, bootstrap_mint_blocks_from_supply_block } from './bootstrap';
import { IAssetBlockDb } from './db/db-prepare-asset-chain';
import { ASSET_BLOCK_FRONTIER_COUNT } from './constants';
import { createNFT } from './db/nfts';
import { delay_between_supply_blocks, delay_between_mint_blocks } from './bananode-cooldown';
import { MintBlocksCrawler } from 'banano-nft-crawler/dist/mint-blocks-crawler';
import { bananode } from './bananode';

export const scanAndCreateNewMints = async (nanoNode: NanoNode, pgPool: any, issuer: TAccount) => {
  await mainMutexManager.runExclusive(issuer, async () => {
    const crawlAt = new Date();
    const issuer_id: number = await findAccountIdByAddress(pgPool, issuer).catch((error) => { throw(error); });
    const pgResult = pgPool.query(`SELECT id, block_hash, block_height, mint_count, max_supply, metadata_representative, mint_crawl_head FROM supply_blocks WHERE issuer_id = $1;`, [issuer_id]).catch((error) => { throw(error); });


    for (let i = 0; i < pgResult.rows.length; i++) {
      const supply_block = pgResult.rows[i];
      const supply_block_id: number = supply_block.id;
      const supply_block_hash: TBlockHash = supply_block.block_hash;
      const supply_block_height: bigint = BigInt(supply_block.block_height);
      const mint_count: bigint = BigInt(supply_block.mint_count);
      const max_supply: bigint = BigInt(supply_block.max_supply);
      const metadata_representative: TAccount = supply_block.metadata_representative;
      const mint_crawl_head: TBlockHash = supply_block.mint_crawl_head;

      const mintBlocksCrawler = new MintBlocksCrawler(issuer, supply_block_hash);
      mintBlocksCrawler.initFromCache(supply_block_height, mint_count, "1.0.0", max_supply, metadata_representative);
      await mintBlocksCrawler.crawlFromFrontier(bananode, mint_crawl_head);

      if (mintBlocksCrawler.mintBlockCount > mint_count) {
        for (let i = 0; i < mintBlocksCrawler.mintBlocks.length; i++) {
          const newMintBlock: INanoBlock = mintBlocksCrawler.mintBlocks[i];
          const newMintNumber = parseInt(mint_count as any) + i + 1;

          await createNFT(pgPool, newMintBlock, newMintNumber, supply_block_id, db_asset_chain_frontiers, asset_chain_height);
          await delay_between_mint_blocks();
        }
      }
      
      await delay_between_supply_blocks();
    }

  }).catch((error) => { throw(error); });
}
