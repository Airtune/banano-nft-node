// Types and interfaces
import { INanoBlock, TAccount, TBlockHash } from 'nano-account-crawler/dist/nano-interfaces';

// imports
import { AssetCrawler } from 'banano-nft-crawler/dist/asset-crawler';
import { getBlock } from 'banano-nft-crawler/dist/lib/get-block';
import { IStatusReturn } from 'nano-account-crawler/dist/status-return-interfaces';
import { NanoNode } from 'nano-account-crawler/dist/nano-node';

// Get the asset frontier block
export const traceAssetChain = async (bananode: any, issuer: TAccount, mintBlockHash: TBlockHash): Promise<IStatusReturn<AssetCrawler>> => {
  console.log(`/traceAssetChain\nissuer: ${issuer}\nmint_block_hash: ${mintBlockHash}`);
  let mintBlockStatusReturn: IStatusReturn<INanoBlock | undefined>;
  try {
    mintBlockStatusReturn = await getBlock(bananode, issuer, mintBlockHash);
  } catch(error) {
    return {
      status: "error",
      error_type: "UnexpectedError",
      message: `${error}`
    };
  }
  if (mintBlockStatusReturn.status === "error") {
    return mintBlockStatusReturn;
  }
  if (!mintBlockStatusReturn.value) {
    return {
      status: "error",
      error_type: "MintBlockError",
      message: `Unable to find block in traceAssetChain with hash: ${mintBlockHash}`,
    };
  }
  const assetCrawler = new AssetCrawler(issuer, mintBlockStatusReturn.value);
  try {
    const assetCrawlerStatusReturn = await assetCrawler.crawl(bananode);
    if (assetCrawlerStatusReturn.status === "error") {
      return assetCrawlerStatusReturn;
    }
  } catch(error) {
    return {
      status: "error",
      error_type: "UnexpectedError",
      message: `${error}`
    };
  }
  return {
    status: "ok",
    value: assetCrawler,
  };
};
