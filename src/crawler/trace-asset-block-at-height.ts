import { INanoBlock, TAccount, TBlockHash } from "nano-account-crawler/dist/nano-interfaces";
import { getBlock } from 'banano-nft-crawler/dist/lib/get-block';
import { AssetCrawler } from 'banano-nft-crawler/dist/asset-crawler';
import { IAssetBlock } from 'banano-nft-crawler/dist/interfaces/asset-block';
import { IStatusReturn } from "nano-account-crawler/dist/status-return-interfaces";

export const traceAssetBlockAtHeight = async (bananode, issuer: TAccount, mintBlockHash: TBlockHash, height: number): Promise<IAssetBlock> => {
  console.log(`/get_asset_at_height\nissuer: ${issuer}\nmint_block_hash: ${mintBlockHash}\nheight: ${height}`);
  const mintBlockStatusReturn: IStatusReturn<INanoBlock> = await getBlock(bananode, issuer, mintBlockHash).catch((error) => { throw(error); });
  if (mintBlockStatusReturn.status === "error") {
    throw Error(`${mintBlockStatusReturn.error_type}: ${mintBlockStatusReturn.message}`);
  }
  const mintBlock: (INanoBlock | undefined) = mintBlockStatusReturn.value;
  if (mintBlock == undefined) {
    throw Error(`MintBlockError: Unabled to find block with hash: ${mintBlockHash}`);
  }
  const assetCrawler = new AssetCrawler(issuer, mintBlock);
  await assetCrawler.crawl(bananode).catch((error) => { throw(error); });

  const assetBlock: IAssetBlock = assetCrawler.assetChain[height];
  return assetBlock;
};
