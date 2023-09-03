import { TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { IErrorReturn, IStatusReturn } from "nano-account-crawler/dist/status-return-interfaces";
import { delay_between_mint_blocks } from "../bananode-cooldown";
import { continueTraceAssetChain } from "./continue-trace-asset-chain";
import { mainMutexManager } from "../lib/mutex-manager";

export interface IDbNFT {
  id: number;
  created_at: Date;
  updated_at: Date;
  asset_representative: TAccount;
  supply_block_id: number | null;
  supply_block_hash: TBlockHash;
  mint_number: number;
  crawl_at: Date;
  crawl_block_height: number;
  crawl_block_head: TBlockHash;
}

export const getMintBlock = async (pgClient: any, nft_id: number): Promise<any> => {
  const query = `
    SELECT *
    FROM nft_blocks
    WHERE nft_id = $1 AND nft_block_height = 0
    LIMIT 1;
  `;

  try {
    const { rows } = await pgClient.query(query, [nft_id]);
    return rows[0];
  } catch (error) {
    console.error(`Could not fetch mint block for NFT ID ${nft_id}.`, error);
    throw error;
  }
};

// Get the existing supply blocks from the database and continue crawling from the
// latest known block to find new supply blocks.
export const continueTraceAndStoreAssetChains = async (bananode: any, pgPool: any): Promise<IStatusReturn<void>> => {
  console.log('continueTraceAndStoreAssetChains...');
  const errorReturns: IErrorReturn[] = [];
  const crawlAt = new Date();

  try {
    // TODO: Set batch size for postgresql request
    const dbNFTsStatusReturn: IStatusReturn<IDbNFT[]> = await getNFTs(pgPool);
    if (dbNFTsStatusReturn.status === "error") {
      console.error(`error getting NFTs`);
      return dbNFTsStatusReturn;
    }
    const dbNFTs: IDbNFT[] = dbNFTsStatusReturn.value;
    
    for (let i = 0; i < dbNFTs.length; i++) {
      try {
        const dbNFT = dbNFTs[i];
        const supplyBlockId: number = dbNFT.supply_block_id;
        const supplyBlockDbStatusReturn = await getSupplyBlockIssuerAddress(pgPool, supplyBlockId);
        if (supplyBlockDbStatusReturn.status === "error") {
          return supplyBlockDbStatusReturn;
        } else if (!supplyBlockDbStatusReturn.value) {
          console.error(`Couldn't find issuer address for supply_block with id: ${supplyBlockId}`);
          return {
            status: "error",
            error_type: "RecordMissing",
            message: `Couldn't find issuer address for supply_block with id: ${supplyBlockId}`
          }
        }
        const issuerAddress: TAccount = supplyBlockDbStatusReturn.value;
        const mintBlock = await getMintBlock(pgPool, dbNFT.id);
        await mainMutexManager.runExclusive(mintBlock.block_hash, async () => {
          console.log(`--- RUN EXCLUSIVE MINT BLOCK HASH: ${mintBlock.block_hash} ---`);
          await continueTraceAssetChain(pgPool, bananode, crawlAt, issuerAddress, dbNFT, mintBlock.block_hash);
        });

        await delay_between_mint_blocks();
      } catch(error) {
        // The code doesn't throw an error a break the loop so only NFTs without errors will be traced and stored
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
    console.log('continueTraceAndStoreAssetChains!');
    // TODO: log errors
    // logErrorReturnsToFile(errorReturns);
  }
}

const getSupplyBlockIssuerAddress = async (pgPool: any, supply_block_id: number): Promise<IStatusReturn<TAccount>> => {
  try {
    const query = `
      SELECT
        id,
        issuer_address
      FROM
        supply_blocks
      WHERE supply_blocks.id = $1
      LIMIT 1;
    `;
    const queryResult = await pgPool.query(query, [supply_block_id]);
    const { rows } = queryResult;
    const row = rows[0];
    console.log(`queryResult: ${JSON.stringify(queryResult)}`);
    return { status: "ok", value: row.issuer_address as TAccount };
  } catch(error) {
    return { status: "error", error_type: "DatabaseError", message: error.message };
  }
};

const getNFTs = async (pgPool: any): Promise<IStatusReturn<IDbNFT[]>> => {
  try {
    const query = {
      text: 'SELECT id, supply_block_id, asset_representative FROM nfts',
    };
    const result = await pgPool.query(query);
    const dbNFTs = result.rows.map(row => ({
      id: row.id,
      supply_block_id: row.supply_block_id,
      asset_representative: row.asset_representative
    }));
    return { status: 'ok', value: dbNFTs };
  } catch (error) {
    return { status: 'error', error_type: "UnexpectedError", message: `${error}` };
  }
}