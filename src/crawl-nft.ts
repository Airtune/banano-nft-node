// TYPES
import { NanoNode } from "nano-account-crawler/dist/nano-node";
import { TBlockHash } from "nano-account-crawler/dist/nano-interfaces";

import { ISupplyBlock } from './interfaces/supply-block';

// DEPENDENCIES
import { MintBlocksCrawler } from 'banano-nft-crawler/dist/mint-blocks-crawler';
import { traceSupplyBlocks } from './crawler/trace-supply-blocks';
import { traceAssetChain } from './crawler/trace-asset-chain';
import { createOrUpdateAccount } from './db/accounts';
import { mainMutexManager } from './lib/mutex-manager';
import { createOrUpdateNFT } from './db/nfts';
import { ASSET_BLOCK_FRONTIER_COUNT } from './constants';
import { getBlock } from 'banano-nft-crawler/dist/lib/get-block';

export const crawlNFTFromMintBlockHash = async (pgClient: any, nanoNode: NanoNode, mintBlockHash: TBlockHash) => {
  const blockInfo = await nanoNode.jsonRequest({ "action": "block_info", "hash": mintBlockHash });


  //const nft = await findNFT(mintBlockHash);
  const nft = {}; // !!!
  return await crawlNFT(pgClient, nanoNode, nft);
}

export const crawlNFT = async (pgClient: any, nanoNode: NanoNode, nft: any) => {
  
}
