import { IAssetBlock } from "banano-nft-crawler/dist/interfaces/asset-block";
import { TAssetState } from "banano-nft-crawler/dist/types/asset-state";

export interface IAssetBlockDb {
  state:      TAssetState,
  type:       string,
  account:    string,
  owner:      string,
  locked:     boolean,
  block_hash: string,
  block_height: string,
  block_representative: string,
  block_link: string
}

export const dbPrepareAssetChain = (assetChain: IAssetBlock[]): IAssetBlockDb[] => {
  return assetChain.map((assetBlock: IAssetBlock) => {
    return {
      state: assetBlock.state,
      type: assetBlock.type,
      account: assetBlock.account,
      owner: assetBlock.owner,
      locked: assetBlock.locked,
      block_hash: assetBlock.block_hash,
      block_height: assetBlock.block_height,
      block_representative: assetBlock.block_representative,
      block_link: assetBlock.block_link
    };
  });
}