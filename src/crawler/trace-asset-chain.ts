// Types and interfaces
import { INanoBlock, TAccount, TBlockHash } from 'nano-account-crawler/dist/nano-interfaces';

// imports
import { AssetCrawler } from 'banano-nft-crawler/dist/asset-crawler';
import { getBlock } from 'banano-nft-crawler/dist/lib/get-block';

// Get the asset frontier block
export const traceAssetChain = async (bananode, issuer: TAccount, mintBlockHash: TBlockHash): Promise<AssetCrawler> => {
  // TODO: validate params
  console.log(`/traceAssetChain\nissuer: ${issuer}\nmint_block_hash: ${mintBlockHash}`);
  const mintBlock: (INanoBlock | undefined) = await getBlock(bananode, issuer, mintBlockHash).catch((error) => { throw(error) });
  if (mintBlock == undefined) {
    throw Error(`MintBlockError: Unabled to find block with hash: ${mintBlockHash}`);
  }
  const assetCrawler = new AssetCrawler(issuer, mintBlock);
  console.log('try');
  try {
    await assetCrawler.crawl(bananode);
  } catch (error) {
    console.log(`state: ${assetCrawler.frontier?.state}`);
  } finally {
    console.log(JSON.stringify(assetCrawler.frontier?.state))
  }
  

  return assetCrawler;
};
