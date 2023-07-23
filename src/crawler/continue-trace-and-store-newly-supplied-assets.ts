import { INanoBlock, TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { IErrorReturn, IStatusReturn } from "nano-account-crawler/dist/status-return-interfaces";
import { delay_between_issuers, delay_between_passive_asset_checks, delay_between_supply_blocks } from "../bananode-cooldown";
import { bootstrap_asset_history_from_mint_block, bootstrap_issuer, bootstrap_mint_blocks_from_supply_block } from "../bootstrap";
import { ASSET_BLOCK_FRONTIER_COUNT } from "../constants";
import { createOrUpdateAccount } from "../db/accounts";
import { IAssetBlockDb } from "../db/db-prepare-asset-chain";
import { createNFT } from "../db/nfts";
import { createSupplyBlockAndFirstMint } from "../db/supply-block-and-first-mint";
import { get_issuers } from "../get-issuers";
import { traceSupplyBlocks } from "./trace-supply-blocks";
import { mainMutexManager } from "../lib/mutex-manager"
import { NanoNode } from "nano-account-crawler/dist/nano-node";

interface IAccountInfo {
  id: number,
  address: TAccount,
  supply_block_crawl_head: (TBlockHash | null)
}

interface IAccountSupplyBlockInfo {
  metadata_representatives: TAccount[],
  mint_crawl_head: (TBlockHash | undefined)
}

// Get the existing supply blocks from the database and continue crawling issuer accounts
// from the latest known block to find new supply blocks.
// Note that it can return { status: "ok", value: [...] } where the value is a list of errors.
export const continueTraceAndStoreNewlySuppliedAssets = async (bananode: NanoNode, pgPool: any): Promise<IStatusReturn<IErrorReturn[]>> => {
  const errorReturns: IErrorReturn[] = [];

  try {
    const crawlAt = new Date();
    const issuers: TAccount[] = await get_issuers();
    const issuerInfosResult = await getAccountInfos(pgPool, issuers);
    if (issuerInfosResult.status === "error") {
      return issuerInfosResult;
    }
    const issuerInfos: IAccountInfo[] = issuerInfosResult.value;

    for (let j = 0; j < issuers.length; j++) {
      const issuerAddress = issuers[j];
      if (issuerInfos.findIndex((_issuerInfo) => { return _issuerInfo.address == issuerAddress }) === -1) {
        console.log(JSON.stringify(issuerInfos));
        console.log(`CTASTNSA: issuer not in db: ${issuerAddress}`);
        await bootstrap_issuer(bananode, pgPool, issuerAddress, errorReturns).catch((error) => {
          console.log(`CTASTNSA: error bootstrapping issuer: ${issuerAddress}`);
          errorReturns.push({
            status: "error",
            error_type: "UnexpectedError",
            message: `${error}`
          });
        });
      }
    }

    for (let i = 0; i < issuerInfos.length; i++) {
      const issuerInfo: IAccountInfo = issuerInfos[i];
      const issuerId = issuerInfo.id;
      const issuerAddress = issuerInfo.address;

      const continueSuppliedAssetTrace = curryContinueSuppliedAssetTrace(crawlAt, bananode, pgPool, errorReturns, issuerId, issuerAddress);
      await mainMutexManager.runExclusive(issuerAddress, continueSuppliedAssetTrace);
    }

    return { status: "ok", value: errorReturns };
  } catch (error) {
    const errorReturn: IErrorReturn = {
      status: "error",
      error_type: "UnexpectedError",
      message: `${error}`
    };
    errorReturns.push(errorReturn);
    return errorReturn;
  } finally {
    // TODO: log errors
    // logErrorReturnsToFile(errorReturns);
  }
}

const curryContinueSuppliedAssetTrace = (crawlAt: Date, bananode: NanoNode, pgPool: any, errorReturns: IErrorReturn[], issuerId: number, issuerAddress: TAccount) => {
  return async (): Promise<void> => {
    try {
      const accountSupplyBlockInfoStatusReturn = await getAccountSupplyBlockInfo(pgPool, issuerId);
      if (accountSupplyBlockInfoStatusReturn.status === "error") {
        errorReturns.push(accountSupplyBlockInfoStatusReturn);
        console.log(`CTASTNSA: Skipping new bootstrap for: ${issuerAddress}. ${accountSupplyBlockInfoStatusReturn.error_type}: ${accountSupplyBlockInfoStatusReturn.message}`);
        return;
      }

      const accountSupplyBlockInfo: IAccountSupplyBlockInfo = accountSupplyBlockInfoStatusReturn.value;
      const mint_crawl_head: (TBlockHash | null) = accountSupplyBlockInfo.mint_crawl_head;
      const ignoreMetadataRepresentatives: TAccount[] = accountSupplyBlockInfo.metadata_representatives;
      // TODO: Fix ambiguity between ISupplyBlock (from nano-account-crawler lib) and supply_blocks from the database.
      let traceSupplyBlocksOffset: string = "0";
      if (mint_crawl_head) {
        traceSupplyBlocksOffset = "-1";
      }

      const { supplyBlocks, crawlerHead, crawlerHeadHeight } = await traceSupplyBlocks(bananode, issuerAddress, mint_crawl_head, traceSupplyBlocksOffset, ignoreMetadataRepresentatives);
      // TODO: This could just be an updateAccount
      const _issuer_id = await createOrUpdateAccount(pgPool, issuerAddress, crawlAt, crawlerHead, crawlerHeadHeight);

      for (let i = 0; i < supplyBlocks.length; i++) {
        const supplyBlock = supplyBlocks[i];
        const maxSupply = supplyBlock.max_supply;
        console.log(`CTASTNSA: bootstrapping new supply block: ${supplyBlock.supply_block_hash}, ${supplyBlock.metadata_representative}`);
        // TODO: Rewrite to return IStatusReturn
        // TODO: continue loop if there's errors
        const mintBlocks: INanoBlock[] = await bootstrap_mint_blocks_from_supply_block(bananode, issuerAddress, supplyBlock.supply_block_hash);
        let supply_block_id: number;

        for (let j = 0; j < mintBlocks.length; j++) {
          const mintBlock = mintBlocks[j];
          console.log(`CTASTNSA: bootstrapping new mint block: ${mintBlock.hash}`);
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
            if (j == 0) {
              supply_block_id = await createSupplyBlockAndFirstMint(crawlAt, pgPool, mintBlock, issuerId, maxSupply, db_asset_chain_frontiers, asset_chain_height, asset_crawler_block_head, asset_crawler_block_height);
            } else {
              const mintNumber = j + 1;
              await createNFT(pgPool, mintBlock, mintNumber, supply_block_id, db_asset_chain_frontiers, asset_chain_height, asset_crawler_block_head, asset_crawler_block_height);
            }
            console.log(`CTASTNSA: Finished bootstrapping new asset from mint block. Frontier: ${db_asset_chain[db_asset_chain.length - 1].state} ${db_asset_chain[db_asset_chain.length - 1].block_hash}`);
          });
          await delay_between_passive_asset_checks();
        }

        console.log(`CTASTNSA: Finished bootstrapping supply block: ${supplyBlock.supply_block_hash}, representative: ${supplyBlock.metadata_representative}`);
        await delay_between_supply_blocks();
      }

      console.log(`CTASTNSA: Finished bootstrapping newly supplied NFTs for issuer: ${issuerAddress}`);
      await delay_between_issuers();
    } catch (error) {
      errorReturns.push({
        status: "error",
        error_type: "MutexManagerError",
        message: `${error}`
      });
    }
  };
}

const getAccountInfos = async (pgPool: any, addresses: string[]): Promise<IStatusReturn<IAccountInfo[]>> => {
  try {
    const { rows } = await pgPool.query('SELECT address, id, supply_block_crawl_head FROM accounts WHERE address = ANY($1::text[])', [addresses]);
    const accountInfos = rows.map(row => {
      return {
        id: row.id,
        address: row.address,
        supply_block_crawl_head: row.supply_block_crawl_head
      };
    });
    return { status: "ok", value: accountInfos };
  } catch (error) {
    return { status: "error", error_type: "UnexpectedError", message: `${error}` };
  }
};


const getAccountSupplyBlockInfo = async (pgPool: any, issuerId: number): Promise<IStatusReturn<IAccountSupplyBlockInfo>> => {
  const query = `
    SELECT DISTINCT ON (metadata_representative) mint_crawl_head, metadata_representative
    FROM supply_blocks
    WHERE issuer_id = $1
    ORDER BY metadata_representative, supply_blocks.block_height DESC;
  `;
  try {
    const result = await pgPool.query(query, [issuerId]);
    if (result.rows.length === 0) {
      return {
        status: "ok",
        value: {
          metadata_representatives: [],
          mint_crawl_head: undefined
        }
      };
    }
    const metadata_representatives = result.rows.map(row => {
      return row.metadata_representative;
    });
    const mint_crawl_head = result.rows[0].mint_crawl_head;
    const accountSupplyBlockInfo: IAccountSupplyBlockInfo = {
      metadata_representatives: metadata_representatives,
      mint_crawl_head: mint_crawl_head
    };
    return {
      status: 'ok',
      value: accountSupplyBlockInfo
    };
  } catch (error) {
    return {
      status: 'error',
      error_type: 'PostgresError',
      message: error.message
    };
  }
};
