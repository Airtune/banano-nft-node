import { AssetCrawler } from "banano-nft-crawler/dist/asset-crawler";
import { INanoBlock, TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { IAssetBlock } from "banano-nft-crawler/dist/interfaces/asset-block";
import { IDbNFT } from "./continue-trace-and-store-asset-chains";
import { getBlock } from "banano-nft-crawler/dist/lib/get-block";
import { IErrorReturn, IStatusReturn } from "nano-account-crawler/dist/status-return-interfaces";
import { TAssetBlockType } from "banano-nft-crawler/dist/types/asset-block-type";
import { updateNFT } from "../db/nfts";
import { ASSET_BLOCK_FRONTIER_COUNT } from "../constants";
import { findFrontierNFTBlocks } from "../db/nft-blocks";

const getBlockSubtypeFromType = (type: TAssetBlockType): string => {
  const index = type.indexOf("#");
  return index >= 0 ? type.substring(0, index) : type;
}

const get_frontier_nft_blocks = async (pgPool: any, dbNFT: IDbNFT): Promise<IStatusReturn<any[]>> => {
  const nft_id = dbNFT.id;
  // TODO: I'm not sure how many but I think 3 blocks of history is enough for the crawler to
  // handle all atomic swap states.
  const frontier_nft_blocks_status = await findFrontierNFTBlocks(pgPool, dbNFT.id, 3);

  if (frontier_nft_blocks_status.status === "ok" && Array.isArray(frontier_nft_blocks_status.value)) {
    return { status: "ok", value: frontier_nft_blocks_status.value };
  }

  return frontier_nft_blocks_status;
};

export const continueTraceAssetChain = async (pgPool: any, bananode: any, crawlAt: Date, issuerAddress: TAccount, dbNFT: IDbNFT, mint_block_hash: TBlockHash): Promise<IStatusReturn<void>> => {
  console.log('continueTraceAssetChain...');
  try {
    const mintBlockStatusReturn = await getBlock(bananode, issuerAddress, mint_block_hash);
    if (mintBlockStatusReturn.status === "error") {
      console.error(`error getting mint block: ${mint_block_hash}, issuerAddress: ${issuerAddress}`);
      return mintBlockStatusReturn;
    }
    const mintBlock: INanoBlock = mintBlockStatusReturn.value;

    const assetRepresentative = dbNFT.asset_representative;
    const assetCrawler = new AssetCrawler(issuerAddress, mintBlock);
    
    const frontier_nft_blocks_status: IStatusReturn<any[]> = await get_frontier_nft_blocks(pgPool, dbNFT);
    if (frontier_nft_blocks_status.status === "error") {
      // TODO: remove log
      console.log(`error getting frontier_nft_blocks`);
      return frontier_nft_blocks_status;
    }
    const frontier_nft_blocks: any[] = frontier_nft_blocks_status.value;
    // TODO: remove log
    console.log(`fetched ${frontier_nft_blocks.length} frontier blocks:`);
    console.log(JSON.stringify(frontier_nft_blocks));
    // Convert frontier_nft_blocks -> IAssetBlock[]
    const cachedAssetChain: IAssetBlock[] = frontier_nft_blocks.map((nft_block: any) => {
      return {
        state: nft_block.state,
        type: nft_block.type,
        account: nft_block.account_address,
        owner: nft_block.owner_address,
        locked: nft_block.account_address !== nft_block.owner_address,
        traceLength: BigInt(0), // since we're doing a new trace from the cached asset chain, we set trace length to 0
        block_link: nft_block.block_link,
        block_hash: nft_block.block_hash,
        block_height: nft_block.block_height.toString(),
        block_account: nft_block.block_account, // TODO: unused, remove from banano-nft-crawler?
        block_representative: nft_block.block_representative,
        block_type: 'state', // TODO: unused, remove from banano-nft-crawler?
        block_subtype: getBlockSubtypeFromType(nft_block.type as TAssetBlockType),
        block_amount: nft_block.block_amount
      } as IAssetBlock;
    });
    assetCrawler.initFromCache(assetRepresentative, cachedAssetChain);

    // TODO: Make consistent with mintBlocksCrawler where you use
    // crawlFromFrontier instead of crawl after calling initFromCache.
    await assetCrawler.crawl(bananode); // TODO: Handle status/errors and retries

    //for (let i = 0; i < assetCrawler.assetChain.length; i++) {
    //  const assetBlock: IAssetBlock = assetCrawler.assetChain[i];
    //  
    //}
    // !!! co
    // TODO: Figure out if I was supposed to do something above here?

    const crawl_block_height = assetCrawler.headHeight;
    const new_asset_chain_frontiers = assetCrawler.assetChain;
    await updateNFT(pgPool, dbNFT.id, crawlAt, assetCrawler.head, crawl_block_height, new_asset_chain_frontiers);
    console.log('continueTraceAssetChain!');
  } catch (error) {
    // TODO: remove log
    console.error(`continueTraceAssetChain error`);
    console.error(error);
    return {
      status: "error",
      error_type: "UnexpectedError",
      message: `${error}`
    }
  }
};
