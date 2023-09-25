import { INanoBlock, TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { IErrorReturn, IStatusReturn } from "nano-account-crawler/dist/status-return-interfaces";
import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { delay_between_mint_blocks, delay_between_supply_blocks } from "../bananode-cooldown";
import { bootstrap_asset_history_from_mint_block, bootstrap_mint_blocks_from_supply_block } from "../bootstrap";
import { createNFT, findLatestNFTForSupplyBlock } from "../db/nfts";
import { continue_trace_mint_blocks } from "./continue-trace-mint-blocks";
import { mainMutexManager } from "../lib/mutex-manager";
import { IAssetBlock } from "banano-nft-crawler/dist/interfaces/asset-block";
import { findFrontierNFTBlock } from "../db/nft-blocks";

interface ISupplyBlockDb {
  id: number,
  issuer_id: number,
  issuer_address: TAccount,
  supply_block_height: number,
  supply_block_hash: TBlockHash,
  metadata_representative: TAccount,
  ipfs_cid: string,
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
  // console.log('continueTraceAndStoreNewlyMintedAssets...');
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
    // console.log('continueTraceAndStoreNewlyMintedAssets!');
    return { status: "ok", value: errorReturns };
  }
}

const curryContinueMintedAssetTrace = (bananode: NanoNode, pgPool: any, supplyBlock: ISupplyBlockDb, errorReturns: IErrorReturn[]) => {
  return async (): Promise<void> => {
    try {
      //const issuerId = supplyBlock.issuer_id;
      const issuerAddress = supplyBlock.issuer_address;
      const maxSupply: bigint = BigInt(supplyBlock.max_supply);
      const mint_crawl_head = supplyBlock.mint_crawl_head;
      const mint_count = supplyBlock.mint_count;

      const frontierNFT = await findLatestNFTForSupplyBlock(pgPool, supplyBlock.id);
      const frontierNFTBlock = await findFrontierNFTBlock(pgPool, frontierNFT.id);

      // TODO: Rewrite to return IStatusReturn
      // TODO: continue loop if there's errors
      // console.log("\n\n    awaiting continue_trace_mint_blocks...\n\n");
      const mintBlocks: INanoBlock[] = await continue_trace_mint_blocks(bananode, issuerAddress, BigInt(supplyBlock.supply_block_height), supplyBlock.supply_block_hash, mint_crawl_head, BigInt(mint_count), maxSupply, supplyBlock.metadata_representative).catch((error) => { throw(error); });
      // console.log("\n\n    awaited continue_trace_mint_blocks!n\n");
      let supply_block_id: number = supplyBlock.id;

      if (!frontierNFT && !frontierNFTBlock) {
        // supply blocks shouldn't be stored without a first mint block so I'm just going to throw an error
        console.error(`Unexpect missing crawlHeadNFT`);
        throw Error(`Unexpect missing crawlHeadNFT`);
      }

      let crawlHeadFound = false;
      let extraMintCount = 0;
      // console.log(`NMAN: mintBlocks.length: ${mintBlocks.length}`);
      for (let j = 0; j < mintBlocks.length; j++) {
        //console.log("\n\n    -- searching for head mint block --\n\n");
        const mintBlock = mintBlocks[j];
        
        //if (!crawlHeadFound) {
        //  if (frontierNFTBlock.block_hash === mintBlock.hash) {
        //    crawlHeadFound = true;
        //    // console.log(`.... found crawl head!: ${mintBlock.hash}`);
        //  } else {
        //    // console.log(`.... didn't find crawl head yet: ${mintBlock.hash}`);
        //  }
        //  continue;
        //  //throw Error(`Unexpected turn of events. Why wasn't the first mint block the mint crawl head NFT? Was it because the crawl head hash was ahead of the latest mint head?`)
        //}
        // console.log(`NMA: bootstrapping newly minted block: ${mintBlock.hash}`);
        extraMintCount += 1;
        await mainMutexManager.runExclusive(mintBlock.hash, async () => {
          const assetHistoryStatusReturn = await bootstrap_asset_history_from_mint_block(bananode, issuerAddress, mintBlock);
          if (assetHistoryStatusReturn.status === "error") {
            console.error(`ERROR assetHistoryStatusReturn: ${assetHistoryStatusReturn.message}`);
            errorReturns.push(assetHistoryStatusReturn);
            return;
          }

          const asset_crawler_block_head = assetHistoryStatusReturn.value.crawler_head;
          const asset_crawler_block_height = assetHistoryStatusReturn.value.crawler_head_height
          const asset_chain: IAssetBlock[] = assetHistoryStatusReturn.value.asset_chain;
          const asset_chain_height: number = asset_chain.length;

          const mintNumber = frontierNFT.mint_number + extraMintCount;
          await createNFT(pgPool, mintBlock, mintNumber, supply_block_id, supplyBlock.supply_block_hash, asset_chain, asset_chain_height, asset_crawler_block_head, asset_crawler_block_height);

          // console.log(`NMA: Finished bootstrapping newly minted asset from mint block. Frontier: ${asset_chain[asset_chain.length-1].state} ${asset_chain[asset_chain.length-1].block_hash}`);
        });
        await delay_between_mint_blocks();
      }

      // console.log(`NMA: Finished bootstrapping supply block: ${supplyBlock.supply_block_hash}, representative: ${supplyBlock.metadata_representative}`);
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
        supply_blocks.issuer_address, 
        supply_blocks.issuer_id,
        supply_blocks.metadata_representative,
        supply_blocks.ipfs_cid,
        supply_blocks.max_supply,
        supply_blocks.mint_count,
        supply_blocks.mint_crawl_head
      FROM 
        supply_blocks 
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
        ipfs_cid: row.ipfs_cid,
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
      `SELECT id, nft_blocks.block_hash AS mint_block_hash, mint_number FROM nfts WHERE supply_block_id = $1 AND mint_block_hash = $2 INNER JOIN nft_blocks ON nfts.id = nft_blocks.nft_id AND nft_blocks.nft_block_height = 0 LIMIT 1`,
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
