import { INanoBlock, TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { IErrorReturn, IStatusReturn } from "nano-account-crawler/dist/status-return-interfaces";
import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { delay_between_mint_blocks, delay_between_supply_blocks } from "../bananode-cooldown";
import { bootstrap_asset_history_from_mint_block, bootstrap_mint_blocks_from_supply_block } from "../bootstrap";
import { ASSET_BLOCK_FRONTIER_COUNT } from "../constants";
import { IAssetBlockDb } from "../db/db-prepare-asset-chain";
import { createNFT } from "../db/nfts";
import { continue_trace_mint_blocks } from "./continue-trace-mint-blocks";
import { mainMutexManager } from "../lib/mutex-manager";

interface ISupplyBlockDb {
  id: number,
  issuer_id: number,
  issuer_address: TAccount,
  supply_block_height: number,
  supply_block_hash: TBlockHash,
  metadata_representative: TAccount,
  max_supply: string,
  mint_count: number,
  mint_crawl_head: TBlockHash
}

interface INft {
  id: number;
  mint_block_hash: string;
  mint_number: bigint;
}

// Get the existing supply blocks from the database and continue crawling from mint_crawl_head
// to find new mint blocks.
// Note that it can return { status: "ok", value: [...] } where the value is a list of errors.
export const continueTraceAndStoreNewlyMintedAssets = async (bananode: NanoNode, pgPool: any): Promise<IStatusReturn<IErrorReturn[]>> => {
  const errorReturns: IErrorReturn[] = [];

  try {
    const supplyBlocksStatusReturn: IStatusReturn<ISupplyBlockDb[]> = await getSupplyBlocks(pgPool);
    if (supplyBlocksStatusReturn.status === "error") {
      return supplyBlocksStatusReturn;
    }
    const supplyBlocks: ISupplyBlockDb[] = supplyBlocksStatusReturn.value;

    for (let i = 0; i < supplyBlocks.length; i++) {
      const supplyBlock = supplyBlocks[i];
      
      const continueMintedAssetTrace = curryContinueMintedAssetTrace(bananode, pgPool, supplyBlock, errorReturns);
      await mainMutexManager.runExclusive(supplyBlock.issuer_address, continueMintedAssetTrace);
    }

    return { status: "ok", value: errorReturns };
  } catch(error) {
    const errorReturn: IErrorReturn = {
      status: "error",
      error_type: "UnexpectedError",
      message: `${error}`
    };
    errorReturns.push(errorReturn);
    return { status: "ok", value: errorReturns };
  }
}

const curryContinueMintedAssetTrace = (bananode: NanoNode, pgPool: any, supplyBlock: ISupplyBlockDb, errorReturns: IErrorReturn[]) => {
  return async (): Promise<void> => {
    try {
      const issuerId = supplyBlock.issuer_id;
      const issuerAddress = supplyBlock.issuer_address;
      const maxSupply: bigint = BigInt(supplyBlock.max_supply);
      const mint_crawl_head = supplyBlock.mint_crawl_head;
      const mint_count = supplyBlock.mint_count;
      // TODO: Rewrite to return IStatusReturn
      // TODO: continue loop if there's errors
      const mintBlocks: INanoBlock[] = await continue_trace_mint_blocks(bananode, issuerAddress, BigInt(supplyBlock.supply_block_height), supplyBlock.supply_block_hash, mint_crawl_head, BigInt(mint_count), maxSupply, supplyBlock.metadata_representative);
      let supply_block_id: number;

      const mintHeadStatusReturn = await findNFT(pgPool, supplyBlock.id, mint_crawl_head);
      let crawlHeadNFT: INft;

      if (mintHeadStatusReturn.status === "ok" && mintHeadStatusReturn.value) {
        crawlHeadNFT = mintHeadStatusReturn.value;
      }

      let offset = 1;
      for (let j = 0; j < mintBlocks.length; j++) {
        const mintBlock = mintBlocks[j];
        // Skip crawlHeadNFT since it's already in the database
        if (j === 0 && crawlHeadNFT && crawlHeadNFT.mint_block_hash === mintBlock.hash) {
          offset = 0;
          continue;
        }
        console.log(`NMA: bootstrapping newly minted block: ${mintBlock.hash}`);

        await mainMutexManager.runExclusive(mintBlock.hash, async () => {
          const assetHistoryStatusReturn = await bootstrap_asset_history_from_mint_block(bananode, issuerAddress, mintBlock);
          if (assetHistoryStatusReturn.status === "error") {
            errorReturns.push(assetHistoryStatusReturn);
            return;
          }

          const asset_crawler_block_head = assetHistoryStatusReturn.value.crawler_head;
          const asset_crawler_block_height = assetHistoryStatusReturn.value.crawler_head_height
          const db_asset_chain: IAssetBlockDb[] = assetHistoryStatusReturn.value.db_asset_chain;
          const db_asset_chain_frontiers = db_asset_chain.slice(-ASSET_BLOCK_FRONTIER_COUNT);
          const asset_chain_height: number = db_asset_chain.length;

          const mintNumber = supplyBlock.mint_count + j + offset;
          await createNFT(pgPool, mintBlock, mintNumber, supply_block_id, db_asset_chain_frontiers, asset_chain_height, asset_crawler_block_head, asset_crawler_block_height);

          console.log(`NMA: Finished bootstrapping newly minted asset from mint block. Frontier: ${db_asset_chain[db_asset_chain.length-1].state} ${db_asset_chain[db_asset_chain.length-1].block_hash}`);
        });
        await delay_between_mint_blocks();
      }

      console.log(`NMA: Finished bootstrapping supply block: ${supplyBlock.supply_block_hash}, representative: ${supplyBlock.metadata_representative}`);
      await delay_between_supply_blocks();
    } catch(error) {
      const errorReturn: IErrorReturn = {
        status: "error",
        error_type: "UnexpectedError",
        message: `${error}`
      };
      errorReturns.push(errorReturn);
    }
  }
}

const getSupplyBlocks = async (pgPool: any): Promise<IStatusReturn<ISupplyBlockDb[]>> => {
  try {
    const query = `
      SELECT 
        supply_blocks.id AS supply_block_id,
        supply_blocks.block_height AS supply_block_height,
        supply_blocks.block_hash AS supply_block_hash, 
        accounts.address AS issuer_address, 
        supply_blocks.issuer_id,
        supply_blocks.metadata_representative,
        supply_blocks.max_supply,
        supply_blocks.mint_count,
        supply_blocks.mint_crawl_head
      FROM 
        supply_blocks 
      INNER JOIN accounts ON accounts.id = supply_blocks.issuer_id
    `;
    const { rows } = await pgPool.query(query);
    const supplyBlocks: ISupplyBlockDb[] = rows.map(row => {
      return {
        id: row.supply_block_id,
        supply_block_height: row.supply_block_height,
        supply_block_hash: row.supply_block_hash,
        issuer_address: row.issuer_address,
        issuer_id: row.issuer_id,
        metadata_representative: row.metadata_representative,
        max_supply: row.max_supply,
        mint_count: row.mint_count,
        mint_crawl_head: row.mint_crawl_head
      };
    });
    return { status: "ok", value: supplyBlocks };
  } catch(error) {
    return { status: "error", error_type: "UnexpectedError", message: error.message };
  }
};

const findNFT = async (pgPool: any, supply_block_id: number, block_hash: TBlockHash): Promise<IStatusReturn<INft>> => {
  try {
    const result = await pgPool.query(
      `SELECT id, mint_block_hash, mint_number FROM nfts WHERE supply_block_id = $1 AND mint_block_hash = $2 LIMIT 1`,
      [supply_block_id, block_hash]
    );
    if (result.rowCount === 0) {
      return { status: "error", error_type: "RecordNotFound", message: "NFT not found" };
    } else {
      return { status: "ok", value: result.rows[0] };
    }
  } catch (error) {
    return { status: "error", error_type: "UnexpectedError", message: error.message };
  }
};
