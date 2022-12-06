// Types and interfaces
import { IAssetBlock } from 'banano-nft-crawler/dist/interfaces/asset-block';
import { INanoBlock, TAccount, TBlockHash } from 'nano-account-crawler/dist/nano-interfaces';

// imports
import { AssetCrawler } from 'banano-nft-crawler/dist/asset-crawler';
import { getBlock } from 'banano-nft-crawler/dist/lib/get-block';

// Get the asset frontier block
export const traceAssetFrontier = async (bananode, issuer: TAccount, mintBlockHash: TBlockHash): Promise<IAssetBlock> => {
  // TODO: validate params
  console.log(`traceAssetFrontier\nissuer: ${issuer}\nmintBlockHash: ${mintBlockHash}`);
  const mintBlock: (INanoBlock | undefined) = await getBlock(bananode, issuer, mintBlockHash).catch((error) => { throw(error); });
  if (mintBlock == undefined) {
    throw Error(`MintBlockError: Unabled to find block with hash: ${mintBlockHash}`);
  }
  const assetCrawler = new AssetCrawler(issuer, mintBlock);
  await assetCrawler.crawl(bananode).catch((error) => { throw(error); });
  const frontier: IAssetBlock = assetCrawler.frontier;

  return frontier;
};
