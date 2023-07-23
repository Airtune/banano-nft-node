import { TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { IErrorReturn, IStatusReturn } from "nano-account-crawler/dist/status-return-interfaces";
import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { delay_between_mint_blocks } from "../bananode-cooldown";
import { IAssetBlockDb } from "../db/db-prepare-asset-chain";
import { continueTraceAssetChain } from "./continue-trace-asset-chain";
import { mainMutexManager } from "../lib/mutex-manager";

export interface IDbNFT {
  id: number,
  supply_block_id: number, 
  mint_block_hash: TBlockHash,
  asset_chain_frontiers: IAssetBlockDb[],
  asset_representative: TAccount,
  asset_chain_height: number
}

// Get the existing supply blocks from the database and continue crawling from the
// latest known block to find new supply blocks.
export const continueTraceAndStoreAssetChains = async (bananode: any, pgPool: any): Promise<IStatusReturn<void>> => {
  const errorReturns: IErrorReturn[] = [];
  const crawlAt = new Date();

  try {
    // TODO: Set batch size for postgresql request
    const dbNFTsStatusReturn: IStatusReturn<IDbNFT[]> = await getNFTs(pgPool);
    if (dbNFTsStatusReturn.status === "error") {
      return dbNFTsStatusReturn;
    }
    const dbNFTs = dbNFTsStatusReturn.value;
    
    for (let i = 0; i < dbNFTs.length; i++) {
      try {
        const dbNFT = dbNFTs[i];
        const supplyBlockId: number = dbNFT.supply_block_id;
        const supplyBlockDbStatusReturn = await getSupplyBlockIssuerAddress(pgPool, supplyBlockId);
        if (supplyBlockDbStatusReturn.status === "error") {
          return supplyBlockDbStatusReturn;
        } else if (!supplyBlockDbStatusReturn.value) {
          return {
            status: "error",
            error_type: "RecordMissing",
            message: `Couldn't find issuer address for supply_block with id: ${supplyBlockId}`
          }
        }
        const issuerAddress: TAccount = supplyBlockDbStatusReturn.value;

        await mainMutexManager.runExclusive(dbNFT.mint_block_hash, async () => {
          await continueTraceAssetChain(pgPool, bananode, crawlAt, issuerAddress, dbNFT);
        });

        await delay_between_mint_blocks();
      } catch(error) {
        const errorReturn: IErrorReturn = {
          status: "error",
          error_type: "UnexpectedError",
          message: `${error}`
        };
        errorReturns.push(errorReturn);
      }
    }

    return { status: "ok" };
  } catch(error) {
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

const getSupplyBlockIssuerAddress = async (pgPool: any, supply_block_id: number): Promise<IStatusReturn<TAccount>> => {
  try {
    const query = `
      SELECT 
        accounts.address AS issuer_address
      FROM 
        supply_blocks
      INNER JOIN accounts ON accounts.id = supply_blocks.issuer_id
      WHERE supply_blocks.id = $1
      LIMIT 1;
    `;
    const { rows } = await pgPool.query(query, [supply_block_id]);
    const row = rows[0];
    return { status: "ok", value: row.issuer_address as TAccount };
  } catch(error) {
    return { status: "error", error_type: "DatabaseError", message: error.message };
  }
};

const getNFTs = async (pgPool: any): Promise<IStatusReturn<IDbNFT[]>> => {
  try {
    const query = {
      text: 'SELECT id, supply_block_id, mint_block_hash, asset_chain_frontiers, asset_representative, asset_chain_height FROM nfts',
    };
    const result = await pgPool.query(query);
    const dbNFTs = result.rows.map(row => ({
      id: row.id,
      supply_block_id: row.supply_block_id,
      mint_block_hash: row.mint_block_hash,
      asset_chain_frontiers: row.asset_chain_frontiers,
      asset_representative: row.asset_representative,
      asset_chain_height: row.asset_chain_height
    }));
    return { status: 'ok', value: dbNFTs };
  } catch (error) {
    return { status: 'error', error_type: "UnexpectedError", message: `${error}` };
  }
}