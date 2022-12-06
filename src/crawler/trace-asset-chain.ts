// Types and interfaces
import { IAssetBlock } from '../interfaces/asset-block'
import { IAssetBlock as ICrawlerAssetBlock } from 'banano-nft-crawler/dist/interfaces/asset-block';
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
  await assetCrawler.crawl(bananode);

  const assetChain: IAssetBlock[] = assetCrawler.assetChain.map((assetBlock: ICrawlerAssetBlock) => {
    return {
      account:    assetBlock.account,
      owner:      assetBlock.owner,
      locked:     assetBlock.locked,
      block_hash: assetBlock.block_hash,
      state:      assetBlock.state,
      type:       assetBlock.type
    } as IAssetBlock;
  });

  return assetCrawler;
};
