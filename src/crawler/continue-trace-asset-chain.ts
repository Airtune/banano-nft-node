import { AssetCrawler } from "banano-nft-crawler/dist/asset-crawler";
import { INanoBlock, TAccount } from "nano-account-crawler/dist/nano-interfaces";
import { IAssetBlock } from "banano-nft-crawler/dist/interfaces/asset-block";
import { IDbNFT } from "./continue-trace-and-store-asset-chains";
import { IAssetBlockDb, dbPrepareAssetChain } from "../db/db-prepare-asset-chain";
import { getBlock } from "banano-nft-crawler/dist/lib/get-block";
import { IStatusReturn } from "nano-account-crawler/dist/status-return-interfaces";
import { TAssetBlockType } from "banano-nft-crawler/dist/types/asset-block-type";
import { updateNFT } from "../db/nfts";
import { ASSET_BLOCK_FRONTIER_COUNT } from "../constants";

const getBlockSubtypeFromType = (type: TAssetBlockType): string => {
  const index = type.indexOf("#");
  return index >= 0 ? type.substring(0, index) : type;
}

export const continueTraceAssetChain = async (pgPool: any, bananode: any, crawlAt: Date, issuerAddress: TAccount, dbNFT: IDbNFT): Promise<IStatusReturn<void>> => {
  try {
    const mintBlockStatusReturn = await getBlock(bananode, issuerAddress, dbNFT.mint_block_hash);
    if (mintBlockStatusReturn.status === "error") {
      return mintBlockStatusReturn;
    }
    const mintBlock: INanoBlock = mintBlockStatusReturn.value;

    const assetRepresentative = dbNFT.asset_representative;
    const assetCrawler = new AssetCrawler(issuerAddress, mintBlock);
    const cachedAssetChainDb: IAssetBlockDb[] = dbNFT.asset_chain_frontiers;
    // convert IAssetBlockDb[] -> IAssetBlock[]
    const cachedAssetChain: IAssetBlock[] = cachedAssetChainDb.map((assetBlockDb: IAssetBlockDb) => {
      return {
        state: assetBlockDb.state,
        type: assetBlockDb.type,
        account: assetBlockDb.account,
        owner: assetBlockDb.owner,
        locked: assetBlockDb.locked,
        traceLength: BigInt(0), // since we're doing a new trace from the cached asset chain, we set trace length to 0
        block_link: assetBlockDb.block_link,
        block_hash: assetBlockDb.block_hash,
        block_height: assetBlockDb.block_height.toString(),
        block_account: assetBlockDb.account,
        block_representative: assetBlockDb.block_representative,
        block_type: 'state',
        block_subtype: getBlockSubtypeFromType(assetBlockDb.type as TAssetBlockType),
        block_amount: assetBlockDb.block_amount.toString()
      } as IAssetBlock;
    });
    assetCrawler.initFromCache(assetRepresentative, cachedAssetChain);
    // TODO: Make consistent with mintBlocksCrawler where you use
    // crawlFromFrontier instead of crawl after calling initFromCache.
    await assetCrawler.crawl(bananode);

    //for (let i = 0; i < assetCrawler.assetChain.length; i++) {
    //  const assetBlock: IAssetBlock = assetCrawler.assetChain[i];
    //  
    //}
    // !!! co
    const crawl_block_height = assetCrawler.headHeight;
    const new_db_asset_chain_frontiers = dbPrepareAssetChain(assetCrawler.assetChain.slice(-ASSET_BLOCK_FRONTIER_COUNT));
    const asset_chain_height = dbNFT.asset_chain_height + assetCrawler.assetChain.length - cachedAssetChainDb.length;
    await updateNFT(pgPool, dbNFT.id, crawlAt, assetCrawler.head, crawl_block_height, new_db_asset_chain_frontiers, asset_chain_height);
  } catch (error) {
    return {
      status: "error",
      error_type: "UnexpectedError",
      message: `${error}`
    }
  }
};
